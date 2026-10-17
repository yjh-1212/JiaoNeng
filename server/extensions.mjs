import { insert, now, uid, must, text, number, unpack } from "./db.mjs";
import { get, list, allowed, version, owner } from "./repository.mjs";
import { patch, makeCode } from "./transport.mjs";
import { passwordHash } from "./seed.mjs";

function saveRecord(
  db,
  user,
  resource,
  name,
  data,
  status = "草稿",
  org = user.scopes[0],
) {
  const id = uid("REC");
  insert(db, "records", {
    id,
    resource,
    code: makeCode("JL"),
    name,
    owner_id: org,
    status,
    created_at: now(),
    source: "MANUAL_SIMULATION",
    data,
  });
  return { id };
}

// Cross-cutting maintenance never changes historical trips, verified costs or device controls.
export function extensionCommand(db, user, type, id, b) {
  if (type === "rule.create") {
    allowed(user, "resource.write");
    const kind = b.kind;
    must(
      [
        "SOC关注",
        "设备断流",
        "时效延误",
        "排队风险",
        "设备故障",
        "负荷越限",
      ].includes(kind),
      "规则类型无效",
    );
    return saveRecord(
      db,
      user,
      "rules",
      text(b.name, "规则名称", 100),
      {
        kind,
        threshold: ["设备断流", "设备故障"].includes(kind)
          ? null
          : number(
              b.threshold,
              "规则阈值",
              1,
              kind === "SOC关注" ? 80 : 100000,
            ),
        max_age_minutes: number(b.max_age_minutes, "数据有效时长", 1, 1440),
        basis: text(b.evidence, "规则依据"),
        production_enabled: false,
      },
      "仿真规则",
    );
  }
  if (type === "rule.run") {
    allowed(user, "alert.write");
    const r = get(db, user, "rules", id);
    version(r, b);
    must(r.status === "仿真规则", "规则未核验为仿真运行版本");
    let generated = 0;
    const findings = [];
    if (r.kind === "SOC关注")
      for (const v of list(db, user, "vehicles", {
        pageSize: 100,
      }).items.filter((v) => v.owner_id === r.owner_id)) {
        const sample = db
          .prepare(
            "SELECT * FROM telemetry WHERE vehicle_id=? ORDER BY occurred_at DESC LIMIT 1",
          )
          .get(v.id);
        if (
          !sample ||
          Date.now() - new Date(sample.occurred_at) > r.max_age_minutes * 60000
        )
          findings.push({
            vehicle_id: v.id,
            name: "车辆状态来源过期",
            kind: "数据质量",
            object: v.code,
          });
        else if (sample.soc < r.threshold)
          findings.push({
            vehicle_id: v.id,
            name: "SOC参考阈值关注",
            kind: "参考风险",
            object: v.code,
            soc: sample.soc,
            source_time: sample.occurred_at,
          });
      }
    if (r.kind === "设备断流")
      for (const d of list(db, user, "devices", { pageSize: 100 }).items.filter(
        (d) => d.owner_id === r.owner_id && d.connection !== "在线",
      ))
        findings.push({
          name: "设备来源中断待核实",
          kind: "数据质量",
          object: d.code,
        });
    if (r.kind === "时效延误")
      for (const t of list(db, user, "tasks", { pageSize: 100 }).items.filter(
        (t) =>
          t.owner_id === r.owner_id &&
          ["待接收", "已接收", "执行中", "退回补充"].includes(t.status) &&
          Date.now() - new Date(t.finish_at) > r.threshold * 60000,
      ))
        findings.push({
          name: "任务计划时效超限",
          kind: "时效风险",
          object: t.code,
          task_id: t.id,
          vehicle_id: t.vehicle_id,
        });
    if (r.kind === "设备故障")
      for (const d of list(db, user, "devices", { pageSize: 100 }).items.filter(
        (d) => d.owner_id === r.owner_id && d.status === "检修",
      ))
        findings.push({
          name: "设备检修影响核查",
          kind: "设备风险",
          object: d.code,
        });
    if (r.kind === "负荷越限")
      for (const l of list(db, user, "loads", { pageSize: 100 }).items.filter(
        (l) => l.owner_id === r.owner_id,
      )) {
        if (l.actual_kw == null)
          findings.push({
            name: "负荷数据缺测",
            kind: "数据质量",
            object: l.code,
          });
        else if (l.actual_kw > r.threshold)
          findings.push({
            name: "负荷参考上限关注",
            kind: "负荷风险",
            object: l.code,
            value: l.actual_kw,
          });
      }
    if (r.kind === "排队风险")
      for (const f of list(db, user, "forecasts", {
        pageSize: 100,
      }).items.filter((f) => f.owner_id === r.owner_id && f.kind === "queue"))
        for (const p of f.items || [])
          if (p.wait_minutes > r.threshold)
            findings.push({
              name: "未来排队参考风险",
              kind: "预测风险",
              object: p.plan_id,
              forecast_id: f.id,
            });
    for (const item of findings) {
      if (
        db
          .prepare(
            "SELECT 1 FROM alerts WHERE owner_id=? AND json_extract(data,'$.rule_id')=? AND json_extract(data,'$.rule_version')=? AND json_extract(data,'$.object')=? AND status<>'已关闭'",
          )
          .get(r.owner_id, r.id, r.version, item.object)
      )
        continue;
      insert(db, "alerts", {
        id: uid("AL"),
        code: makeCode("YJ"),
        name: item.name,
        owner_id: r.owner_id,
        vehicle_id: item.vehicle_id || null,
        task_id: item.task_id || null,
        status: "待受理",
        severity: "待核实",
        created_at: now(),
        source: "DERIVED_SIMULATION",
        data: {
          ...item,
          rule_id: r.id,
          rule_version: r.version,
          trigger: r.basis,
          threshold: r.threshold,
          observed_at: now(),
          production_fault_confirmed: false,
        },
      });
      generated++;
    }
    return { id, generated, evaluated_at: now(), source: "DERIVED_SIMULATION" };
  }
  if (type === "replacement.implement") {
    allowed(user, "asset.write");
    const r = get(db, user, "replacements", id);
    version(r, b);
    must(r.status === "已确认方案", "先核对合作方案");
    must(Array.isArray(b.asset_ids) && b.asset_ids.length, "请关联已核验资产");
    const assets = [...new Set(b.asset_ids)].map((x) =>
      get(db, user, "assets", x),
    );
    must(
      assets.every(
        (x) => x.owner_id === r.owner_id && x.status === "已核验投运",
      ),
      "关联资产须属于同主体且已有投运核验",
    );
    patch(db, "records", id, {
      status: "已核验实施",
      data: {
        ...r,
        implemented_assets: assets.map((x) => x.id),
        implemented_count: assets.length,
        implementation_evidence: text(b.evidence, "实施核验依据"),
      },
    });
    return { id };
  }
  if (type === "planning.analyze") {
    allowed(user, "planning.write");
    const start = new Date(b.start_at),
      finish = new Date(b.finish_at);
    must(
      Number.isFinite(+start) && Number.isFinite(+finish) && finish > start,
      "分析区间无效",
    );
    const orders = list(db, user, "orders", { pageSize: 100 }).items.filter(
      (o) =>
        o.status !== "已取消" &&
        new Date(o.start_at) >= start &&
        new Date(o.start_at) < finish,
    );
    const corridors = new Map();
    for (const o of orders) {
      const key = o.origin + " → " + o.destination;
      const r = corridors.get(key) || {
        corridor: key,
        orders: 0,
        planned_kg: 0,
        verified_kg: 0,
        verified_trips: 0,
        distance_km: o.distance_km,
      };
      r.orders++;
      r.planned_kg += o.quantity_kg - o.cancelled_kg;
      const facts = db
        .prepare(
          "SELECT COALESCE(sum(verified_kg),0) quantity FROM tasks WHERE order_id=?",
        )
        .get(o.id);
      r.verified_kg += facts.quantity;
      r.verified_trips += db
        .prepare(
          "SELECT count(*) n FROM trips WHERE task_id IN(SELECT id FROM tasks WHERE order_id=?) AND status='已核验'",
        )
        .get(o.id).n;
      corridors.set(key, r);
    }
    return saveRecord(
      db,
      user,
      "od-analysis",
      "运输需求走廊分析",
      {
        start_at: start.toISOString(),
        finish_at: finish.toISOString(),
        corridors: [...corridors.values()],
        order_count: orders.length,
        coverage: "当前主体授权范围内最多100个订单；非全市交通观测",
        source_kind: "SIMULATED",
      },
      "分析完成",
    );
  }
  if (type === "user.update") {
    allowed(user, "user.manage");
    const r = get(db, user, "users", id);
    version(r, b);
    const scopes = b.scopes || r.scopes,
      operations = b.operations || r.operations;
    must(
      Array.isArray(scopes) &&
        scopes.length &&
        scopes.every((s) => user.scopes.includes(s)),
      "授予主体范围超出本人权限",
      403,
    );
    must(
      Array.isArray(operations) &&
        operations.every(
          (s) =>
            typeof s === "string" &&
            (user.operations.includes("*") || user.operations.includes(s)),
        ),
      "授予操作超出本人权限",
      403,
    );
    must(id !== user.id || b.enabled !== false, "不能停用当前登录账号");
    if (r.role === "driver")
      must(
        scopes.includes(get(db, user, "drivers", r.driver_id).owner_id),
        "司机所属主体必须保留",
      );
    const fields = {
      name: text(b.name || r.name, "显示名称", 100),
      enabled: b.enabled === false ? 0 : 1,
      operations,
    };
    if (b.password) {
      must(
        typeof b.password === "string" &&
          b.password.length >= 10 &&
          b.password.length <= 200,
        "密码长度应为10至200位",
      );
      fields.password_hash = passwordHash(b.password);
    }
    patch(db, "users", id, fields);
    db.prepare("DELETE FROM user_scopes WHERE user_id=?").run(id);
    for (const scope of scopes)
      insert(db, "user_scopes", { user_id: id, owner_id: scope });
    db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(id);
    return { id };
  }
  if (type === "parameter.draft") {
    allowed(user, "resource.write");
    const r = get(db, user, "parameters", id);
    version(r, b);
    return saveRecord(
      db,
      user,
      "parameters",
      r.name,
      {
        ...r,
        replacement_id: r.id,
        candidate: text(b.candidate, "候选值", 300),
        usage_boundary: text(b.usage_boundary, "适用边界"),
        evidence: text(b.evidence, "参数依据"),
        enabled: false,
        production_auto_enabled: false,
      },
      "参考草案",
      r.owner_id,
    );
  }
  if (type === "candidate.verify") {
    allowed(user, "planning.write");
    const r = get(db, user, "candidates", id);
    version(r, b);
    const land = text(b.land, "用地依据"),
      grid = text(b.grid, "接电依据");
    const capacity = number(b.capacity_kw, "候选容量", 1, 100000);
    patch(db, "records", id, {
      status: "条件齐备",
      data: {
        ...r,
        land,
        grid,
        capacity_kw: capacity,
        evidence: text(b.evidence, "核对依据"),
        engineering_approved: false,
      },
    });
    return { id };
  }
  if (type === "asset.record") {
    allowed(user, "asset.write");
    const r = get(db, user, "assets", id);
    version(r, b);
    must(["租赁", "维保", "流转"].includes(b.kind), "资产事项类型无效");
    const event = {
      id: uid("AS-EVENT"),
      kind: b.kind,
      occurred_at: now(),
      note: text(b.note, "事项内容"),
      evidence: text(b.evidence, "事项依据"),
      operator: user.id,
    };
    if (b.kind === "流转" && b.session_id) {
      const session = get(db, user, "sessions", b.session_id);
      must(session.status === "已核验", "关联作业尚未核验");
      event.session_id = session.id;
    }
    patch(db, "records", id, {
      data: { ...r, history: [...(r.history || []), event] },
    });
    return { id };
  }
  if (type === "quality.review") {
    allowed(user, "data.write");
    const r = get(db, user, "quality", id);
    version(r, b);
    must(r.status === "待核验", "纠正记录已处理");
    const evidence = text(b.evidence, "核验依据");
    if (r.source_resource === "sessions") {
      allowed(user, "session.verify");
      const original = get(db, user, "sessions", r.source_record);
      must(
        original.version === r.original.version,
        "作业已变化，请重新登记更正",
        409,
        "VERSION_CONFLICT",
      );
      patch(db, "sessions", original.id, {
        quantity_kwh: number(b.quantity_kwh, "更正计量电量", 0.1, 10000),
        amount_cents: Math.round(
          number(b.amount, "更正来源金额", 0, 1e7) * 100,
        ),
        data: {
          ...original,
          correction_record: r.id,
          previous_values: r.original,
          correction_evidence: evidence,
        },
      });
    }
    patch(db, "records", id, {
      status: "已核验纠正",
      data: { ...r, review_evidence: evidence, reviewer: user.id },
    });
    return { id };
  }
  if (type === "integration.sync") {
    allowed(user, "data.write");
    const source = get(db, user, "integrations", id);
    version(source, b);
    must(b.simulated === true, "未取得真实协议，本入口仅允许业务仿真同步");
    must(
      Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 100,
      "同步批次应有1至100条记录",
    );
    let accepted = 0,
      duplicate = 0,
      rejected = 0;
    const problems = [];
    for (const item of b.items) {
      let vehicle;
      try {
        vehicle = get(db, user, "vehicles", item.vehicle_id);
        must(
          vehicle.owner_id === source.owner_id,
          "来源与车辆主体不一致",
          403,
          "FORBIDDEN",
        );
        text(item.event_id, "外部事件标识", 100);
        const at = new Date(item.occurred_at);
        must(Number.isFinite(+at) && +at <= Date.now() + 60000, "采样时间无效");
        number(item.longitude, "经度", 73, 136);
        number(item.latitude, "纬度", 18, 54);
        number(item.soc, "SOC", 0, 100);
        number(item.speed_kmh, "速度", 0, 150);
        const externalId = source.id + ":" + item.event_id;
        const prior = db
          .prepare("SELECT * FROM telemetry WHERE id=?")
          .get(externalId);
        if (prior) {
          must(
            prior.vehicle_id === vehicle.id &&
              prior.soc === item.soc &&
              prior.longitude === item.longitude &&
              prior.latitude === item.latitude &&
              prior.occurred_at === at.toISOString(),
            "同外部事件存在冲突值",
          );
          duplicate++;
          continue;
        }
        insert(db, "telemetry", {
          id: externalId,
          vehicle_id: vehicle.id,
          owner_id: vehicle.owner_id,
          occurred_at: at.toISOString(),
          longitude: item.longitude,
          latitude: item.latitude,
          soc: item.soc,
          speed_kmh: item.speed_kmh,
          source: "SIMULATED",
        });
        accepted++;
        if (!vehicle.source_time || at >= new Date(vehicle.source_time))
          patch(db, "vehicles", vehicle.id, {
            soc: item.soc,
            data: {
              ...vehicle,
              longitude: item.longitude,
              latitude: item.latitude,
              source_time: at.toISOString(),
              source_record: externalId,
            },
          });
      } catch (e) {
        if (e.status === 403 || e.status === 404) throw e;
        rejected++;
        problems.push({
          event_id: String(item.event_id || "缺失").slice(0, 100),
          reason: e.message,
        });
      }
    }
    if (problems.length)
      saveRecord(
        db,
        user,
        "quality",
        source.name + "同步异常",
        {
          source_record: id,
          issues: problems,
          correction: "保留原始业务事实；核查映射、单位和来源",
        },
        "待核验",
        source.owner_id,
      );
    patch(db, "records", id, {
      status: rejected ? "部分异常" : "仿真数据",
      data: {
        ...source,
        last_sync: now(),
        coverage: Math.round((100 * (accepted + duplicate)) / b.items.length),
        last_batch: { accepted, duplicate, rejected },
        mapping_version: 1,
      },
    });
    return { id, accepted, duplicate, rejected };
  }
  if (type === "charging.optimize") {
    allowed(user, "forecast.run");
    const plans = list(db, user, "charging", { pageSize: 100 })
      .items.filter((r) => ["草稿", "待确认", "已确认"].includes(r.status))
      .sort((x, y) => x.arrival_at.localeCompare(y.arrival_at));
    const changes = [],
      slots = new Map();
    for (const r of plans) {
      const s = get(db, user, "stations", r.station_id),
        device = db
          .prepare(
            "SELECT min(power_kw) power,count(*) count FROM devices WHERE station_id=? AND connection='在线' AND status='空闲'",
          )
          .get(s.id);
      if (!device.count) continue;
      const begin = Math.max(+new Date(r.arrival_at), slots.get(s.id) || 0),
        minutes =
          s.mode === "换电"
            ? 10
            : (r.quantity_kwh /
                Math.max(1, Math.min(device.power, s.power_kw))) *
              60;
      const task = r.task_id ? get(db, user, "tasks", r.task_id) : null;
      const feasible =
        !task || begin + minutes * 60000 < +new Date(task.finish_at);
      changes.push({
        id: r.id,
        expected_version: r.version,
        station_id: s.id,
        station_version: s.version,
        task_id: task?.id,
        task_version: task?.version,
        original_at: r.arrival_at,
        arrival_at: new Date(begin).toISOString(),
        feasible,
      });
      slots.set(s.id, begin + minutes * 60000);
    }
    must(changes.length, "没有可优化的有效补能计划");
    return saveRecord(
      db,
      user,
      "charging-optimizations",
      "补能时序候选",
      {
        changes,
        reference_only: true,
        assumptions: [
          "保留原场站与计划电量",
          "参考服务时长、保守串行安排",
          "确认前复核时效、资源及电量安全；不代表外部预约",
        ],
      },
      "待确认",
    );
  }
  if (type === "charging.apply") {
    allowed(user, "charging.write");
    const r = get(db, user, "charging-optimizations", id);
    version(r, b);
    must(r.status === "待确认", "候选已处理");
    text(b.evidence, "时效与电量复核依据");
    for (const c of r.changes) {
      must(c.feasible, "存在时效冲突，整批不调整");
      const plan = get(db, user, "charging", c.id),
        station = get(db, user, "stations", c.station_id);
      version(plan, c);
      must(
        station.version === c.station_version && station.status === "运营中",
        "场站已变化，请重算",
        409,
      );
      if (c.task_id) {
        const task = get(db, user, "tasks", c.task_id);
        must(task.version === c.task_version, "运输任务已变化，请重算", 409);
      }
    }
    for (const c of r.changes) {
      const plan = get(db, user, "charging", c.id);
      patch(db, "charging", c.id, {
        arrival_at: c.arrival_at,
        data: {
          ...plan,
          prior_arrival_at: c.original_at,
          optimization_id: id,
          review_evidence: b.evidence,
        },
      });
    }
    patch(db, "records", id, { status: "已确认调整" });
    return { id };
  }
  return undefined;
}
