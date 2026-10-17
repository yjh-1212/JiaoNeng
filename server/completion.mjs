import { optimizeCharging, applyCharging } from "./charging-model.mjs";
import { workbenchCommand } from "./order-workbench.mjs";
import { assistantPreparation } from "./assistant.mjs";
import { insert, now, uid, must, text, number, unpack } from "./db.mjs";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { passwordHash } from "./seed.mjs";
import { get, list, allowed, version, scopeClause } from "./repository.mjs";
import { patch, makeCode } from "./transport.mjs";
import { distanceKm, availableIn, parseWindow } from "./scheduling.mjs";
export function allRows(db, user, resource, query = {}) {
  const items = [];
  for (let page = 1; ; page++) {
    const result = list(db, user, resource, { ...query, page, pageSize: 100 });
    items.push(...result.items);
    if (items.length >= result.total) return items;
  }
}
export function save(
  db,
  user,
  resource,
  name,
  data,
  status = "条件测算",
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
    source: "DERIVED_SIMULATION",
    data,
  });
  return { ...data, id };
}
export function planningAnalysis(db, user, b) {
  allowed(user, "planning.write");
  const start = new Date(b.start_at),
    finish = new Date(b.finish_at);
  must(
    Number.isFinite(+start) && Number.isFinite(+finish) && finish > start,
    "分析区间无效",
  );
  const rows = allRows(db, user, "orders").filter(
    (o) =>
      o.status !== "已取消" &&
      new Date(o.start_at) >= start &&
      new Date(o.start_at) < finish &&
      (!b.origin || o.origin.includes(b.origin)) &&
      (!b.owner_id || o.owner_id === b.owner_id),
  );
  const corridors = new Map();
  for (const o of rows) {
    const key = o.origin + " → " + o.destination,
      r = corridors.get(key) || {
        corridor: key,
        orders: 0,
        planned_kg: 0,
        verified_kg: 0,
        verified_trips: 0,
        distance_km: o.distance_km,
        origin_coords: o.origin_coords,
        destination_coords: o.destination_coords,
      };
    r.orders++;
    r.planned_kg += o.quantity_kg - o.cancelled_kg;
    const fact = db
      .prepare(
        "SELECT COALESCE(sum(verified_kg),0) quantity FROM tasks WHERE order_id=?",
      )
      .get(o.id);
    r.verified_kg += fact.quantity;
    r.verified_trips += db
      .prepare(
        "SELECT count(*) n FROM trips WHERE task_id IN(SELECT id FROM tasks WHERE order_id=?) AND status='已核验'",
      )
      .get(o.id).n;
    corridors.set(key, r);
  }
  return save(
    db,
    user,
    "od-analysis",
    "运输需求走廊分析",
    {
      start_at: start.toISOString(),
      finish_at: finish.toISOString(),
      corridors: [...corridors.values()],
      order_count: rows.length,
      coverage:
        "授权主体内完整订单区间；订单需求与核验车次分列，非全市交通观测",
      source_kind: "SIMULATED",
    },
    "分析完成",
  );
}
export function completionCommand(db, user, type, id, b) {
  const workbench = workbenchCommand(db, user, type, id, b);
  if (workbench) return workbench;
  if (type === "profile.update") {
    must(!id || id === user.id, "只能维护本人资料", 403);
    const r = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
    version(r, b);
    const fields = { name: text(b.name, "显示名称", 100) };
    if (b.password) {
      must(
        typeof b.password === "string" &&
          b.password.length >= 10 &&
          b.password.length <= 200,
        "新密码应为10至200位",
      );
      const [salt, hash] = r.password_hash.split(":");
      must(
        typeof b.current_password === "string" &&
          b.current_password.length <= 200 &&
          timingSafeEqual(
            scryptSync(b.current_password, salt, 64),
            Buffer.from(hash, "hex"),
          ),
        "当前密码不正确",
        403,
      );
      fields.password_hash = passwordHash(b.password);
    }
    patch(db, "users", r.id, fields);
    if (b.password)
      db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(r.id);
    return { id: r.id, reauthenticate: !!b.password };
  }
  if (type === "charging.optimize") return optimizeCharging(db, user);
  if (type === "charging.apply") return applyCharging(db, user, id, b);
  if (type === "order.amend") {
    allowed(user, "order.write");
    const r = get(db, user, "orders", id);
    version(r, b);
    must(r.status === "已确认", "仅已确认订单允许此调整");
    const start = new Date(b.start_at),
      end = new Date(b.finish_at);
    must(
      Number.isFinite(+start) && Number.isFinite(+end) && end > start,
      "时间区间无效",
    );
    const quantity = Math.round(
        number(b.quantity, "调整运量", 0.001, 1e6) * 1000,
      ),
      reason = text(b.reason, "调整及影响说明"),
      tasks = db.prepare("SELECT * FROM tasks WHERE order_id=?").all(id),
      executed = tasks.filter(
        (t) =>
          ["执行中", "待核验", "退回补充", "已完成", "余量已终止"].includes(
            t.status,
          ) ||
          t.reported_kg ||
          t.verified_kg,
      );
    const held = executed.reduce(
      (n, t) =>
        n +
        (["已完成", "余量已终止"].includes(t.status)
          ? t.verified_kg
          : t.quantity_kg),
      0,
    );
    must(
      quantity >= held + r.cancelled_kg,
      "调整量不能低于已履约及执行中责任量",
    );
    if (executed.length) {
      must(
        b.origin === r.origin && b.destination === r.destination,
        "已有履约事实，不能覆盖既有路线",
      );
      must(
        executed.every(
          (t) =>
            ["已完成", "余量已终止"].includes(t.status) ||
            new Date(t.finish_at) <= end,
        ),
        "调整结束时间早于在途责任窗口",
      );
    }
    const demand = get(db, user, "demands", r.demand_id),
      delta = quantity - r.quantity_kg;
    must(demand.allocated_kg + delta <= demand.quantity_kg, "需求可分配量不足");
    for (const t of tasks.filter(
      (t) => !executed.some((e) => e.id === t.id) && t.status !== "已取消",
    )) {
      must(
        !db.prepare("SELECT 1 FROM trips WHERE task_id=?").get(t.id),
        "已有车次事实不能覆盖",
      );
      patch(db, "tasks", t.id, {
        status: "已取消",
        data: { ...JSON.parse(t.data), cancel_reason: reason },
      });
      db.prepare(
        "UPDATE charging SET status='已取消',version=version+1 WHERE task_id=? AND status IN('草稿','已确认','待调整')",
      ).run(t.id);
      db.prepare(
        "UPDATE costs SET status='已替代',version=version+1 WHERE task_id=? AND nature='预计'",
      ).run(t.id);
    }
    db.prepare(
      "UPDATE simulations SET status='已失效',version=version+1 WHERE order_id=? AND status IN('条件可行','已确认')",
    ).run(id);
    db.prepare(
      "UPDATE demands SET allocated_kg=allocated_kg+?,version=version+1 WHERE id=?",
    ).run(delta, demand.id);
    patch(db, "orders", id, {
      name: text(b.name, "订单名称", 100),
      quantity_kg: quantity,
      start_at: start.toISOString(),
      finish_at: end.toISOString(),
      data: {
        ...r,
        origin: text(b.origin, "装货位置"),
        destination: text(b.destination, "卸货位置"),
        distance_km: number(b.distance_km, "运输距离", 0.1, 3000),
        cargo: b.cargo || r.cargo,
        history: [
          ...(r.history || []),
          {
            at: now(),
            by: user.id,
            reason,
            prior_version: r.version,
            prior_quantity_kg: r.quantity_kg,
            prior_start_at: r.start_at,
            prior_finish_at: r.finish_at,
          },
        ],
      },
    });
    return { id, invalidated: true };
  }
  if (type === "device.create") {
    allowed(user, "resource.write");
    const s = get(db, user, "stations", b.station_id);
    id = uid("DEV");
    insert(db, "devices", {
      id,
      code: text(b.code, "工位编码", 40),
      name: text(b.name, "工位名称", 100),
      owner_id: s.owner_id,
      station_id: s.id,
      status: "待核实",
      connection: "待核实",
      power_kw: number(b.power_kw, "额定功率", 1, 10000),
      source: "MANUAL_SIMULATION",
      data: {
        compatibility: text(b.compatibility, "设备适配"),
        evidence: text(b.evidence, "资料依据"),
        source_time: now(),
      },
    });
    return { id };
  }
  if (type === "asset.ready") {
    allowed(user, "asset.write");
    const r = get(db, user, "assets", id);
    version(r, b);
    must(
      r.kind === "电池" && r.status === "已核验投运" && r.station_id,
      "须先关联已核验在站电池",
    );
    const soc = number(b.soc, "核验SOC", 80, 100);
    patch(db, "records", id, {
      data: {
        ...r,
        soc,
        available: true,
        evidence: text(b.evidence, "可用核验依据"),
      },
    });
    const st = get(db, user, "stations", r.station_id),
      inventory = db
        .prepare(
          "SELECT count(*) n FROM records WHERE resource='assets' AND json_extract(data,'$.station_id')=? AND json_extract(data,'$.available')=1",
        )
        .get(st.id).n;
    patch(db, "stations", st.id, { data: { ...st, inventory } });
    return { id };
  }
  if (type === "assistant.prepare")
    return { preparation: assistantPreparation(db, user, b) };
  if (type === "planning.analyze") return planningAnalysis(db, user, b);
  if (type === "demand.edit" || type === "demand.cancel") {
    allowed(user, "demand.write");
    const r = get(db, user, "demands", id);
    version(r, b);
    must(["草稿", "已确认"].includes(r.status), "当前需求不能变更");
    if (type === "demand.cancel") {
      patch(db, "demands", id, {
        status: "已终止",
        data: {
          ...r,
          reason: text(b.reason, "终止原因"),
          allocated_preserved: r.allocated_kg,
        },
      });
      return { id };
    }
    const q = Math.round(number(b.quantity, "需求运量", 0.001, 1e6) * 1000);
    must(q >= r.allocated_kg, "需求量不能低于已分配量");
    if (r.allocated_kg > 0)
      must(
        ["cargo", "origin", "destination"].every((key) => b[key] === r[key]),
        "需求已有订单分配，货物与线路不能覆盖，请登记新需求",
      );
    patch(db, "demands", id, {
      name: text(b.name, "需求名称", 100),
      quantity_kg: q,
      data: {
        ...r,
        cargo: text(b.cargo, "货物"),
        origin: text(b.origin, "装货位置"),
        destination: text(b.destination, "卸货位置"),
        contact: b.contact || r.contact || "",
        history: [
          ...(r.history || []),
          {
            at: now(),
            by: user.id,
            prior_version: r.version,
            name: r.name,
            quantity_kg: r.quantity_kg,
          },
        ],
      },
    });
    return { id };
  }
  if (type === "resource.configure") {
    allowed(user, "resource.write");
    const r = get(db, user, b.resource, id);
    version(r, b);
    must(
      [
        "stations",
        "vehicles",
        "drivers",
        "devices",
        "energy-resources",
        "integrations",
        "replacements",
        "entities",
      ].includes(b.resource),
      "不支持此资料类型",
    );
    const fields = {};
    const data = {
      ...r,
      history: [
        ...(r.history || []),
        {
          at: now(),
          by: user.id,
          version: r.version,
          evidence: text(b.evidence, "变更依据"),
        },
      ],
    };
    if (b.resource === "stations") {
      if (b.price_curve) {
        must(
          Array.isArray(b.price_curve) && b.price_curve.length === 24,
          "价格须覆盖24小时",
        );
        const hours = new Set();
        for (const p of b.price_curve) {
          number(p.hour, "小时", 0, 23);
          must(
            Number.isInteger(p.hour) && !hours.has(p.hour),
            "小时重复或无效",
          );
          hours.add(p.hour);
          number(p.electricity, "电价", 0, 10);
          number(p.service, "服务费", 0, 10);
        }
        data.price_curve = b.price_curve;
        data.tariff_version = uid("TARIFF");
      }
      if (b.inventory != null)
        data.inventory = number(b.inventory, "电池库存", 0, 10000);
      if (b.service_minutes != null)
        data.service_minutes = number(b.service_minutes, "服务时长", 1, 480);
    }
    for (const key of [
      "available_window",
      "compatibility",
      "license",
      "available_windows",
      "partner",
      "valid_until",
      "contact",
      "longitude",
      "latitude",
      "capacity_kwh",
      "charge_discharge_bounds",
      "green_output_series",
      "grid_capacity_kw",
      "transformer_limit_kw",
      "storage_soc",
      "storage_capacity_kwh",
      "effective_start",
      "effective_end",
      "tariff_version",
      "mapping",
      "connector",
      "protocol_evidence",
    ])
      if (b[key] != null) data[key] = b[key];
    if (b.available_window) parseWindow(b.available_window);
    if (b.available_windows) {
      must(
        Array.isArray(b.available_windows) && b.available_windows.length > 0,
        "可用时间段不能为空",
      );
      must(
        b.available_windows.every(
          (w) => new Date(w.finish_at) > new Date(w.start_at),
        ),
        "可用时间段无效",
      );
    }
    if (
      ["vehicles", "drivers"].includes(b.resource) &&
      (b.available_window || b.available_windows)
    ) {
      const key = b.resource === "vehicles" ? "vehicle_id" : "driver_id";
      must(
        db
          .prepare(
            `SELECT * FROM tasks WHERE ${key}=? AND status IN('待接收','已接收','执行中','待核验','退回补充')`,
          )
          .all(id)
          .every((t) => availableIn(data, t.start_at, t.finish_at)),
        "新的排班窗口影响未完成任务，请先调整任务",
      );
    }
    if (b.resource === "energy-resources") {
      if (b.power_kw != null)
        data.charge_discharge_bounds = {
          power_kw: b.power_kw,
          efficiency: b.efficiency,
          min_soc: 20,
          max_soc: 90,
        };
      if (b.green_peak_kw != null)
        data.green_output_series = Array.from({ length: 24 }, (_, hour) => ({
          hour,
          kw: Math.round(
            b.green_peak_kw *
              Math.max(0, Math.sin(((hour - 6) * Math.PI) / 12)),
          ),
        }));
      get(db, user, "stations", b.station_id || r.station_id);
      data.station_id = b.station_id || r.station_id;
      data.kind = b.kind || r.kind;
      must(["电网", "绿电", "储能"].includes(data.kind), "能源类别无效");
      if (data.kind === "电网") {
        number(data.grid_capacity_kw, "有效接电容量", 0, 100000);
        number(data.transformer_limit_kw, "共享供电边界", 0, 100000);
      }
      if (data.kind === "储能") {
        number(data.storage_soc, "储能SOC", 0, 100);
        number(data.storage_capacity_kwh, "储能容量", 1, 1e6);
        must(data.charge_discharge_bounds, "缺少充放电边界");
        number(data.charge_discharge_bounds.power_kw, "充放电功率", 1, 1e5);
        number(data.charge_discharge_bounds.efficiency, "效率", 0.1, 1);
      }
      if (data.kind === "绿电") {
        must(
          Array.isArray(data.green_output_series) &&
            data.green_output_series.length === 24,
          "绿电出力须覆盖24时段",
        );
        data.green_output_series.forEach((p) =>
          number(p.kw, "绿电出力", 0, 1e5),
        );
      }
      must(
        new Date(data.effective_end) > new Date(data.effective_start),
        "有效期缺失或倒置",
      );
      fields.status = "仿真已核验";
    }
    patch(
      db,
      ["energy-resources", "integrations", "replacements", "entities"].includes(
        b.resource,
      )
        ? "records"
        : b.resource,
      id,
      { ...fields, data },
    );
    return { id };
  }
  if (
    type === "asset.lease" ||
    type === "asset.maintenance" ||
    type === "asset.move"
  ) {
    allowed(user, "asset.write");
    const r = get(db, user, "assets", id);
    version(r, b);
    const event = {
      id: uid("ASE"),
      kind: type,
      at: now(),
      operator: user.id,
      evidence: text(b.evidence, "事项依据"),
    };
    const data = { ...r, history: [...(r.history || []), event] };
    if (type === "asset.lease") {
      must(new Date(b.finish_at) > new Date(b.start_at), "租赁区间无效");
      data.lease = {
        start_at: b.start_at,
        finish_at: b.finish_at,
        lessor: text(b.lessor, "出租主体"),
        amount_cents: Math.round(number(b.amount, "租金", 0, 1e9) * 100),
      };
      event.lease = data.lease;
    }
    if (type === "asset.maintenance") {
      event.note = text(b.note, "维保内容");
      data.maintenance_due = b.due_at || null;
      data.maintenance_state = b.maintenance_state || "已完成";
      if (data.vehicle_id && data.maintenance_state === "检修中") {
        const v = get(db, user, "vehicles", data.vehicle_id);
        must(
          !db
            .prepare(
              "SELECT 1 FROM tasks WHERE vehicle_id=? AND status IN('待接收','已接收','执行中','待核验','退回补充')",
            )
            .get(v.id),
          "关联运力有未完成任务",
        );
        patch(db, "vehicles", v.id, { status: "检修" });
      }
    }
    if (type === "asset.move") {
      must(r.kind === "电池", "仅电池登记出入站");
      must(!!b.station_id !== !!b.vehicle_id, "只选择场站或车辆一个去向");
      for (const vehicleId of new Set(
        [r.vehicle_id, b.vehicle_id].filter(Boolean),
      )) {
        const v = get(db, user, "vehicles", vehicleId);
        must(v.owner_id === r.owner_id, "电池与车辆业务主体不一致");
        must(v.capacity_kwh === r.capacity_kwh, "电池容量与车辆不适配");
        must(
          !db
            .prepare(
              "SELECT 1 FROM tasks WHERE vehicle_id=? AND status IN('待接收','已接收','执行中','待核验','退回补充')",
            )
            .get(v.id),
          "车辆有未完成任务，请通过核验作业处理电池去向",
        );
      }
      if (b.station_id) {
        const station = get(db, user, "stations", b.station_id);
        must(station.owner_id === r.owner_id, "电池与场站业务主体不一致");
      }
      data.station_id = b.station_id || null;
      data.vehicle_id = b.vehicle_id || null;
      data.available = false;
      event.destination = {
        station_id: data.station_id,
        vehicle_id: data.vehicle_id,
      };
    }
    patch(db, "records", id, { data });
    if (type === "asset.move")
      for (const stationId of new Set(
        [r.station_id, data.station_id].filter(Boolean),
      )) {
        const st = get(db, user, "stations", stationId),
          inventory = db
            .prepare(
              "SELECT count(*) n FROM records WHERE resource='assets' AND status='已核验投运' AND json_extract(data,'$.station_id')=? AND json_extract(data,'$.available')=1",
            )
            .get(st.id).n;
        patch(db, "stations", st.id, { data: { ...st, inventory } });
      }
    return { id };
  }
  if (type === "asset.review-expiry") {
    allowed(user, "asset.write");
    const expired = allRows(db, user, "assets").filter(
      (a) => a.lease && new Date(a.lease.finish_at) < new Date(),
    );
    for (const a of expired) {
      if (
        db
          .prepare(
            "SELECT 1 FROM alerts WHERE json_extract(data,'$.asset_id')=? AND status<>'已关闭'",
          )
          .get(a.id)
      )
        continue;
      insert(db, "alerts", {
        id: uid("A"),
        code: makeCode("YJ"),
        name: "资产租赁到期核查",
        owner_id: a.owner_id,
        status: "待受理",
        severity: "一般",
        created_at: now(),
        source: "DERIVED_SIMULATION",
        data: {
          asset_id: a.id,
          object: a.code,
          kind: "租赁风险",
          trigger: a.lease.finish_at,
        },
      });
    }
    return { count: expired.length };
  }
  if (type === "forecast.evaluate") {
    allowed(user, "forecast.run");
    const r = get(db, user, "forecasts", id);
    version(r, b);
    let samples = [];
    if (r.kind === "load") {
      const actual = allRows(db, user, "loads");
      samples = (r.series || [])
        .map((p) => {
          const a = actual.find(
            (a) =>
              a.hour === p.hour &&
              a.actual_kw != null &&
              (!r.station_id || a.station_id === r.station_id),
          );
          return a && p.predicted_kw != null
            ? {
                hour: p.hour,
                predicted: p.predicted_kw,
                actual: a.actual_kw,
                error: p.predicted_kw - a.actual_kw,
              }
            : null;
        })
        .filter(Boolean);
    } else
      for (const p of r.items || []) {
        const sessions = allRows(db, user, "sessions").filter(
          (s) => s.plan_id === p.plan_id && s.status === "已核验",
        );
        for (const s of sessions)
          samples.push({
            plan_id: p.plan_id,
            predicted: p.wait_minutes,
            actual: Math.max(
              0,
              (new Date(s.start_at) - new Date(p.arrival_at)) / 60000,
            ),
            error: (new Date(s.start_at) - new Date(p.start_at)) / 60000,
          });
      }
    const mae = samples.length
      ? samples.reduce((n, p) => n + Math.abs(p.error), 0) / samples.length
      : null;
    return save(
      db,
      user,
      "forecast-evaluations",
      "预测与核验样本偏差",
      {
        forecast_id: id,
        forecast_version: r.version,
        samples,
        mae,
        valid_samples: samples.length,
        accuracy_validated: false,
        scope: "仅样本偏差；仿真数据不认定现场模型精度",
      },
      "样本对照",
    );
  }
  if (type === "planning.recommend") {
    allowed(user, "planning.write");
    const r = get(db, user, b.resource || "planning", id);
    version(r, b);
    must(r.status === "条件比选", "成果当前不能推荐");
    const c = r.comparison.find((c) => c.candidate_id === b.candidate_id);
    must(c?.feasible, "候选存在缺项或容量冲突");
    must(
      get(db, user, "candidates", c.candidate_id).version ===
        c.candidate_version,
      "候选点已变化，请重新比较",
      409,
    );
    patch(db, "records", id, {
      status: "已确认条件推荐",
      data: {
        ...r,
        recommended_id: c.candidate_id,
        evidence: text(b.evidence, "推荐依据"),
        engineering_approved: false,
      },
    });
    return { id };
  }
  if (type === "planning.compare" || type === "deployment.compare") {
    allowed(user, "planning.write");
    const points = (b.candidate_ids || []).map((x) =>
      get(db, user, "candidates", x),
    );
    must(points.length >= 2, "至少选择两个候选点");
    const daily = number(b.daily_quantity, "日运输需求", 1, 1e6),
      distance = number(b.distance_km, "参考距离", 0.1, 1000),
      days = number(b.operating_days ?? 300, "年运营天数", 1, 366),
      hours = number(b.hours ?? 8, "每日工时", 1, 24);
    const phases = b.phases || [
      { name: "一期", ratio: 0.5 },
      { name: "二期", ratio: 1 },
    ];
    must(
      phases.length >= 1 &&
        phases.every(
          (p, i) =>
            p.ratio > 0 &&
            p.ratio <= 1 &&
            (!i || p.ratio > phases[i - 1].ratio),
        ),
      "阶段比例须递增且不超过100%",
    );
    const orders = allRows(db, user, "orders").filter(
      (o) => o.status !== "已取消",
    );
    const results = points.map((p) => {
      const coords = [p.longitude, p.latitude],
        routeKnown =
          coords.every(Number.isFinite) &&
          orders.some((o) => o.origin_coords && o.destination_coords);
      let weighted = 0,
        volume = 0,
        covered = 0;
      for (const o of orders) {
        const km = routeKnown
          ? Math.max(
              0,
              (distanceKm(o.origin_coords, coords) +
                distanceKm(coords, o.destination_coords)) *
                1.25 -
                o.distance_km,
            )
          : null;
        if (km != null) {
          const q = o.quantity_kg - o.cancelled_kg;
          weighted += km * q;
          volume += q;
          if (km <= (b.max_detour_km ?? 15)) covered += q;
        }
      }
      const detour = volume ? weighted / volume : null,
        cycle =
          ((distance + (detour || 0)) * 60) / 35 + (distance * 60) / 45 + 20,
        trips = Math.ceil(daily / 30),
        vehicles = Math.ceil(
          trips / Math.max(1, Math.floor((hours * 60) / cycle)),
        ),
        energy = trips * (distance * 2 + (detour || 0)) * 1.58,
        devices = Math.ceil(energy / (240 * hours * 0.85)),
        wait = Math.max(0, (trips * 10) / Math.max(1, devices) - hours * 60),
        capacity = Number(p.capacity_kw),
        feasible =
          p.status === "条件齐备" &&
          Number.isFinite(capacity) &&
          devices * 240 <= capacity;
      return {
        candidate_id: p.id,
        candidate_version: p.version,
        name: p.name,
        coverage_ratio: volume ? covered / volume : null,
        detour_km: detour,
        vehicles,
        batteries: vehicles,
        devices,
        required_power_kw: devices * 240,
        energy_kwh: energy,
        wait_minutes: wait,
        known_annual_cost_cents: Math.round(energy * days * 1.28 * 100),
        engineering_conditions: {
          land: p.land,
          grid: p.grid,
          road: p.road || "仿真路网，待实证",
        },
        feasible,
        phases: phases.map((phase) => ({
          name: phase.name,
          ratio: phase.ratio,
          vehicles: Math.ceil(vehicles * phase.ratio),
          devices: Math.ceil(devices * phase.ratio),
          daily_quantity: daily * phase.ratio,
        })),
      };
    });
    return save(
      db,
      user,
      type === "planning.compare" ? "planning" : "deployment",
      "同口径布局与阶段比选",
      {
        comparison: results,
        inputs: {
          daily_quantity: daily,
          distance_km: distance,
          hours,
          operating_days: days,
          max_detour_km: b.max_detour_km ?? 15,
        },
        phases,
        assumptions: [
          "距离为公开区域坐标的1.25倍几何情景，非已核验货车道路",
          "30吨、1.58kWh/km、240kW、85%服务系数为仿真条件",
          "仅比较已知补能费用，不含建设投资、人工及租赁；纯充电不额外配置换电备用电池",
        ],
        engineering_approved: false,
      },
      "条件比选",
    );
  }
  if (type === "integration.pause" || type === "integration.resume") {
    allowed(user, "data.write");
    const r = get(db, user, "integrations", id);
    version(r, b);
    patch(db, "records", id, {
      status: type === "integration.pause" ? "已暂停" : "仿真数据",
      data: {
        ...r,
        history: [
          ...(r.history || []),
          {
            at: now(),
            by: user.id,
            action: type,
            reason: text(b.reason, "影响与恢复说明"),
          },
        ],
        affected_objects: b.affected_objects || [],
      },
    });
    return { id };
  }
  if (type === "energy.feedback") {
    allowed(user, "energy.write");
    const r = get(db, user, "energy-plans", id);
    version(r, b);
    must(r.status === "已确认计划", "请先确认协同计划");
    const refs = (
      Array.isArray(b.session_ids)
        ? b.session_ids
        : String(b.session_ids || "")
            .split(/[，, ]/)
            .filter(Boolean)
    ).map((x) => get(db, user, "sessions", x));
    must(
      refs.every((s) => s.status === "已核验"),
      "反馈仅引用已核验作业",
    );
    patch(db, "records", id, {
      data: {
        ...r,
        actual_feedback_refs: refs.map((s) => ({
          id: s.id,
          version: s.version,
        })),
        feedback: text(b.evidence, "执行反馈依据"),
        evaluation_complete: refs.length > 0,
      },
    });
    return { id };
  }
  return undefined;
}
