import { scryptSync, randomBytes } from "node:crypto";
import { insert, now, transaction } from "./db.mjs";
import fs from "node:fs";
export function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export const LOCAL_PASSWORD = "JiaoNeng2026!";
const iso = (day, hour = 8) => {
  const d = new Date();
  d.setDate(d.getDate() + day);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
export function seed(db) {
  // Once a business dataset is installed, retiring legacy records must be durable.
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_view_state'").get()&&db.prepare("SELECT 1 FROM data_view_state WHERE key='business-dataset-v1'").get())return;
  if (db.prepare("SELECT count(*) n FROM organizations").get().n) {
    db.prepare(
      "UPDATE records SET source='REFERENCE_PARAMETER' WHERE resource='parameters' AND source='PUBLIC_REFERENCE'",
    ).run();
    seedBoundaries(db);
    seedAvailability(db);
    seedTelemetry(db);
    seedActive(db);
    seedCurrentDrivers(db);
    return;
  }
  transaction(db, () => {
    const owners = ["ORG-N", "ORG-S"];
    owners.forEach((id, i) =>
      insert(db, "organizations", {
        id,
        name: ["庆阳北区运营主体（仿真）", "庆阳南区合作主体（仿真）"][i],
        kind: i ? "合作运力" : "运营主体",
      }),
    );
    const refs = JSON.parse(
      fs.readFileSync(
        new URL("../shared/reference-data.json", import.meta.url),
        "utf8",
      ),
    );
    refs.sources.forEach((s) =>
      insert(db, "sources", {
        id: s.source_id,
        title: s.title,
        kind: s.type,
        url: s.url,
        published_at: s.published,
        verified_at: now(),
        limitations: s.limits,
      }),
    );
    const metadata = (i) => ({
      generated_at: now(),
      scenario: "庆阳煤炭短倒业务仿真",
      evidence: `SIM-20261013-${i}`,
      source_time: now(),
    });
    for (let i = 1; i <= 12; i++) {
      const id = "D" + String(i).padStart(3, "0");
      insert(db, "drivers", {
        id,
        code: "SJ-" + String(i).padStart(3, "0"),
        name: "仿真司机" + String(i).padStart(2, "0"),
        owner_id: i > 9 ? owners[1] : owners[0],
        status: i === 12 ? "休息" : "可用",
        data: {
          ...metadata(i),
          license: "A2（仿真）",
          phone: "138****" + String(1000 + i),
          available_window: "06:00—22:00",
        },
      });
    }
    for (let i = 1; i <= 18; i++) {
      const id = "V" + String(i).padStart(3, "0");
      insert(db, "vehicles", {
        id,
        code: "甘M·仿" + String(i).padStart(3, "0"),
        name:
          (i % 3 ? "350度换电牵引车" : "513度干线牵引车") +
          " " +
          String(i).padStart(2, "0"),
        owner_id: (i >= 10 && i <= 12) || i > 14 ? owners[1] : owners[0],
        driver_id: i <= 12 ? "D" + String(i).padStart(3, "0") : null,
        status: i === 17 ? "检修" : i === 18 ? "待核实" : "可用",
        capacity_kwh: i % 3 ? 350 : 513,
        payload_kg: 30000,
        soc: 62 + ((i * 7) % 30),
        source_id: i % 3 ? "PUB-002" : "PUB-003",
        data: {
          ...metadata(i),
          model: i % 3 ? "REF-350（参考档）" : "REF-513（参考档）",
          energy_per_km: i % 3 ? 1.58 : 1.5,
          compatibility: "QY-SWAP-A（仿真适配）",
          longitude: 107.56 + i * 0.004,
          latitude: 35.71 + (i % 5) * 0.006,
          road_verified: false,
          parameter_kind: "SIMULATED",
        },
      });
    }
    [
      ["S001", "北区煤运补能站", "充电", 720, 107.63, 35.75],
      ["S002", "西区集运换电站", "换电", 480, 107.58, 35.73],
      ["S003", "南区物流补能站", "充电", 360, 107.66, 35.7],
    ].forEach(([id, name, mode, power, lon, lat], i) => {
      insert(db, "stations", {
        id,
        code: "CZ-" + String(i + 1).padStart(3, "0"),
        name,
        owner_id: i === 2 ? owners[1] : owners[0],
        status: "运营中",
        mode,
        power_kw: power,
        longitude: lon,
        latitude: lat,
        data: {
          ...metadata(id),
          inventory: i === 1 ? 8 : 0,
          service_minutes: mode === "换电" ? 10 : 40,
          compatibility: "QY-SWAP-A（仿真适配）",
          price_curve: Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            electricity:
              h >= 10 && h < 16 ? 0.48 : h >= 18 && h < 23 ? 0.88 : 0.68,
            service: 0.6,
          })),
          price_basis: "按业务生成的分时价格曲线，非实际合同电价",
          land_verified: false,
          grid_verified: false,
        },
      });
      for (let n = 1; n <= 3; n++)
        insert(db, "devices", {
          id: id + "-G" + n,
          code: id + "-G" + n,
          name: (mode === "换电" ? "换电工位" : "充电枪位") + n,
          owner_id: i === 2 ? owners[1] : owners[0],
          station_id: id,
          status: n === 2 ? "占用" : "空闲",
          connection: id === "S001" && n === 3 ? "离线" : "在线",
          power_kw: mode === "充电" ? 240 : 160,
          data: {
            ...metadata(id + n),
            release_at: iso(0, 10),
            compatibility: "QY-SWAP-A（仿真适配）",
          },
        });
    });
    for (let i = 1; i <= 8; i++)
      insert(db, "demands", {
        id: "DM" + i,
        code: "XQ-2610-" + String(i).padStart(3, "0"),
        name: [
          "煤炭短倒周计划",
          "精煤集运计划",
          "园区原料转运",
          "矿区日发运计划",
        ][i % 4],
        owner_id: i > 6 ? owners[1] : owners[0],
        status: "已确认",
        quantity_kg: 4000000,
        allocated_kg: 0,
        created_at: iso(-10 - i),
        data: {
          ...metadata(i),
          cargo: "原煤",
          origin: "北区装载场",
          destination: "煤炭集运中心",
          contact: "仿真调度组",
        },
      });
    for (let i = 1; i <= 24; i++) {
      const owner = i > 18 ? owners[1] : owners[0],
        demand = owner === owners[1] ? "DM7" : "DM" + (((i - 1) % 6) + 1),
        status = i <= 12 ? "已完成" : i === 24 ? "草稿" : "已确认",
        day = i <= 12 ? -i : 0;
      const orderId = "O" + String(i).padStart(3, "0");
      insert(db, "orders", {
        id: orderId,
        code: "DD-2610-" + String(i).padStart(4, "0"),
        name:
          ["原煤短倒", "精煤集运", "园区转运"][i % 3] +
          " · " +
          String(i).padStart(2, "0"),
        owner_id: owner,
        demand_id: demand,
        status,
        quantity_kg: i <= 12 ? 60000 : 300000,
        start_at: iso(day, 6),
        finish_at: iso(day, 22),
        created_at: iso(-i, 7),
        data: {
          ...metadata(i),
          cargo: i % 2 ? "原煤" : "精煤",
          origin: i % 2 ? "北区装载场" : "西区堆场",
          destination: "煤炭集运中心",
          distance_km: 14 + (i % 4) * 3,
          loaded_speed_kmh: 35,
          empty_speed_kmh: 45,
          loading_minutes: 10,
          unloading_minutes: 10,
          origin_coords: [107.57, 35.72],
          destination_coords: [107.72, 35.78],
          road_verified: false,
        },
      });
      if (status !== "草稿")
        db.prepare(
          "UPDATE demands SET allocated_kg=allocated_kg+? WHERE id=?",
        ).run(i <= 12 ? 60000 : 300000, demand);
      if (i <= 12) {
        const tid = "T" + String(i).padStart(3, "0"),
          vehicle = "V" + String(((i - 1) % 9) + 1).padStart(3, "0"),
          driver = "D" + String(((i - 1) % 9) + 1).padStart(3, "0");
        insert(db, "tasks", {
          id: tid,
          code: "RW-2610-" + String(i).padStart(4, "0"),
          name: "两趟短倒任务",
          owner_id: owner,
          order_id: orderId,
          vehicle_id: vehicle,
          driver_id: driver,
          status: "已完成",
          notification: "已投递",
          quantity_kg: 60000,
          reported_kg: 60000,
          verified_kg: 60000,
          start_at: iso(day, 8),
          finish_at: iso(day, 18),
          created_at: iso(day, 7),
          data: {
            ...metadata(i),
            submission: 1,
            completion_evidence: "仿真磅单及交付核验",
            verifier: "仿真管理员",
          },
        });
        for (let n = 1; n <= 2; n++)
          insert(db, "trips", {
            id: tid + "-C" + n,
            code: tid + "-C" + n,
            task_id: tid,
            owner_id: owner,
            status: "已核验",
            loaded_kg: 30000,
            delivered_kg: 30000,
            verified_kg: 30000,
            occurred_at: iso(day, 9 + n * 2),
            data: {
              ...metadata(i + n),
              loading_evidence: "SIM-LOAD-" + i + n,
              delivery_evidence: "SIM-DELIVERY-" + i + n,
            },
          });
        const sid = "BN" + i;
        insert(db, "sessions", {
          id: sid,
          code: "ZY-2610-" + String(i).padStart(3, "0"),
          name: "短倒补能作业",
          owner_id: owner,
          station_id: owner === owners[1] ? "S003" : "S001",
          vehicle_id: vehicle,
          status: i % 5 === 0 ? "待核验" : "已核验",
          quantity_kwh: 95 + i * 3,
          amount_cents: Math.round((95 + i * 3) * 1.28 * 100),
          start_at: iso(day, 12),
          finish_at: iso(day, 13),
          data: {
            ...metadata(i),
            mode: "充电",
            included: "电费及服务费",
            meter_ref: "SIM-METER-" + i,
          },
        });
        insert(db, "costs", {
          id: "F" + i,
          code: "FY-2610-" + String(i).padStart(4, "0"),
          name: "补能电费及服务费",
          owner_id: owner,
          task_id: tid,
          session_id: sid,
          status: i % 5 === 0 ? "待核验" : "已核验",
          nature: "实际",
          amount_cents: Math.round((95 + i * 3) * 1.28 * 100),
          created_at: iso(day, 14),
          data: {
            ...metadata(i),
            category: "电费及服务费",
            included: "已含服务费，不重复加收",
            quantity: 95 + i * 3,
            price: 1.28,
            evidence: "SIM-METER-" + i,
            coverage: "仅补能费用，运输人工/租赁等未计入",
          },
        });
      }
    }
    for (let i = 1; i <= 5; i++)
      insert(db, "alerts", {
        id: "A" + i,
        code: "YJ-2610-" + String(i).padStart(3, "0"),
        name: [
          "工位数据中断",
          "低SOC关注",
          "到站集中风险",
          "交付凭证缺项",
          "设备释放延迟",
        ][i - 1],
        owner_id: i === 5 ? owners[1] : owners[0],
        vehicle_id: i === 2 ? "V002" : null,
        status: ["待受理", "处理中", "待受理", "已关闭", "待核实"][i - 1],
        severity: i === 1 ? "重要" : "一般",
        created_at: iso(0, 8),
        data: {
          ...metadata(i),
          kind: i === 3 ? "预测风险" : "待核实异常",
          object: i === 1 ? "S001-G3" : i === 2 ? "甘M·仿002" : "北区运输链路",
          trigger: "业务仿真规则生成，非实际故障",
          evidence: i === 4 ? "SIM-CLOSED-4" : "",
          assignee: "北区运营组",
        },
      });
    refs.parameters.forEach((p, i) =>
      insert(db, "records", {
        id: p.parameter_id,
        resource: "parameters",
        code: p.parameter_id,
        name: p.topic,
        owner_id: owners[0],
        status: "参考草案",
        created_at: now(),
        source: "REFERENCE_PARAMETER",
        data: {
          ...p,
          enabled: false,
          source_kind: p.evidence_type,
          production_auto_enabled: false,
        },
      }),
    );
    for (let i = 1; i <= 12; i++)
      insert(db, "records", {
        id: "AS" + i,
        resource: "assets",
        code: "ZC-" + String(i).padStart(3, "0"),
        name: i <= 6 ? "动力电池组 " + i : "牵引车资产 " + i,
        owner_id: owners[0],
        status: i === 12 ? "待核验" : "已核验投运",
        created_at: iso(-20),
        data: {
          ...metadata(i),
          kind: i <= 6 ? "电池" : "车辆",
          vehicle_id: i > 6 ? "V" + String(i - 6).padStart(3, "0") : null,
          capacity_kwh: i <= 6 ? 350 : null,
          holder: "北区运营主体",
          proof: i === 12 ? "" : "SIM-ASSET-PROOF-" + i,
        },
      });
    [
      [
        "INT1",
        "integrations",
        "车辆状态接入",
        "待接入",
        { connector: "JT/T协议待对接", coverage: 0, last_sync: null },
      ],
      [
        "INT2",
        "integrations",
        "场站设备数据",
        "仿真数据",
        { connector: "业务仿真发生器", coverage: 100, last_sync: now() },
      ],
      [
        "RP1",
        "replacements",
        "2026年第四季度运力合作",
        "草稿",
        {
          partner: "仿真合作运力主体",
          quantity: 6,
          capacity_kwh: 350,
          evidence: "合作提案，不是实际投运",
        },
      ],
      [
        "PL1",
        "candidates",
        "北区候选点 A",
        "条件齐备",
        {
          longitude: 107.65,
          latitude: 35.76,
          land: "仿真已核验",
          grid: "仿真已核验",
          capacity_kw: 720,
        },
      ],
      [
        "PL2",
        "candidates",
        "东区候选点 B",
        "待核实",
        {
          longitude: 107.72,
          latitude: 35.74,
          land: "待核实",
          grid: "待核实",
          capacity_kw: null,
        },
      ],
    ].forEach(([id, resource, name, status, data]) =>
      insert(db, "records", {
        id,
        resource,
        code: id,
        name,
        owner_id: owners[0],
        status,
        created_at: now(),
        data: { ...metadata(id), ...data },
      }),
    );
    for (let h = 0; h < 24; h++)
      insert(db, "records", {
        id: "LD" + h,
        resource: "loads",
        code: "FH-" + String(h).padStart(2, "0"),
        name: String(h).padStart(2, "0") + ":00",
        owner_id: owners[0],
        status: h === 15 ? "缺测" : "有效",
        created_at: iso(-1, h),
        data: {
          ...metadata(h),
          source_time: iso(-1, h),
          station_id: "S001",
          hour: h,
          actual_kw:
            h === 15
              ? null
              : Math.round(
                  140 + 180 * Math.max(0, Math.sin(((h - 5) * Math.PI) / 12)),
                ),
          predicted_kw: null,
        },
      });
    [
      ["U-ADMIN", "admin", "平台管理员", "admin", null, owners, ["*"]],
      ["U-NORTH", "north", "北区查询员", "admin", null, [owners[0]], ["read"]],
      [
        "U-DRIVER",
        "driver01",
        "仿真司机01",
        "driver",
        "D001",
        [owners[0]],
        ["driver.execute"],
      ],
      [
        "U-DRIVER2",
        "driver02",
        "仿真司机02",
        "driver",
        "D002",
        [owners[0]],
        ["driver.execute"],
      ],
    ].forEach(([id, username, name, role, driver, scopes, operations]) => {
      insert(db, "users", {
        id,
        username,
        name,
        password_hash: passwordHash(LOCAL_PASSWORD),
        role,
        driver_id: driver,
        operations,
      });
      scopes.forEach((owner) =>
        insert(db, "user_scopes", { user_id: id, owner_id: owner }),
      );
    });
    insert(db, "audit", {
      id: "AUD-SEED",
      user_id: "U-ADMIN",
      owner_id: owners[0],
      action: "初始化业务仿真数据",
      entity_id: "SEED-V1",
      created_at: now(),
      data: {
        source: "SIMULATED",
        recipe:
          "固定业务关系＋最近30天窗口；公开参考独立目录；无真实交易或遥测",
      },
    });
  });
  seedBoundaries(db);
  seedAvailability(db);
  seedTelemetry(db);
  seedActive(db);
  seedCurrentDrivers(db);
}

