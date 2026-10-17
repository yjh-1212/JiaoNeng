import { must, insert, unpack, now, uid, text, number } from "./db.mjs";
import { get, allowed, version } from "./repository.mjs";
import { patch, makeCode } from "./transport.mjs";
import { operationsCommand } from "./operations.mjs";
import {
  energyRows,
  checkDay,
  energyDay,
  filterPlans,
  joinedPlans,
} from "./energy-workspace.mjs";
import { optimizeCharging } from "./charging-model.mjs";
import { compareEnergy } from "./energy-model.mjs";
const visitGet = (db, user, id) =>
  get(db, user, "station-visits", text(id, "到站记录", 160));
const currentVisits = (db, condition, args = []) =>
  db
    .prepare(
      "SELECT * FROM records WHERE resource='station-visits' AND status IN('待服务','补能中') AND " +
        condition,
    )
    .all(...args)
    .map(unpack);
const admin = (user) =>
  must(user.role === "admin", "只有管理员可执行此操作", 403);
function actualTime(value, label) {
  const d = new Date(value);
  must(
    Number.isFinite(+d) && +d <= Date.now() + 60000,
    label + "无效或晚于当前时间",
  );
  return d.toISOString();
}
function activeTask(db, user, id) {
  if (!id) return null;
  const t = get(db, user, "tasks", id);
  must(
    !["已取消", "余量已终止", "已完成"].includes(t.status),
    "关联运输任务已结束，不能安排新作业",
  );
  return t;
}
function noFact(db, id) {
  must(
    !db
      .prepare(
        "SELECT 1 FROM records WHERE resource='station-visits' AND json_extract(data,'$.plan_id')=? AND status<>'已取消'",
      )
      .get(id) && !db.prepare("SELECT 1 FROM sessions WHERE plan_id=?").get(id),
    "已有到站或实际作业，不能覆盖补能计划",
    409,
  );
}

