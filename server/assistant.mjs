import { allowed, get, list } from "./repository.mjs";
import { must, now } from "./db.mjs";
export function assistantIntent(question) {
  return /推演|调度条件|运输条件|安排.*订单/.test(question)
    ? "dispatch"
    : /排队|负荷|预测/.test(question)
      ? "forecast"
      : /选址|规划|投放|布局/.test(question)
        ? "planning"
        : /风险|预警|异常/.test(question)
          ? "risk"
          : "query";
}
export function assistantPreparation(db, user, b) {
  allowed(user, "ai.use");
  allowed(user, "simulation.run");
  const orders = list(db, user, "orders", { pageSize: 100 }).items;
  const order = b.order_id
    ? get(db, user, "orders", b.order_id)
    : orders.find((o) => String(b.question || "").includes(o.code));
  must(
    order && order.status === "已确认",
    "请指定已确认的来源订单，不以聊天文本替代订单",
  );
  const drivers = list(db, user, "drivers", { pageSize: 100 }).items;
  const active = list(db, user, "tasks", { pageSize: 100 }).items.filter((t) =>
    ["待接收", "已接收", "执行中", "待核验", "退回补充"].includes(t.status),
  );
  const vehicles = list(db, user, "vehicles", { pageSize: 100 }).items.filter(
      (v) =>
        v.owner_id === order.owner_id &&
        v.status === "可用" &&
        v.driver_id &&
        drivers.some(
          (d) =>
            d.id === v.driver_id &&
            d.status === "可用" &&
            d.owner_id === order.owner_id,
        ) &&
        !active.some(
          (t) => t.vehicle_id === v.id || t.driver_id === v.driver_id,
        ),
    ),
    stations = list(db, user, "stations", { pageSize: 100 }).items;
  const station = stations
    .sort((a, b) => (a.mode === "充电" ? 0 : 1) - (b.mode === "充电" ? 0 : 1))
    .find(
      (s) =>
        s.owner_id === order.owner_id &&
        s.status === "运营中" &&
        vehicles
          .slice(0, 2)
          .every(
            (v) =>
              v.compatibility === s.compatibility &&
              (s.mode !== "换电" ||
                s.supported_capacity_kwh?.includes(v.capacity_kwh)),
          ),
    );
  must(vehicles.length && station, "当前缺少可用运力或适配场站");
  return {
    order_id: order.id,
    order_version: order.version,
    vehicle_ids: vehicles.slice(0, 2).map((v) => v.id),
    station_id: station.id,
    soc: vehicles[0].soc,
    reserve_soc: 20,
    use_reference: true,
    requires_input_confirmation: true,
    source: "DB_DERIVED_SIMULATION",
    prepared_at: now(),
    missing: vehicles[0].soc == null ? ["初始SOC"] : [],
    constraints: [
      "20%余量仅为当前仿真候选，须在推演条件中核对",
      "不创建任务，不派单",
    ],
  };
}
export function assistantEvidence(context) {
  return [
    {
      resource: "summary",
      id: "summary",
      code: "运营汇总",
      version: context.summary.generated_at,
    },
    ...context.orders.map((r) => ({ ...r, resource: "orders" })),
    ...context.forecasts.map((r) => ({
      id: r.id,
      code: r.code,
      version: r.version,
      resource: "forecasts",
    })),
    ...context.planning.map((r) => ({
      id: r.id,
      code: r.code,
      version: r.version,
      resource: "planning",
    })),
    ...context.alerts.map((r) => ({
      id: r.id,
      code: r.code,
      version: r.version,
      resource: "alerts",
    })),
  ];
}
export function contextValidity(db, record) {
  const changed = [];
  for (const [key, table] of [
    ["plan_versions", "charging"],
    ["station_versions", "stations"],
    ["resource_versions", "records"],
  ])
    for (const ref of record[key] || []) {
      if (
        db.prepare(`SELECT version FROM ${table} WHERE id=?`).get(ref.id)
          ?.version !== ref.version
      )
        changed.push(ref.id);
    }
  for (const point of record.comparison || [])
    if (
      db
        .prepare("SELECT version FROM records WHERE id=?")
        .get(point.candidate_id)?.version !== point.candidate_version
    )
      changed.push(point.candidate_id);
  return {
    ...record,
    context_validity: changed.length
      ? "输入已变化，仅供历史解释"
      : "仿真成果，须核对适用时段",
    changed_input_ids: changed,
  };
}
