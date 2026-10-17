import { must, number } from "./db.mjs";
const minute = 60000;
const iso = (n) => new Date(n).toISOString();
export function parseWindow(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{2}):(\d{2})\s*[—–-]\s*(\d{2}):(\d{2})$/);
  must(
    m &&
      +m[1] < 24 &&
      +m[2] < 60 &&
      +m[3] <= 24 &&
      +m[4] < 60 &&
      (+m[3] !== 24 || +m[4] === 0),
    "可用窗口应为HH:mm—HH:mm",
  );
  return { start: +m[1] * 60 + +m[2], finish: +m[3] * 60 + +m[4] };
}
export function availableIn(resource, start, finish) {
  if (resource.available_windows?.length)
    return resource.available_windows.some(
      (w) =>
        new Date(w.start_at) <= new Date(start) &&
        new Date(w.finish_at) >= new Date(finish),
    );
  const w = parseWindow(resource.available_window);
  if (!w) return false;
  const s = +new Date(start) + 8 * 3600000,
    e = +new Date(finish) + 8 * 3600000,
    day = Math.floor(s / 86400000) * 86400000;
  return [day, day - 86400000].some(
    (d) =>
      s >= d + w.start * minute &&
      e <= d + (w.finish > w.start ? w.finish : w.finish + 1440) * minute,
  );
}
export function distanceKm(a, b) {
  if (!a || !b) return null;
  const rad = (x) => (x * Math.PI) / 180,
    dlat = rad(b[1] - a[1]),
    dlon = rad(b[0] - a[0]);
  return (
    6371 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dlon / 2) ** 2,
      ),
    )
  );
}
export function scheduleCandidate({
  order,
  station,
  devices,
  vehicles,
  drivers,
  allocations,
  soc,
  reserve,
  offset = 0,
  id = "A",
  name,
}) {
  must(
    Array.isArray(station.price_curve) && station.price_curve.length === 24,
    "缺少完整分时计价边界",
  );
  must(station.power_kw > 0, "有效供电功率缺失");
  const online = devices.filter(
    (d) => d.connection === "在线" && ["空闲", "占用"].includes(d.status),
  );
  must(online.length, "没有在线服务工位");
  const base = +new Date(order.start_at),
    slots = online.map((d) =>
      d.status === "占用"
        ? Math.max(base, +new Date(JSON.parse(d.data || "{}").release_at))
        : base,
    );
  must(slots.every(Number.isFinite), "占用工位缺少可核验释放时间");
  const batterySlots = Array.from(
      { length: Math.max(0, Math.floor(station.inventory || 0)) },
      () => base,
    ),
    violations = [],
    assignments = [];
  for (const [index, a] of allocations.entries()) {
    const v = vehicles.find((v) => v.id === a.vehicle_id),
      d = drivers.find((d) => d.id === a.driver_id),
      nodes = [],
      charging_events = [];
    const capacity = number(v.capacity_kwh, "电池容量", 1, 2000),
      rate = number(v.energy_per_km, "参考能耗", 0.1, 10),
      floor = (capacity * reserve) / 100;
    let t = base + (offset + index * (id === "A" ? 5 : 0)) * minute,
      battery = (capacity * soc) / 100,
      energy = 0,
      distance = 0,
      wait = 0,
      charge = 0,
      cost = 0,
      service = 0;
    const node = (kind, duration, extra = {}) => {
      const start = t;
      t += duration * minute;
      nodes.push({ kind, start_at: iso(start), finish_at: iso(t), ...extra });
    };
    const drive = (kind, km, speed) => {
      const used = km * rate;
      node(kind, (km / speed) * 60, {
        distance_km: km,
        energy_kwh: used,
        soc_before: (battery / capacity) * 100,
        soc_after: ((battery - used) / capacity) * 100,
      });
      battery -= used;
      energy += used;
      distance += km;
      if (battery < floor - 0.001)
        violations.push({
          vehicle_id: v.id,
          kind: "电量余量",
          required_soc: reserve,
          actual_soc: (battery / capacity) * 100,
        });
    };
    const detour =
      (distanceKm(order.origin_coords, [station.longitude, station.latitude]) ||
        0) * 1.25;
    for (let trip = 1; trip <= a.trips; trip++) {
      const cycleEnergy = order.distance_km * 2 * rate;
      if (battery - cycleEnergy < floor) {
        if (battery - detour * rate < floor) {
          violations.push({ vehicle_id: v.id, kind: "补能不可达", trip });
          break;
        }
        drive("驶入补能站", detour, 35);
        const arrival = t,
          slot = slots.indexOf(Math.min(...slots));
        let start = Math.max(t, slots[slot]),
          batteryIndex = -1;
        if (station.mode === "换电") {
          if (
            station.supported_capacity_kwh &&
            !station.supported_capacity_kwh.includes(capacity)
          ) {
            violations.push({ vehicle_id: v.id, kind: "缺少适配规格电池" });
            break;
          }
          if (!batterySlots.length) {
            violations.push({ vehicle_id: v.id, kind: "可用电池缺失" });
            break;
          }
          batteryIndex = batterySlots.indexOf(Math.min(...batterySlots));
          start = Math.max(start, batterySlots[batteryIndex]);
        }
        if (start > t) {
          wait += (start - t) / minute;
          node("补能等待", (start - t) / minute);
        }
        const target = Math.max(
          capacity * 0.8,
          floor + cycleEnergy + detour * rate,
        );
        if (target > capacity) {
          violations.push({ vehicle_id: v.id, kind: "单趟能量超过有效容量" });
          break;
        }
        const quantity = target - battery,
          power = Math.min(
            online[slot].power_kw,
            station.power_kw / online.length,
          ),
          duration = station.mode === "换电" ? 10 : (quantity / power) * 60;
        must(power > 0, "工位有效功率缺失");
        const begin = t;
        let localCost = 0,
          remaining = quantity,
          at = t;
        while (remaining > 0.00001) {
          const hour = (new Date(at).getUTCHours() + 8) % 24,
            tariff = station.price_curve.find((p) => p.hour === hour);
          must(
            tariff &&
              Number.isFinite(tariff.electricity) &&
              Number.isFinite(tariff.service),
            "价格时段缺项",
          );
          const untilHour =
            (60 -
              new Date(at).getUTCMinutes() -
              new Date(at).getUTCSeconds() / 60) *
            minute;
          const q =
            station.mode === "换电"
              ? remaining
              : Math.min(remaining, (power * untilHour) / 3600000);
          localCost += q * (tariff.electricity + tariff.service);
          remaining -= q;
          at += (q / power) * 3600000;
        }
        node(station.mode === "换电" ? "换电作业" : "充电作业", duration, {
          quantity_kwh: quantity,
          device_id: online[slot].id,
          station_id: station.id,
        });
        slots[slot] = t;
        if (batteryIndex >= 0)
          batterySlots[batteryIndex] =
            t +
            (quantity / Math.max(1, station.power_kw / batterySlots.length)) *
              3600000;
        charging_events.push({
          arrival_at: iso(arrival),
          start_at: iso(begin),
          finish_at: iso(t),
          quantity_kwh: quantity,
          device_id: online[slot].id,
          known_cost_cents: Math.round(localCost * 100),
        });
        charge += quantity;
        cost += localCost;
        service += duration;
        battery = target;
        drive("返回装货点", detour, 35);
      }
      node("装货", order.loading_minutes || 10, { trip });
      drive("重载运输", order.distance_km, 35);
      node("卸货交付", order.unloading_minutes || 10, { trip });
      drive("空载返程", order.distance_km, 45);
    }
    if (t > +new Date(order.finish_at))
      violations.push({
        vehicle_id: v.id,
        kind: "运输时效",
        finish_at: iso(t),
      });
    for (const resource of [v, d, station])
      if (
        !availableIn(
          resource,
          iso(base + (offset + index * (id === "A" ? 5 : 0)) * minute),
          iso(t),
        )
      )
        violations.push({
          object_id: resource.id,
          kind: "可用排班窗口",
          window: resource.available_window || "缺失",
        });
    assignments.push({
      ...a,
      start_at: nodes[0]?.start_at || iso(base),
      finish_at: iso(t),
      distance_km: distance,
      energy_kwh: energy,
      charging_kwh: charge,
      known_cost_cents: Math.round(cost * 100),
      service_minutes: service,
      wait_minutes: wait,
      nodes,
      charging_events,
    });
  }
  const sum = (k) => assignments.reduce((n, a) => n + a[k], 0);
  return {
    id,
    name,
    offset,
    assignments,
    trips: allocations.reduce((n, a) => n + a.trips, 0),
    energy_kwh: sum("energy_kwh"),
    distance_km: sum("distance_km"),
    known_cost_cents: sum("known_cost_cents"),
    wait_minutes: Math.round(sum("wait_minutes")),
    finish_at: iso(
      Math.max(base, ...assignments.map((a) => +new Date(a.finish_at))),
    ),
    feasible: !violations.length,
    constraint_violations: violations,
    exclusions: [
      "人工、租赁、维保等未纳入",
      "路网、安全阈值及资源均为仿真/参考条件",
    ],
    station_id: station.id,
    model: "REFERENCE-NODE-SCHEDULE-V2",
  };
}