export function guardEnergyMutation(db, user, type, id, b) {
  if (type === "order.cancel") {
    get(db, user, "orders", id);
    must(
      !db
        .prepare(
          "SELECT 1 FROM records WHERE resource='station-visits' AND status<>'已取消' AND json_extract(data,'$.task_id') IN(SELECT id FROM tasks WHERE order_id=?)",
        )
        .get(id),
      "订单已有到站或补能作业事实，请先核对任务责任与余量",
      409,
    );
  }
  if (
    [
      "task.cancel",
      "task.reassign",
      "task.schedule",
      "task.terminate",
      "task.reject",
    ].includes(type)
  ) {
    get(db, user, "tasks", id);
    const all = db
      .prepare(
        "SELECT status FROM records WHERE resource='station-visits' AND json_extract(data,'$.task_id')=? AND status<>'已取消'",
      )
      .all(id);
    must(
      !all.some((v) => ["待服务", "补能中"].includes(v.status)),
      "存在到站或补能中作业，请先处理现场责任",
      409,
    );
    if (["task.cancel", "task.reassign", "task.reject"].includes(type))
      must(!all.length, "已有补能作业事实，不能直接取消或覆盖指派", 409);
  }
  if (
    ["charging.cancel", "charging.adjust", "charging.confirm"].includes(type)
  ) {
    get(db, user, "charging", id);
    noFact(db, id);
    if (type === "charging.confirm") {
      const p = joinedPlans(db, user).find((p) => p.id === id);
      must(p && !p.risks.length, "补能安排存在冲突，请调整后重新核对");
    }
  }
  if (type === "session.create" && b.plan_id)
    must(
      !currentVisits(db, "json_extract(data,'$.plan_id')=?", [b.plan_id])
        .length,
      "该计划已有现场作业，请从现场作业登记结束",
      409,
    );
  if (type === "resource.edit" && b.resource === "devices") {
    get(db, user, "devices", id);
    must(
      !currentVisits(
        db,
        "json_extract(data,'$.device_id')=? AND status='补能中'",
        [id],
      ).length,
      "工位有进行中的作业，请先完成交接",
      409,
    );
  }
  if (type === "charging.apply") {
    const r = get(db, user, "charging-optimizations", id);
    const a = r.alternatives?.find(
      (x) => x.id === (b.alternative_id || r.selected),
    );
    for (const c of a?.changes || []) noFact(db, c.id);
  }
}
export function afterEnergyMutation(db, user, type, id) {
  if (type === "session.verify") {
    const rows = db
      .prepare(
        "SELECT * FROM records WHERE resource='station-visits' AND json_extract(data,'$.session_id')=? AND status='待核验'",
      )
      .all(id)
      .map(unpack);
    for (const v of rows)
      patch(db, "records", v.id, {
        status: "已完成",
        data: { ...v, verified_at: now(), verified_by: user.id },
      });
  }
}
export function energyCommand(db, user, type, id, b) {
  if (type === "driver.energy-alert") {
    must(user.role === "driver", "仅司机本人可反馈", 403);
    allowed(user, "driver.execute");
    const p = get(db, user, "charging", text(b.plan_id, "补能计划", 160));
    const r = {
      id: uid("A"),
      code: makeCode("YJ"),
      name: "补能异常",
      owner_id: p.owner_id,
      task_id: p.task_id,
      vehicle_id: p.vehicle_id,
      status: "待受理",
      severity: "待核实",
      created_at: now(),
      source: "MANUAL_SIMULATION",
      data: {
        report: text(b.reason, "异常情况"),
        evidence: text(b.evidence, "现场依据"),
        driver_id: user.driver_id,
        station_id: p.station_id,
        plan_id: p.id,
        kind: "人工反馈",
      },
    };
    insert(db, "alerts", r);
    return { id: r.id };
  }
  if (type === "station.alert") {
    admin(user);
    allowed(user, "alert.write");
    const d = get(db, user, "devices", text(b.device_id, "设备工位", 160));
    const r = {
      id: uid("A"),
      code: makeCode("YJ"),
      name: "场站设备异常",
      owner_id: d.owner_id,
      task_id: null,
      vehicle_id: null,
      status: "待受理",
      severity: "待核实",
      created_at: now(),
      source: "MANUAL_SIMULATION",
      data: {
        report: text(b.reason, "异常情况"),
        evidence: text(b.evidence, "现场依据"),
        station_id: d.station_id,
        device_id: d.id,
        kind: "人工反馈",
      },
    };
    insert(db, "alerts", r);
    return { id: r.id };
  }
  if (type === "charging.optimize-scoped") {
    admin(user);
    allowed(user, "forecast.run");
    if (b.plan_ids) {
      must(
        Array.isArray(b.plan_ids) &&
          b.plan_ids.length > 0 &&
          b.plan_ids.length <= 100 &&
          b.plan_ids.every((x) => typeof x === "string") &&
          new Set(b.plan_ids).size === b.plan_ids.length,
        "所选计划范围无效",
      );
      for (const id of b.plan_ids) get(db, user, "charging", id);
    }
    must(
      !b.stage ||
        ["all", "pending", "arranged", "risk", "ended"].includes(b.stage),
      "优化分组无效",
    );
    const rows = filterPlans(joinedPlans(db, user), b).filter(
      (p) =>
        ["草稿", "待确认", "已确认"].includes(p.status) &&
        !p.visit &&
        !p.sessions.length &&
        (!b.plan_ids || b.plan_ids.includes(p.id)) &&
        (!b.stage || b.stage === "all" || p.stage === b.stage) &&
        (!b.status || p.status === b.status) &&
        (!b.risk || b.risk !== "1" || p.risks.length),
    );
    if (b.plan_ids)
      must(
        rows.length === b.plan_ids.length,
        "所选计划已变化或超出查询范围，请刷新后重选",
        409,
      );
    must(rows.length, "当前范围没有可优化的未执行计划");
    return optimizeCharging(db, user, { plan_ids: rows.map((p) => p.id) });
  }
  if (type === "energy.compare" && b.date) {
    admin(user);
    allowed(user, "energy.write");
    const date = checkDay(b.date),
      station = get(db, user, "stations", text(b.station_id, "场站", 160));
    const loads = energyRows(db, user, "loads").filter(
      (r) =>
        r.station_id === station.id &&
        energyDay(r.source_time || r.created_at) === date,
    );
    must(
      loads.some((r) => r.actual_kw != null),
      "所选日期缺少负荷来源，请选择有记录的日期",
    );
    const resources = energyRows(db, user, "energy-resources").filter(
      (r) => r.station_id === station.id,
    );
    const strategies = compareEnergy(
      station,
      loads,
      resources,
      new Date(date + "T00:00:00+08:00"),
    );
    const plans = filterPlans(joinedPlans(db, user), {
      date,
      station: station.id,
    }).filter((p) => p.status === "已确认");
    const rec = {
      id: uid("EN"),
      resource: "energy-plans",
      code: makeCode("NY"),
      name: station.name + " · " + date + "能源策略",
      owner_id: station.owner_id,
      status: "待确认",
      created_at: now(),
      source: "DERIVED_SIMULATION",
      data: {
        station_id: station.id,
        date,
        strategies,
        selected: "base",
        peak_kw: Math.max(
          ...loads.filter((r) => r.actual_kw != null).map((r) => r.actual_kw),
        ),
        storage_control: false,
        linked_plan_versions: plans.map((p) => ({
          id: p.id,
          version: p.version,
        })),
        resource_versions: resources.map((r) => ({
          id: r.id,
          version: r.version,
        })),
        effective_window: {
          start_at: date + "T00:00:00+08:00",
          finish_at: new Date(
            +new Date(date + "T00:00:00+08:00") + 86400000,
          ).toISOString(),
        },
        boundaries:
          "所选场站/日期、独立总表样例及已知电价；缺测不计0，确认不下发设备指令",
      },
    };
    insert(db, "records", rec);
    return { id: rec.id };
  }
  if (type === "charging.create" || type === "charging.review") {
    admin(user);
    allowed(user, "charging.write");
    const old =
      type === "charging.review" ? get(db, user, "charging", id) : null;
    if (old) {
      version(old, b);
      noFact(db, id);
      must(
        ["草稿", "待确认", "已确认", "待调整"].includes(old.status),
        "当前补能安排不可调整",
      );
      text(b.reason, "调整原因");
    }
    const vehicle = get(
        db,
        user,
        "vehicles",
        old?.vehicle_id || text(b.vehicle_id, "车辆", 160),
      ),
      station = get(
        db,
        user,
        "stations",
        b.station_id || old?.station_id || text(b.station_id, "场站", 160),
      );
    must(
      vehicle.owner_id === station.owner_id &&
        station.status === "运营中" &&
        vehicle.compatibility === station.compatibility,
      "车辆与场站主体、状态或适配不符",
    );
    const task = activeTask(db, user, old?.task_id || b.task_id);
    if (task)
      must(
        task.vehicle_id === vehicle.id && task.owner_id === vehicle.owner_id,
        "关联任务与车辆不一致",
      );
    const arrival = new Date(b.arrival_at),
      finish = b.finish_at ? new Date(b.finish_at) : null;
    must(Number.isFinite(+arrival), "预计到站无效");
    if (finish)
      must(
        Number.isFinite(+finish) && finish > arrival,
        "服务结束必须晚于到站",
      );
    if (task && finish)
      must(+finish <= +new Date(task.finish_at), "服务结束超过运输任务时限");
    const quantity = number(b.quantity_kwh, "预计补能量", 1, 1000);
    if (old) {
      patch(db, "charging", id, {
        station_id: station.id,
        arrival_at: arrival.toISOString(),
        quantity_kwh: quantity,
        status: "待确认",
        data: {
          ...old,
          mode: station.mode,
          finish_at: finish?.toISOString() || null,
          start_at: null,
          adjustment_reason: b.reason,
          reviewed_at: now(),
          reference_only: true,
        },
      });
      return { id };
    }
    const r = operationsCommand(db, user, "charging.create", null, {
      ...b,
      vehicle_id: vehicle.id,
      station_id: station.id,
      arrival_at: arrival.toISOString(),
    });
    if (finish) {
      const p = get(db, user, "charging", r.id);
      patch(db, "charging", r.id, {
        data: { ...p, finish_at: finish.toISOString() },
      });
    }
    return r;
  }
  if (type === "station.arrive" || type === "driver.arrive") {
    const isDriver = type === "driver.arrive";
    if (isDriver) {
      must(user.role === "driver", "仅司机本人可反馈到站", 403);
      allowed(user, "driver.execute");
    } else {
      admin(user);
      allowed(user, "session.write");
    }
    const plan = b.plan_id
      ? get(db, user, "charging", text(b.plan_id, "补能计划", 160))
      : null;
    if (isDriver) must(plan, "司机到站需关联有效补能计划");
    if (plan) {
      version(plan, b);
      must(plan.status === "已确认", "补能安排未确认或已失效");
      noFact(db, plan.id);
    }
    const vehicle = get(
        db,
        user,
        "vehicles",
        plan?.vehicle_id || text(b.vehicle_id, "车辆", 160),
      ),
      station = get(
        db,
        user,
        "stations",
        plan?.station_id || text(b.station_id, "场站", 160),
      );
    must(vehicle.owner_id === station.owner_id, "车辆和场站主体不一致");
    must(station.status === "运营中", "场站当前不可用");
    must(vehicle.compatibility === station.compatibility, "补能适配不一致");
    const task = activeTask(db, user, plan?.task_id || b.task_id);
    if (task) must(task.vehicle_id === vehicle.id, "任务与到站车辆不一致");
    must(
      !currentVisits(db, "json_extract(data,'$.vehicle_id')=?", [vehicle.id])
        .length,
      "该车辆已有未结束到站作业",
      409,
    );
    const arrived = actualTime(b.arrived_at, "到站时间");
    const r = {
      id: uid("VIS"),
      resource: "station-visits",
      code: makeCode("DZ"),
      name: vehicle.code + "到站作业",
      owner_id: vehicle.owner_id,
      status: "待服务",
      created_at: now(),
      source: "MANUAL_SIMULATION",
      data: {
        plan_id: plan?.id || null,
        vehicle_id: vehicle.id,
        station_id: station.id,
        task_id: task?.id || null,
        driver_id: task?.driver_id || vehicle.driver_id,
        arrived_at: arrived,
        reported_by: user.id,
        evidence: text(b.evidence || "本人/现场到站登记", "到站依据"),
      },
    };
    insert(db, "records", r);
    return { id: r.id };
  }
  if (!["station.start", "station.finish", "station.cancel"].includes(type))
    return undefined;
  admin(user);
  allowed(user, "session.write");
  const v = visitGet(db, user, id);
  version(v, b);
  if (type === "station.cancel") {
    must(v.status === "待服务", "仅待服务到站可取消");
    const reason = text(b.reason, "取消原因");
    patch(db, "records", id, {
      status: "已取消",
      data: { ...v, cancel_reason: reason },
    });
    return { id };
  }
  const station = get(db, user, "stations", v.station_id),
    vehicle = get(db, user, "vehicles", v.vehicle_id);
  if (type === "station.start") {
    must(v.status === "待服务", "作业已经开始或结束");
    const task = activeTask(db, user, v.task_id);
    must(!task?.requires_resimulation, "运输安排已变化，先重新核对");
    if (v.plan_id) {
      const p = get(db, user, "charging", v.plan_id);
      must(
        p.status === "已确认" &&
          p.vehicle_id === v.vehicle_id &&
          p.station_id === v.station_id,
        "补能计划已变化",
        409,
      );
    }
    const device = get(db, user, "devices", text(b.device_id, "作业工位", 160));
    version(device, { expected_version: b.device_version });
    must(
      device.station_id === station.id &&
        device.owner_id === v.owner_id &&
        station.status === "运营中" &&
        device.connection === "在线" &&
        device.status === "空闲" &&
        device.power_kw > 0 &&
        !device.managed_visit_id,
      "工位不属于本站、不可用或已占用",
      409,
    );
    if (station.mode === "换电")
      must(station.inventory > 0, "本站可用电池库存不足");
    must(
      !device.compatibility || device.compatibility === vehicle.compatibility,
      "工位与车辆适配不一致",
    );
    must(
      !currentVisits(
        db,
        "(json_extract(data,'$.device_id')=? OR json_extract(data,'$.vehicle_id')=?) AND status='补能中'",
        [device.id, vehicle.id],
      ).length,
      "工位或车辆已有作业",
      409,
    );
    const start = actualTime(b.start_at, "开始时间"),
      release = new Date(b.release_at);
    must(start >= v.arrived_at, "开始早于到站");
    must(
      Number.isFinite(+release) && +release > +new Date(start),
      "预计释放必须晚于开始",
    );
    patch(db, "records", id, {
      status: "补能中",
      data: {
        ...v,
        device_id: device.id,
        start_at: start,
        release_at: release.toISOString(),
        started_by: user.id,
      },
    });
    patch(db, "devices", device.id, {
      status: "占用",
      data: {
        ...device,
        managed_visit_id: id,
        release_at: release.toISOString(),
        operational_source: "人工作业登记·仿真",
      },
    });
    return { id };
  }
  must(v.status === "补能中", "当前没有进行中的作业");
  const device = get(db, user, "devices", v.device_id);
  must(device.managed_visit_id === v.id, "工位归属已变化，请核查现场", 409);
  const finish = actualTime(b.finish_at, "结束时间");
  must(finish > v.start_at, "结束时间必须晚于开始");
  if (station.mode === "换电") {
    text(b.incoming_battery, "换入电池", 160);
    text(b.outgoing_battery, "换出电池", 160);
  }
  const output = operationsCommand(db, user, "session.create", null, {
    ...b,
    vehicle_id: v.vehicle_id,
    station_id: v.station_id,
    task_id: v.task_id,
    plan_id: v.plan_id,
    driver_id: v.driver_id,
    device_id: v.device_id,
    start_at: v.start_at,
    finish_at: finish,
    source_event_id: v.id,
  });
  const session = get(db, user, "sessions", output.id);
  patch(db, "sessions", session.id, { data: { ...session, visit_id: v.id } });
  patch(db, "records", id, {
    status: "待核验",
    data: {
      ...v,
      finish_at: finish,
      session_id: output.id,
      actual_kwh: b.quantity_kwh,
      amount_cents: Math.round(b.amount * 100),
      finish_evidence: b.evidence,
    },
  });
  patch(db, "devices", device.id, {
    status: "空闲",
    data: {
      ...device,
      managed_visit_id: null,
      release_at: finish,
      operational_source: "人工作业结束·仿真",
    },
  });
  return { id, session_id: output.id };
}
