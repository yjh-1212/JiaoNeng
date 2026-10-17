import { unpack, must, BusinessError } from "./db.mjs";
import { visibilityClause } from './data-visibility.mjs';
export const tables = [
  "demands",
  "orders",
  "vehicles",
  "drivers",
  "stations",
  "devices",
  "tasks",
  "trips",
  "simulations",
  "charging",
  "sessions",
  "costs",
  "alerts",
];
export const recordTypes = [
  "planning-projects",
  "planning-solutions",
  "simulation-scenarios",
  "regional-plans",
  "assets",
  "replacements",
  "parameters",
  "integrations",
  "candidates",
  "loads",
  "device-loads",
  "forecasts",
  "energy-plans",
  "planning",
  "deployment",
  "quality",
  "entities",
  "energy-resources",
  "rules",
  "charging-optimizations",
  "station-visits",
  "od-analysis",
  "forecast-evaluations",
];
export const resources = [
  ...tables,
  ...recordTypes,
  "users",
  "audit",
  "sources",
];
export function can(user, operation) {
  return (
    user.operations.includes("*") ||
    user.operations.includes(operation) ||
    (operation === "read" && user.operations.includes("read"))
  );
}
export function allowed(user, operation = "read") {
  must(can(user, operation), "当前账号没有执行此操作的授权", 403, "FORBIDDEN");
}
export function tableFor(resource) {
  must(resources.includes(resource), "业务资源不存在", 404, "NOT_FOUND");
  return recordTypes.includes(resource) ? "records" : resource;
}
export function scopeClause(db, user, resource) {
  const base=baseScopeClause(db,user,resource),table=tableFor(resource);
  return {sql:'('+base.sql+')'+visibilityClause(user,resource,table),args:base.args};
}
function baseScopeClause(db, user, resource) {
  if (resource === "sources") return { sql: "1=1", args: [] };
  if (user.role === "driver") {
    const id = user.driver_id;
    if (resource === "station-visits")
      return {
        sql: "json_extract(data,'$.driver_id')=? AND (json_extract(data,'$.task_id') IN(SELECT id FROM tasks WHERE driver_id=?) OR (json_extract(data,'$.task_id') IS NULL AND json_extract(data,'$.vehicle_id') IN(SELECT id FROM vehicles WHERE driver_id=?)))",
        args: [id, id, id],
      };
    if (resource === "alerts")
      return {
        sql: "(task_id IN(SELECT id FROM tasks WHERE driver_id=?) OR EXISTS(SELECT 1 FROM json_each(json_extract(alerts.data,'$.task_ids')) j JOIN tasks t ON t.id=j.value WHERE t.driver_id=? AND t.owner_id=alerts.owner_id) OR (task_id IS NULL AND json_extract(data,'$.driver_id')=? AND vehicle_id IN(SELECT id FROM vehicles WHERE driver_id=?)))",
        args: [id, id, id, id],
      };
    if (resource === "tasks") return { sql: "driver_id=?", args: [id] };
    if (resource === "trips")
      return {
        sql: "task_id IN(SELECT id FROM tasks WHERE driver_id=?)",
        args: [id],
      };
    if (resource === "charging")
      return {
        sql: "task_id IN(SELECT id FROM tasks WHERE driver_id=?) OR (task_id IS NULL AND vehicle_id IN(SELECT id FROM vehicles WHERE driver_id=?))",
        args: [id, id],
      };
    if (resource === "sessions")
      return {
        sql: "plan_id IN(SELECT id FROM charging WHERE task_id IN(SELECT id FROM tasks WHERE driver_id=?)) OR (plan_id IS NULL AND vehicle_id IN(SELECT id FROM vehicles WHERE driver_id=?))",
        args: [id, id],
      };
    if (resource === "vehicles")
      return {
        sql: "id IN(SELECT vehicle_id FROM tasks WHERE driver_id=?) OR driver_id=?",
        args: [id, id],
      };
    if (resource === "drivers") return { sql: "id=?", args: [id] };
    if (resource === "stations")
      return {
        sql: "id IN(SELECT station_id FROM charging WHERE task_id IN(SELECT id FROM tasks WHERE driver_id=?) OR (task_id IS NULL AND vehicle_id IN(SELECT id FROM vehicles WHERE driver_id=?)))",
        args: [id, id],
      };
    throw new BusinessError(
      "司机仅能查询本人任务及必要补能资料",
      403,
      "FORBIDDEN",
    );
  }
  const scopes = user.scopes;
  must(scopes.length, "账号没有可访问业务主体", 403, "FORBIDDEN");
  return {
    sql: `owner_id IN(${scopes.map(() => "?").join(",")})`,
    args: scopes,
  };
}
function scopedUsers(db, user) {
  allowed(user, "user.manage");
  return db
    .prepare(
      "SELECT id,username,name,role,driver_id,enabled,version,operations FROM users WHERE EXISTS(SELECT 1 FROM user_scopes s WHERE s.user_id=users.id) AND NOT EXISTS(SELECT 1 FROM user_scopes s WHERE s.user_id=users.id AND s.owner_id NOT IN(" +
        user.scopes.map(() => "?").join(",") +
        ")) ORDER BY username",
    )
    .all(...user.scopes)
    .map((r) => ({
      ...r,
      ...(user.data_view==='operational'&&/仿真|模拟/.test(r.name)?{name:r.username+'（姓名待登记）'}:{}),
      operations: JSON.parse(r.operations),
      scopes: db
        .prepare("SELECT owner_id FROM user_scopes WHERE user_id=?")
        .all(r.id)
        .map((x) => x.owner_id),
    }));
}
export function get(db, user, resource, id) {
  if (user.role === "admin") allowed(user, "read");
  const table = tableFor(resource);
  if (resource === "users") {
    const r = scopedUsers(db, user).find((r) => r.id === id);
    must(r, "记录不存在或无权访问", 404);
    return r;
  }
  const s = scopeClause(db, user, resource);
  const row = db
    .prepare(
      `SELECT * FROM ${table} WHERE id=? AND (${s.sql})${table === "records" ? " AND resource=?" : ""}`,
    )
    .get(id, ...s.args, ...(table === "records" ? [resource] : []));
  must(row, "记录不存在或无权访问", 404, "NOT_FOUND");
  return redact(
    user,
    resource,
    provenance(db, transportFacts(db, resource, [unpack(row)])[0]),
  );
}
function transportFacts(db, resource, rows) {
  if (!["demands", "orders"].includes(resource) || !rows.length) return rows;
  const marks = rows.map(() => "?").join(","),
    ids = rows.map((r) => r.id);
  const facts =
    resource === "demands"
      ? db
          .prepare(
            `SELECT d.id,count(DISTINCT o.id) order_count,COALESCE(sum(t.verified_kg),0) verified_kg FROM demands d LEFT JOIN orders o ON o.demand_id=d.id AND o.owner_id=d.owner_id LEFT JOIN tasks t ON t.order_id=o.id AND t.owner_id=d.owner_id WHERE d.id IN(${marks}) GROUP BY d.id`,
          )
          .all(...ids)
      : db
          .prepare(
            `SELECT o.id,count(t.id) task_count,COALESCE(sum(t.verified_kg),0) verified_kg,COALESCE(sum(t.reported_kg),0) reported_kg FROM orders o LEFT JOIN tasks t ON t.order_id=o.id AND t.owner_id=o.owner_id WHERE o.id IN(${marks}) GROUP BY o.id`,
          )
          .all(...ids);
  const map = new Map(facts.map((r) => [r.id, r]));
  return rows.map((r) => ({ ...r, ...map.get(r.id) }));
}
function provenance(db, row) {
  if (row.source_time) {
    const age = (Date.now() - new Date(row.source_time)) / 60000;
    row.data_state = age > 15 ? "历史/延迟样本" : "有效时段样本";
    row.age_minutes = Math.max(0, Math.round(age));
  }
  if (row.source_record) {
    const source = db
      .prepare(
        "SELECT status FROM records WHERE id=? AND resource='integrations'",
      )
      .get(String(row.source_record).split(":")[0]);
    if (source?.status === "已暂停") row.data_state = "来源已暂停";
  }
  return row;
}
function redact(user, resource, row) {
  if (user.role !== "driver") return row;
  if (resource === "alerts")
    return Object.fromEntries(
      Object.entries({
        id: row.id,
        code: row.code,
        name: row.name,
        owner_id: row.owner_id,
        status: row.status,
        version: row.version,
        ...(row.cr019
          ? {}
          : {
              task_id: row.task_id,
              vehicle_id: row.vehicle_id,
              plan_id: row.plan_id,
            }),
        created_at: row.created_at,
        source: row.source,
        source_label: row.source_label,
        report: row.driver_id === user.driver_id ? row.report : "关联任务异常",
        instruction: row.instruction,
        instruction_revision: row.instruction_revision,
        history: (row.history || [])
          .filter((h) => h.public)
          .map((h) => ({ at: h.at, label: h.label, note: h.public_note })),
      }).filter(([, v]) => v !== undefined),
    );
  const result = { ...row };
  for (const key of [
    "amount_cents",
    "price_curve",
    "price_basis",
    "lease",
    "partner",
    "password_hash",
    "operations",
  ])
    delete result[key];
  return result;
}
export function list(db, user, resource, query = {}) {
  if (user.role === "admin") allowed(user, "read");
  const table = tableFor(resource);
  if (resource === "users") {
    const items = scopedUsers(db, user);
    return { items, total: items.length, page: 1, pageSize: items.length };
  }
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page) || 1)),
    pageSize = Math.max(
      1,
      Math.min(100, Number.parseInt(query.pageSize) || 20),
    );
  const s = scopeClause(db, user, resource),
    conditions = ["(" + s.sql + ")"],
    args = [...s.args];
  if (table === "records") {
    conditions.push("resource=?");
    args.push(resource);
  }
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((x) => x.name);
  if (query.status && cols.includes("status")) {
    conditions.push("status=?");
    args.push(String(query.status));
  }
  if (query.q) {
    const q = "%" + String(query.q).slice(0, 100) + "%";
    const fields = ["code", "name", "username", "action", "entity_id"].filter(
      (k) => cols.includes(k),
    );
    const searchFields = [...fields];
    if (["demands", "orders"].includes(resource))
      searchFields.push(
        "json_extract(data,'$.cargo')",
        "json_extract(data,'$.origin')",
        "json_extract(data,'$.destination')",
      );
    conditions.push(
      "(" + searchFields.map((k) => k + " LIKE ?").join(" OR ") + ")",
    );
    args.push(...searchFields.map(() => q));
  }
  if (["demands", "orders"].includes(resource))
    for (const key of ["cargo", "origin", "destination"])
      if (query[key]) {
        conditions.push(`json_extract(data,'$.${key}') LIKE ?`);
        args.push("%" + String(query[key]).slice(0, 100) + "%");
      }
  if (resource === "orders" && query.demand) {
    conditions.push("demand_id=?");
    args.push(String(query.demand));
  }
  if (resource === "demands" && query.allocation) {
    const expression = {
      none: "allocated_kg=0",
      partial: "allocated_kg>0 AND allocated_kg<quantity_kg",
      full: "allocated_kg>=quantity_kg",
    }[query.allocation];
    must(expression, "分配进度无效");
    conditions.push("status='已确认'", "(" + expression + ")");
  }
  if (query.owner && user.role === "admin" && cols.includes("owner_id")) {
    conditions.push("owner_id=?");
    args.push(String(query.owner));
  }
  if (query.task && cols.includes("task_id")) {
    conditions.push("task_id=?");
    args.push(String(query.task));
  }
  if (query.station && cols.includes("station_id")) {
    conditions.push("station_id=?");
    args.push(String(query.station));
  }
  if (query.station && table === "records") {
    conditions.push("json_extract(data,'$.station_id')=?");
    args.push(String(query.station));
  }
  if (query.kind && table === "records") {
    conditions.push("json_extract(data,'$.kind')=?");
    args.push(String(query.kind));
  }
  if (query.device && table === "records") {
    conditions.push("json_extract(data,'$.device_id')=?");
    args.push(String(query.device));
  }
  const timeColumn = cols.includes("start_at")
    ? "start_at"
    : cols.includes("created_at")
      ? "created_at"
      : cols.includes("occurred_at")
        ? "occurred_at"
        : null;
  if (timeColumn)
    for (const [key, op] of [
      ["from", ">="],
      ["to", "<"],
    ])
      if (query[key]) {
        const date = new Date(query[key]);
        must(Number.isFinite(+date), "查询时间无效");
        conditions.push(timeColumn + op + "?");
        args.push(date.toISOString());
      }
  const where = conditions.join(" AND "),
    sort =
      [
        "code",
        "name",
        "created_at",
        "amount_cents",
        "quantity_kg",
        "occurred_at",
        "start_at",
        "finish_at",
      ].includes(query.sort) && cols.includes(query.sort)
        ? query.sort
        : cols.includes("created_at")
          ? "created_at"
          : cols.includes("code")
            ? "code"
            : "id",
    dir = query.direction === "asc" ? "ASC" : "DESC";
  const total = db
    .prepare(`SELECT count(*) total FROM ${table} WHERE ${where}`)
    .get(...args).total;
  const rows = db
    .prepare(
      `SELECT * FROM ${table} WHERE ${where} ORDER BY ${sort} ${dir},id ASC LIMIT ? OFFSET ?`,
    )
    .all(...args, pageSize, (page - 1) * pageSize);
  return {
    items: transportFacts(db, resource, rows.map(unpack)).map((r) =>
      redact(user, resource, provenance(db, r)),
    ),
    total,
    page,
    pageSize,
  };
}
export function version(row, body) {
  must(
    Number.isSafeInteger(body.expected_version),
    "缺少对象版本，请重新读取后提交",
    409,
    "VERSION_REQUIRED",
  );
  must(
    row.version === body.expected_version,
    "资料已更新，请核对新版本；当前输入保留",
    409,
    "VERSION_CONFLICT",
  );
}
export function owner(user, owner_id) {
  must(
    user.role === "admin" && user.scopes.includes(owner_id),
    "不能操作未授权主体",
    403,
    "FORBIDDEN",
  );
  return owner_id;
}
export function bootstrap(db, user) {
  const r = {
    user,
    organizations: db
      .prepare(
        `SELECT * FROM organizations WHERE id IN(${user.scopes.map(() => "?").join(",")})`,
      )
      .all(...user.scopes),
    sources: db.prepare("SELECT * FROM sources").all(),
    server_time: new Date().toISOString(),
    data_mode: user.data_view==='operational' ? 'OPERATIONAL' : 'SIMULATED',
  };
  for (const resource of user.role === "admin"
    ? [
        "vehicles",
        "drivers",
        "stations",
        "devices",
        "demands",
        "orders",
        "tasks",
        "charging",
        "candidates",
        "assets",
        "energy-resources",
      ]
    : ["vehicles", "drivers", "stations", "tasks", "charging", "alerts"]) {
    const first = list(db, user, resource, { pageSize: 100 });
    r[resource] = first.items;
  }
  if (user.data_view==='operational') {
    r.organizations=r.organizations.map((o,i)=>({...o,name:/仿真|模拟/.test(o.name)?`业务主体 ${i+1}（名称待登记）`:o.name}));
    if(/仿真|模拟/.test(r.user.name||''))r.user={...r.user,name:r.user.role==='driver'?'司机（姓名待登记）':'管理员（姓名待登记）'};
  }
  if (user.role === "driver") {
    r.orders = db
      .prepare(
        "SELECT DISTINCT o.id,o.code,o.name,o.start_at,o.finish_at,o.quantity_kg,o.data FROM orders o JOIN tasks t ON t.order_id=o.id WHERE t.driver_id=?" + (user.data_view==='operational'?" AND NOT EXISTS(SELECT 1 FROM data_visibility dv WHERE (dv.resource='orders' AND dv.id=o.id) OR (dv.resource='tasks' AND dv.id=t.id))":''),
      )
      .all(user.driver_id)
      .map((row) => {
        const d = JSON.parse(row.data);
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          start_at: row.start_at,
          finish_at: row.finish_at,
          quantity_kg: row.quantity_kg,
          origin: d.origin,
          destination: d.destination,
        };
      });
  }
  return r;
}
