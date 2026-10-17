import { must, unpack, now } from "./db.mjs";
import { allowed, get, scopeClause } from "./repository.mjs";
import {
  energyRows,
  joinedPlans,
  pageRows,
  checkDay,
  energyDay,
} from "./energy-workspace.mjs";

export const terminal = (s) => ["已完成", "已取消", "余量已终止"].includes(s);
export const incidentStage = (s) =>
  ({
    待受理: "pending",
    待核实: "pending",
    处理中: "working",
    待关闭: "verify",
    待核验: "verify",
    已关闭: "closed",
  })[s] || "pending";
export function safetyRows(db, user, table) {
  const s = scopeClause(db, user, table);
  return db
    .prepare(`SELECT * FROM ${table} WHERE (${s.sql})`)
    .all(...s.args)
    .map(unpack);
}
export function adminRead(user) {
  must(user.role === "admin", "仅管理端可访问运行监控", 403);
  allowed(user, "read");
}
const refs = (db, r) => {
  const one = (table, id) =>
    id
      ? unpack(
          db
            .prepare(`SELECT * FROM ${table} WHERE id=? AND owner_id=?`)
            .get(id, r.owner_id),
        )
      : null;
  const tasks = [
    ...new Set(
      [r.task_id, ...(Array.isArray(r.task_ids) ? r.task_ids : [])].filter(
        Boolean,
      ),
    ),
  ]
    .map((id) => one("tasks", id))
    .filter(Boolean);
  const plans = [
    ...new Set(
      [r.plan_id, ...(Array.isArray(r.plan_ids) ? r.plan_ids : [])].filter(
        Boolean,
      ),
    ),
  ]
    .map((id) => one("charging", id))
    .filter(Boolean);
  for (const p of plans)
    if (p.task_id && !tasks.some((t) => t.id === p.task_id)) {
      const t = one("tasks", p.task_id);
      if (t) tasks.push(t);
    }
  const orders = [...new Set(tasks.map((t) => t.order_id))]
    .map((id) => one("orders", id))
    .filter(Boolean);
  const vehicle = one(
    "vehicles",
    r.vehicle_id || tasks[0]?.vehicle_id || plans[0]?.vehicle_id,
  );
  const device = one(
    "devices",
    r.device_id || (r.object?.startsWith("S") ? r.object : null),
  );
  const station = one(
    "stations",
    r.station_id || device?.station_id || plans[0]?.station_id,
  );
  return { tasks, plans, orders, vehicle, station, device };
};
export function joinIncident(db, r) {
  const x = refs(db, r);
  const potentialPlans = x.station
    ? db
        .prepare(
          "SELECT c.id,c.code,c.task_id,c.vehicle_id,c.arrival_at FROM charging c WHERE c.owner_id=? AND c.station_id=? AND c.status<>'已取消' AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.plan_id=c.id) AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=c.task_id AND t.status IN('已完成','已取消','余量已终止')) ORDER BY c.arrival_at",
        )
        .all(r.owner_id, x.station.id)
        .filter((p) => !x.plans.some((q) => q.id === p.id))
    : [];
  return {
    ...r,
    stage: incidentStage(r.status),
    status_label: incidentStage(r.status) === "verify" ? "待核验" : r.status,
    tasks: x.tasks.map((t) => ({
      id: t.id,
      code: t.code,
      order_id: t.order_id,
      vehicle_id: t.vehicle_id,
      driver_id: t.driver_id,
      status: t.status,
      quantity_kg: t.quantity_kg,
      verified_kg: t.verified_kg,
      start_at: t.start_at,
      finish_at: t.finish_at,
      requires_resimulation: !!t.requires_resimulation,
    })),
    orders: x.orders.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      origin: o.origin,
      destination: o.destination,
    })),
    plans: x.plans.map((p) => ({
      id: p.id,
      code: p.code,
      task_id: p.task_id,
      vehicle_id: p.vehicle_id,
      station_id: p.station_id,
      status: p.status,
      version: p.version,
      arrival_at: p.arrival_at,
    })),
    potential_plans: potentialPlans,
    expected_driver_ids: [
      ...new Set(
        (x.tasks.length
          ? x.tasks.map((t) => t.driver_id)
          : [x.vehicle?.driver_id]
        ).filter(Boolean),
      ),
    ],
    vehicle_code: x.vehicle?.code,
    station_id: x.station?.id || r.station_id,
    station_name: x.station?.name,
    device_id: x.device?.id || r.device_id,
    device_name: x.device?.name,
    incident_type: r.incident_type || r.name,
    impact:
      r.impact ||
      (x.plans.length
        ? "补能安排受影响"
        : x.tasks.length
          ? "任务执行需关注"
          : "业务影响待核实"),
    planned_kg: x.tasks.reduce((n, t) => n + t.quantity_kg, 0),
    overdue:
      !!r.due_at &&
      new Date(r.due_at) < new Date() &&
      incidentStage(r.status) !== "closed",
    history: Array.isArray(r.history) ? r.history : [],
  };
}
function driverView(db, r, user) {
  const tasks = r.tasks.filter((t) => t.driver_id === user.driver_id);
  const ownPlans = new Set(safetyRows(db, user, "charging").map((p) => p.id));
  const plans = r.plans.filter((p) => ownPlans.has(p.id));
  const ownVehicle = tasks[0]?.vehicle_id || plans[0]?.vehicle_id;
  const vehicleCode = ownVehicle
    ? db.prepare("SELECT code FROM vehicles WHERE id=?").get(ownVehicle)?.code
    : undefined;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    status_label: r.status_label,
    stage: r.stage,
    version: r.version,
    created_at: r.created_at,
    source: r.source,
    source_label: r.source_label,
    vehicle_code: vehicleCode,
    orders: [],
    incident_type: r.incident_type,
    tasks: tasks.map((t) => ({ id: t.id, code: t.code, status: t.status })),
    plans,
    instruction: r.instruction || "",
    instruction_revision: r.instruction_revision || 0,
    acknowledged:
      r.driver_receipts?.[user.driver_id]?.revision ===
        r.instruction_revision && !!r.instruction_revision,
    driver_feedback: (r.driver_feedback || []).filter(
      (f) => f.driver_id === user.driver_id,
    ),
    report: r.driver_id === user.driver_id ? r.report : "关联任务异常",
    result: r.result
      ? {
          summary: r.result.public_summary || "处置结果已登记，请查看恢复情况",
          recovery: r.result.recovery,
        }
      : null,
    history: r.history
      .filter((h) => h.public)
      .map((h) => ({
        at: h.at,
        label: h.label,
        note: h.public_note || "",
        public: true,
      })),
  };
}
export function incidentList(db, user, q = {}) {
  if (user.role === "admin") allowed(user, "read");
  else allowed(user, "driver.execute");
  const day = checkDay(q.date);
  must(
    !q.stage ||
      ["open", "all", "pending", "working", "verify", "closed"].includes(
        q.stage,
      ),
    "异常分组无效",
  );
  let rows = safetyRows(db, user, "alerts").map((r) => joinIncident(db, r));
  if(q.owner) rows=rows.filter(r=>r.owner_id===q.owner);
  if (user.role === "driver") rows = rows.map((r) => driverView(db, r, user));
  if (q.id) rows = rows.filter((r) => r.id === q.id);
  if (q.task) rows = rows.filter((r) => r.tasks.some((t) => t.id === q.task));
  if (q.order)
    rows = rows.filter((r) => r.orders.some((o) => o.id === q.order));
  if (q.plan) rows = rows.filter((r) => r.plans.some((p) => p.id === q.plan));
  if (q.station)
    rows = rows.filter(
      (r) =>
        r.station_id === q.station ||
        r.plans.some((p) => p.station_id === q.station),
    );
  if (q.vehicle)
    rows = rows.filter(
      (r) =>
        r.vehicle_id === q.vehicle ||
        r.tasks.some((t) => t.vehicle_id === q.vehicle),
    );
  if (q.q) {
    const s = String(q.q).trim().toLowerCase();
    rows = rows.filter((r) =>
      [
        r.code,
        r.name,
        r.vehicle_code,
        r.station_name,
        r.assignee,
        ...r.tasks.map((t) => t.code),
        ...r.orders.map((t) => t.code),
        ...r.plans.map((t) => t.code),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }
  if (day) rows = rows.filter((r) => energyDay(r.created_at) === day);
  if (q.type) rows = rows.filter((r) => r.incident_type === q.type);
  if (q.assignee) rows = rows.filter((r) => r.assignee_id === q.assignee);
  const counts = {
    all: rows.length,
    pending: 0,
    working: 0,
    verify: 0,
    closed: 0,
    open: 0,
  };
  for (const r of rows) {
    counts[r.stage]++;
    if (r.stage !== "closed") counts.open++;
  }
  if (q.stage && q.stage !== "all")
    rows = rows.filter((r) =>
      q.stage === "open" ? r.stage !== "closed" : r.stage === q.stage,
    );
  const rank = { 紧急: 0, 较高: 1, 重要: 1, 一般: 2, 待核实: 3 };
  rows.sort(
    (a, b) =>
      (a.stage === "closed") - (b.stage === "closed") ||
      (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) ||
      String(b.created_at).localeCompare(a.created_at) ||
      a.id.localeCompare(b.id),
  );
  return {
    ...pageRows(rows, q),
    counts,
    at: now(),
  };
}
export function incidentDetail(db, user, id) {
  get(db, user, "alerts", id);
  const r = joinIncident(
    db,
    unpack(db.prepare("SELECT * FROM alerts WHERE id=?").get(id)),
  );
  return user.role === "driver" ? driverView(db, r, user) : r;
}
export function safetyOptions(db, user) {
  adminRead(user);
  const result = {};
  for (const resource of [
    "tasks",
    "orders",
    "vehicles",
    "stations",
    "devices",
    "charging",
  ])
    result[resource] = safetyRows(db, user, resource);
  result.assignees = db
    .prepare(
      "SELECT id,name,operations FROM users WHERE role='admin' AND enabled=1",
    )
    .all()
    .filter((u) => {
      const ops = JSON.parse(u.operations);
      return ops.includes("*") || ops.includes("alert.write");
    })
    .map((u) => ({
      id: u.id,
      name: u.name,
      scopes: db
        .prepare("SELECT owner_id FROM user_scopes WHERE user_id=?")
        .all(u.id)
        .map((s) => s.owner_id)
        .filter((id) => user.scopes.includes(id)),
    }))
    .filter((u) => u.scopes.length);
  result.types = [
    "车辆故障",
    "充电位故障",
    "补能排队",
    "电量关注",
    "装卸等待",
    "节点反馈超时",
    "定位数据延迟",
    "设备数据延迟",
    "用能风险",
    "其他异常",
  ];
  return result;
}
export function monitoring(db, user, q = {}) {
  adminRead(user);
  const tasks = safetyRows(db, user, "tasks").filter(
    (t) => !terminal(t.status) && t.status !== "待派发",
  );
  const orders = new Map(safetyRows(db, user, "orders").map((o) => [o.id, o]));
  const drivers = new Map(
    safetyRows(db, user, "drivers").map((o) => [o.id, o]),
  );
  const alerts = safetyRows(db, user, "alerts")
    .filter((a) => a.status !== "已关闭")
    .map((a) => joinIncident(db, a));
  const plans = joinedPlans(db, user).filter((p) => p.stage !== "ended");
  const allStations = safetyRows(db, user, "stations"),
    devices = safetyRows(db, user, "devices");
  let rows;
  if (q.kind === "station") {
    rows = allStations.map((s) => {
      const ps = plans.filter((p) => p.station_id === s.id),
        ds = devices.filter((d) => d.station_id === s.id);
      const own = alerts.filter(
        (a) =>
          a.station_id === s.id || a.plans.some((p) => p.station_id === s.id),
      );
      const risks = [
        ...new Set([
          ...own.map((a) => a.name),
          ...ps.flatMap((p) => p.risks),
          ...ds.filter((d) => d.status === "故障").map((d) => d.name + "故障"),
        ]),
      ];
      return {
        ...s,
        kind: "station",
        tasks: tasks
          .filter((t) => ps.some((p) => p.task_id === t.id))
          .map((t) => ({
            ...t,
            order: orders.get(t.order_id),
            driver_name: drivers.get(t.driver_id)?.name,
          })),
        plans: ps,
        alerts: own,
        devices: ds,
        risks,
        attention: !!risks.length,
        phase: s.status,
        code: s.name,
        data_status: "人工登记/仿真",
        fresh: false,
      };
    });
  } else {
    rows = safetyRows(db, user, "vehicles").map((v) => {
      const sample = db
        .prepare(
          "SELECT * FROM telemetry WHERE vehicle_id=? AND owner_id=? ORDER BY occurred_at DESC LIMIT 1",
        )
        .get(v.id, v.owner_id);
      const rawTime = v.source_time,
        rawValid = rawTime && Number.isFinite(+new Date(rawTime));
      const newest =
        sample &&
        (!rawValid || new Date(sample.occurred_at) >= new Date(rawTime))
          ? sample
          : null;
      const sourceTime = newest?.occurred_at || (rawValid ? rawTime : null);
      const fresh =
        !!sourceTime &&
        Date.now() - new Date(sourceTime) >= -60000 &&
        Date.now() - new Date(sourceTime) <= 600000;
      const ts = tasks
        .filter((t) => t.vehicle_id === v.id)
        .map((t) => ({
          ...t,
          order: orders.get(t.order_id),
          driver_name: drivers.get(t.driver_id)?.name,
        }));
      const own = alerts.filter(
        (a) =>
          a.vehicle_id === v.id || a.tasks.some((t) => t.vehicle_id === v.id),
      );
      const ps = plans.filter((p) => p.vehicle_id === v.id);
      const risks = [
        ...new Set([...own.map((a) => a.name), ...ps.flatMap((p) => p.risks)]),
      ];
      if (!fresh && ts.length)
        risks.push(sourceTime ? "定位/电量数据延迟" : "缺少有效采样时间");
      if (ts.some((t) => t.requires_resimulation))
        risks.push("任务时间变化，需重新推演");
      if (
        ts.some(
          (t) => new Date(t.finish_at) < new Date() && t.status !== "待核验",
        )
      )
        risks.push("计划截止已过，完成情况待核实");
      if (
        ts.some(
          (t) =>
            ["待接收", "已接收"].includes(t.status) &&
            new Date(t.start_at) < new Date(),
        )
      )
        risks.push("计划开始已过，执行反馈待核实");
      const soc = newest?.soc ?? v.soc,
        lon = newest?.longitude ?? v.longitude,
        lat = newest?.latitude ?? v.latitude;
      const phase = ts.length
        ? ps.some((p) => p.execution_status === "补能中")
          ? "补能中"
          : ts.some((t) => t.status === "执行中")
            ? "运输中"
            : "待反馈"
        : "空闲";
      return {
        ...v,
        kind: "vehicle",
        tasks: ts,
        plans: ps,
        alerts: own,
        risks: [...new Set(risks)],
        attention: !!risks.length,
        phase,
        driver_name: drivers.get(ts[0]?.driver_id || v.driver_id)?.name,
        soc,
        longitude: lon,
        latitude: lat,
        source_time: sourceTime,
        speed_kmh: newest?.speed_kmh ?? null,
        fresh,
        data_status: fresh
          ? "有效采样"
          : sourceTime
            ? "数据延迟"
            : "时间待核实",
        position_label: sourceTime
          ? fresh
            ? "最近有效位置"
            : "最后有效位置"
          : "位置时间待核实",
        source: newest?.source || v.source,
      };
    });
  }
  if (q.owner) rows = rows.filter((r) => r.owner_id === q.owner);
  if (q.q) {
    const s = String(q.q).trim().toLowerCase();
    rows = rows.filter((r) =>
      [
        r.code,
        r.name,
        r.driver_name,
        ...r.tasks.flatMap((t) => [t.code, t.order?.code]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }
  if (q.phase) rows = rows.filter((r) => r.phase === q.phase);
  if (q.data)
    rows = rows.filter((r) => (q.data === "fresh" ? r.fresh : !r.fresh));
  if (q.risk)
    rows = rows.filter((r) => r.risks.some((s) => s.includes(q.risk)));
  const counts = {
    all: rows.length,
    attention: rows.filter((r) => r.attention).length,
    transport: rows.filter((r) => r.phase === "运输中").length,
    charging: rows.filter((r) => r.phase === "补能中").length,
    waiting: rows.filter((r) => r.phase === "待反馈").length,
  };
  if (q.stage && q.stage !== "all")
    rows = rows.filter((r) =>
      q.stage === "attention"
        ? r.attention
        : { transport: "运输中", charging: "补能中", waiting: "待反馈" }[
            q.stage
          ] === r.phase,
    );
  rows.sort(
    (a, b) =>
      Number(b.attention) - Number(a.attention) || a.code.localeCompare(b.code),
  );
  return {
    ...pageRows(rows, q),
    counts,
    at: now(),
    freshness_minutes: 10,
    source: "SIMULATED",
  };
}
export function safetyTrace(db, user, id, q = {}) {
  adminRead(user);
  const v = get(db, user, "vehicles", id);
  const end = q.to ? new Date(q.to) : new Date(),
    start = q.from ? new Date(q.from) : new Date(+end - 24 * 3600000);
  must(
    Number.isFinite(+end) &&
      Number.isFinite(+start) &&
      start < end &&
      end - start <= 7 * 86400000,
    "轨迹时间范围须有效且不超过7天",
  );
  const items = db
    .prepare(
      "SELECT * FROM telemetry WHERE vehicle_id=? AND owner_id=? AND occurred_at>=? AND occurred_at<=? ORDER BY occurred_at,id LIMIT 2001",
    )
    .all(id, v.owner_id, start.toISOString(), end.toISOString());
  const ids = db
    .prepare("SELECT id FROM tasks WHERE vehicle_id=? AND owner_id=?")
    .all(id, v.owner_id)
    .map((t) => t.id);
  const events = ids.length
    ? db
        .prepare(
          `SELECT id,task_id,kind,occurred_at,received_at FROM events WHERE task_id IN(${ids.map(() => "?")}) AND occurred_at>=? AND occurred_at<=? ORDER BY occurred_at LIMIT 1000`,
        )
        .all(...ids, start.toISOString(), end.toISOString())
    : [];
  const count = items.length;
  return {
    items: items.slice(0, 2000),
    events,
    truncated: count > 2000,
    from: start.toISOString(),
    to: end.toISOString(),
    source: "SIMULATED",
    real_trajectory: false,
  };
}
