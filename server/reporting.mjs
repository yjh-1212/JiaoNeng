import { allRows } from "./completion.mjs";
import { allowed, get } from "./repository.mjs";
import { must, now } from "./db.mjs";
export function reportData(db, user, q = {}) {
  must(user.role === "admin", "仅管理员可查经营报表", 403);
  allowed(user, "read");
  const query = { from: q.from, to: q.to, owner: q.owner, station: q.station };
  if (q.owner) must(user.scopes.includes(q.owner), "无此主体范围", 403);
  if (q.station) get(db, user, "stations", q.station);
  const tasks = allRows(db, user, "tasks", query).filter(
      (t) =>
        !q.station ||
        t.station_id === q.station ||
        db
          .prepare("SELECT 1 FROM charging WHERE task_id=? AND station_id=?")
          .get(t.id, q.station),
    ),
    ids = new Set(tasks.map((t) => t.id)),
    sessions = allRows(db, user, "sessions", query).filter(
      (s) => s.status === "已核验",
    ),
    costs = allRows(db, user, "costs", {
      from: q.from,
      to: q.to,
      owner: q.owner,
    }).filter(
      (c) =>
        !q.station ||
        (c.task_id && ids.has(c.task_id)) ||
        (c.session_id && sessions.some((s) => s.id === c.session_id)),
    ),
    alerts = allRows(db, user, "alerts", {
      from: q.from,
      to: q.to,
      owner: q.owner,
    }).filter(
      (a) =>
        !q.station ||
        (a.task_id && ids.has(a.task_id)) ||
        a.object === q.station,
    );
  const validCosts = costs.filter(
      (c) => c.nature === "实际" && c.status === "已核验",
    ),
    estimated = costs.filter((c) => c.nature === "预计" && c.status === "预计"),
    sum = (rows, k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const details = tasks.map((t) => {
    const actual = validCosts.filter((c) => c.task_id === t.id),
      expected = estimated.filter((c) => c.task_id === t.id),
      categories = new Set(actual.map((c) => c.category));
    const missing = ["电费及服务费", "运输费用", "租赁费用", "维保费用"].filter(
      (k) => !categories.has(k),
    );
    return {
      id: t.id,
      code: t.code,
      vehicle_id: t.vehicle_id,
      station_id: t.station_id || null,
      verified_kg: t.verified_kg,
      reported_kg: t.reported_kg,
      status: t.status,
      expected_cents: sum(expected, "amount_cents"),
      actual_cents: sum(actual, "amount_cents"),
      difference_cents:
        expected.length && actual.length
          ? sum(actual, "amount_cents") - sum(expected, "amount_cents")
          : null,
      missing_categories: missing,
      unit_cost_cents_per_tonne:
        !missing.length && t.verified_kg
          ? sum(actual, "amount_cents") / (t.verified_kg / 1000)
          : null,
    };
  });
  const group = (field) => {
    const m = new Map();
    for (const d of details) {
      const key = d[field] || "未关联",
        r = m.get(key) || {
          id: key,
          count: 0,
          verified_kg: 0,
          actual_cents: 0,
          expected_cents: 0,
        };
      r.count++;
      r.verified_kg += d.verified_kg;
      r.actual_cents += d.actual_cents;
      r.expected_cents += d.expected_cents;
      m.set(key, r);
    }
    return [...m.values()];
  };
  return {
    generated_at: now(),
    source: "SIMULATED",
    scope: {
      ...q,
      time_basis: "任务开始、补能作业开始、费用登记与告警发生，区间左闭右开",
      valid_cost_basis: "已核验实际费用及有效预计版本",
    },
    summary: {
      verified_tonnes: sum(tasks, "verified_kg") / 1000,
      reported_tonnes: sum(tasks, "reported_kg") / 1000,
      actual_energy: sum(sessions, "quantity_kwh"),
      actual_cost_cents: sum(validCosts, "amount_cents"),
      estimated_cost_cents: sum(estimated, "amount_cents"),
      active_tasks: tasks.filter((t) =>
        ["待接收", "已接收", "执行中", "待核验", "退回补充"].includes(t.status),
      ).length,
      open_alerts: alerts.filter((a) => a.status !== "已关闭").length,
    },
    details,
    by_vehicle: group("vehicle_id"),
    by_station: group("station_id"),
    source_records: {
      tasks: tasks.map((t) => t.id),
      sessions: sessions.map((s) => s.id),
      costs: validCosts.map((c) => c.id),
      alerts: alerts.map((a) => a.id),
    },
  };
}