function seedCurrentDrivers(db) {
  for (const index of [4, 5]) {
    const username = "driver" + String(index).padStart(2, "0");
    if (db.prepare("SELECT 1 FROM users WHERE username=?").get(username))
      continue;
    transaction(db, () => {
      const id = "U-CURRENT-DRIVER-" + index,
        driver_id = "D" + String(index).padStart(3, "0");
      insert(db, "users", {
        id,
        username,
        name: "仿真司机" + String(index).padStart(2, "0"),
        password_hash: passwordHash(LOCAL_PASSWORD),
        role: "driver",
        driver_id,
        operations: ["driver.execute"],
      });
      insert(db, "user_scopes", { user_id: id, owner_id: "ORG-N" });
    });
  }
}

export function seedTelemetry(db) {
  if (db.prepare("SELECT count(*) n FROM telemetry").get().n) return;
  transaction(db, () => {
    for (const v of db.prepare("SELECT id,owner_id,soc FROM vehicles").all())
      for (let i = 0; i < 24; i++)
        insert(db, "telemetry", {
          id: v.id + "-POS-" + i,
          vehicle_id: v.id,
          owner_id: v.owner_id,
          occurred_at: new Date(
            Date.now() - (24 - i) * 5 * 60000,
          ).toISOString(),
          longitude: 107.57 + 0.005 * i,
          latitude: 35.72 + 0.002 * i,
          soc: Math.max(20, v.soc - i * 0.3),
          speed_kmh: i % 7 === 0 ? 0 : 28 + (i % 11),
          source: "SIMULATED",
        });
  });
}

