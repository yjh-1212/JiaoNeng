import { must, unpack, now, text } from "./db.mjs";
import { allowed, get, scopeClause } from "./repository.mjs";

export function energyRows(db, user, resource) {
  const s = scopeClause(db, user, resource);
  const records = [
    "station-visits",
    "loads",
    "device-loads",
    "energy-resources",
    "energy-plans",
    "assets",
  ].includes(resource);
  return db
    .prepare(
      `SELECT * FROM ${records ? "records" : resource} WHERE (${s.sql})${records ? " AND resource=?" : ""}`,
    )
    .all(...s.args, ...(records ? [resource] : []))
    .map(unpack);
}
export const energyDay = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
    : "";
export function checkDay(value) {
  if (!value) return "";
  must(
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(+new Date(value + "T00:00:00+08:00")) &&
      energyDay(value + "T00:00:00+08:00") === value,
    "日期无效",
  );
  return value;
}
const readAdmin = (user) => {
  must(user.role === "admin", "仅管理端可访问此工作区", 403);
  allowed(user, "read");
};
export const pageRows = (rows, q) => {
  const page = Math.max(1, Math.min(100000, parseInt(q.page) || 1)),
    pageSize = Math.max(1, Math.min(100, parseInt(q.pageSize) || 10));
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
  };
};
export function joinedPlans(db, user) {
  const plans = energyRows(db, user, "charging");
  return plans.map((p) => {
    // Every join remains in the plan's owner scope. Driver reads expose only their own task context.
    const one = (table, id) =>
      id
        ? unpack(
            db
              .prepare(`SELECT * FROM ${table} WHERE id=? AND owner_id=?`)
              .get(id, p.owner_id),
          )
        : null;
    const task = one("tasks", p.task_id),
      vehicle = one("vehicles", p.vehicle_id),
      station = one("stations", p.station_id),
      order = one("orders", task?.order_id),
      driver = one("drivers", task?.driver_id || vehicle?.driver_id);
    const visits = db
      .prepare(
        "SELECT * FROM records WHERE resource='station-visits' AND owner_id=? AND json_extract(data,'$.plan_id')=? ORDER BY created_at DESC",
      )
      .all(p.owner_id, p.id)
      .map(unpack);
    const sessions = db
      .prepare(
        "SELECT * FROM sessions WHERE plan_id=? AND owner_id=? ORDER BY finish_at DESC",
      )
      .all(p.id, p.owner_id)
      .map(unpack);
    const visit = visits.find((v) => v.status !== "已取消") || null;
    const risks = [];
    if (task?.requires_resimulation) risks.push("运输时间变化，需重新核对");
    if (
      task &&
      ["已取消", "余量已终止"].includes(task.status) &&
      p.status !== "已取消" &&
      !sessions.length
    )
      risks.push("关联任务已失效");
    if (station?.status !== "运营中") risks.push("场站当前不可用");
    if (p.status === "待调整") risks.push("安排需要调整");
    const start = p.start_at || p.arrival_at;
    const online = db
      .prepare(
        "SELECT * FROM devices WHERE station_id=? AND owner_id=? AND connection='在线' AND status IN('空闲','占用')",
      )
      .all(p.station_id, p.owner_id)
      .map(unpack);
    const power = online.length
      ? Math.min(
          station?.power_kw / online.length,
          ...online.map((d) => d.power_kw),
        )
      : 0;
    const minutes =
      station?.mode === "换电"
        ? station.service_minutes || 10
        : power > 0
          ? (p.quantity_kwh / power) * 60
          : null;
    const finish =
      p.finish_at ||
      (minutes != null
        ? new Date(+new Date(start) + minutes * 60000).toISOString()
        : null);
    if (!online.length || !(power > 0)) risks.push("没有可核验的在线服务工位");
    if (task && finish && finish > task.finish_at)
      risks.push("超出运输时间窗口");
    const ended =
      p.status === "已取消" ||
      sessions.length > 0 ||
      visit?.status === "已完成";
    const joined = {
      ...p,
      vehicle_code: vehicle?.code,
      driver_name: driver?.name,
      driver_id: driver?.id,
      station_name: station?.name,
      station_mode: station?.mode,
      longitude: station?.longitude,
      latitude: station?.latitude,
      capacity_kwh: vehicle?.capacity_kwh,
      task_code: task?.code,
      task_status: task?.status,
      order_id: order?.id,
      order_code: order?.code,
      origin: order?.origin,
      destination: order?.destination,
      task_finish_at: task?.finish_at,
      visit,
      sessions,
      start_at: start,
      finish_at: finish,
      time_reference: p.time_reference || !p.finish_at,
      wait_minutes: p.wait_minutes ?? null,
      risks: ended ? [] : risks,
      stage: ended
        ? "ended"
        : risks.length
          ? "risk"
          : ["草稿", "待确认"].includes(p.status)
            ? "pending"
            : "arranged",
      execution_status:
        visit?.status ||
        (sessions.length
          ? sessions[0].status === "已核验"
            ? "已完成"
            : "待核验"
          : p.status === "已取消"
            ? "已取消"
            : "待到站"),
    };
    if (user.role === "driver") {
      for (const key of [
        "amount_cents",
        "known_cost_cents",
        "price_curve",
        "price_basis",
      ])
        delete joined[key];
      joined.sessions = sessions.map((s) => {
        const { amount_cents, ...rest } = s;
        return rest;
      });
      if (joined.visit) {
        joined.visit = { ...joined.visit };
        delete joined.visit.amount_cents;
      }
    }
    return joined;
  });
}
export function filterPlans(rows, q = {}) {
  const day = checkDay(q.date),
    keyword = String(q.q || "")
      .trim()
      .toLowerCase();
  return rows.filter(
    (p) =>
      (!q.owner || p.owner_id === q.owner) &&
      (!q.station || p.station_id === q.station) &&
      (!q.task || p.task_id === q.task) &&
      (!q.order || p.order_id === q.order) &&
      (!q.mode || p.station_mode === q.mode) &&
      (!day || energyDay(p.arrival_at) === day) &&
      (!keyword ||
        [
          p.code,
          p.vehicle_code,
          p.driver_name,
          p.task_code,
          p.order_code,
          p.station_name,
        ].some((v) => v?.toLowerCase().includes(keyword))),
  );
}
export function chargingWorkspace(db, user, q = {}) {
  if (user.role === "admin") readAdmin(user);
  const rows = filterPlans(joinedPlans(db, user), q)
    .filter(
      (p) => user.role !== "driver" || !["草稿", "待确认"].includes(p.status),
    )
    .sort(
      (a, b) =>
        (a.stage === "ended") - (b.stage === "ended") ||
        a.arrival_at.localeCompare(b.arrival_at) ||
        a.id.localeCompare(b.id),
    );
  const stages = ["all", "pending", "arranged", "risk", "ended"];
  must(!q.stage || stages.includes(q.stage), "补能分组无效");
  must(
    !q.status ||
      ["草稿", "待确认", "已确认", "待调整", "已取消"].includes(q.status),
    "补能计划状态无效",
  );
  const counts = Object.fromEntries(
    stages.map((k) => [
      k,
      k === "all" ? rows.length : rows.filter((p) => p.stage === k).length,
    ]),
  );
  const driverStage = (p) =>
    p.stage === "ended" ? "ended" : p.visit ? "running" : "pending";
  const driver_counts = Object.fromEntries(
    ["pending", "running", "ended"].map((s) => [
      s,
      rows.filter((p) => driverStage(p) === s).length,
    ]),
  );
  must(
    !q.driver_stage ||
      ["all", "pending", "running", "ended"].includes(q.driver_stage),
    "司机补能分组无效",
  );
  const selected = rows.filter(
    (p) =>
      (!q.stage || q.stage === "all" || p.stage === q.stage) &&
      (!q.status || p.status === q.status) &&
      (!q.risk || q.risk !== "1" || p.risks.length) &&
      (!q.driver_stage ||
        q.driver_stage === "all" ||
        driverStage(p) === q.driver_stage),
  );
  return {
    ...pageRows(selected, q),
    counts,
    driver_counts,
    linked_count: rows.filter((p) => p.task_id).length,
    temporary_count: rows.filter((p) => !p.task_id).length,
    source: "SIMULATED",
    server_time: now(),
  };
}
export function chargingDetail(db, user, id) {
  get(db, user, "charging", id);
  const row = joinedPlans(db, user).find((p) => p.id === id);
  must(row, "补能计划不存在", 404);
  return {
    ...row,
    audit:
      user.role === "admin"
        ? db
            .prepare(
              "SELECT action,created_at,before_version,after_version,data FROM audit WHERE owner_id=? AND entity_id IN(?,?,?) ORDER BY created_at DESC LIMIT 60",
            )
            .all(
              row.owner_id,
              id,
              row.visit?.id || "",
              row.sessions[0]?.id || "",
            )
            .map(unpack)
        : [],
  };
}
export function stationWorkspace(db, user, q = {}) {
  readAdmin(user);
  const day = checkDay(q.date);
  if (q.station) get(db, user, "stations", q.station);
  const plans = filterPlans(joinedPlans(db, user), { ...q, date: "" }),
    keyword = String(q.q || "").toLowerCase();
  const visits = energyRows(db, user, "station-visits").filter(
    (v) =>
      (!q.station || v.station_id === q.station) &&
      (!day || energyDay(v.arrived_at) === day),
  );
  const planMap = new Map(plans.map((p) => [p.id, p]));
  const rows = [];
  for (const v of visits) {
    const vehicle = unpack(
      db
        .prepare("SELECT * FROM vehicles WHERE id=? AND owner_id=?")
        .get(v.vehicle_id, v.owner_id),
    );
    const p = planMap.get(v.plan_id);
    if (
      q.q &&
      !p &&
      ![v.code, vehicle?.code].some((x) => x?.toLowerCase().includes(keyword))
    )
      continue;
    rows.push({
      ...p,
      ...v,
      id: v.id,
      visit: v,
      vehicle_code: p?.vehicle_code || vehicle?.code,
      driver_name: p?.driver_name || "临时到站",
      plan_id: v.plan_id,
      plan_code: p?.code,
      quantity_kwh: p?.quantity_kwh,
      start_at: v.start_at || null,
      finish_at: v.finish_at || null,
      device_id: v.device_id || null,
      execution_status: v.status,
      sessions: p?.sessions || [],
      kind: "visit",
    });
  }
  for (const p of plans.filter(
    (p) =>
      p.status === "已确认" &&
      !p.visit &&
      !p.sessions.length &&
      (!day || energyDay(p.arrival_at) === day),
  ))
    rows.push({
      ...p,
      plan_id: p.id,
      plan_code: p.code,
      kind: "plan",
      execution_status: "待到站",
    });
  const counts = Object.fromEntries(
    ["待到站", "待服务", "补能中", "待核验", "已完成", "已取消"].map((s) => [
      s,
      rows.filter((r) => r.execution_status === s).length,
    ]),
  );
  counts.all = rows.length;
  const selected = rows
    .filter(
      (r) => !q.stage || q.stage === "all" || r.execution_status === q.stage,
    )
    .sort(
      (a, b) =>
        ["补能中", "待服务", "待核验", "待到站", "已完成", "已取消"].indexOf(
          a.execution_status,
        ) -
          ["补能中", "待服务", "待核验", "待到站", "已完成", "已取消"].indexOf(
            b.execution_status,
          ) ||
        (a.arrived_at || a.arrival_at).localeCompare(
          b.arrived_at || b.arrival_at,
        ),
    );
  const devices = energyRows(db, user, "devices")
    .filter((d) => !q.station || d.station_id === q.station)
    .map((d) => ({
      ...d,
      active_visit:
        visits.find(
          (v) => v.id === d.managed_visit_id && v.status === "补能中",
        ) || null,
    }));
  return {
    ...pageRows(selected, q),
    counts,
    devices,
    server_time: now(),
    source: "SIMULATED",
  };
}
export function sessionWorkspace(db, user, q = {}) {
  readAdmin(user);
  const day = checkDay(q.date),
    keyword = String(q.q || "").toLowerCase();
  const rows = energyRows(db, user, "sessions")
    .filter(
      (s) =>
        (!q.station || s.station_id === q.station) &&
        (!day || energyDay(s.start_at) === day),
    )
    .map((s) => {
      const own = (table, id) =>
        id
          ? unpack(
              db
                .prepare(`SELECT * FROM ${table} WHERE id=? AND owner_id=?`)
                .get(id, s.owner_id),
            )
          : null;
      const vehicle = own("vehicles", s.vehicle_id),
        station = own("stations", s.station_id),
        plan = own("charging", s.plan_id),
        task = own("tasks", s.task_id || plan?.task_id);
      return {
        ...s,
        vehicle_code: vehicle?.code,
        station_name: station?.name,
        plan_code: plan?.code,
        task_id: task?.id,
        task_code: task?.code,
      };
    })
    .filter(
      (s) =>
        (!q.status || s.status === q.status) &&
        (!keyword ||
          [s.code, s.vehicle_code, s.plan_code, s.task_code].some((v) =>
            v?.toLowerCase().includes(keyword),
          )),
    )
    .sort(
      (a, b) =>
        (a.status !== "待核验") - (b.status !== "待核验") ||
        b.finish_at.localeCompare(a.finish_at),
    );
  return pageRows(rows, q);
}
export function energyAnalysis(db, user, q = {}) {
  readAdmin(user);
  const station = get(db, user, "stations", text(q.station, "场站", 160)),
    date = checkDay(q.date);
  must(date, "请选择日期");
  if (q.device) {
    const d = get(db, user, "devices", q.device);
    must(d.station_id === station.id, "计量工位不属于场站");
  }
  const samples = energyRows(
    db,
    user,
    q.device ? "device-loads" : "loads",
  ).filter(
    (l) =>
      l.station_id === station.id &&
      (!q.device || l.device_id === q.device) &&
      energyDay(l.source_time || l.created_at) === date,
  );
  const latest = new Map();
  for (const l of samples) {
    const old = latest.get(l.hour);
    if (
      !old ||
      (l.source_time || l.created_at) > (old.source_time || old.created_at)
    )
      latest.set(l.hour, l);
  }
  const plans = filterPlans(joinedPlans(db, user), {
    station: station.id,
    date,
  }).filter((p) => p.status === "已确认" && !p.sessions.length);
  const devices = energyRows(db, user, "devices").filter(
    (d) =>
      d.station_id === station.id &&
      d.connection === "在线" &&
      ["空闲", "占用"].includes(d.status),
  );
  const baseTime = +new Date(date + "T00:00:00+08:00"),
    nowMs = Date.now(),
    demand = Array(24).fill(0),
    planIntervals = [];
  for (const p of plans) {
    if (q.device && p.device_id !== q.device) continue;
    const usable = devices.filter((d) => !q.device || d.id === q.device),
      power = Math.min(
        station.power_kw / Math.max(1, devices.length),
        ...usable.map((d) => d.power_kw),
      );
    if (!usable.length || !(power > 0)) continue;
    const start = +new Date(p.start_at || p.arrival_at),
      duration =
        station.mode === "换电"
          ? (station.service_minutes || 10) * 60000
          : (p.quantity_kwh / power) * 3600000;
    const end = p.finish_at ? +new Date(p.finish_at) : start + duration;
    if (!(end > start)) continue;
    // Replacement batteries are replenished against reference charging power; not energy delivered by a swap robot.
    const kw =
      station.mode === "换电"
        ? p.quantity_kwh / ((end - start) / 3600000)
        : Math.min(power, p.quantity_kwh / ((end - start) / 3600000));
    planIntervals.push({
      ...p,
      estimated_start_at: new Date(start).toISOString(),
      estimated_finish_at: new Date(end).toISOString(),
      estimated_kw: kw,
    });
    for (let h = 0; h < 24; h++) {
      const overlap = Math.max(
        0,
        Math.min(end, baseTime + (h + 1) * 3600000) -
          Math.max(start, baseTime + h * 3600000),
      );
      demand[h] += (kw * overlap) / 3600000;
    }
  }
  const actual = [...latest.values()].filter(
      (l) => l.actual_kw != null && baseTime + l.hour * 3600000 <= nowMs,
    ),
    background = actual.length
      ? Math.min(...actual.map((l) => l.actual_kw))
      : 0;
  const series = Array.from({ length: 24 }, (_, hour) => {
    const l = latest.get(hour),
      past = baseTime + hour * 3600000 <= nowMs;
    return {
      hour,
      actual_kw: past ? (l?.actual_kw ?? null) : null,
      predicted_kw:
        demand[hour] > 0
          ? Math.round((q.device ? 0 : background) + demand[hour])
          : null,
      planned_energy_kwh: Math.round(demand[hour] * 100) / 100,
    };
  });
  const resources = energyRows(db, user, "energy-resources").filter(
    (r) =>
      r.station_id === station.id &&
      r.status === "仿真已核验" &&
      +new Date(r.effective_start) <= baseTime &&
      +new Date(r.effective_end) > baseTime,
  );
  const grid = resources.find((r) => r.kind === "电网");
  const limit = Math.min(
    station.power_kw,
    grid?.grid_capacity_kw ?? Infinity,
    grid?.transformer_limit_kw ?? Infinity,
  );
  const risks = series
    .filter((s) => s.predicted_kw > limit)
    .map((s) => ({
      hour: s.hour,
      excess_kw: s.predicted_kw - limit,
      plan_ids: planIntervals
        .filter(
          (p) =>
            +new Date(p.estimated_start_at) <
              baseTime + (s.hour + 1) * 3600000 &&
            +new Date(p.estimated_finish_at) > baseTime + s.hour * 3600000,
        )
        .map((p) => p.id),
    }));
  const affectedIds = new Set(risks.flatMap((r) => r.plan_ids));
  const affected = planIntervals
    .filter((p) => affectedIds.has(p.id))
    .map((p) => ({
      ...p,
      adjustable:
        !!p.task_finish_at &&
        +new Date(p.task_finish_at) - +new Date(p.estimated_finish_at) >=
          30 * 60000,
    }));
  const sessions = energyRows(db, user, "sessions").filter(
    (s) =>
      s.station_id === station.id &&
      s.status === "已核验" &&
      energyDay(s.start_at) === date &&
      (!q.device || s.device_id === q.device),
  );
  const measuredEnergy = actual.reduce(
    (sum, l) => sum + l.actual_kw * ((l.granularity_minutes ?? 60) / 60),
    0,
  );
  return {
    station,
    date,
    device_id: q.device || null,
    series,
    limit_kw: limit,
    peak_kw: actual.length ? Math.max(...actual.map((l) => l.actual_kw)) : null,
    energy_kwh: actual.length ? Math.round(measuredEnergy * 100) / 100 : null,
    sample_count: actual.length,
    sample_coverage: actual.length / 24,
    known_cost_cents: sessions.length
      ? sessions.reduce((s, r) => s + r.amount_cents, 0)
      : null,
    cost_sessions: sessions.length,
    risks,
    affected,
    plans: planIntervals,
    devices,
    source: "SIMULATED",
    calculated_at: now(),
    assumptions: [
      "1小时区间平均功率样例换算电量；总表与分表不相加",
      "预测按计划服务时段分摊及有效样本低值背景负荷，非现场校准模型",
      ...(station.mode === "换电"
        ? ["换电需求按参考电池回充情景折算，非现场回充曲线"]
        : []),
    ],
  };
}
export function energyPlanWorkspace(db, user, q = {}) {
  readAdmin(user);
  const date = checkDay(q.date);
  if (q.station) get(db, user, "stations", q.station);
  const rows = energyRows(db, user, "energy-plans")
    .filter(
      (p) =>
        (!q.station || p.station_id === q.station) &&
        (!date ||
          (p.date ||
            energyDay(p.effective_window?.start_at || p.created_at)) === date),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return pageRows(rows, q);
}
