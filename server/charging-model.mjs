import { allRows, save } from "./completion.mjs";
import { get, allowed, version } from "./repository.mjs";
import { must } from "./db.mjs";
import { distanceKm, availableIn } from "./scheduling.mjs";
import { patch } from "./transport.mjs";
export function optimizeCharging(db, user, options = {}) {
  allowed(user, "forecast.run");
  const plans = allRows(db, user, "charging")
    .filter(
      (p) =>
        ["草稿", "待确认", "已确认"].includes(p.status) &&
        (!options.plan_ids || options.plan_ids.includes(p.id)) &&
        !db.prepare("SELECT 1 FROM sessions WHERE plan_id=?").get(p.id) &&
        !db
          .prepare(
            "SELECT 1 FROM records WHERE resource='station-visits' AND json_extract(data,'$.plan_id')=? AND status<>'已取消'",
          )
          .get(p.id),
    )
    .sort((a, b) => a.arrival_at.localeCompare(b.arrival_at));
  must(plans.length, "没有可优化的补能计划");
  const stations = allRows(db, user, "stations"),
    devices = allRows(db, user, "devices");
  const alternatives = [
    { id: "original", name: "保留场站、调整时序", allowStations: false },
    { id: "balanced", name: "比较适配场站与等待", allowStations: true },
  ].map((strategy) => {
    const slots = new Map(),
      changes = [],
      violations = [];
    let totalCost = 0,
      totalWait = 0;
    for (const p of plans) {
      const v = get(db, user, "vehicles", p.vehicle_id),
        task = p.task_id ? get(db, user, "tasks", p.task_id) : null;
      let candidates = [];
      for (const st of stations.filter(
        (s) =>
          s.owner_id === p.owner_id &&
          s.status === "运营中" &&
          s.compatibility === v.compatibility &&
          (strategy.allowStations || s.id === p.station_id),
      )) {
        const online = devices.filter(
          (d) =>
            d.station_id === st.id &&
            d.connection === "在线" &&
            ["空闲", "占用"].includes(d.status),
        );
        if (!online.length || st.power_kw <= 0 || !st.price_curve?.length)
          continue;
        if (
          st.mode === "换电" &&
          (!(st.inventory > 0) ||
            (st.supported_capacity_kwh &&
              !st.supported_capacity_kwh.includes(v.capacity_kwh)))
        )
          continue;
        const distance =
            st.id === p.station_id
              ? 0
              : (distanceKm(
                  [v.longitude, v.latitude],
                  [st.longitude, st.latitude],
                ) || 0) * 1.25,
          socAfter =
            v.soc - ((distance * v.energy_per_km) / v.capacity_kwh) * 100;
        if (!Number.isFinite(socAfter) || socAfter < 20) continue;
        const arrival = +new Date(p.arrival_at) + (distance / 35) * 3600000;
        for (const d of online) {
          const release = d.status === "占用" ? +new Date(d.release_at) : 0;
          if (d.status === "占用" && !Number.isFinite(release)) continue;
          const start = Math.max(arrival, slots.get(d.id) || release),
            power = Math.min(d.power_kw, st.power_kw / online.length),
            minutes =
              st.mode === "换电"
                ? st.service_minutes || 10
                : (p.quantity_kwh / power) * 60,
            end = start + minutes * 60000;
          if (task && end > +new Date(task.finish_at)) continue;
          if (
            !availableIn(
              st,
              new Date(start).toISOString(),
              new Date(end).toISOString(),
            )
          )
            continue;
          const hour = (new Date(start).getUTCHours() + 8) % 24,
            tariff = st.price_curve.find((t) => t.hour === hour);
          if (!tariff) continue;
          const cost =
            p.quantity_kwh * (tariff.electricity + tariff.service) * 100;
          candidates.push({
            id: p.id,
            expected_version: p.version,
            station_id: st.id,
            station_version: st.version,
            vehicle_version: v.version,
            device_id: d.id,
            device_version: d.version,
            task_id: task?.id,
            task_version: task?.version,
            original_station_id: p.station_id,
            original_at: p.arrival_at,
            arrival_at: new Date(start).toISOString(),
            finish_at: new Date(end).toISOString(),
            soc_after_detour: socAfter,
            detour_km: distance,
            wait_minutes: (start - arrival) / 60000,
            known_cost_cents: Math.round(cost),
            feasible: true,
            mode: st.mode,
          });
        }
      }
      candidates.sort(
        (a, b) =>
          a.wait_minutes - b.wait_minutes ||
          a.known_cost_cents - b.known_cost_cents,
      );
      const chosen = candidates[0];
      if (chosen) {
        changes.push(chosen);
        slots.set(chosen.device_id, +new Date(chosen.finish_at));
        totalCost += chosen.known_cost_cents;
        totalWait += chosen.wait_minutes;
      } else
        violations.push({
          plan_id: p.id,
          kind: "无满足时窗、SOC余量及设备条件的候选",
        });
    }
    return {
      ...strategy,
      changes,
      feasible: !violations.length,
      violations,
      known_cost_cents: totalCost,
      wait_minutes: totalWait,
    };
  });
  return save(
    db,
    user,
    "charging-optimizations",
    "补能场站与时序候选",
    {
      alternatives,
      changes: alternatives[0].changes,
      selected: "original",
      reference_only: true,
      assumptions: [
        "按授权计划、电量、在线工位、共享供电及参考SOC核验",
        "绕行采用区域坐标几何情景；先比较等待，再比较已知补能费用",
        "确认仅更新内部计划，不代表外部预约或现场安全批准",
      ],
    },
    "待确认",
  );
}
export function applyCharging(db, user, id, b) {
  allowed(user, "charging.write");
  const r = get(db, user, "charging-optimizations", id);
  version(r, b);
  must(r.status === "待确认", "候选已处理");
  must(b.evidence, "请填写时效与电量复核依据");
  const alternative = r.alternatives.find(
    (a) => a.id === (b.alternative_id || r.selected),
  );
  must(alternative?.feasible, "候选存在缺项或冲突，整批不调整");
  for (const c of alternative.changes) {
    const p = get(db, user, "charging", c.id);
    version(p, c);
    must(
      get(db, user, "stations", c.station_id).version === c.station_version,
      "场站已变化，请重算",
      409,
    );
    const d = get(db, user, "devices", c.device_id);
    must(
      d.version === c.device_version &&
        d.connection === "在线" &&
        ["空闲", "占用"].includes(d.status),
      "工位已变化，请重算",
      409,
    );
    must(
      get(db, user, "vehicles", p.vehicle_id).version === c.vehicle_version,
      "车辆边界已变化，请重算",
      409,
    );
    if (c.task_id)
      must(
        get(db, user, "tasks", c.task_id).version === c.task_version,
        "运输任务已变化，请重算",
        409,
      );
    must(
      !db.prepare("SELECT 1 FROM sessions WHERE plan_id=?").get(c.id),
      "已有作业事实不能覆盖计划",
    );
  }
  for (const c of alternative.changes) {
    const p = get(db, user, "charging", c.id);
    patch(db, "charging", c.id, {
      station_id: c.station_id,
      arrival_at: c.arrival_at,
      data: {
        ...p,
        mode: c.mode,
        prior_arrival_at: c.original_at,
        prior_station_id: c.original_station_id,
        optimization_id: id,
        review_evidence: b.evidence,
        device_id: c.device_id,
        start_at: c.start_at,
        finish_at: c.finish_at,
        wait_minutes: c.wait_minutes,
        time_reference: true,
      },
    });
  }
  patch(db, "records", id, {
    status: "已确认调整",
    data: { ...r, selected: alternative.id, changes: alternative.changes },
  });
  return { id };
}
