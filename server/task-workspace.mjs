import { must, unpack } from "./db.mjs";
import { allowed, get, scopeClause } from "./repository.mjs";
import { transportCommand } from "./transport.mjs";

export const taskStages = {
  pending: ["待派发"],
  ready: ["待接收", "已接收"],
  running: ["执行中", "退回补充"],
  verify: ["待核验"],
  ended: ["已完成", "已取消", "余量已终止"],
};
const states = Object.values(taskStages).flat();
function reader(user) {
  must(user.role === "admin", "此工作区仅供管理端使用", 403);
  allowed(user, "read");
}
export function taskWorkspace(db, user, query = {}) {
  reader(user);
  const scoped = scopeClause(db, user, "tasks"),
    args = [...scoped.args],
    conditions = ["1=1"];
  const stage = query.stage || "all";
  must(stage === "all" || taskStages[stage], "任务分组无效");
  if (query.status) must(states.includes(query.status), "任务状态无效");
  if (query.owner) {
    conditions.push("t.owner_id=?");
    args.push(String(query.owner));
  }
  if (query.id) {
    conditions.push("t.id=?");
    args.push(String(query.id));
  }
  if (query.q) {
    const fields = [
      "t.code",
      "t.name",
      "o.code",
      "v.code",
      "d.name",
      "d.code",
      "json_extract(o.data,'$.origin')",
      "json_extract(o.data,'$.destination')",
      "json_extract(o.data,'$.cargo')",
    ];
    conditions.push(
      "(" + fields.map((f) => f + " LIKE ? ESCAPE '\\'").join(" OR ") + ")",
    );
    const q =
      "%" +
      String(query.q)
        .slice(0, 100)
        .replace(/[\\%_]/g, "\\$&") +
      "%";
    args.push(...fields.map(() => q));
  }
  const dates = {};
  for (const key of ["from", "to"])
    if (query[key]) {
      const date = new Date(query[key]);
      must(Number.isFinite(+date), "计划日期无效");
      dates[key] = date.toISOString();
    }
  if (dates.from && dates.to)
    must(dates.to > dates.from, "计划日期结束须晚于开始");
  if (dates.from) {
    conditions.push("t.finish_at>?");
    args.push(dates.from);
  }
  if (dates.to) {
    conditions.push("t.start_at<?");
    args.push(dates.to);
  }
  const base = `WITH scoped_tasks AS(SELECT * FROM tasks WHERE ${scoped.sql})
    SELECT t.*,o.code order_code,json_extract(o.data,'$.origin') origin,
    json_extract(o.data,'$.destination') destination,json_extract(o.data,'$.cargo') cargo,
    v.code vehicle_code,d.name driver_name,d.code driver_code,
    (SELECT count(*) FROM trips tr WHERE tr.task_id=t.id AND tr.owner_id=t.owner_id) trip_count,
    (SELECT count(*) FROM trips tr WHERE tr.task_id=t.id AND tr.owner_id=t.owner_id AND tr.status IN('已卸货','已核验')) delivered_trips,
    (SELECT max(e.occurred_at) FROM events e WHERE e.task_id=t.id) last_event_at,
    (SELECT count(*) FROM alerts al WHERE al.owner_id=t.owner_id AND (al.task_id=t.id OR json_extract(al.data,'$.task_id')=t.id OR EXISTS(SELECT 1 FROM json_each(al.data,'$.task_ids') j WHERE j.value=t.id)) AND al.status<>'已关闭') open_alerts
    FROM scoped_tasks t LEFT JOIN orders o ON o.id=t.order_id AND o.owner_id=t.owner_id
    LEFT JOIN vehicles v ON v.id=t.vehicle_id AND v.owner_id=t.owner_id
    LEFT JOIN drivers d ON d.id=t.driver_id AND d.owner_id=t.owner_id
    WHERE ${conditions.join(" AND ")}`;
  const statusRows = db
    .prepare(`SELECT status,count(*) n FROM (${base}) GROUP BY status`)
    .all(...args);
  const counts = { all: statusRows.reduce((s, r) => s + r.n, 0) };
  for (const [key, values] of Object.entries(taskStages))
    counts[key] = statusRows
      .filter((r) => values.includes(r.status))
      .reduce((s, r) => s + r.n, 0);
  const selected = query.status ? [query.status] : taskStages[stage],
    suffix = selected
      ? ` WHERE status IN(${selected.map(() => "?").join(",")})`
      : "",
    filteredArgs = [...args, ...(selected || [])],
    total = db
      .prepare(`SELECT count(*) n FROM (${base})${suffix}`)
      .get(...filteredArgs).n,
    page = Math.max(1, Math.min(100000, parseInt(query.page) || 1)),
    pageSize = Math.max(1, Math.min(100, parseInt(query.pageSize) || 10));
  const items = db
    .prepare(
      `SELECT * FROM (${base})${suffix}
    ORDER BY CASE WHEN status IN('已完成','已取消','余量已终止') THEN 1 ELSE 0 END,
    created_at DESC,start_at ASC,id ASC LIMIT ? OFFSET ?`,
    )
    .all(...filteredArgs, pageSize, (page - 1) * pageSize)
    .map(unpack);
  return { items, total, page, pageSize, counts, statuses: states };
}
export function taskWorkspaceDetail(db, user, id) {
  const r = taskWorkspace(db, user, { id, pageSize: 1 }).items[0];
  must(r, "记录不存在或无权访问", 404, "NOT_FOUND");
  return {
    ...r,
    trips: db
      .prepare(
        "SELECT * FROM trips WHERE task_id=? AND owner_id=? ORDER BY occurred_at,code",
      )
      .all(id, r.owner_id)
      .map(unpack),
    charging: db
      .prepare(
        "SELECT c.*,s.name station_name FROM charging c LEFT JOIN stations s ON s.id=c.station_id AND s.owner_id=c.owner_id WHERE c.task_id=? AND c.owner_id=? ORDER BY c.arrival_at",
      )
      .all(id, r.owner_id)
      .map(unpack),
    alerts: db
      .prepare(
        "SELECT * FROM alerts WHERE owner_id=? AND (task_id=? OR json_extract(data,'$.task_id')=? OR EXISTS(SELECT 1 FROM json_each(alerts.data,'$.task_ids') j WHERE j.value=?)) ORDER BY created_at DESC",
      )
      .all(r.owner_id, id, id, id)
      .map(unpack),
    events: db
      .prepare(
        "SELECT * FROM events WHERE task_id=? ORDER BY occurred_at,received_at",
      )
      .all(id)
      .map(unpack),
    audit: db
      .prepare(
        "SELECT action,created_at,before_version,after_version,data FROM audit WHERE owner_id=? AND (entity_id=? OR EXISTS(SELECT 1 FROM json_each(audit.data,'$.result_ids') j WHERE j.value=?)) ORDER BY created_at DESC LIMIT 100",
      )
      .all(r.owner_id, id, id)
      .map(unpack),
  };
}
export function taskDispatchPreview(db, user, body) {
  reader(user);
  allowed(user, "task.dispatch");
  must(
    Array.isArray(body.items) &&
      body.items.length > 0 &&
      body.items.length <= 100,
    "请选择1–100条待派发任务",
  );
  must(
    body.items.every(
      (x) =>
        x && typeof x.id === "string" && x.id.length > 0 && x.id.length <= 120,
    ),
    "任务参数无效",
  );
  must(
    new Set(body.items.map((x) => x.id)).size === body.items.length,
    "任务不能重复选择",
  );
  // Resolve every scope before returning any validation detail.
  const tasks = body.items.map((item) => get(db, user, "tasks", item.id));
  const issues = [];
  for (let i = 0; i < tasks.length; i++) {
    try {
      transportCommand(db, user, "dispatch.validate", null, {
        items: [body.items[i]],
      });
    } catch (e) {
      issues.push({
        task_ids: [tasks[i].id],
        task_codes: [tasks[i].code],
        message: e.message,
        code: e.code || "VALIDATION_FAILED",
      });
    }
  }
  if (!issues.length) {
    try {
      transportCommand(db, user, "dispatch.validate", null, body);
    } catch (e) {
      issues.push({
        task_ids: tasks.map((t) => t.id),
        task_codes: tasks.map((t) => t.code),
        message: e.message,
        code: e.code || "BATCH_CONFLICT",
      });
    }
  }
  return {
    validated: issues.length === 0,
    issues,
    versions: tasks.map((t) => ({ id: t.id, version: t.version })),
  };
}
