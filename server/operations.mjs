import { completionCommand, allRows } from "./completion.mjs";
import { compareEnergy } from "./energy-model.mjs";
import { availableIn, parseWindow } from "./scheduling.mjs";
import { insert, now, uid, must, text, number, unpack } from "./db.mjs";
import { get, list, allowed, version, owner } from "./repository.mjs";
import { patch, makeCode } from "./transport.mjs";
import { extensionCommand } from "./extensions.mjs";
import { passwordHash } from "./seed.mjs";
const record = (
  db,
  user,
  resource,
  name,
  data,
  status = "草稿",
  source = "DERIVED_SIMULATION",
) => {
  const id = uid(resource.toUpperCase());
  insert(db, "records", {
    id,
    resource,
    code: makeCode(
      resource === "planning" ? "GH" : resource === "forecasts" ? "YC" : "JL",
    ),
    name,
    owner_id: user.scopes[0],
    status,
    created_at: now(),
    source,
    data,
  });
  return { ...data, id };
};
export function operationsCommand(db, user, type, id, b) {
  const completed = completionCommand(db, user, type, id, b);
  if (completed) return completed;
  const extension = extensionCommand(db, user, type, id, b);
  if (extension) return extension;
  must(
    user.role === "admin" || type === "alert.report",
    "只有管理员可执行业务管理动作",
    403,
    "FORBIDDEN",
  );
  if (type === "resource.edit") {
    allowed(user, "resource.write");
    must(
      [
        "vehicles",
        "drivers",
        "stations",
        "devices",
        "integrations",
        "entities",
        "assets",
        "replacements",
        "parameters",
      ].includes(b.resource),
      "该对象不支持通用维护",
    );
    const r = get(db, user, b.resource, id);
    version(r, b);
    const status = text(b.status || r.status, "状态", 30);
    if (b.resource === "parameters") {
      must(
        r.production_auto_enabled === true && b.enabled === true,
        "参考参数不得直接启用为生产版本",
      );
      return { id };
    }
    const valid = {
      vehicles: ["可用", "检修", "停用", "待核实"],
      drivers: ["可用", "休息", "停用"],
      stations: ["运营中", "维护", "待核实", "停用"],
      devices: ["空闲", "占用", "检修", "待核实"],
    };
    if (valid[b.resource])
      must(valid[b.resource].includes(status), "状态值不在允许范围");
    if (["vehicles", "drivers"].includes(b.resource) && status !== "可用") {
      const field = b.resource === "vehicles" ? "vehicle_id" : "driver_id";
      must(
        !db
          .prepare(
            `SELECT 1 FROM tasks WHERE ${field}=? AND status IN('待接收','已接收','执行中','待核验','退回补充')`,
          )
          .get(id),
        "存在未完成关联任务，不能直接停用资源",
      );
    }
    if (b.resource === "devices") {
      must(
        ["在线", "离线", "待核实"].includes(b.connection || r.connection),
        "连接状态不正确",
      );
      patch(db, "devices", id, {
        status,
        connection: b.connection || r.connection,
        source: "MANUAL_SIMULATION",
        data: {
          ...r,
          evidence: text(b.evidence, "核验依据"),
          manual_override: true,
          source_time: now(),
          previous_source_values: {
            status: r.status,
            connection: r.connection,
            source: r.source,
          },
        },
      });
    } else {
      const data = {
          ...r,
          note: b.note || "",
          evidence: text(b.evidence, "变更核验依据"),
        },
        fields = { name: text(b.name || r.name, "名称", 100), status };
      if (b.resource === "vehicles") {
        if (b.capacity_kwh != null)
          fields.capacity_kwh = number(b.capacity_kwh, "电池容量", 1, 2000);
        if (b.payload_tonnes != null)
          fields.payload_kg = Math.round(
            number(b.payload_tonnes, "有效载重", 0.1, 100) * 1000,
          );
        if (b.compatibility)
          data.compatibility = text(b.compatibility, "补能适配");
        if (b.energy_per_km != null)
          data.energy_per_km = number(b.energy_per_km, "参考能耗", 0.1, 10);
      }
      if (b.resource === "drivers") {
        if (b.license) data.license = text(b.license, "驾驶资格");
        if (b.available_window)
          data.available_window = text(b.available_window, "可用窗口");
      }
      if (
        ["vehicles", "drivers", "stations"].includes(b.resource) &&
        b.available_window
      ) {
        parseWindow(b.available_window);
        data.available_window = b.available_window;
        const field =
          b.resource === "drivers"
            ? "driver_id"
            : b.resource === "vehicles"
              ? "vehicle_id"
              : null;
        if (field) {
          const occupied = db
            .prepare(
              `SELECT * FROM tasks WHERE ${field}=? AND status IN('待接收','已接收','执行中','待核验','退回补充')`,
            )
            .all(id);
          must(
            occupied.every((t) => availableIn(data, t.start_at, t.finish_at)),
            "新的排班窗口影响未完成任务，请先调整任务",
          );
        }
      }
      if (b.resource === "stations") {
        if (b.power_kw != null)
          fields.power_kw = number(b.power_kw, "有效供电", 0, 100000);
        if (b.compatibility)
          data.compatibility = text(b.compatibility, "服务适配");
        if (b.price_curve) {
          must(b.price_curve.length === 24, "须登记24小时价格");
          data.price_curve = b.price_curve;
        }
        if (b.inventory != null)
          data.inventory = number(b.inventory, "参考电池库存", 0, 10000);
      }
      fields.data = data;
      patch(
        db,
        [
          "integrations",
          "entities",
          "assets",
          "replacements",
          "parameters",
        ].includes(b.resource)
          ? "records"
          : b.resource,
        id,
        fields,
      );
    }
    return { id };
  }
  if (
    type === "resource.create" &&
    [
      "vehicles",
      "drivers",
      "stations",
      "candidates",
      "energy-resources",
      "rules",
    ].includes(b.resource)
  ) {
    allowed(user, "resource.write");
    const org = owner(user, b.owner_id || user.scopes[0]),
      name = text(b.name, "名称", 100);
    id = uid("R");
    if (b.resource === "vehicles") {
      if (b.driver_id)
        must(
          get(db, user, "drivers", b.driver_id).owner_id === org,
          "绑定司机与车辆主体不一致",
        );
      insert(db, "vehicles", {
        id,
        code: text(b.code, "车辆编号", 30),
        name,
        owner_id: org,
        driver_id: b.driver_id || null,
        status: "待核实",
        capacity_kwh: number(b.capacity_kwh, "电池容量", 1, 2000),
        payload_kg: Math.round(
          number(b.payload_tonnes, "核定载重", 0.1, 100) * 1000,
        ),
        soc: b.soc == null ? null : number(b.soc, "SOC", 0, 100),
        source: "MANUAL_SIMULATION",
        data: {
          compatibility: text(b.compatibility, "补能适配"),
          energy_per_km: number(b.energy_per_km, "参考能耗", 0.1, 10),
          available_window: b.available_window
            ? (parseWindow(b.available_window), b.available_window)
            : null,
          evidence: text(b.evidence, "资料依据"),
        },
      });
    } else if (b.resource === "drivers") {
      insert(db, "drivers", {
        id,
        code: text(b.code, "司机编号", 30),
        name,
        owner_id: org,
        status: "休息",
        source: "MANUAL_SIMULATION",
        data: {
          license: text(b.license, "驾驶资格"),
          available_window: text(b.available_window, "可用窗口"),
          evidence: text(b.evidence, "资料依据"),
        },
      });
    } else if (b.resource === "stations") {
      must(["充电", "换电"].includes(b.mode), "补能方式无效");
      insert(db, "stations", {
        id,
        code: text(b.code, "场站编号", 30),
        name,
        owner_id: org,
        status: "待核实",
        mode: b.mode,
        power_kw: number(b.power_kw, "有效供电功率", 0, 100000),
        longitude: number(b.longitude, "经度", 73, 136),
        latitude: number(b.latitude, "纬度", 18, 54),
        source: "MANUAL_SIMULATION",
        data: {
          compatibility: text(b.compatibility, "服务适配"),
          available_window: b.available_window
            ? (parseWindow(b.available_window), b.available_window)
            : null,
          land_verified: false,
          grid_verified: false,
          price_curve: [],
          inventory: 0,
          evidence: text(b.evidence, "资料依据"),
        },
      });
    } else
      return record(
        db,
        user,
        b.resource,
        name,
        {
          kind: b.kind || "候选资料",
          station_id: b.station_id || null,
          capacity_kw: b.capacity_kw ?? null,
          longitude: b.longitude ?? null,
          latitude: b.latitude ?? null,
          evidence: text(b.evidence, "资料依据"),
          land: "待核实",
          grid: "待核实",
          note: b.note || "",
        },
        "待核实",
        "MANUAL_SIMULATION",
      );
    return { id };
  }
  if (type === "resource.create") {
    allowed(user, "resource.write");
    must(
      ["entities", "assets", "replacements", "integrations"].includes(
        b.resource,
      ),
      "请使用对应业务登记入口",
    );
    return record(
      db,
      user,
      b.resource,
      text(b.name, "名称", 100),
      {
        note: text(b.note, "内容"),
        kind: b.kind || "人工登记",
        vehicle_id: b.vehicle_id
          ? get(db, user, "vehicles", b.vehicle_id).id
          : null,
        capacity_kwh:
          b.capacity_kwh == null
            ? null
            : number(b.capacity_kwh, "电池容量", 1, 2000),
        partner: b.partner || null,
        quantity: b.quantity ?? null,
        contact: b.contact || null,
        external_code: b.code || null,
        evidence: b.evidence || "",
      },
      "草稿",
      "MANUAL_SIMULATION",
    );
  }
  if (type === "charging.create") {
    allowed(user, "charging.write");
    const vehicle = get(db, user, "vehicles", b.vehicle_id),
      station = get(db, user, "stations", b.station_id);
    must(vehicle.owner_id === station.owner_id, "车辆与场站主体不一致");
    must(vehicle.compatibility === station.compatibility, "补能适配未核验");
    const task = b.task_id ? get(db, user, "tasks", b.task_id) : null;
    if (task) must(task.vehicle_id === vehicle.id, "任务和补能车辆不一致");
    id = uid("C");
    const arrival = new Date(b.arrival_at);
    must(Number.isFinite(+arrival), "预计到站时间无效");
    insert(db, "charging", {
      id,
      code: makeCode("BN"),
      name: vehicle.code + "补能安排",
      owner_id: vehicle.owner_id,
      task_id: task?.id || null,
      vehicle_id: vehicle.id,
      station_id: station.id,
      status: "草稿",
      arrival_at: arrival.toISOString(),
      quantity_kwh: number(b.quantity_kwh, "预计补能量", 1, 1000),
      source: "MANUAL_SIMULATION",
      data: { mode: station.mode, reference_only: true },
    });
    return { id };
  }
  if (type === "charging.cancel") {
    allowed(user, "charging.write");
    const r = get(db, user, "charging", id);
    version(r, b);
    must(
      ["草稿", "待确认", "已确认", "待调整"].includes(r.status),
      "已有作业事实，不能取消计划",
    );
    must(
      !db.prepare("SELECT 1 FROM sessions WHERE plan_id=?").get(id),
      "存在实际作业记录，保留计划核验",
    );
    patch(db, "charging", id, {
      status: "已取消",
      data: { ...r, cancel_reason: text(b.reason, "取消原因") },
    });
    return { id };
  }
  if (type === "charging.confirm" || type === "charging.adjust") {
    allowed(user, "charging.write");
    const r = get(db, user, "charging", id);
    version(r, b);
    must(
      ["草稿", "待确认", "已确认"].includes(r.status),
      "补能已执行或失效，不能修改",
    );
    const s = get(db, user, "stations", r.station_id);
    must(s.status === "运营中", "场站当前不可用");
    const vehicle = get(db, user, "vehicles", r.vehicle_id);
    must(vehicle.compatibility === s.compatibility, "适配资料已变化");
    must(
      db
        .prepare(
          "SELECT 1 FROM devices WHERE station_id=? AND connection='在线' AND status IN('空闲','占用')",
        )
        .get(s.id),
      "没有可核验在线工位",
    );
    if (s.mode === "换电") must(s.inventory > 0, "可用电池库存不足");
    if (r.task_id)
      must(
        get(db, user, "tasks", r.task_id).vehicle_id === r.vehicle_id,
        "关联任务已改派，需重新安排",
      );
    const changes = { status: "已确认" };
    if (type === "charging.adjust") {
      text(b.reason, "调整原因");
      const date = new Date(b.arrival_at);
      must(Number.isFinite(+date), "到站时间无效");
      changes.arrival_at = date.toISOString();
      changes.data = { ...r, adjustment_reason: b.reason };
    }
    patch(db, "charging", id, changes);
    return { id };
  }
  if (type === "session.create") {
    allowed(user, "session.write");
    const v = get(db, user, "vehicles", b.vehicle_id),
      s = get(db, user, "stations", b.station_id);
    const start = new Date(b.start_at),
      end = new Date(b.finish_at);
    must(
      Number.isFinite(+start) && Number.isFinite(+end) && end > start,
      "作业起止时间无效",
    );
    must(v.owner_id === s.owner_id, "作业车辆与场站主体不一致");
    const task = b.task_id ? get(db, user, "tasks", b.task_id) : null,
      plan = b.plan_id ? get(db, user, "charging", b.plan_id) : null;
    const driver = get(
      db,
      user,
      "drivers",
      b.driver_id || task?.driver_id || v.driver_id,
    );
    must(driver.owner_id === v.owner_id, "司机主体不一致");
    if (task)
      must(
        task.vehicle_id === v.id && task.driver_id === driver.id,
        "任务运力与作业不一致",
      );
    if (plan)
      must(
        plan.vehicle_id === v.id && plan.station_id === s.id,
        "计划与作业关联不一致",
      );
    const device = b.device_id ? get(db, user, "devices", b.device_id) : null;
    if (device) must(device.station_id === s.id, "工位不属于场站");
    must(device, "请关联作业设备工位");
    if (b.source_event_id)
      must(
        !db
          .prepare(
            "SELECT 1 FROM sessions WHERE json_extract(data,'$.source_event_id')=? AND station_id=?",
          )
          .get(b.source_event_id, s.id),
        "重复来源作业，不能再次登记",
        409,
      );
    if (s.mode === "换电") {
      const incoming = get(db, user, "assets", b.incoming_battery),
        outgoing = get(db, user, "assets", b.outgoing_battery);
      must(incoming.id !== outgoing.id, "换入换出电池不能相同");
      must(
        incoming.kind === "电池" && outgoing.kind === "电池",
        "关联对象不是电池",
      );
      must(
        incoming.owner_id === v.owner_id && outgoing.owner_id === v.owner_id,
        "电池主体不一致",
      );
      must(
        incoming.available && incoming.station_id === s.id,
        "换入电池不在本站可用库存",
      );
      must(outgoing.vehicle_id === v.id, "换出电池不属于作业车辆");
      must(incoming.capacity_kwh === v.capacity_kwh, "电池规格与车辆不适配");
    }
    id = uid("SES");
    insert(db, "sessions", {
      id,
      code: makeCode("ZY"),
      name: v.code + "补能作业",
      owner_id: v.owner_id,
      vehicle_id: v.id,
      station_id: s.id,
      plan_id: plan?.id || null,
      status: "待核验",
      quantity_kwh: number(b.quantity_kwh, "计量电量", 0.1, 10000),
      amount_cents: Math.round(number(b.amount, "来源金额", 0, 1e7) * 100),
      start_at: start.toISOString(),
      finish_at: end.toISOString(),
      source: "MANUAL_SIMULATION",
      data: {
        mode: s.mode,
        task_id: task?.id || plan?.task_id || null,
        driver_id: driver.id,
        device_id: device.id,
        source_event_id: b.source_event_id || uid("MANUAL"),
        incoming_battery: b.incoming_battery || null,
        outgoing_battery: b.outgoing_battery || null,
        included: text(b.included, "已包含费用项"),
        evidence: text(b.evidence, "计量/换电来源依据"),
      },
    });
    return { id };
  }
  if (type === "session.correct") {
    allowed(user, "session.write");
    const r = get(db, user, "sessions", id);
    version(r, b);
    return record(
      db,
      user,
      "quality",
      r.code + "作业更正",
      {
        source_record: r.id,
        source_resource: "sessions",
        original: {
          quantity_kwh: r.quantity_kwh,
          amount_cents: r.amount_cents,
          status: r.status,
          version: r.version,
        },
        correction: text(b.correction, "更正内容"),
        evidence: text(b.evidence, "更正依据"),
      },
      "待核验",
      "MANUAL_SIMULATION",
    );
  }
  if (type === "session.verify") {
    allowed(user, "session.verify");
    const r = get(db, user, "sessions", id);
    version(r, b);
    must(r.status === "待核验", "作业当前不可核验");
    if (r.mode === "换电") {
      const incoming = get(db, user, "assets", r.incoming_battery),
        outgoing = get(db, user, "assets", r.outgoing_battery);
      must(
        incoming.available &&
          incoming.station_id === r.station_id &&
          outgoing.vehicle_id === r.vehicle_id,
        "电池库存或归属已变化，先核查更换历史",
        409,
      );
      for (const [asset, station_id, vehicle_id, available] of [
        [incoming, null, r.vehicle_id, false],
        [outgoing, r.station_id, null, false],
      ])
        patch(db, "records", asset.id, {
          data: {
            ...asset,
            station_id,
            vehicle_id,
            available,
            history: [
              ...(asset.history || []),
              {
                kind: "已核验换电",
                session_id: r.id,
                at: now(),
                by: user.id,
                station_id,
                vehicle_id,
              },
            ],
          },
        });
      const station = get(db, user, "stations", r.station_id);
      const inventory = db
        .prepare(
          "SELECT count(*) n FROM records WHERE resource='assets' AND json_extract(data,'$.station_id')=? AND json_extract(data,'$.available')=1",
        )
        .get(station.id).n;
      patch(db, "stations", station.id, { data: { ...station, inventory } });
    }
    patch(db, "sessions", id, {
      status: "已核验",
      data: {
        ...r,
        verification_evidence: text(b.evidence, "核验依据"),
        verified_by: user.id,
      },
    });
    return { id };
  }
  if (type === "cost.create") {
    allowed(user, "cost.write");
    const task = b.task_id ? get(db, user, "tasks", b.task_id) : null;
    const replaced = b.replacement_id
      ? get(db, user, "costs", b.replacement_id)
      : null;
    if (replaced) {
      must(!task || task.id === replaced.task_id, "费用更正不能改变原任务归属");
      must(replaced.status !== "已替代", "原费用已更正");
      version(replaced, b);
    }
    const session = b.session_id
      ? get(db, user, "sessions", b.session_id)
      : null;
    if (session && task)
      must(
        session.task_id === task.id || session.vehicle_id === task.vehicle_id,
        "作业与任务归属不一致",
      );
    const nature = b.nature || "实际";
    must(["预计", "实际"].includes(nature), "费用属性无效");
    if (b.source_event_id)
      must(
        !db
          .prepare(
            "SELECT 1 FROM costs WHERE json_extract(data,'$.source_event_id')=? AND replacement_id IS NULL",
          )
          .get(b.source_event_id),
        "重复费用来源，请走更正流程",
        409,
      );
    if (b.components) {
      must(Array.isArray(b.components) && b.components.length, "计价组成无效");
      let sum = 0;
      for (const component of b.components) {
        number(component.quantity, "计价量", 0, 1e9);
        number(component.unit_price, "单价", 0, 1e6);
        text(component.unit, "计价单位");
        must(component.included !== true, "已包含费用不能再次叠加为独立组成");
        sum += Math.round(component.quantity * component.unit_price * 100);
      }
      must(
        sum === Math.round(b.amount * 100),
        "计价组成与来源总额不一致，须核对税费及分摊",
      );
    }
    id = uid("F");
    insert(db, "costs", {
      id,
      code: makeCode("FY"),
      name: text(b.name, "费用说明", 100),
      owner_id: task?.owner_id || replaced?.owner_id || user.scopes[0],
      task_id: task?.id || replaced?.task_id || null,
      replacement_id: replaced?.id || null,
      session_id: session?.id || replaced?.session_id || null,
      status: nature === "预计" ? "预计" : "待核验",
      nature,
      amount_cents: Math.round(number(b.amount, "来源金额", 0, 1e8) * 100),
      created_at: now(),
      source: "MANUAL_SIMULATION",
      data: {
        category: text(b.category, "费用类别", 50),
        currency: "CNY",
        source_event_id: b.source_event_id || uid("MANUAL-COST"),
        fee_quantity: b.fee_quantity ?? null,
        unit_price: b.unit_price ?? null,
        quantity_unit: b.quantity_unit || null,
        tax_basis: b.tax_basis || "按原始来源总额；税费范围待依据核验",
        allocation_basis: b.allocation_basis || null,
        components: b.components || null,
        included: text(b.included, "已含项目", 200),
        evidence: text(b.evidence, "原始依据"),
        coverage: b.coverage || "费用范围以原始依据为准",
      },
    });
    return { id };
  }
  if (type === "cost.verify") {
    allowed(user, "cost.verify");
    const r = get(db, user, "costs", id);
    version(r, b);
    must(r.status === "待核验" && r.nature === "实际", "费用当前不可核验");
    if (r.replacement_id) {
      const original = get(db, user, "costs", r.replacement_id);
      must(original.status !== "已替代", "已有生效更正版，请核对最新费用", 409);
      patch(db, "costs", original.id, { status: "已替代" });
    }
    patch(db, "costs", id, {
      status: "已核验",
      data: { ...r, verification_evidence: text(b.evidence, "核验依据") },
    });
    return { id };
  }
  if (type === "alert.report") {
    const task = b.task_id ? get(db, user, "tasks", b.task_id) : null;
    if (user.role === "driver") {
      must(task, "请从本人任务报告异常");
      allowed(user, "driver.execute");
    } else allowed(user, "alert.write");
    id = uid("A");
    insert(db, "alerts", {
      id,
      code: makeCode("YJ"),
      name: text(b.name, "异常类型", 100),
      owner_id: task?.owner_id || user.scopes[0],
      task_id: task?.id || null,
      vehicle_id: task?.vehicle_id || null,
      status: "待受理",
      severity: "待核实",
      created_at: now(),
      source: "MANUAL_SIMULATION",
      data: {
        report: text(b.reason, "情况说明"),
        driver_id: user.driver_id,
        kind: "人工反馈",
        evidence: b.evidence || "",
      },
    });
    return { id };
  }
  if (type.startsWith("alert.")) {
    allowed(user, "alert.write");
    const r = get(db, user, "alerts", id);
    version(r, b);
    const map = {
        "alert.accept": ["待受理", "处理中"],
        "alert.resolve": ["处理中", "待关闭"],
        "alert.close": ["待关闭", "已关闭"],
        "alert.reopen": ["已关闭", "待受理"],
      },
      transition = map[type];
    must(
      transition && r.status === transition[0],
      "告警状态已改变，不能执行此动作",
    );
    patch(db, "alerts", id, {
      status: transition[1],
      data: {
        ...r,
        evidence: text(b.evidence, "处置/核验依据"),
        assignee: b.assignee || user.name,
      },
    });
    return { id };
  }
  if (type === "asset.verify") {
    allowed(user, "asset.write");
    const r = get(db, user, "assets", id);
    version(r, b);
    patch(db, "records", id, {
      status: "已核验投运",
      data: { ...r, proof: text(b.evidence, "投运证明"), verified_by: user.id },
    });
    return { id };
  }
  if (type === "replacement.confirm") {
    allowed(user, "asset.write");
    const r = get(db, user, "replacements", id);
    version(r, b);
    must(r.status === "草稿", "方案已确认");
    patch(db, "records", id, {
      status: "已确认方案",
      data: { ...r, evidence: text(b.evidence, "合作依据") },
    });
    return { id };
  }
  if (type === "quality.correct") {
    allowed(user, "data.write");
    const r = get(db, user, "integrations", id);
    return record(
      db,
      user,
      "quality",
      r.name + "纠正记录",
      {
        source_record: r.id,
        original: {
          status: r.status,
          version: r.version,
          last_sync: r.last_sync,
        },
        correction: text(b.correction, "纠正内容"),
        evidence: text(b.evidence, "纠正依据"),
      },
      "已登记",
      "MANUAL_SIMULATION",
    );
  }
  if (type === "forecast.queue") {
    allowed(user, "forecast.run");
    must(b.use_reference === true, "请明确采用参考服务时长测算");
    const plans = allRows(db, user, "charging")
      .filter((x) => ["草稿", "已确认", "待确认"].includes(x.status))
      .sort((a, b) => a.arrival_at.localeCompare(b.arrival_at));
    const result = [];
    for (const station of allRows(db, user, "stations")) {
      const devices = db
        .prepare(
          "SELECT * FROM devices WHERE station_id=? AND connection='在线' AND status IN('空闲','占用')",
        )
        .all(station.id);
      if (!devices.length) continue;
      const slots = devices.map((d) =>
        d.status === "占用"
          ? Math.max(Date.now(), +new Date(JSON.parse(d.data).release_at))
          : Date.now(),
      );
      for (const plan of plans.filter((x) => x.station_id === station.id)) {
        const slot = slots.indexOf(Math.min(...slots)),
          start = Math.max(+new Date(plan.arrival_at), slots[slot]);
        const duration =
          station.mode === "换电"
            ? 10
            : (plan.quantity_kwh / Math.max(1, devices[slot].power_kw)) * 60;
        slots[slot] = start + duration * 60000;
        result.push({
          plan_id: plan.id,
          station_id: station.id,
          arrival_at: plan.arrival_at,
          start_at: new Date(start).toISOString(),
          finish_at: new Date(slots[slot]).toISOString(),
          wait_minutes: Math.max(
            0,
            Math.round((start - +new Date(plan.arrival_at)) / 60000),
          ),
          service_minutes: Math.round(duration),
          device_id: devices[slot].id,
        });
      }
    }
    return record(
      db,
      user,
      "forecasts",
      "未来到站参考预测",
      {
        kind: "queue",
        items: result,
        window: {
          start_at: plans[0]?.arrival_at || now(),
          finish_at: result.at(-1)?.finish_at || now(),
        },
        plan_versions: plans.map((p) => ({ id: p.id, version: p.version })),
        station_versions: allRows(db, user, "stations").map((st) => ({
          id: st.id,
          version: st.version,
        })),
        input_coverage: result.length / Math.max(1, plans.length),
        generated_at: now(),
        model: "ARRIVAL-ORDER-SCENARIO-V1",
        assumptions: [
          "到站顺序仅测算情景，非运营优先规则",
          "当前在线工位及参考服务时长",
          "仿真电池库存不代表真实可用量",
        ],
      },
      "参考测算",
    );
  }
  if (type === "forecast.load") {
    allowed(user, "forecast.run");
    const stationId = b.station_id || "S001";
    get(db, user, "stations", stationId);
    const actual = allRows(db, user, "loads").filter(
      (r) => r.station_id === stationId,
    );
    must(
      actual.some((x) => x.actual_kw != null),
      "缺少有效负荷来源",
    );
    const plans = allRows(db, user, "charging").filter(
      (p) =>
        p.station_id === stationId &&
        ["草稿", "已确认", "待确认"].includes(p.status),
    );
    const baseline = Math.min(
      ...actual.filter((p) => p.actual_kw != null).map((p) => p.actual_kw),
    );
    const demand = Array(24).fill(0);
    for (const p of plans) {
      const hour = (new Date(p.arrival_at).getUTCHours() + 8) % 24;
      demand[hour] += p.quantity_kwh;
    }
    const series = actual.map((x) => ({
      hour: x.hour,
      actual_kw: x.actual_kw,
      predicted_kw:
        x.actual_kw == null ? null : Math.round(baseline + demand[x.hour]),
      planned_energy_kwh: demand[x.hour],
    }));
    return record(
      db,
      user,
      "forecasts",
      "计划驱动的分时负荷情景",
      {
        kind: "load",
        station_id: stationId,
        series,
        model: "PLAN-LOAD-REFERENCE-V2",
        window: { start_at: actual[0]?.created_at, granularity_minutes: 60 },
        plan_versions: plans.map((p) => ({ id: p.id, version: p.version })),
        assumptions: [
          "1小时粒度；背景负荷取有效样本低值，补能需求按计划到站小时分配",
          "缺测不补为实际0；参考情景未经现场精度校准",
        ],
        accuracy_validated: false,
      },
      "参考测算",
    );
  }

  if (type === "energy.compare") {
    allowed(user, "energy.write");
    const stations = allRows(db, user, "stations"),
      station =
        stations.find((s) => s.id === (b.station_id || "S001")) || stations[0];
    must(station, "缺少授权场站");
    const loads = allRows(db, user, "loads").filter(
        (l) => l.station_id === station.id,
      ),
      resources = allRows(db, user, "energy-resources").filter(
        (r) => r.station_id === station.id,
      ),
      strategies = compareEnergy(station, loads, resources);
    const plans = allRows(db, user, "charging").filter(
      (c) => c.station_id === station.id && c.status === "已确认",
    );
    return record(
      db,
      user,
      "energy-plans",
      "同边界能源策略比较",
      {
        station_id: station.id,
        peak_kw: Math.max(
          ...loads.filter((l) => l.actual_kw != null).map((l) => l.actual_kw),
        ),
        strategies,
        selected: "base",
        linked_plan_versions: plans.map((p) => ({
          id: p.id,
          version: p.version,
        })),
        resource_versions: resources.map((r) => ({
          id: r.id,
          version: r.version,
        })),
        effective_window: {
          start_at: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
          finish_at: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
        },
        storage_control: false,
        expected_saving_cents: null,
        boundaries:
          "同一负荷、电价、共享供电及有效资源边界；缺测时段不计为0，费用仅覆盖有效样本",
      },
      "待确认",
    );
  }

  if (type === "energy.adjust") {
    allowed(user, "energy.write");
    const r = get(db, user, "energy-plans", id);
    version(r, b);
    must(
      ["待确认", "已确认计划"].includes(r.status),
      "已归档或已替代计划不能覆盖",
    );
    const next = record(
      db,
      user,
      "energy-plans",
      r.name + " · 调整版",
      {
        ...r,
        replacement_id: r.id,
        adjustment_reason: text(b.reason, "调整原因"),
        prior_version: r.version,
      },
      "待确认",
    );
    patch(db, "records", id, { status: "待调整" });
    return { id: next.id };
  }
  if (type === "energy.archive") {
    allowed(user, "energy.write");
    const r = get(db, user, "energy-plans", id);
    version(r, b);
    must(r.status === "已确认计划", "当前计划不能归档");
    patch(db, "records", id, {
      status: "已归档",
      data: {
        ...r,
        archive_evidence: text(b.evidence, "执行归集依据"),
        evaluation_complete: false,
      },
    });
    return { id };
  }
  if (type === "energy.confirm") {
    allowed(user, "energy.write");
    const r = get(db, user, "energy-plans", id);
    version(r, b);
    must(r.status === "待确认", "当前计划不能确认");
    for (const x of r.linked_plan_versions || [])
      must(
        get(db, user, "charging", x.id).version === x.version,
        "补能计划已经变化，请重新比较",
        409,
      );
    for (const x of r.resource_versions || [])
      must(
        get(db, user, "energy-resources", x.id).version === x.version,
        "能源资源边界已变化，请重新比较",
        409,
      );
    const selected = b.strategy_id || r.selected || "base";
    if (r.strategies) {
      const strategy = r.strategies.find((x) => x.id === selected);
      must(strategy?.available && strategy.feasible, "所选策略缺项或违反边界");
      r.selected = selected;
    }
    if (r.replacement_id) {
      const old = get(db, user, "energy-plans", r.replacement_id);
      patch(db, "records", old.id, { status: "已替代" });
    }
    patch(db, "records", id, {
      status: "已确认计划",
      data: { ...r, evidence: text(b.evidence, "协同计划核对依据") },
    });
    return { id };
  }
  if (type === "planning.run" || type === "deployment.run") {
    allowed(user, "planning.write");
    const point = get(db, user, "candidates", b.candidate_id);
    must(
      point.status === "条件齐备",
      "候选点用地或接电仍待核实，不能生成可实施推荐",
    );
    const quantity = number(b.daily_quantity, "日运输需求（吨）", 1, 100000),
      distance = number(b.distance_km, "单趟距离", 0.1, 1000);
    const hours = number(b.hours ?? 8, "运营小时", 1, 24),
      payload = number(b.payload_tonnes ?? 30, "有效载重", 1, 100),
      energyPerKm = number(b.energy_per_km ?? 1.58, "参考能耗", 0.1, 10),
      mode = b.mode || "充电";
    must(["充电", "换电"].includes(mode), "补能方式无效");
    const availability = number(b.availability ?? 0.85, "有效服务系数", 0.1, 1),
      trips = Math.ceil(quantity / payload),
      cycle = (distance / 35) * 60 + (distance / 45) * 60 + 20,
      cycles = Math.max(1, Math.floor((hours * 60) / cycle)),
      vehicles = Math.ceil(trips / cycles),
      dailyEnergy = trips * distance * 2 * energyPerKm,
      devicePower = 240,
      serviceMinutes = mode === "换电" ? 10 : (210 / devicePower) * 60,
      serviceCount = Math.ceil(dailyEnergy / 210),
      devices = Math.ceil(
        (serviceCount * serviceMinutes) / (hours * 60 * availability),
      ),
      requiredPower =
        mode === "充电"
          ? devices * devicePower
          : Math.ceil(dailyEnergy / (hours * availability)),
      spares =
        mode === "换电"
          ? Math.ceil(((serviceCount / (hours * 60)) * 60) / availability)
          : 0;
    return record(
      db,
      user,
      type === "planning.run" ? "planning" : "deployment",
      type === "planning.run" ? "北区条件规划" : "车辆与电池投放建议",
      {
        candidate_id: point.id,
        daily_quantity: quantity,
        distance_km: distance,
        trips,
        cycle_minutes: Math.round(cycle),
        vehicles,
        batteries: vehicles + spares,
        spare_batteries: spares,
        devices,
        required_power_kw: requiredPower,
        daily_energy_kwh: Math.round(dailyEnergy),
        capacity_feasible: requiredPower <= point.capacity_kw,
        mode,
        inputs: {
          hours,
          payload_tonnes: payload,
          energy_per_km: energyPerKm,
          availability,
        },
        candidate_version: point.version,
        assumptions: [
          `${hours}小时运营窗、${payload}吨参考载重、${energyPerKm}kWh/km情景能耗`,
          `${Math.round(availability * 100)}%有效服务系数；每次有效补能210kWh、240kW充电候选`,
          mode === "换电"
            ? "换电10分钟；备电按1小时充电周转情景测算"
            : "纯充电模式不额外配置换电备用电池",
          "不含地形、许可与实际接电验收",
        ],
        engineering_approved: false,
      },
      "条件推荐",
    );
  }

  if (type === "planning.archive") {
    allowed(user, "planning.write");
    const r = get(db, user, b.resource || "planning", id);
    version(r, b);
    must(["条件推荐", "已确认条件推荐"].includes(r.status), "当前成果不能归档");
    patch(db, "records", id, {
      status: "已归档",
      data: { ...r, archive_evidence: text(b.evidence, "归档说明") },
    });
    return { id };
  }
  if (type === "planning.confirm") {
    allowed(user, "planning.write");
    const r = get(db, user, b.resource || "planning", id);
    version(r, b);
    must(r.status === "条件推荐", "当前结果不能确认");
    must(r.capacity_feasible !== false, "候选接电容量不足，请调整条件后重算");
    if (r.candidate_id) {
      const point = get(db, user, "candidates", r.candidate_id);
      must(
        point.version === r.candidate_version,
        "候选点资料已变化，请重算",
        409,
      );
    }
    patch(db, "records", id, {
      status: "已确认条件推荐",
      data: { ...r, evidence: text(b.evidence, "推荐依据") },
    });
    return { id };
  }
  if (type === "user.create") {
    allowed(user, "user.manage");
    const username = text(b.username, "登录账号", 80),
      role = b.role;
    must(["admin", "driver"].includes(role), "角色无效");
    const scopes = Array.isArray(b.scopes) ? b.scopes : [];
    must(
      scopes.length && scopes.every((x) => user.scopes.includes(x)),
      "可授予主体范围超出本人权限",
    );
    const operations =
      role === "driver" ? ["driver.execute"] : b.operations || ["read"];
    must(
      operations.every(
        (x) => user.operations.includes("*") || user.operations.includes(x),
      ),
      "不能授予本人没有的操作",
    );
    let driver = null;
    if (role === "driver") {
      driver = get(db, user, "drivers", b.driver_id);
      must(scopes.includes(driver.owner_id), "司机绑定与主体范围不一致");
      must(
        !db
          .prepare("SELECT 1 FROM users WHERE driver_id=? AND enabled=1")
          .get(driver.id),
        "该司机已有有效账号",
      );
    }
    must(
      typeof b.password === "string" && b.password.length >= 10,
      "本地账号密码至少10位",
    );
    id = uid("U");
    insert(db, "users", {
      id,
      username,
      name: text(b.name, "显示名称", 100),
      password_hash: passwordHash(b.password),
      role,
      driver_id: driver?.id || null,
      operations,
    });
    scopes.forEach((s) =>
      insert(db, "user_scopes", { user_id: id, owner_id: s }),
    );
    return { id };
  }
  return undefined;
}
