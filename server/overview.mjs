import { must, now, unpack } from "./db.mjs";
import { allowed, scopeClause } from "./repository.mjs";
import { taskWorkspace } from "./task-workspace.mjs";
import { chargingWorkspace } from "./energy-workspace.mjs";

// Read-only aggregation over the complete authorized set, never bootstrap's first 100 rows.
export function overview(db, user, q = {}) {
  must(user.role === "admin", "运营总览仅供管理端访问", 403);
  allowed(user, "read");
  const owner = q.owner || "";
  must(typeof owner === "string" && owner.length <= 100, "主体参数无效");
  if (owner) must(user.scopes.includes(owner), "无权访问该业务主体", 403);
  const rows = (table) => {
    const s = scopeClause(db, user, table);
    return db
      .prepare(
        `SELECT * FROM ${table} WHERE (${s.sql})${owner ? " AND owner_id=?" : ""}`,
      )
      .all(...s.args, ...(owner ? [owner] : []))
      .map(unpack);
  };
  const tasks = rows("tasks"),
    demands = rows("demands"),
    orders = rows("orders"),
    alerts = rows("alerts"),
    devices = rows("devices"),
    sessions = rows("sessions");
  const count = (data, status) =>
    data.filter((r) => status.includes(r.status)).length;
  const stats = {
    pending: count(tasks, ["待派发"]),
    running: count(tasks, ["执行中", "退回补充"]),
    verify: count(tasks, ["待核验"]),
    verified_tonnes: tasks.reduce((n, t) => n + t.verified_kg, 0) / 1000,
    open_alerts: alerts.filter((a) => a.status !== "已关闭").length,
    completed: count(tasks, ["已完成"]),
    pending_charging: chargingWorkspace(db, user, { owner, pageSize: 1 }).counts
      .pending,
    online_devices: devices.filter(
      (d) => d.connection === "在线" && ["空闲", "占用"].includes(d.status),
    ).length,
    total_devices: devices.length,
    verified_energy_kwh: sessions
      .filter((s) => s.status === "已核验")
      .reduce((n, s) => n + s.quantity_kwh, 0),
  };
  const todos = [
    {
      key: "demand",
      label: "运输需求待完善",
      count: count(demands, ["草稿"]),
      route: "demands",
      status: "草稿",
      hint: "补齐货物、运量与运输条件",
    },
    {
      key: "order",
      label: "运输订单待确认",
      count: count(orders, ["草稿"]),
      route: "orders",
      status: "草稿",
      hint: "核对订单，进入运输安排",
    },
    {
      key: "dispatch",
      label: "运输任务待派发",
      count: stats.pending,
      route: "tasks",
      stage: "pending",
      hint: "核对车辆、司机与执行时间",
    },
    {
      key: "verify",
      label: "任务完工待核验",
      count: stats.verify,
      route: "tasks",
      stage: "verify",
      hint: "核对司机报送与交付凭证",
    },
    {
      key: "charging",
      label: "补能计划待安排",
      count: stats.pending_charging,
      route: "charging",
      stage: "pending",
      hint: "核对到站时间与工位适配",
    },
    {
      key: "alert",
      label: "异常事件待处置",
      count: stats.open_alerts,
      route: "alerts",
      stage: "open",
      hint: "查看影响范围，跟进处置",
    },
  ];
  const details = taskWorkspace(db, user, { owner, pageSize: 100 }).items;
  // Select recent task IDs from the full set before resolving bounded presentation rows.
  const recentIds = [...tasks]
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
    )
    .slice(0, 6)
    .map((t) => t.id);
  const present = (t) => ({
    id: t.id,
    owner_id: t.owner_id,
    code: t.code,
    order_code: t.order_code,
    origin: t.origin || "",
    destination: t.destination || "",
    cargo: t.cargo || "",
    vehicle_code: t.vehicle_code || "",
    driver_name: t.driver_name || "",
    status: t.status,
    quantity_kg: t.quantity_kg,
    reported_kg: t.reported_kg,
    verified_kg: t.verified_kg,
    trip_count: t.trip_count,
    delivered_trips: t.delivered_trips,
    open_alerts: t.open_alerts,
    requires_resimulation: !!t.requires_resimulation,
    start_at: t.start_at,
    finish_at: t.finish_at,
  });
  const resolve = (id) =>
    details.find((t) => t.id === id) ||
    taskWorkspace(db, user, { id, owner, pageSize: 1 }).items[0];
  const items = recentIds.map(resolve).filter(Boolean).map(present);
  const priority = {
    执行中: 0,
    退回补充: 1,
    待核验: 2,
    已接收: 3,
    待接收: 4,
    待派发: 5,
    已完成: 6,
  };
  const chosen = [...tasks]
    .filter((t) => priority[t.status] != null)
    .sort(
      (a, b) =>
        priority[a.status] - priority[b.status] ||
        b.created_at.localeCompare(a.created_at) ||
        a.id.localeCompare(b.id),
    )[0];
  let progress = null;
  if (chosen) {
    const item = present(resolve(chosen.id));
    const latest = db
      .prepare(
        "SELECT code,status,occurred_at FROM trips WHERE task_id=? AND owner_id=? ORDER BY occurred_at DESC,code DESC LIMIT 1",
      )
      .get(chosen.id, chosen.owner_id);
    progress = {
      ...item,
      latest_trip: latest || null,
      nodes: [
        {
          label: "任务派发",
          state: chosen.status === "待派发" ? "current" : "done",
        },
        {
          label: "司机接单",
          state:
            chosen.status === "待派发"
              ? "pending"
              : chosen.status === "待接收"
                ? "current"
                : "done",
        },
        {
          label: "运输执行",
          state: ["执行中", "退回补充"].includes(chosen.status)
            ? "current"
            : ["待核验", "已完成"].includes(chosen.status)
              ? "done"
              : "pending",
        },
        {
          label: "完工核验",
          state:
            chosen.status === "已完成"
              ? "done"
              : chosen.status === "待核验"
                ? "current"
                : "pending",
        },
      ],
    };
  }
  const s = scopeClause(db, user, "tasks");
  const organizations = db
    .prepare(
      `SELECT id,name FROM organizations WHERE id IN(${s.args.map(() => "?").join(",")}) ORDER BY name`,
    )
    .all(...s.args);
  return {
    generated_at: now(),
    data_mode: "SIMULATED",
    scope: {
      owner_id: owner || null,
      label: owner
        ? organizations.find((o) => o.id === owner)?.name
        : "全部授权主体",
    },
    organizations,
    statistics: stats,
    todos,
    todo_count: todos.reduce((n, t) => n + t.count, 0),
    items,
    total_tasks: tasks.length,
    progress,
    time_basis:
      "当前状态；交付量与补能电量为累计已核验值，计划结束不是预测到达时间",
  };
}