function seedActive(db) {
  if (db.prepare("SELECT 1 FROM tasks WHERE id='TA001'").get()) return;
  transaction(db, () => {
    for (let i = 1; i <= 4; i++) {
      const id = "TA" + String(i).padStart(3, "0"),
        vehicle = "V" + String(i + 3).padStart(3, "0"),
        driver = "D" + String(i + 3).padStart(3, "0"),
        order = "O" + String(i + 13).padStart(3, "0");
      if (db.prepare("SELECT 1 FROM tasks WHERE order_id=?").get(order))
        continue;
      const state = ["执行中", "待接收", "待核验", "已接收"][i - 1],
        reported = i === 1 ? 30000 : i === 3 ? 60000 : 0;
      insert(db, "tasks", {
        id,
        code: "RW-当前-" + String(i).padStart(3, "0"),
        name: "北区煤炭短倒 · 当前批次" + i,
        owner_id: "ORG-N",
        order_id: order,
        vehicle_id: vehicle,
        driver_id: driver,
        status: state,
        notification: "已投递",
        quantity_kg: 60000,
        reported_kg: reported,
        start_at: iso(0, 6),
        finish_at: iso(0, 22),
        created_at: iso(0, 6),
        data: {
          source_time: now(),
          completion_evidence: i === 3 ? "SIM交付汇总" : "",
          submission: i === 3 ? 1 : 0,
        },
      });
      for (let n = 1; n <= reported / 30000; n++)
        insert(db, "trips", {
          id: id + "-C" + n,
          code: id + "-C" + n,
          task_id: id,
          owner_id: "ORG-N",
          status: "已卸货",
          loaded_kg: 30000,
          delivered_kg: 30000,
          occurred_at: iso(0, 9 + n),
          data: {
            loading_evidence: "SIM装货凭证",
            delivery_evidence: "SIM交付凭证",
          },
        });
      insert(db, "charging", {
        id: "C-ACT" + i,
        code: "BN-当前-" + i,
        name: "当前批次补能" + i,
        owner_id: "ORG-N",
        task_id: id,
        vehicle_id: vehicle,
        station_id: i % 2 ? "S001" : "S002",
        status: "已确认",
        arrival_at: iso(0, 12 + i),
        quantity_kwh: 100 + i * 10,
        data: { mode: i % 2 ? "充电" : "换电", reference_only: true },
      });
    }
  });
}

