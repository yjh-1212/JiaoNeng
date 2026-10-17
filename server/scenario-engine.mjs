import { must, number, text } from "./db.mjs";
import { validCoordinate } from "./maps.mjs";
const M = 60000,
  iso = (t) => new Date(t).toISOString(),
  round = (n) => Math.round(n * 100) / 100;
export const phases = {
  load_wait: "装载排队",
  load: "装载",
  drive: "重载行驶",
  charge_wait: "补能排队",
  charge: "补能",
  unload_wait: "卸载排队",
  unload: "卸载",
  return: "空载返程",
};
export function validateInputs(b) {
  const out = { ...b };
  if(b.route_strategy!=null)must([32,34,36].includes(b.route_strategy),'路线策略无效');
  for (const [k, label, min, max] of [
    ["quantity", "运输量", 0.1, 100000],
    ["vehicle_count", "车辆数", 1, 60],
    ["payload", "标准载重", 1, 60],
    ["capacity", "电池容量", 100, 1000],
    ["initial_soc", "初始SOC", 1, 100],
    ["min_soc", "最低SOC", 5, 50],
    ["target_soc", "补能目标SOC", 20, 100],
    ["speed", "重载速度", 5, 80],
    ["empty_speed", "空载速度", 5, 90],
    ["consumption", "重载能耗", 0.3, 5],
    ["empty_consumption", "空载能耗", 0.3, 5],
    ["loading_slots", "装载车位", 1, 30],
    ["unloading_slots", "卸载车位", 1, 30],
    ["loading_minutes", "装载分钟", 1, 180],
    ["unloading_minutes", "卸载分钟", 1, 180],
    ["load_queue_limit", "装载队列上限", 0, 100],
    ["unload_queue_limit", "卸载队列上限", 0, 100],
    ["departure_interval", "发车间隔", 0, 120],
    ["batch_size", "批次车数", 1, 60],
    ["batch_interval", "批次间隔", 1, 180],
    ["max_charge_minutes", "补能时长上限", 5, 240],
    ["max_wait", "补能等待上限", 0, 240],
    ["forecast_hours", "预测窗口", 1, 4],
    ["external_weight", "社会车流权重", 0, 3],
    ["external_arrivals", "社会到达车次/小时", 0, 30],
    ["background_service", "社会车辆补能分钟", 5, 180],
    ["congestion_tolerance", "拥堵容忍度", 0, 100],
    ["cost_km", "非能源运输成本", 0, 20],
    ["driver_hour", "司机小时成本", 0, 300],
    ["max_driver_hours", "司机工时", 1, 24],
  ])
    out[k] = number(b[k], label, min, max);
  for (const k of [
    "vehicle_count",
    "loading_slots",
    "unloading_slots",
    "load_queue_limit",
    "unload_queue_limit",
    "batch_size",
  ])
    must(Number.isInteger(out[k]), "数量/车位必须为整数");
  must([1, 2, 4].includes(out.forecast_hours), "预测窗口应为1、2或4小时");
  must(out.target_soc > out.min_soc, "补能目标SOC必须高于最低SOC");
  must(out.initial_soc >= out.min_soc, "初始SOC低于最低安全余量");
  out.name = text(b.name, "场景名称", 100);
  out.cargo = text(b.cargo, "货物", 40);
  must(
    ["auto", "interval", "batch"].includes(b.departure_strategy),
    "发车策略无效",
  );
  must(
    ["time", "cost", "balanced", "charges", "queue", "vehicles"].includes(
      b.objective,
    ),
    "优化目标无效",
  );
  must(["normal", "high"].includes(b.priority), "任务优先级无效");
  must(["charge", "swap", "both"].includes(b.vehicle_type), "车辆类型无效");
  for (const k of [
    "include_external",
    "allow_cross_station",
    "allow_detour",
    "prefer_low_load",
    "prefer_same_type",
    "appointments",
  ])
    must(typeof b[k] === "boolean", "约束开关无效");
  for (const k of ["origin", "destination"]) {
    must(
      b[k] && validCoordinate([b[k].lng, b[k].lat]),
      "请在地图上确认起终点位置",
    );
    out[k] = {
      name: text(b[k].name, "位置名称", 100),
      lng: b[k].lng,
      lat: b[k].lat,
    };
  }
  must(
    JSON.stringify(out.origin) !== JSON.stringify(out.destination),
    "起终点不能相同",
  );
  const start = +new Date(b.start_at),
    end = +new Date(b.deadline);
  must(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      end - start <= 7 * 86400000,
    "运输时窗应为正数且不超过7天",
  );
  out.start_at = iso(start);
  out.deadline = iso(end);
  for (const k of ["loading_window", "unloading_window"]) {
    must(
      /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]|24):[0-5]\d$/.test(b[k]) &&
        !b[k].endsWith("24:01"),
      "作业时段格式应为HH:mm-HH:mm",
    );
    const [s, e] = b[k].split("-").map((t) => {
      const [h, m] = t.split(":").map(Number);
      must(h < 24 || m === 0, "24点只能写24:00");
      return h * 60 + m;
    });
    must(s !== e, "作业时段起止不能相同");
    must(
      Math.max(out.loading_minutes, out.unloading_minutes) <=
        ((e - s + 1440) % 1440 || 1440),
      "单次作业不能长于可用时段",
    );
  }
  must(
    Array.isArray(b.station_ids) &&
      b.station_ids.length <= 8 &&
      new Set(b.station_ids).size === b.station_ids.length,
    "候选补能站数量不能超过8个",
  );
  must(
    Math.ceil(out.quantity / out.payload) <= 5000,
    "车次过多，请拆分推演范围",
  );
  return out;
}
const earlier = (a, b) =>
  a.t < b.t || (a.t === b.t && (a.car?.priority || 0) > (b.car?.priority || 0));
