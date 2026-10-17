import { must, text, number, insert, uid, now, unpack } from "./db.mjs";
import { get, allowed, scopeClause, version } from "./repository.mjs";
import { patch } from "./transport.mjs";
import { availableIn } from "./scheduling.mjs";
import {
  defaults,
  period,
  validateConditions,
  sizeFleet,
  siteResult,
  rounded,
} from "./planning-engine.mjs";

const PROJECT = "planning-projects",
  SOLUTION = "planning-solutions";
function access(user, write = false) {
  must(user.role === "admin", "仅管理员可访问规划决策", 403);
  allowed(user, write ? "planning.write" : "read");
}
function owner(user, id) {
  must(user.scopes.includes(id), "无权访问该业务主体", 403);
  return id;
}
function rows(db, user, resource, ownerId) {
  const s = scopeClause(db, user, resource),
    record = [PROJECT, SOLUTION, "candidates"].includes(resource);
  return db
    .prepare(
      `SELECT * FROM ${record ? "records" : resource} WHERE (${s.sql})${record ? " AND resource=?" : ""}${ownerId ? " AND owner_id=?" : ""}`,
    )
    .all(
      ...s.args,
      ...(record ? [resource] : []),
      ...(ownerId ? [ownerId] : []),
    )
    .map(unpack);
}
function add(db, resource, user, b, data, status) {
  const id = uid(resource === PROJECT ? "PP" : "PS");
  insert(db, "records", {
    id,
    resource,
    code: id,
    name: b.name,
    owner_id: b.owner_id,
    status,
    created_at: now(),
    source: "DERIVED_SIMULATION",
    data,
  });
  return get(db, user, resource, id);
}
export function planningHandoff(db, user, id) {
  access(user);
  const s = get(db, user, SOLUTION, id),
    p = get(db, user, PROJECT, s.project_id);
  must(
    s.status !== "已归档" && s.project_version === p.version,
    "规划条件已变化或方案已归档，请返回规划重新测算",
    409,
    "STALE_SOLUTION",
  );
  must(
    s.fleet.transport_feasible && s.fleet.vehicles <= 60,
    "该规划规模或运输条件超出当前单次推演范围，请拆分或调整条件",
  );
  const c = s.conditions;
  must(
    c.payload_tonnes <= 60 &&
      c.battery_kwh >= 100 &&
      c.battery_kwh <= 1000 &&
      c.loaded_speed >= 5 &&
      c.loaded_speed <= 80 &&
      c.empty_speed >= 5 &&
      c.empty_speed <= 90 &&
      c.energy_per_km >= 0.3 &&
      c.energy_per_km <= 5 &&
      c.loading_minutes <= 180 &&
      c.unloading_minutes <= 180 &&
      c.hours >= 1 &&
      c.daily_quantity >= 0.1,
    "部分规划参数超出当前交能推演支持范围，请调整条件后带入",
  );
  return {
    name: p.name,
    owner_id: p.owner_id,
    project_id: p.id,
    sequence: s.sequence,
    conditions: s.conditions,
    vehicles: s.fleet.vehicles,
    corridor:
      s.business_snapshot?.corridors.find(
        (l) => l.origin_coords && l.destination_coords,
      ) || null,
  };
}
function dayWindow(p, c, last = false) {
  const base = last ? p.end - 86400000 : p.start;
  return [
    new Date(base + c.start_hour * 3600000).toISOString(),
    new Date(base + (c.start_hour + c.hours) * 3600000).toISOString(),
  ];
}
function configFor(db, user, ownerId, b, c) {
  must(
    Array.isArray(b.sites) && b.sites.length > 0 && b.sites.length <= 20,
    "请选择1至20个候选点",
  );
  must(
    b.sites.every(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof x.candidate_id === "string" &&
        (!x.station_id || typeof x.station_id === "string"),
    ),
    "候选布局格式无效",
  );
  must(
    new Set(b.sites.map((x) => x.candidate_id)).size === b.sites.length,
    "候选点不能重复",
  );
  return b.sites.map((x) => {
    const p = get(db, user, "candidates", x.candidate_id);
    must(p.owner_id === ownerId, "候选点与规划主体不一致");
    let station = null;
    if (x.station_id) {
      station = get(db, user, "stations", x.station_id);
      must(station.owner_id === ownerId, "关联场站与规划主体不一致");
    }
    const supply =
      x.supply_kw == null ? null : number(x.supply_kw, "供电上限", 0, 1e7);
    return {
      candidate_id: p.id,
      station_id: station?.id || null,
      mode: station?.mode || "充电",
      supply_kw: supply,
      other_load_kw: number(x.other_load_kw ?? 0, "其他负荷", 0, 1e7),
      detour_km:
        x.detour_km == null ? null : number(x.detour_km, "道路绕行", 0, 1000),
      detour_basis:
        x.detour_km == null ? "" : text(x.detour_basis, "绕行依据", 500),
      land_verified: x.land_verified === true,
      grid_verified: x.grid_verified === true,
      access_verified: x.access_verified === true,
    };
  });
}
export function planningOptions(db, user, q = {}) {
  access(user);
  const id = owner(user, q.owner_id || user.scopes[0]);
  const end = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    start = new Date(
      +new Date(end + "T00:00:00+08:00") - 14 * 86400000 + 8 * 3600000,
    )
      .toISOString()
      .slice(0, 10);
  return {
    owner_id: id,
    defaults: { ...defaults, start_date: start, finish_date: end },
    candidates: rows(db, user, "candidates", id),
    stations: rows(db, user, "stations", id),
    source: "SIMULATED",
  };
}
export function planningProjects(db, user, q = {}) {
  access(user);
  const all = rows(db, user, PROJECT)
    .filter(
      (r) =>
        !q.q ||
        `${r.code} ${r.name}`.toLowerCase().includes(String(q.q).toLowerCase()),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { items: all, total: all.length };
}
export function planningDetail(db, user, id) {
  access(user);
  const project = get(db, user, PROJECT, id),
    solutions = rows(db, user, SOLUTION, project.owner_id)
      .filter((s) => s.project_id === id)
      .sort((a, b) => b.sequence - a.sequence)
      .map((s) => ({ ...s, stale: s.project_version !== project.version }));
  return { project, solutions };
}
export function planningBusiness(db, user, q) {
  access(user);
  const id = owner(user, q.owner_id),
    p = period(q),
    c = new Map(),
    refs = [],
    excluded = [];
  let quantity = 0,
    verified = 0;
  const put = (r, qty, kind) => {
    const from = +new Date(r.start_at),
      to = +new Date(r.finish_at);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      excluded.push({ id: r.id, code: r.code, reason: "缺少有效运输时窗" });
      return;
    }
    const overlap = Math.max(0, Math.min(p.end, to) - Math.max(p.start, from));
    if (!overlap) return;
    const portion = (qty * overlap) / (to - from),
      key = (r.origin || "未填起点") + " → " + (r.destination || "未填终点"),
      line = c.get(key) || {
        corridor: key,
        quantity: 0,
        verified_tonnes: 0,
        distance_km: r.distance_km ?? null,
        order_id: kind === "orders" ? r.id : null,
        origin: r.origin,
        destination: r.destination,
        origin_coords: r.origin_coords,
        destination_coords: r.destination_coords,
      };
    line.quantity += portion;
    quantity += portion;
    if (kind === "orders") {
      const facts = rows(db, user, "tasks", id).filter(
        (t) => t.order_id === r.id,
      );
      const ids = facts.map((t) => t.id);
      let v = 0;
      if (ids.length)
        v = db
          .prepare(
            `SELECT COALESCE(sum(verified_kg),0)/1000 n FROM trips WHERE task_id IN(${ids.map(() => "?").join(",")}) AND status='已核验' AND occurred_at>=? AND occurred_at<?`,
          )
          .get(
            ...ids,
            new Date(p.start).toISOString(),
            new Date(p.end).toISOString(),
          ).n;
      verified += v;
      line.verified_tonnes += v;
    }
    c.set(key, line);
    refs.push({
      resource: kind,
      id: r.id,
      code: r.code,
      version: r.version,
      quantity_tonnes: rounded(portion, 3),
      source: r.source,
    });
  };
  const orders = rows(db, user, "orders", id).filter(
    (o) => !["草稿", "已取消", "已终止"].includes(o.status),
  );
  for (const r of orders)
    put(r, Math.max(0, r.quantity_kg - r.cancelled_kg) / 1000, "orders");
  for (const r of rows(db, user, "demands", id).filter(
    (d) => d.status === "已确认",
  )) {
    const remainder = Math.max(0, r.quantity_kg - r.allocated_kg) / 1000;
    if (remainder > 0) put(r, remainder, "demands");
  }
  const corridors = [...c.values()].map((l) => ({
    ...l,
    quantity: rounded(l.quantity, 3),
    daily_quantity: rounded(l.quantity / p.days, 3),
  }));
  return {
    owner_id: id,
    start_date: q.start_date,
    finish_date: q.finish_date,
    days: p.days,
    quantity_tonnes: rounded(quantity, 3),
    daily_quantity: rounded(quantity / p.days, 3),
    verified_tonnes: rounded(verified, 3),
    corridors,
    refs,
    excluded,
    generated_at: now(),
    source: "DERIVED_SIMULATION",
    basis:
      "订单有效运量＋需求未分配余量，按运输时窗与基准期交集比例分摊；核验交付单列。",
  };
}
function inventory(db, user, project) {
  const c = project.conditions,
    p = period(project),
    tasks = rows(db, user, "tasks", project.owner_id).filter(
      (t) =>
        !["已完成", "已取消", "余量已终止"].includes(t.status) &&
        +new Date(t.start_at) < p.end &&
        +new Date(t.finish_at) > p.start,
    ),
    vehicles = rows(db, user, "vehicles", project.owner_id),
    drivers = rows(db, user, "drivers", project.owner_id);
  const check = (r, kind) => {
    const reasons = [];
    if (r.status !== "可用") reasons.push("状态：" + r.status);
    if (kind === "vehicle") {
      if (r.compatibility !== c.compatibility) reasons.push("补能规格不适配");
      if (r.payload_kg < c.payload_tonnes * 1000) reasons.push("载重不足");
      if (r.capacity_kwh < c.battery_kwh) reasons.push("电池容量不足");
    } else if (!/^A2/.test(r.license || "")) reasons.push("缺少A2驾驶资格");
    try {
      let covers = true;
      for (let day = p.start; day < p.end; day += 86400000) {
        const [start, finish] = dayWindow({ start: day }, c);
        if (!availableIn(r, start, finish)) {
          covers = false;
          break;
        }
      }
      if (!covers) reasons.push("可用窗口不覆盖规划班次");
    } catch {
      reasons.push("可用窗口待核实");
    }
    if (
      tasks.some(
        (t) => t[kind === "vehicle" ? "vehicle_id" : "driver_id"] === r.id,
      )
    )
      reasons.push("基准期内有未结束任务占用");
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      version: r.version,
      eligible: !reasons.length,
      reasons,
    };
  };
  const vs = vehicles.map((v) => check(v, "vehicle")),
    ds = drivers.map((d) => check(d, "driver"));
  return {
    vehicles: vs,
    drivers: ds,
    available_vehicles: vs.filter((v) => v.eligible).length,
    available_drivers: ds.filter((d) => d.eligible).length,
    generated_at: now(),
    basis:
      "基准期内有未结束任务即保守排除；逐日检查可用窗口是否覆盖规划班次，仍需核实实际排班。",
  };
}
function resourceSignature(db, user, project) {
  return [
    "vehicles",
    "drivers",
    "devices",
    "stations",
    "candidates",
    "tasks",
  ].map((resource) => ({
    resource,
    rows: rows(db, user, resource, project.owner_id)
      .map((r) => [
        r.id,
        r.version,
        r.status,
        r.connection ?? null,
        r.power_kw ?? null,
        r.mode ?? null,
      ])
      .sort((a, b) => a[0].localeCompare(b[0])),
  }));
}
export function planningCommand(db, user, type, id, b) {
  if (!type.startsWith("planner.")) return null;
  access(user, true);
  if (type === "planner.create" || type === "planner.update") {
    const previous =
      type === "planner.update" ? get(db, user, PROJECT, id) : null;
    if (previous) version(previous, b);
    const ownerId = owner(user, previous?.owner_id || b.owner_id),
      name = text(b.name, "项目名称", 100),
      p = period(b),
      conditions = validateConditions(b.conditions || {}),
      sites = configFor(db, user, ownerId, b, conditions);
    const data = {
      start_date: b.start_date,
      finish_date: b.finish_date,
      conditions,
      sites,
      days: p.days,
      business_snapshot:
        b.use_business === true
          ? planningBusiness(db, user, { ...b, owner_id: ownerId })
          : null,
      reference_id: previous?.reference_id || null,
      created_by: previous?.created_by || user.id,
      updated_at: now(),
    };
    if (previous) {
      patch(db, "records", id, { name, data });
      return { id, project: get(db, user, PROJECT, id) };
    }
    const project = add(
      db,
      PROJECT,
      user,
      { name, owner_id: ownerId },
      data,
      "规划中",
    );
    return { id: project.id, project };
  }
  const project = get(
    db,
    user,
    PROJECT,
    type === "planner.calculate" ? id : b.project_id,
  );
  version(project, b);
  if (type === "planner.calculate") {
    const c = project.conditions,
      size = sizeFleet(c),
      stock = inventory(db, user, project),
      devices = rows(db, user, "devices", project.owner_id),
      sites = project.sites
        .map((s) => {
          const station = s.station_id
            ? get(db, user, "stations", s.station_id)
            : null;
          return siteResult(
            c,
            size,
            {
              ...get(db, user, "candidates", s.candidate_id),
              ...(station
                ? { longitude: station.longitude, latitude: station.latitude }
                : {}),
            },
            {
              ...s,
              mode: station?.mode || s.mode,
              station_name: station?.name || null,
              station_version: station?.version || null,
            },
            devices,
          );
        })
        .sort(
          (a, b) =>
            Number(b.feasible) - Number(a.feasible) ||
            a.unknown.length - b.unknown.length ||
            a.added - b.added,
        ),
      current = rows(db, user, SOLUTION, project.owner_id).filter(
        (s) => s.project_id === project.id,
      ),
      seq = Math.max(0, ...current.map((s) => s.sequence)) + 1;
    const fleet = {
      ...size,
      available: stock.available_vehicles,
      vehicle_gap:
        size.vehicles === null
          ? null
          : Math.max(0, size.vehicles - stock.available_vehicles),
      drivers_required: size.vehicles,
      drivers_available: stock.available_drivers,
      driver_gap:
        size.vehicles === null
          ? null
          : Math.max(0, size.vehicles - stock.available_drivers),
    };
    const data = {
      project_id: project.id,
      project_version: project.version,
      sequence: seq,
      conditions: c,
      period: {
        start_date: project.start_date,
        finish_date: project.finish_date,
      },
      sites,
      fleet,
      inventory: stock,
      resource_signature: resourceSignature(db, user, project),
      phase_one: sizeFleet(c, c.phase_one_quantity),
      business_snapshot: project.business_snapshot,
      budget: {
        equipment: null,
        vehicle_purchase: null,
        vehicle_lease: null,
        engineering: null,
        currency: "CNY",
        battery_included: true,
      },
      engineering_approved: false,
      generated_at: now(),
      recommended_id: sites.find((s) => s.feasible)?.id || null,
    };
    const solution = add(
      db,
      SOLUTION,
      user,
      { name: project.name + " · V" + seq, owner_id: project.owner_id },
      data,
      "待比选",
    );
    return { id: solution.id, solution };
  }
  must(
    ["planner.adopt", "planner.archive"].includes(type),
    "规划动作不存在",
    404,
  );
  const solution = get(db, user, SOLUTION, id);
  must(
    solution.project_id === project.id &&
      solution.owner_id === project.owner_id,
    "方案与项目不一致",
  );
  must(
    b.solution_version === solution.version,
    "方案已更新，请刷新后重试",
    409,
    "VERSION_CONFLICT",
  );
  if (type === "planner.archive") {
    must(project.reference_id !== id, "当前参考方案不能归档");
    must(solution.status !== "已归档", "方案已归档");
    patch(db, "records", id, { status: "已归档" });
    return { id };
  }
  must(solution.status !== "已归档", "已归档方案不能采用");
  must(
    solution.project_version === project.version,
    "项目条件已变化，请重新测算",
    409,
    "STALE_SOLUTION",
  );
  const selected = solution.sites.find((s) => s.id === b.candidate_id);
  must(
    JSON.stringify(solution.resource_signature) ===
      JSON.stringify(resourceSignature(db, user, project)),
    "资源档案已变化，请重新测算后采用",
    409,
    "STALE_RESOURCES",
  );
  must(selected?.feasible, "候选方案存在硬约束不满足，不能采用");
  // Reference selection is metadata: keep the condition version stable.
  const prior =
    project.reference_id && get(db, user, SOLUTION, project.reference_id);
  if (prior && prior.id !== id)
    patch(db, "records", prior.id, { status: "历史参考" });
  const raw = db.prepare("SELECT data FROM records WHERE id=?").get(project.id);
  db.prepare("UPDATE records SET data=? WHERE id=?").run(
    JSON.stringify({ ...JSON.parse(raw.data), reference_id: id }),
    project.id,
  );
  patch(db, "records", id, {
    status: "已采用参考",
    data: {
      ...solution,
      selected_id: selected.id,
      adopted_at: now(),
      adopted_by: user.id,
    },
  });
  return { id, project_id: project.id };
}
