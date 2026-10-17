import { completionCommand } from "./completion.mjs";
import { scheduleCandidate, availableIn, parseWindow } from "./scheduling.mjs";
import { insert, now, uid, unpack, must, number, text, kg } from "./db.mjs";
import { get, allowed, version, owner } from "./repository.mjs";
const patch = (db, table, id, fields) => {
  const keys = Object.keys(fields);
  db.prepare(
    `UPDATE ${table} SET ${keys.length ? keys.map((k) => k + "=?").join(",") + "," : ""}version=version+1 WHERE id=?`,
  ).run(
    ...keys.map((k) =>
      typeof fields[k] === "object" ? JSON.stringify(fields[k]) : fields[k],
    ),
    id,
  );
};
const makeCode = (prefix) =>
  prefix +
  "-" +
  Date.now().toString(36).toUpperCase() +
  "-" +
  uid().slice(-4).toUpperCase();
export function createOrder(db, user, b) {
  allowed(user, "order.write");
  const demand = get(db, user, "demands", b.demand_id);
  must(demand.status === "已确认", "来源需求尚未确认");
  owner(user, demand.owner_id);
  const start = new Date(b.start_at),
    finish = new Date(b.finish_at);
  must(
    Number.isFinite(+start) && Number.isFinite(+finish) && finish > start,
    "要求完成时间必须晚于开始时间",
  );
  const id = uid("O");
  insert(db, "orders", {
    id,
    code: makeCode("DD"),
    name: text(b.name, "订单名称", 100),
    owner_id: demand.owner_id,
    demand_id: demand.id,
    status: "草稿",
    quantity_kg: kg(b.quantity),
    start_at: start.toISOString(),
    finish_at: finish.toISOString(),
    created_at: now(),
    source: "MANUAL_SIMULATION",
    data: {
      cargo: text(b.cargo || "原煤", "货物"),
      origin: text(b.origin, "装货位置"),
      destination: text(b.destination, "卸货位置"),
      distance_km: number(b.distance_km, "单趟运输距离", 0.1, 3000),
      loaded_speed_kmh: 35,
      empty_speed_kmh: 45,
      loading_minutes: 10,
      unloading_minutes: 10,
      origin_coords: user.data_view==='operational' ? (b.origin_coords||demand.origin_coords||null) : [107.57, 35.72],
      destination_coords: user.data_view==='operational' ? (b.destination_coords||demand.destination_coords||null) : [107.72, 35.78],
      road_verified: false,
    },
  });
  return { id };
}
export function transportCommand(db, user, type, id, b) {
  const completed = completionCommand(db, user, type, id, b);
  if (completed) return completed;
  if (type === "order.create") return createOrder(db, user, b);
  if (type === "demand.create") {
    allowed(user, "demand.write");
    const org = owner(user, b.owner_id || user.scopes[0]);
    id = uid("DM");
    insert(db, "demands", {
      id,
      code: makeCode("XQ"),
      name: text(b.name, "需求名称", 100),
      owner_id: org,
      status: "草稿",
      quantity_kg: kg(b.quantity),
      created_at: now(),
      source: "MANUAL_SIMULATION",
      data: {
        cargo: b.cargo || "原煤",
        origin: text(b.origin, "装货位置"),
        destination: text(b.destination, "卸货位置"),
      },
    });
    return { id };
  }
  if (type === "demand.confirm") {
    allowed(user, "demand.write");
    const d = get(db, user, "demands", id);
    version(d, b);
    must(d.status === "草稿", "只有草稿可以确认");
    patch(db, "demands", id, { status: "已确认" });
    return { id };
  }
  if (type === "order.copy") {
    allowed(user, "order.write");
    const o = get(db, user, "orders", id);
    return createOrder(db, user, {
      ...o,
      quantity: o.quantity_kg / 1000,
      name: o.name + "（复制）",
      ...b,
    });
  }
  if (type === "order.confirm") {
    allowed(user, "order.write");
    const o = get(db, user, "orders", id);
    version(o, b);
    must(o.status === "草稿", "当前订单不能重复确认");
    const d = get(db, user, "demands", o.demand_id);
    must(d.status === "已确认", "来源需求已失效");
    must(
      d.allocated_kg + o.quantity_kg <= d.quantity_kg,
      "需求剩余量不足，未确认订单",
    );
    db.prepare(
      "UPDATE demands SET allocated_kg=allocated_kg+?,version=version+1 WHERE id=?",
    ).run(o.quantity_kg, d.id);
    patch(db, "orders", id, { status: "已确认" });
    return { id };
  }
  if (type === "order.edit") {
    allowed(user, "order.write");
    const o = get(db, user, "orders", id);
    version(o, b);
    must(o.status === "草稿", "已有业务引用的订单不能直接覆盖，请复制新草稿");
    const a = new Date(b.start_at),
      z = new Date(b.finish_at);
    must(Number.isFinite(+a) && Number.isFinite(+z) && z > a, "时间窗口无效");
    const demand = get(db, user, "demands", b.demand_id || o.demand_id);
    must(
      demand.status === "已确认" && demand.owner_id === o.owner_id,
      "来源需求状态或业务主体不一致",
    );
    patch(db, "orders", id, {
      name: text(b.name, "订单名称", 100),
      demand_id: demand.id,
      quantity_kg: kg(b.quantity),
      start_at: a.toISOString(),
      finish_at: z.toISOString(),
      data: {
        ...o,
        cargo: text(b.cargo || o.cargo, "货物"),
        origin: text(b.origin, "装货位置"),
        destination: text(b.destination, "卸货位置"),
        distance_km: number(b.distance_km, "单趟距离", 0.1, 3000),
      },
    });
    return { id };
  }
  if (type === "order.cancel") {
    allowed(user, "order.cancel");
    const o = get(db, user, "orders", id);
    version(o, b);
    must(["草稿", "已确认"].includes(o.status), "当前订单不允许取消");
    const tasks = db.prepare("SELECT * FROM tasks WHERE order_id=?").all(id);
    must(
      !tasks.some(
        (t) =>
          ["执行中", "待核验", "已完成", "退回补充"].includes(t.status) ||
          t.reported_kg ||
          t.verified_kg,
      ),
      "存在执行或交付事实，请先核对余量，不得取消已履约记录",
    );
    const reason = text(b.reason, "取消原因");
    for (const t of tasks) {
      patch(db, "tasks", t.id, {
        status: "已取消",
        data: { ...JSON.parse(t.data), cancel_reason: reason },
      });
      db.prepare(
        "UPDATE charging SET status='已取消',version=version+1 WHERE task_id=?",
      ).run(t.id);
    }
    if (o.status === "已确认")
      db.prepare(
        "UPDATE demands SET allocated_kg=allocated_kg-?,version=version+1 WHERE id=?",
      ).run(o.quantity_kg - o.cancelled_kg, o.demand_id);
    patch(db, "orders", id, {
      status: "已取消",
      cancelled_kg: o.quantity_kg,
      data: { ...o, cancel_reason: reason },
    });
    return { id };
  }
  if (type === "simulation.run") {
    allowed(user, "simulation.run");
    const order = get(db, user, "orders", b.order_id);
    must(order.status === "已确认", "请选择已确认订单");
    if (b.order_version != null)
      must(
        order.version === b.order_version,
        "来源订单已变化，请重新核对条件",
        409,
      );
    const vehicleIds = [...new Set(b.vehicle_ids || [])];
    must(
      vehicleIds.length > 0 && vehicleIds.length <= 100,
      "请选择1—100辆候选车",
    );
    must(
      b.use_reference === true,
      "缺少真实安全与资源边界，请显式选择参考条件测算",
    );
    const soc = number(b.soc, "SOC", 0, 100),
      reserve = number(b.reserve_soc ?? 20, "到站余量", 5, 50);
    const station = get(db, user, "stations", b.station_id);
    must(station.status === "运营中", "场站不可服务");
    const devices = db
      .prepare(
        "SELECT * FROM devices WHERE station_id=? AND connection='在线' AND status='空闲'",
      )
      .all(station.id);
    must(devices.length, "没有在线可用工位，离线工位不作为空闲");
    const vehicles = vehicleIds.map((v) => get(db, user, "vehicles", v));
    vehicles.forEach((v) => {
      must(v.status === "可用" && v.driver_id, "候选车辆或有效司机不可用");
      const driver = get(db, user, "drivers", v.driver_id);
      must(driver.status === "可用", "司机当前不可用");
      must(
        driver.owner_id === order.owner_id &&
          station.owner_id === order.owner_id,
        "司机/场站与订单主体不一致",
      );
      must(
        v.owner_id === order.owner_id,
        "当前方案车辆与订单主体不一致，需获授权合作指派规则",
      );
      must(v.compatibility === station.compatibility, "车辆与场站缺少适配依据");
    });
    const windowMinutes =
      (new Date(order.finish_at) - new Date(order.start_at)) / 60000;
    const organized = db
      .prepare(
        "SELECT COALESCE(sum(CASE WHEN status IN('已完成','余量已终止') THEN verified_kg ELSE quantity_kg END),0) n FROM tasks WHERE order_id=? AND status NOT IN('待派发','已取消')",
      )
      .get(order.id).n;
    const remainingQuantity =
      order.quantity_kg - order.cancelled_kg - organized;
    must(remainingQuantity > 0, "当前订单没有可组织余量");
    const allocationRows = vehicles.map((v) => ({
      vehicle_id: v.id,
      driver_id: v.driver_id,
      trips: 0,
      quantity_kg: 0,
    }));
    let remaining = remainingQuantity,
      index = 0;
    while (remaining > 0) {
      const i = index++ % vehicles.length,
        x = allocationRows[i],
        q = Math.min(remaining, vehicles[i].payload_kg);
      x.trips++;
      x.quantity_kg += q;
      remaining -= q;
      must(index <= 100000, "车次数量过大，请拆分订单");
    }
    const allocations = allocationRows.filter((x) => x.trips),
      totalTrips = allocations.reduce((n, x) => n + x.trips, 0);
    const drivers = vehicles.map((v) => get(db, user, "drivers", v.driver_id));
    const candidates = [
      { id: "A", name: "方案 A · 错峰到站", offset: 0 },
      { id: "B", name: "方案 B · 分时价格比较", offset: 30 },
    ].map((c) =>
      scheduleCandidate({
        order,
        station,
        devices,
        vehicles,
        drivers,
        allocations,
        soc,
        reserve,
        ...c,
      }),
    );
    id = uid("SIM");
    insert(db, "simulations", {
      id,
      code: makeCode("TY"),
      name: order.name,
      owner_id: order.owner_id,
      order_id: order.id,
      status: candidates.some((c) => c.feasible) ? "条件可行" : "无可行方案",
      order_version: order.version,
      created_at: now(),
      data: {
        remaining_quantity_kg: remainingQuantity,
        inputs: {
          soc,
          reserve_soc: reserve,
          vehicle_ids: vehicleIds,
          station_id: station.id,
          use_reference: true,
        },
        resource_versions: vehicles.map((v) => ({
          id: v.id,
          version: v.version,
        })),
        driver_versions: vehicles.map((v) => {
          const d = get(db, user, "drivers", v.driver_id);
          return { id: d.id, version: d.version };
        }),
        station_version: station.version,
        device_versions: devices.map((d) => ({ id: d.id, version: d.version })),
        candidates,
        selected: null,
        model: "REFERENCE-NODE-SCHEDULE-V2",
        parameter_kind: "SIMULATED",
        road_verified: false,
      },
    });
    return { id, simulation: get(db, user, "simulations", id) };
  }
  if (type === "simulation.confirm") {
    allowed(user, "simulation.confirm");
    const sim = get(db, user, "simulations", id);
    version(sim, b);
    const order = get(db, user, "orders", sim.order_id);
    must(
      order.version === sim.order_version,
      "订单已变化，需要重新推演",
      409,
      "STALE_SOLUTION",
    );
    must(sim.status === "条件可行", "当前方案不可确认");
    const candidate = sim.candidates.find(
      (c) => c.id === b.candidate_id && c.feasible,
    );
    must(candidate, "请选择同次运行内条件可行的方案");
    for (const x of sim.resource_versions) {
      const v = get(db, user, "vehicles", x.id);
      must(
        v.version === x.version && v.status === "可用",
        "车辆资料已变化，请重新推演",
        409,
        "STALE_SOLUTION",
      );
    }
    for (const x of sim.driver_versions || []) {
      const d = get(db, user, "drivers", x.id);
      must(
        d.version === x.version && d.status === "可用",
        "司机资料已变化，请重新推演",
        409,
        "STALE_SOLUTION",
      );
    }
    for (const x of sim.device_versions || []) {
      const d = get(db, user, "devices", x.id);
      must(
        d.version === x.version &&
          d.connection === "在线" &&
          ["空闲", "占用"].includes(d.status),
        "设备状态或来源已变化，请重算",
        409,
      );
    }
    const st = get(db, user, "stations", candidate.station_id);
    must(
      st.version === sim.station_version && st.status === "运营中",
      "场站资料已变化，请重新推演",
      409,
      "STALE_SOLUTION",
    );
    const organized = db
      .prepare(
        "SELECT COALESCE(sum(CASE WHEN status IN('已完成','余量已终止') THEN verified_kg ELSE quantity_kg END),0) n FROM tasks WHERE order_id=? AND status NOT IN('待派发','已取消')",
      )
      .get(order.id).n;
    must(
      order.quantity_kg - order.cancelled_kg - organized ===
        sim.remaining_quantity_kg,
      "订单可组织余量已变化，请重新推演",
      409,
      "STALE_QUANTITY",
    );
    db.prepare(
      "UPDATE tasks SET status='已取消',version=version+1 WHERE order_id=? AND status='待派发'",
    ).run(order.id);
    const replacementFor = db
      .prepare(
        "SELECT id FROM tasks WHERE order_id=? AND status IN('已完成','余量已终止') AND quantity_kg>verified_kg",
      )
      .all(order.id)
      .map((r) => r.id);
    const newTaskIds = [];
    candidate.assignments.forEach((a) => {
      const newId = uid("T");
      newTaskIds.push(newId);
      return insert(db, "tasks", {
        id: newId,
        code: makeCode("RW"),
        name: order.name,
        owner_id: order.owner_id,
        order_id: order.id,
        vehicle_id: a.vehicle_id,
        driver_id: a.driver_id,
        simulation_id: sim.id,
        status: "待派发",
        quantity_kg: a.quantity_kg,
        start_at: a.start_at,
        finish_at: a.finish_at,
        created_at: now(),
        data: {
          plan: a,
          replaces_task_ids: replacementFor,
          station_id: candidate.station_id,
          reference_only: true,
        },
      });
    });
    for (const oldId of replacementFor) {
      const old = get(db, user, "tasks", oldId);
      patch(db, "tasks", oldId, {
        data: {
          ...old,
          replacement_task_ids: [
            ...(old.replacement_task_ids || []),
            ...newTaskIds,
          ],
        },
      });
    }
    patch(db, "simulations", id, {
      status: "已确认",
      data: { ...sim, selected: candidate.id },
    });
    return { id };
  }
  if (type === "dispatch.batch" || type === "dispatch.validate") {
    allowed(user, "task.dispatch");
    must(Array.isArray(b.items) && b.items.length > 0, "请选择待派发任务");
    must(
      b.items.every((x) => x && typeof x.id === "string"),
      "任务参数无效",
    );
    must(
      new Set(b.items.map((x) => x.id)).size === b.items.length,
      "任务不能重复选择",
    );
    const tasks = b.items.map((item) => {
      const t = get(db, user, "tasks", item.id);
      version(t, item);
      must(t.status === "待派发", "任务状态已改变，全批未派发");
      must(!t.requires_resimulation, "计划时窗已改变，请重新推演后派发");
      return {
        ...t,
        vehicle_id: item.vehicle_id || t.vehicle_id,
        driver_id: item.driver_id || t.driver_id,
      };
    });
    const used = [];
    for (const t of tasks) {
      const v = get(db, user, "vehicles", t.vehicle_id),
        d = get(db, user, "drivers", t.driver_id),
        sim = get(db, user, "simulations", t.simulation_id),
        o = get(db, user, "orders", t.order_id);
      must(
        v.status === "可用" && d.status === "可用",
        "车辆/司机不可用，全批未派发",
      );
      must(
        v.driver_id === d.id &&
          d.owner_id === t.owner_id &&
          v.owner_id === t.owner_id,
        "运力归属或绑定变化，全批未派发",
        409,
      );
      must(
        !sim.driver_versions ||
          sim.driver_versions.some(
            (x) => x.id === d.id && x.version === d.version,
          ),
        "司机资料版本变化，请重算",
        409,
      );
      must(
        sim.status === "已确认" && o.version === sim.order_version,
        "引用方案或订单已经失效，全批未派发",
        409,
      );
      must(
        sim.resource_versions.some(
          (x) => x.id === v.id && x.version === v.version,
        ),
        "更换运力或资源版本需重新推演，全批未派发",
        409,
      );
      const conflicts = db
        .prepare(
          "SELECT id FROM tasks WHERE id<>? AND status IN('待接收','已接收','执行中','待核验','退回补充') AND (vehicle_id=? OR driver_id=?) AND start_at<? AND finish_at>?",
        )
        .all(t.id, t.vehicle_id, t.driver_id, t.finish_at, t.start_at);
      must(
        !conflicts.length &&
          !used.some(
            (x) =>
              (x.vehicle_id === t.vehicle_id || x.driver_id === t.driver_id) &&
              x.start_at < t.finish_at &&
              x.finish_at > t.start_at,
          ),
        "车辆或司机时间冲突，全批未派发",
        409,
        "RESOURCE_CONFLICT",
      );
      must(
        availableIn(v, t.start_at, t.finish_at) &&
          availableIn(d, t.start_at, t.finish_at),
        "运力排班窗口变化，全批未派发",
        409,
      );
      for (const x of sim.device_versions || []) {
        const device = get(db, user, "devices", x.id);
        must(
          device.version === x.version &&
            device.connection === "在线" &&
            ["空闲", "占用"].includes(device.status),
          "工位状态变化，全批未派发",
          409,
        );
      }
      used.push(t);
      if (sim.scene_id && Array.isArray(sim.station_versions)) {
        for (const ref of sim.station_versions) {
          const st = get(db, user, "stations", ref.id);
          must(
            st.version === ref.version && st.status === "运营中",
            "场站边界已变化，全批未派发",
            409,
          );
        }
        must(
          (t.plan.charging_events || []).every((e) =>
            sim.station_versions.some(
              (s) => s.id === (e.station_id || t.station_id),
            ),
          ),
          "补能节点缺少有效场站依据，请重新推演",
          409,
        );
      } else {
        must(t.station_id, "任务缺少场站依据，请重新推演", 409);
        const st = get(db, user, "stations", t.station_id);
        must(
          (sim.station_versions
            ? sim.station_versions.some(
                (x) => x.id === st.id && x.version === st.version,
              )
            : st.version === sim.station_version) && st.status === "运营中",
          "场站边界已变化，全批未派发",
          409,
        );
      }
    }
    for (const orderId of new Set(tasks.map((t) => t.order_id))) {
      const o = get(db, user, "orders", orderId),
        active = db
          .prepare(
            "SELECT COALESCE(sum(CASE WHEN status IN('已完成','余量已终止') THEN verified_kg ELSE quantity_kg END),0) n FROM tasks WHERE order_id=? AND status NOT IN('待派发','已取消')",
          )
          .get(orderId).n;
      must(
        active +
          tasks
            .filter((t) => t.order_id === orderId)
            .reduce((n, t) => n + t.quantity_kg, 0) <=
          o.quantity_kg - o.cancelled_kg,
        "任务量超过可组织余量，全批未派发",
      );
    }
    if (type === "dispatch.validate")
      return { validated: true, ids: tasks.map((t) => t.id) };
    tasks.forEach((t) => {
      patch(db, "tasks", t.id, { status: "待接收", notification: "已投递" });
      db.prepare(
        "UPDATE charging SET status='已取消',version=version+1 WHERE task_id=? AND status='待调整'",
      ).run(t.id);
      for (const event of t.plan.charging_events || []) {
        insert(db, "charging", {
          id: uid("C"),
          code: makeCode("BN"),
          name: t.name + "补能",
          owner_id: t.owner_id,
          task_id: t.id,
          vehicle_id: t.vehicle_id,
          station_id: event.station_id || t.station_id,
          status: "已确认",
          arrival_at: event.arrival_at,
          quantity_kwh: event.quantity_kwh,
          data: {
            ...event,
            mode: get(db, user, "stations", event.station_id || t.station_id)
              .mode,
            reference_only: true,
            task_version: t.version + 1,
          },
        });
      }
      db.prepare(
        "UPDATE costs SET status='已替代',version=version+1 WHERE task_id=? AND nature='预计' AND status='预计'",
      ).run(t.id);
      if (t.plan.known_cost_cents > 0)
        insert(db, "costs", {
          id: uid("F"),
          code: makeCode("FY"),
          name: t.name + "预计补能费",
          owner_id: t.owner_id,
          task_id: t.id,
          status: "预计",
          nature: "预计",
          amount_cents: t.plan.known_cost_cents,
          created_at: now(),
          source: "DERIVED_SIMULATION",
          data: {
            category: "电费及服务费",
            included: "参考电价与服务费",
            coverage: "仅预计补能费用，不含人工租赁维保",
            simulation_id: t.simulation_id,
          },
        });
    });
    return { ids: tasks.map((t) => t.id), dispatched: tasks.length };
  }
  if (type.startsWith("task.") || type.startsWith("trip."))
    return execution(db, user, type, id, b);
  return undefined;
}
function execution(db, user, type, id, b) {
  const t = get(db, user, "tasks", id);
  version(t, b);
  const isDriver = [
    "task.accept",
    "task.reject",
    "task.start",
    "trip.create",
    "trip.load",
    "trip.depart",
    "trip.deliver",
    "task.submit",
  ].includes(type);
  if (isDriver) {
    must(
      user.role === "driver" && user.driver_id === t.driver_id,
      "只有当前本人司机可以执行此动作",
      403,
    );
    allowed(user, "driver.execute");
  } else allowed(user, "task.verify");
  if (type === "task.reject") {
    must(t.status === "待接收", "当前任务不能拒绝");
    patch(db, "tasks", id, {
      status: "待派发",
      notification: "未投递",
      data: { ...t, rejection_reason: text(b.reason, "拒绝原因") },
    });
    db.prepare(
      "UPDATE charging SET status='待调整',version=version+1 WHERE task_id=? AND status='已确认'",
    ).run(id);
    return { id };
  }
  if (type === "task.cancel") {
    must(
      ["待派发", "待接收", "已接收"].includes(t.status) && !t.reported_kg,
      "存在执行事实，不允许直接取消",
    );
    text(b.reason, "取消原因");
    must(
      !db.prepare("SELECT 1 FROM trips WHERE task_id=?").get(id),
      "已有车次事实，需先核验",
    );
    patch(db, "tasks", id, {
      status: "已取消",
      data: { ...t, cancel_reason: b.reason },
    });
    db.prepare(
      "UPDATE charging SET status='已取消',version=version+1 WHERE task_id=?",
    ).run(id);
    return { id };
  }
  if (type === "task.schedule") {
    must(
      ["待派发", "待接收", "已接收"].includes(t.status),
      "实际执行后不能覆盖原计划时窗",
    );
    const start = new Date(b.start_at),
      finish = new Date(b.finish_at);
    must(
      Number.isFinite(+start) && Number.isFinite(+finish) && finish > start,
      "时窗无效",
    );
    must(
      !db
        .prepare(
          "SELECT 1 FROM tasks WHERE id<>? AND status IN('待接收','已接收','执行中','待核验','退回补充') AND (vehicle_id=? OR driver_id=?) AND start_at<? AND finish_at>?",
        )
        .get(
          id,
          t.vehicle_id,
          t.driver_id,
          finish.toISOString(),
          start.toISOString(),
        ),
      "调整后的车辆/司机时间冲突",
    );
    const reason = text(b.reason, "调整原因");
    patch(db, "tasks", id, {
      start_at: start.toISOString(),
      finish_at: finish.toISOString(),
      data: { ...t, schedule_reason: reason, requires_resimulation: true },
    });
    return { id };
  }
  if (type === "task.terminate") {
    must(
      ["执行中", "待核验", "退回补充"].includes(t.status),
      "当前任务不能终止余量",
    );
    must(
      !db
        .prepare(
          "SELECT 1 FROM trips WHERE task_id=? AND status NOT IN('已卸货','已核验')",
        )
        .get(id),
      "仍有在途/未完成车次，不能解除责任",
    );
    const reason = text(b.reason, "余量责任交接"),
      evidence = text(b.evidence, "已完成量核验依据");
    must(
      b.verified_quantity === t.reported_kg / 1000,
      "终止前须核对全部已报告车次",
    );
    db.prepare(
      "UPDATE trips SET verified_kg=delivered_kg,status='已核验',version=version+1 WHERE task_id=?",
    ).run(id);
    patch(db, "tasks", id, {
      status: "余量已终止",
      verified_kg: t.reported_kg,
      data: {
        ...t,
        remaining_reason: reason,
        verification_evidence: evidence,
        released_kg: t.quantity_kg - t.reported_kg,
      },
    });
    db.prepare(
      "UPDATE charging SET status='已取消',version=version+1 WHERE task_id=? AND status IN('草稿','已确认','待调整')",
    ).run(id);
    return {
      id,
      released_kg: t.quantity_kg - t.reported_kg,
      next: "重新推演订单可组织余量",
    };
  }
  if (type === "task.accept") {
    must(t.status === "待接收", "当前任务不能接收");
    patch(db, "tasks", id, { status: "已接收" });
    return { id };
  }
  if (type === "task.start") {
    must(t.status === "已接收", "请先接收任务");
    must(!t.requires_resimulation, "计划已调整，请管理员重新核对后再开始");
    patch(db, "tasks", id, { status: "执行中" });
    return { id };
  }
  if (type === "trip.create") {
    must(t.status === "执行中", "任务不在执行中");
    must(
      !db
        .prepare(
          "SELECT 1 FROM trips WHERE task_id=? AND status NOT IN('已卸货','已核验')",
        )
        .get(id),
      "请先完成当前车次",
    );
    const tripId = uid("TR");
    insert(db, "trips", {
      id: tripId,
      code: makeCode("CC"),
      task_id: id,
      owner_id: t.owner_id,
      status: "待装货",
      occurred_at: now(),
      data: { assignment_version: t.version },
    });
    patch(db, "tasks", id, {});
    return { id, trip_id: tripId };
  }
  if (type.startsWith("trip.")) {
    const tr = unpack(
      db
        .prepare("SELECT * FROM trips WHERE id=? AND task_id=?")
        .get(b.trip_id, id),
    );
    must(tr, "车次不属于当前任务", 404);
    must(t.status === "执行中", "任务状态已变化");
    let fields;
    if (type === "trip.load") {
      must(tr.status === "待装货", "车次状态已变化");
      const v = get(db, user, "vehicles", t.vehicle_id),
        quantity = kg(b.quantity);
      must(quantity <= v.payload_kg, "超过车辆有效载重");
      const prior = db
        .prepare(
          "SELECT COALESCE(sum(delivered_kg),0) n FROM trips WHERE task_id=? AND status IN('已卸货','已核验')",
        )
        .get(id).n;
      must(prior + quantity <= t.quantity_kg, "车次量超过任务未履约量");
      fields = {
        loaded_kg: quantity,
        status: "已装货",
        data: { ...tr, loading_evidence: text(b.evidence, "装货凭证或说明") },
      };
    } else if (type === "trip.depart") {
      must(tr.status === "已装货", "请先反馈装货");
      fields = { status: "运输中" };
    } else {
      must(type === "trip.deliver" && tr.status === "运输中", "请先开始运输");
      const q = kg(b.quantity);
      must(q <= tr.loaded_kg, "交付量不能超过本车次装货量");
      fields = {
        delivered_kg: q,
        status: "已卸货",
        data: { ...tr, delivery_evidence: text(b.evidence, "交付凭证或说明") },
      };
    }
    const occurred = b.occurred_at ? new Date(b.occurred_at) : new Date();
    must(
      Number.isFinite(+occurred) && +occurred <= Date.now() + 60000,
      "发生时间无效",
    );
    const late = Date.now() - occurred > 15 * 60000;
    if (late) text(b.late_reason, "补录说明");
    fields.occurred_at = occurred.toISOString();
    patch(db, "trips", tr.id, fields);
    insert(db, "events", {
      id: uid("EV"),
      source_key: user.id,
      event_key: text(b.event_id, "事件标识", 100),
      task_id: id,
      trip_id: tr.id,
      kind: type,
      occurred_at: occurred.toISOString(),
      received_at: now(),
      data: {
        late,
        late_reason: b.late_reason || "",
        source: "DRIVER_MANUAL_SIMULATION",
        quantity_kg: fields.delivered_kg || fields.loaded_kg || 0,
      },
    });
    const reported = db
      .prepare(
        "SELECT COALESCE(sum(delivered_kg),0) n FROM trips WHERE task_id=?",
      )
      .get(id).n;
    patch(db, "tasks", id, { reported_kg: reported });
    return { id };
  }
  if (type === "task.submit") {
    must(["执行中", "退回补充"].includes(t.status), "当前任务不能提交完工");
    const trips = db.prepare("SELECT * FROM trips WHERE task_id=?").all(id);
    must(
      trips.length &&
        trips.every((x) => ["已卸货", "已核验"].includes(x.status)),
      "存在未完成车次或没有交付记录",
    );
    if (t.reported_kg < t.quantity_kg)
      text(b.remaining_reason, "未履约量及责任说明");
    patch(db, "tasks", id, {
      status: "待核验",
      data: {
        ...t,
        submission_history: [
          ...(t.submission_history || []),
          {
            id: uid("SUB"),
            at: now(),
            by: user.id,
            quantity_kg: t.reported_kg,
            evidence: b.evidence,
            remaining_reason: b.remaining_reason || "",
            trip_ids: trips.map((tr) => tr.id),
          },
        ],
        completion_evidence: text(b.evidence, "完工凭证"),
        remaining_reason: b.remaining_reason || "",
        submission: (t.submission || 0) + 1,
        return_reason: "",
      },
    });
    return { id };
  }
  if (type === "task.return") {
    must(t.status === "待核验", "当前任务不在待核验");
    patch(db, "tasks", id, {
      status: "退回补充",
      data: {
        ...t,
        return_reason: text(b.reason, "退回原因"),
        verification_history: [
          ...(t.verification_history || []),
          { action: "退回补充", at: now(), by: user.id, reason: b.reason },
        ],
      },
    });
    return { id };
  }
  if (type === "task.verify") {
    must(t.status === "待核验", "当前任务不在待核验");
    const evidence = text(b.evidence, "核验依据");
    must(
      b.verified_quantity === t.reported_kg / 1000,
      "请按逐车次报告量核验；差异需要退回补充，不直接改总量",
    );
    db.prepare(
      "UPDATE trips SET verified_kg=delivered_kg,status='已核验',version=version+1 WHERE task_id=?",
    ).run(id);
    patch(db, "tasks", id, {
      status: "已完成",
      verified_kg: t.reported_kg,
      data: {
        ...t,
        verification_evidence: evidence,
        verified_by: user.id,
        verification_history: [
          ...(t.verification_history || []),
          {
            action: "核验通过",
            at: now(),
            by: user.id,
            evidence,
            verified_kg: t.reported_kg,
          },
        ],
      },
    });
    const order = get(db, user, "orders", t.order_id),
      verified = db
        .prepare(
          "SELECT COALESCE(sum(verified_kg),0) n FROM tasks WHERE order_id=?",
        )
        .get(order.id).n;
    if (verified >= order.quantity_kg - order.cancelled_kg)
      patch(db, "orders", order.id, { status: "已完成" });
    return { id };
  }
  if (type === "task.reassign") {
    must(
      ["待接收", "已接收"].includes(t.status),
      "执行中的改派必须处理在途责任，本期禁止直接覆盖",
    );
    const v = get(db, user, "vehicles", b.vehicle_id),
      d = get(db, user, "drivers", b.driver_id);
    must(v.status === "可用" && d.status === "可用", "新运力不可用");
    must(
      v.owner_id === t.owner_id && d.owner_id === t.owner_id,
      "新运力归属主体不一致",
    );
    text(b.reason, "变更及责任说明");
    must(
      !db
        .prepare(
          "SELECT 1 FROM tasks WHERE id<>? AND status IN('待接收','已接收','执行中','待核验','退回补充') AND (vehicle_id=? OR driver_id=?) AND start_at<? AND finish_at>?",
        )
        .get(id, v.id, d.id, t.finish_at, t.start_at),
      "新车辆或司机时间冲突",
    );
    const order = get(db, user, "orders", t.order_id),
      station = get(
        db,
        user,
        "stations",
        t.station_id ||
          db
            .prepare(
              "SELECT station_id FROM charging WHERE task_id=? ORDER BY id LIMIT 1",
            )
            .get(t.id)?.station_id ||
          "S001",
      );
    must(
      v.compatibility === station.compatibility && station.status === "运营中",
      "新车辆与补能场站适配或服务条件不成立",
    );
    const device = db
      .prepare(
        "SELECT min(power_kw) power FROM devices WHERE station_id=? AND connection='在线' AND status='空闲'",
      )
      .get(station.id);
    must(device.power > 0, "没有在线空闲工位，不能确认新的补能条件");
    must(v.soc != null && v.soc > 20, "新车辆缺少有效参考SOC或不能满足余量");
    const trips = Math.ceil(t.quantity_kg / v.payload_kg),
      distance = trips * order.distance_km * 2,
      energy = distance * v.energy_per_km,
      charge = Math.max(0, energy - (v.capacity_kwh * (v.soc - 20)) / 100);
    if (station.mode === "换电" && charge > 0)
      must(station.inventory > 0, "参考电池库存不足");
    const service =
      station.mode === "换电"
        ? Math.ceil(charge / v.capacity_kwh) * 10
        : (charge / Math.min(device.power, station.power_kw)) * 60;
    const duration =
      trips *
        ((order.distance_km / 35) * 60 +
          (order.distance_km / 45) * 60 +
          (order.loading_minutes || 10) +
          (order.unloading_minutes || 10)) +
      service;
    must(
      duration <= (new Date(t.finish_at) - new Date(t.start_at)) / 60000,
      "新车辆参考运量、补能和时窗不可行",
    );
    const plans = db
      .prepare("SELECT id FROM charging WHERE task_id=?")
      .all(t.id);
    must(
      !plans.some((c) =>
        db.prepare("SELECT 1 FROM sessions WHERE plan_id=?").get(c.id),
      ),
      "已存在关联作业事实，请先核验能源责任再变更",
    );
    const candidate = scheduleCandidate({
      order: { ...order, start_at: t.start_at, finish_at: t.finish_at },
      station,
      devices: db
        .prepare("SELECT * FROM devices WHERE station_id=?")
        .all(station.id),
      vehicles: [v],
      drivers: [d],
      allocations: [
        {
          vehicle_id: v.id,
          driver_id: d.id,
          trips,
          quantity_kg: t.quantity_kg,
        },
      ],
      soc: v.soc,
      reserve: 20,
      id: "A",
      name: "改派参考方案",
    });
    must(
      candidate.feasible,
      "新运力排班、电量或时效不满足：" +
        candidate.constraint_violations.map((x) => x.kind).join("、"),
    );
    const plan = candidate.assignments[0];
    db.prepare(
      "UPDATE charging SET status='已取消',version=version+1 WHERE task_id=? AND status IN('草稿','已确认','待调整')",
    ).run(t.id);
    for (const event of plan.charging_events)
      insert(db, "charging", {
        id: uid("C"),
        code: makeCode("BN"),
        name: t.name + "改派补能",
        owner_id: t.owner_id,
        task_id: t.id,
        vehicle_id: v.id,
        station_id: station.id,
        status: "待确认",
        arrival_at: event.arrival_at,
        quantity_kwh: event.quantity_kwh,
        data: {
          ...event,
          mode: station.mode,
          reference_only: true,
          reason: b.reason,
        },
      });
    db.prepare(
      "UPDATE costs SET status='已替代',version=version+1 WHERE task_id=? AND nature='预计' AND status='预计'",
    ).run(t.id);
    if (plan.known_cost_cents > 0)
      insert(db, "costs", {
        id: uid("F"),
        code: makeCode("FY"),
        name: t.name + "改派预计补能费",
        owner_id: t.owner_id,
        task_id: t.id,
        status: "预计",
        nature: "预计",
        amount_cents: plan.known_cost_cents,
        created_at: now(),
        source: "DERIVED_SIMULATION",
        data: {
          category: "电费及服务费",
          included: "参考电价与服务费",
          coverage: "仅补能费",
        },
      });
    patch(db, "tasks", id, {
      vehicle_id: v.id,
      driver_id: d.id,
      status: "待接收",
      finish_at: plan.finish_at,
      data: {
        ...t,
        plan,
        requires_resimulation: false,
        station_id: station.id,
        reference_only: true,
        reassignment_snapshot: {
          vehicle_version: v.version,
          driver_version: d.version,
          station_version: station.version,
          soc: v.soc,
          reserve_soc: 20,
          model: "REFERENCE-REASSIGNMENT-V2",
        },
        reassignment_reason: b.reason,
        previous_assignment: {
          vehicle_id: t.vehicle_id,
          driver_id: t.driver_id,
        },
      },
    });
    return { id };
  }
  if (type === "task.notify") {
    must(t.notification === "投递失败", "当前通知不需要重试");
    patch(db, "tasks", id, { notification: "已投递" });
    return { id };
  }
  throw new Error("未知执行动作");
}
export { patch, makeCode };