class Heap {
  a = [];
  push(v) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (!earlier(v, a[p])) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = v;
  }
  pop() {
    const a = this.a,
      v = a[0],
      last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1;
        if (c + 1 < a.length && earlier(a[c + 1], a[c])) c++;
        if (!earlier(a[c], last)) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return v;
  }
}
function openAt(at, duration, window) {
  if (!window) return at;
  const [s, e] = window
    .replace(/[—–]/g, "-")
    .split("-")
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    });
  const d = Math.floor((at + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
  for (let offset = -1; offset < 10; offset++) {
    const start = d + offset * 86400000 + s * M,
      end = d + offset * 86400000 + (e > s ? e : e + 1440) * M;
    const time = Math.max(at, start);
    if (time + duration * M <= end) return time;
  }
  return Infinity;
}
function pool(count, start) {
  return { slots: Array(count).fill(start), bookings: [] };
}
function reserve(resource, arrival, minutes, window, meta = {}) {
  const options = resource.slots
    .map((t, i) => ({
      i,
      start: openAt(Math.max(t, arrival), minutes, window),
    }))
    .sort((a, b) => a.start - b.start);
  const { i, start } = options[0],
    end = start + minutes * M;
  resource.slots[i] = end;
  const booking = { arrival, start, end, slot: i, ...meta };
  resource.bookings.push(booking);
  return booking;
}
const queueAt = (p, t) =>
  p.bookings.filter((b) => b.arrival <= t && b.start > t).length;
export function tariffCost(station, amount, start, end) {
  let cost = 0;
  for (let t = start; t < end; ) {
    const hour = new Date(t + 8 * 3600000).getUTCHours(),
      boundary = Math.floor(t / 3600000) * 3600000 + 3600000,
      until = station.mode === "换电" ? end : Math.min(end, boundary),
      price = station.price_curve?.find((p) => p.hour === hour);
    cost +=
      ((amount * (until - t)) / (end - start)) *
      ((price?.electricity ?? 0.68) + (price?.service ?? 0.6));
    t = until;
  }
  return Math.round(cost * 100);
}
export function simulateCandidate(
  inputs,
  network,
  stations,
  background,
  id,
  mode,
) {
  const i = inputs,
    start = +new Date(i.start_at),
    deadline = +new Date(i.deadline),
    horizon = deadline + 24 * 3600000,
    count =
      mode === "balanced" && i.objective === "vehicles"
        ? Math.max(1, i.vehicle_count - 1)
        : i.vehicle_count,
    cars = Array.from({ length: count }, (_, n) => ({
      id: "SIM-" + String(n + 1).padStart(2, "0"),
      soc: i.initial_soc,
      priority: i.priority === "high" ? 1 : 0,
      nodes: [],
      quantity_kg: 0,
      trips: 0,
      distance_km: 0,
      energy_kwh: 0,
      charge_cost_cents: 0,
      finish: start,
    })),
    loading = pool(i.loading_slots, start),
    unloading = pool(i.unloading_slots, start),
    ss = stations.map((s) => ({ ...s, pool: pool(s.slots, start) })),
    events = [],
    heap = new Heap(),
    violations = [];
  let remaining = Math.round(i.quantity * 1000),
    delivered = 0,
    job = 0,
    iterations = 0;
  const violation = (kind, vehicle, message) => {
    if (!violations.some((v) => v.kind === kind && v.vehicle_id === vehicle))
      violations.push({ kind, vehicle_id: vehicle, message });
  };
  const event = (t, kind, car, station) => {
    events.push({
      at: iso(t),
      kind: phases[kind] || kind,
      vehicle_id: car?.id || null,
      station_id: station || null,
    });
  };
  const node = (car, kind, t, end, extra = {}) => {
    if (end > t)
      car.nodes.push({
        kind,
        start_at: iso(t),
        finish_at: iso(end),
        soc_start: car.soc,
        soc_end: car.soc,
        ...extra,
      });
    car.finish = Math.max(car.finish, end);
  };
  const departure = (n) =>
    i.departure_strategy === "interval"
      ? n * i.departure_interval
      : i.departure_strategy === "batch"
        ? Math.floor(n / i.batch_size) * i.batch_interval
        : mode === "cost"
          ? n * 12
          : mode === "balanced"
            ? n * 6
            : 0;
  cars.forEach((car, n) =>
    heap.push({ t: start + departure(n) * M, kind: "load_arrive", car }),
  );
  const trafficEnd = horizon;
  for (const s of ss) {
    for (let n = 0; n < s.occupied; n++)
      reserve(s.pool, start, Math.max(5, s.occupied_minutes || 25), null, {
        kind: "occupied",
      });
    if (i.include_external && i.external_arrivals * i.external_weight > 0) {
      const base = i.external_arrivals * i.external_weight;
      for (
        let t = start + (s.id.charCodeAt(s.id.length - 1) % 7) * M;
        t < trafficEnd;

      ) {
        const hour = new Date(t + 8 * 3600000).getUTCHours(),
          factor =
            (hour >= 9 && hour < 12) || (hour >= 17 && hour < 21) ? 1.5 : 0.7;
        t += (60 / (base * factor)) * M;
        heap.push({
          t,
          kind: "background",
          station: s.id,
          minutes: i.background_service,
          source: "external",
        });
      }
    }
  }
  for (const b of background || [])
    if (
      ss.some((s) => s.id === b.station_id) &&
      b.at >= start &&
      b.at <= horizon
    )
      heap.push({
        t: b.at,
        kind: "background",
        station: b.station_id,
        minutes: b.minutes,
        source: "platform",
      });
  const drive = (car, t, key, next, loaded) => {
    const r = network[key];
    must(r?.coordinates?.length > 2, "缺少可用道路路线");
    const km = r.distance_m / 1000,
      energy = km * (loaded ? i.consumption : i.empty_consumption),
      end = t + (km / (loaded ? i.speed : i.empty_speed)) * 3600000,
      newSoc = car.soc - (energy / i.capacity) * 100;
    if (newSoc < i.min_soc - 0.001)
      violation("SOC", car.id, "到达电量低于安全SOC");
    node(car, loaded ? "drive" : "return", t, end, {
      path_key: key,
      distance_km: km,
      soc_end: round(newSoc),
    });
    car.soc = newSoc;
    car.energy_kwh += energy;
    car.distance_km += km;
    heap.push({ t: end, kind: next, car });
  };
  const travel = (car, t, from, loaded, next) => {
    const key = from === "origin" ? "direct" : "back",
      r = network[key],
      originEscape = ss.length
        ? Math.min(
            ...ss.map(
              (s) =>
                (network["origin_" + s.id].distance_m / 1000) * i.consumption,
            ),
          )
        : 0,
      destinationEscape = ss.length
        ? Math.min(
            ...ss.map(
              (s) =>
                (network["destination_" + s.id].distance_m / 1000) *
                i.empty_consumption,
            ),
          )
        : 0,
      // Preserve a reachable replenishment path, rather than returning to the loader at minimum SOC.
      nextEnergy =
        remaining > 0
          ? loaded
            ? Math.min(
                (network.back.distance_m / 1000) * i.empty_consumption +
                  originEscape,
                destinationEscape,
              )
            : originEscape
          : 0,
      need =
        (r.distance_m / 1000) * (loaded ? i.consumption : i.empty_consumption) +
        nextEnergy;
    if (car.soc - (need / i.capacity) * 100 >= i.min_soc) {
      drive(car, t, key, next, loaded);
      return;
    }
    let options = ss
      .map((s) => {
        const leg1 = network[from + "_" + s.id],
          leg2 =
            network[
              s.id + "_" + (from === "origin" ? "destination" : "origin")
            ];
        if (!leg1 || !leg2) return null;
        const energy =
            (leg1.distance_m / 1000) *
            (loaded ? i.consumption : i.empty_consumption),
          arrivalSoc = car.soc - (energy / i.capacity) * 100;
        if (
          arrivalSoc < i.min_soc ||
          i.target_soc -
            (((leg2.distance_m / 1000) *
              (loaded ? i.consumption : i.empty_consumption) +
              nextEnergy) /
              i.capacity) *
              100 <
            i.min_soc
        )
          return null;
        const hour = new Date(t + 8 * 3600000).getUTCHours(),
          price = s.price_curve?.find((p) => p.hour === hour),
          unit = (price?.electricity ?? 0.68) + (price?.service ?? 0.6),
          service =
            s.mode === "换电"
              ? s.service_minutes
              : Math.max(
                  5,
                  ((((i.target_soc - arrivalSoc) / 100) * i.capacity) /
                    s.power_kw) *
                    60 +
                    5,
                ),
          wait = Math.max(0, (Math.min(...s.pool.slots) - t) / M),
          driveMin =
            ((leg1.distance_m + leg2.distance_m) /
              1000 /
              (loaded ? i.speed : i.empty_speed)) *
            60,
          charge = ((i.target_soc - arrivalSoc) / 100) * i.capacity * unit;
        const detour =
          (leg1.distance_m + leg2.distance_m - r.distance_m) / 1000;
        if (!i.allow_detour && detour > 2) return null;
        if (!i.allow_cross_station && s.id !== i.station_ids[0]) return null;
        const score =
          mode === "cost"
            ? charge + driveMin * 0.2 + wait * 0.6
            : mode === "time"
              ? driveMin + service + wait
              : driveMin +
                service * 0.7 +
                wait * (i.prefer_low_load ? 2 : 1) +
                charge * 0.15;
        return {
          s,
          leg1,
          leg2,
          arrivalSoc,
          service,
          score: score + (i.prefer_same_type && s.mode !== ss[0].mode ? 10 : 0),
          key1: from + "_" + s.id,
          key2: s.id + "_" + (from === "origin" ? "destination" : "origin"),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    if (!options.length) {
      violation(
        "ENERGY_ROUTE",
        car.id,
        "当前电量与补能范围无法形成安全道路路径",
      );
      car.finish = t;
      car.blocked = true;
      car.done = true;
      return;
    }
    const choice = options[0];
    car.pending = { ...choice, next, loaded };
    drive(car, t, choice.key1, "station_arrive", loaded);
    if (choice.s.id !== i.station_ids[0])
      event(t, "推荐备选补能站", car, choice.s.id);
  };
  while (heap.a.length && !cars.every((c) => c.done) && iterations++ < 200000) {
    const e = heap.pop(),
      { car, t } = e;
    if (t > horizon) {
      if (car) {
        violation("HORIZON", car.id, "推演超出最长时间范围");
        car.blocked = true;
        car.done = true;
      }
      continue;
    }
    if (e.kind === "background") {
      const s = ss.find((s) => s.id === e.station);
      reserve(s.pool, t, e.minutes, s.window, { kind: e.source });
      continue;
    }
    if (e.kind === "load_arrive") {
      if (remaining <= 0) {
        car.done = true;
        continue;
      }
      const q = Math.min(remaining, Math.round(i.payload * 1000));
      remaining -= q;
      car.current_quantity = q;
      job++;
      const arrival = i.appointments
          ? Math.max(t, Math.min(...loading.slots))
          : t,
        booking = reserve(
          loading,
          arrival,
          i.loading_minutes,
          i.loading_window,
          { vehicle_id: car.id, kind: "scenario" },
        );
      const queue = queueAt(loading, arrival);
      if (queue > i.load_queue_limit)
        violation("LOAD_QUEUE", car.id, "装载排队超过上限");
      node(car, "load_wait", t, booking.start, { queue });
      node(car, "load", booking.start, booking.end);
      event(booking.start, "load", car);
      heap.push({ t: booking.end, kind: "load_done", car });
    } else if (e.kind === "load_done") {
      travel(car, t, "origin", true, "unload_arrive");
    } else if (e.kind === "station_arrive") {
      const { s, key2, next, loaded } = car.pending,
        target = i.target_soc,
        service =
          s.mode === "换电"
            ? s.service_minutes
            : Math.max(
                5,
                ((((target - car.soc) / 100) * i.capacity) / s.power_kw) * 60 +
                  5,
              ),
        booking = reserve(s.pool, t, service, s.window, {
          kind: "scenario",
          vehicle_id: car.id,
        }),
        wait = (booking.start - t) / M,
        amount = Math.max(0, ((target - car.soc) / 100) * i.capacity),
        cost = tariffCost(s, amount, booking.start, booking.end);
      if (wait > i.max_wait)
        violation("CHARGE_WAIT", car.id, "补能等待超过上限");
      if (service > i.max_charge_minutes)
        violation("CHARGE_DURATION", car.id, "单次补能时长超过上限");
      const queue = queueAt(s.pool, t);
      if (queue > i.congestion_tolerance)
        violation("CONGESTION", car.id, "场站拥堵超过容忍值");
      node(car, "charge_wait", t, booking.start, { station_id: s.id, queue });
      node(car, "charge", booking.start, booking.end, {
        station_id: s.id,
        energy_kwh: round(amount),
        cost_cents: cost,
        soc_end: target,
        mode: s.mode,
      });
      car.soc = target;
      car.charge_cost_cents += cost;
      event(t, "charge_wait", car, s.id);
      event(booking.start, "charge", car, s.id);
      heap.push({
        t: booking.end,
        kind: "station_done",
        car,
        key2,
        next,
        loaded,
      });
    } else if (e.kind === "station_done") {
      drive(car, t, e.key2, e.next, e.loaded);
    } else if (e.kind === "unload_arrive") {
      const booking = reserve(
          unloading,
          t,
          i.unloading_minutes,
          i.unloading_window,
          { kind: "scenario", vehicle_id: car.id },
        ),
        queue = queueAt(unloading, t);
      if (queue > i.unload_queue_limit)
        violation("UNLOAD_QUEUE", car.id, "卸载排队超过上限");
      node(car, "unload_wait", t, booking.start, { queue });
      node(car, "unload", booking.start, booking.end);
      event(booking.start, "unload", car);
      heap.push({ t: booking.end, kind: "unload_done", car });
    } else if (e.kind === "unload_done") {
      car.quantity_kg += car.current_quantity;
      delivered += car.current_quantity;
      car.trips++;
      car.finish = t;
      event(t, "完成交付", car);
      if (remaining > 0) travel(car, t, "destination", false, "load_arrive");
      else car.done = true;
    }
  }
  const active = cars.filter((c) => c.trips || c.nodes.length),
    finish = Math.max(start, ...active.map((c) => c.finish)),
    allNodes = active.flatMap((c) => c.nodes),
    minutes = (kind) =>
      allNodes
        .filter((n) => n.kind === kind)
        .reduce(
          (s, n) => s + (+new Date(n.finish_at) - new Date(n.start_at)) / M,
          0,
        ),
    queue =
      minutes("load_wait") + minutes("unload_wait") + minutes("charge_wait"),
    energy = active.reduce((s, c) => s + c.energy_kwh, 0),
    transport = Math.round(
      active.reduce(
        (s, c) =>
          s +
          c.distance_km * i.cost_km +
          ((c.finish - start) / 3600000) * i.driver_hour,
        0,
      ) * 100,
    ),
    charging = active.reduce((s, c) => s + c.charge_cost_cents, 0),
    chargeCount = allNodes.filter((n) => n.kind === "charge").length;
  if (delivered < Math.round(i.quantity * 1000))
    violation(
      "INCOMPLETE",
      null,
      "运量未全部完成，请增加电量、补能范围或调整作业条件",
    );
  if (finish > deadline)
    violation("DEADLINE", null, "未能在要求完成时间前交付");
  for (const c of active)
    if ((c.finish - start) / 3600000 > i.max_driver_hours)
      violation("DRIVER_HOURS", c.id, "司机连续任务工时超过配置上限");
  const queueMetrics = [
    ["装载", minutes("load_wait")],
    ["卸载", minutes("unload_wait")],
    ["补能", minutes("charge_wait")],
  ].sort((a, b) => b[1] - a[1]);
  const stats = ss.map((s) => {
    const books = s.pool.bookings.filter((b) => b.arrival <= finish),
      own = books.filter((b) => b.kind === "scenario"),
      ext = books.filter((b) => b.kind === "external"),
      platform = books.filter((b) => b.kind === "platform");
    const bins = [];
    for (let t = start; t <= finish; t += 30 * M) {
      const current = books.filter((b) => b.start <= t && b.end > t),
        waiting = books.filter((b) => b.arrival <= t && b.start > t);
      bins.push({
        at: iso(t),
        occupied: current.length,
        waiting: waiting.length,
        own: current.filter((b) => b.kind === "scenario").length,
      });
    }
    return {
      id: s.id,
      name: s.name,
      mode: s.mode,
      slots: s.slots,
      initial_occupied: s.occupied,
      scenario_arrivals: own.length,
      external_arrivals: ext.length,
      platform_arrivals: platform.length,
      avg_wait_minutes: round(
        own.reduce((sum, b) => sum + (b.start - b.arrival) / M, 0) /
          (own.length || 1),
      ),
      max_wait_minutes: round(
        Math.max(0, ...own.map((b) => (b.start - b.arrival) / M)),
      ),
      peak_waiting: Math.max(0, ...bins.map((b) => b.waiting)),
      peak_utilization: round(
        (Math.max(0, ...bins.map((b) => b.occupied)) / s.slots) * 100,
      ),
      bins,
      timeline: books.map((b) => ({
        arrival_at: iso(b.arrival),
        start_at: iso(b.start),
        finish_at: iso(b.end),
        kind: b.kind,
        vehicle_id: b.vehicle_id || null,
        slot: b.slot,
      })),
      forecast_external_next_window: Math.round(
        i.include_external
          ? i.external_arrivals * i.external_weight * i.forecast_hours
          : 0,
      ),
    };
  });
  const metrics = {
    finish_at: iso(finish),
    duration_minutes: round((finish - start) / M),
    total_cost_cents: transport + charging,
    transport_cost_cents: transport,
    charging_cost_cents: charging,
    charge_count: chargeCount,
    energy_kwh: round(energy),
    distance_km: round(active.reduce((s, c) => s + c.distance_km, 0)),
    queue_minutes: round(queue),
    loading_wait: round(minutes("load_wait")),
    unloading_wait: round(minutes("unload_wait")),
    charging_wait: round(minutes("charge_wait")),
    vehicle_count: active.length,
    delivered_kg: delivered,
    ontime_rate: round(
      (allNodes.filter(
        (n) => n.kind === "unload" && +new Date(n.finish_at) <= deadline,
      ).length /
        (allNodes.filter((n) => n.kind === "unload").length || 1)) *
        100,
    ),
    load_peak: Math.max(
      0,
      ...loading.bookings.map((b) => queueAt(loading, b.arrival)),
    ),
    unload_peak: Math.max(
      0,
      ...unloading.bookings.map((b) => queueAt(unloading, b.arrival)),
    ),
    station_peak: Math.max(0, ...stats.map((s) => s.peak_waiting)),
    resource_utilization: round(
      ((minutes("load") + minutes("unload")) /
        Math.max(
          1,
          ((finish - start) / M) * (i.loading_slots + i.unloading_slots),
        )) *
        100,
    ),
    high_risk_stations: stats.filter((s) => s.max_wait_minutes > i.max_wait)
      .length,
  };
  const comfort = [
    {
      met:
        Math.max(0, ...stats.map((s) => s.max_wait_minutes)) <=
        i.max_wait * 0.7,
      message: "补能等待接近配置上限",
    },
    { met: deadline - finish >= 30 * M, message: "交付时窗余量不足30分钟" },
    {
      met: Math.min(...allNodes.map((n) => n.soc_end)) >= i.min_soc + 5,
      message: "电量余量接近最低SOC",
    },
  ];
  metrics.soft_satisfied_ratio = Math.round(
    (comfort.filter((c) => c.met).length / comfort.length) * 100,
  );
  return {
    id,
    name:
      mode === "time" ? "时效优先" : mode === "cost" ? "成本优先" : "均衡方案",
    mode,
    feasible: violations.length === 0,
    metrics,
    violations,
    risks: comfort.filter((c) => !c.met).map((c) => c.message),
    bottleneck:
      queueMetrics[0][1] > 0
        ? queueMetrics[0][0] + "等待占用最多"
        : "运输行驶与装卸作业",
    suggestions: [
      ...(metrics.unloading_wait > metrics.loading_wait
        ? ["增加卸载车位或缩短卸载时间"]
        : ["增加装载车位或错开发车"]),
      ...(metrics.charging_wait
        ? ["降低社会流量高峰到站频率或允许跨站补能"]
        : []),
      ...(finish > deadline ? ["增加参与车辆或延长交付时窗"] : []),
    ],
    vehicles: active.map((c) => ({
      ...c,
      finish_at: iso(c.finish),
      start_at: c.nodes[0]?.start_at || iso(start),
      soc: round(c.soc),
    })),
    station_stats: stats,
    events: events.sort((a, b) => a.at.localeCompare(b.at)),
    cost_scope: "按配置里程成本、司机小时成本及补能费用估算；非实际结算",
  };
}
export function simulateScenario(inputs, network, stations, background = []) {
  const candidates = [
    simulateCandidate(inputs, network, stations, background, "A", "time"),
    simulateCandidate(inputs, network, stations, background, "B", "cost"),
    simulateCandidate(inputs, network, stations, background, "C", "balanced"),
  ];
  const feasible = candidates.filter((c) => c.feasible),
    goal = inputs.objective;
  const score = (c) =>
    goal === "cost"
      ? c.metrics.total_cost_cents
      : goal === "charges"
        ? c.metrics.charge_count
        : goal === "queue"
          ? c.metrics.queue_minutes
          : goal === "vehicles"
            ? c.metrics.vehicle_count
            : goal === "time"
              ? c.metrics.duration_minutes
              : c.metrics.duration_minutes +
                (c.metrics.total_cost_cents / 100) * 0.1 +
                c.metrics.queue_minutes * 0.5;
  feasible.sort((a, b) => score(a) - score(b));
  return {
    model: "DISCRETE-EVENT-REFERENCE-V1",
    candidates,
    recommended_id: feasible[0]?.id || null,
    routes: network,
    generated_at: new Date().toISOString(),
    source: "DERIVED_SIMULATION",
    input_kind: "业务模拟与高德道路参考",
    limitations: [
      "社会车流采用可配置模拟到达，不是实时预测",
      "道路为通用驾车参考，货车限高限重及矿内道路待核验",
      "装卸、能耗、电价及工时均按所配置参数计算",
    ],
  };
}