function seedAvailability(db) {
  db.prepare(
    "UPDATE stations SET data=json_set(data,'$.supported_capacity_kwh',json(?)) WHERE source='SIMULATED' AND json_extract(data,'$.supported_capacity_kwh') IS NULL AND mode=?",
  ).run("[350]", "换电");
  for (const table of ["vehicles", "stations"])
    db.prepare(
      `UPDATE ${table} SET data=json_set(data,'$.available_window',?) WHERE source='SIMULATED' AND json_extract(data,'$.available_window') IS NULL`,
    ).run(table === "vehicles" ? "00:00—24:00" : "00:00—24:00");
}

function seedBoundaries(db) {
  db.prepare(
    "UPDATE vehicles SET owner_id=(SELECT owner_id FROM drivers WHERE drivers.id=vehicles.driver_id) WHERE source='SIMULATED' AND id IN('V010','V011','V012') AND owner_id<>(SELECT owner_id FROM drivers WHERE drivers.id=vehicles.driver_id) AND NOT EXISTS(SELECT 1 FROM tasks WHERE vehicle_id=vehicles.id AND status IN('待接收','已接收','执行中','待核验','退回补充'))",
  ).run();

  if (!db.prepare("SELECT 1 FROM records WHERE resource='device-loads'").get())
    for (const r of db
      .prepare("SELECT * FROM records WHERE resource='loads'")
      .all()) {
      const d = JSON.parse(r.data);
      for (let i = 1; i <= 3; i++)
        insert(db, "records", {
          id: "DLOAD-" + r.id + "-" + i,
          resource: "device-loads",
          code: "GFH-" + r.code + "-" + i,
          name: r.name + "工位" + i,
          owner_id: r.owner_id,
          status: i === 3 || d.actual_kw == null ? "缺测" : "有效",
          created_at: r.created_at,
          source: "SIMULATED",
          data: {
            station_id: d.station_id,
            device_id: d.station_id + "-G" + i,
            hour: d.hour,
            actual_kw:
              i === 3 || d.actual_kw == null
                ? null
                : Math.round(d.actual_kw * (i === 1 ? 0.55 : 0.45)),
            source_time: r.created_at,
            evidence: "SIM分设备计量；站级总表独立，不重复汇总",
          },
        });
    }

  if (!db.prepare("SELECT 1 FROM records WHERE id='ER-GRID'").get()) {
    const start = iso(-365, 0),
      end = iso(365, 0);
    for (const [id, kind, data] of [
      ["ER-GRID", "电网", { grid_capacity_kw: 720, transformer_limit_kw: 720 }],
      [
        "ER-GREEN",
        "绿电",
        {
          green_output_series: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            kw: Math.round(
              100 * Math.max(0, Math.sin(((hour - 6) * Math.PI) / 12)),
            ),
          })),
        },
      ],
      [
        "ER-STORAGE",
        "储能",
        {
          storage_soc: 60,
          storage_capacity_kwh: 1000,
          charge_discharge_bounds: {
            power_kw: 250,
            efficiency: 0.92,
            min_soc: 20,
            max_soc: 90,
          },
        },
      ],
    ])
      insert(db, "records", {
        id,
        resource: "energy-resources",
        code: id,
        name: "北区" + kind + "边界（仿真）",
        owner_id: "ORG-N",
        status: "仿真已核验",
        created_at: now(),
        source: "SIMULATED",
        data: {
          kind,
          station_id: "S001",
          effective_start: start,
          effective_end: end,
          evidence:
            "SIM能源场景：720kW共享接电、100kW绿电出力、1000kWh储能；非现场设备参数",
          ...data,
        },
      });
  }
  const marker = db.prepare("SELECT data FROM stations WHERE id='S002'").get();
  if (marker && !JSON.parse(marker.data).battery_inventory_linked) {
    for (let i = 1; i <= 6; i++) {
      const r = db.prepare("SELECT data FROM records WHERE id=?").get("AS" + i);
      if (!r) continue;
      const data = JSON.parse(r.data);
      Object.assign(data, {
        station_id: i <= 3 ? "S002" : null,
        vehicle_id:
          i > 3
            ? "V" + String(i === 4 ? 1 : i === 5 ? 2 : 4).padStart(3, "0")
            : null,
        available: i <= 3,
        soc: i <= 3 ? 80 : 60,
        compatibility: "QY-SWAP-A（仿真适配）",
      });
      db.prepare("UPDATE records SET data=? WHERE id=?").run(
        JSON.stringify(data),
        "AS" + i,
      );
    }
    const data = JSON.parse(marker.data);
    data.inventory = 3;
    data.battery_inventory_linked = true;
    db.prepare("UPDATE stations SET data=? WHERE id='S002'").run(
      JSON.stringify(data),
    );
  }
}
