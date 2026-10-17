import React from "react";
import { Button } from "@lobehub/ui";
import { Table, Alert, Tabs, Select } from "antd";
import { Card, col, Pill, format, money, time, Source, DataTable } from "./ui";
export function advancedActions(a, field, localDate) {
  const opts = (resource, filter = () => true) =>
    (a.boot?.[resource] || [])
      .filter(filter)
      .map((r) => ({ value: r.id, label: r.code + " · " + r.name }));
  const form = (title, fields, initial, type, r, resource) =>
    a.openForm(title, fields, initial, (v) =>
      a.execute(type, r?.id, { ...v, resource, expected_version: r?.version }),
    );
  const evidence = () => field("evidence", "来源与核验依据", "textarea");
  const configureEnergy = (r) =>
    form(
      "能源资源边界",
      [
        field("station_id", "所属场站", "select", {
          options: opts("stations"),
        }),
        field("kind", "能源类别", "select", {
          options: ["电网", "绿电", "储能"].map((value) => ({
            value,
            label: value,
          })),
        }),
        field("grid_capacity_kw", "有效接电容量（kW）", "number", {
          when: (v) => v.kind === "电网",
        }),
        field("transformer_limit_kw", "共享供电上限（kW）", "number", {
          when: (v) => v.kind === "电网",
        }),
        field("storage_soc", "储能SOC（%）", "number", {
          max: 100,
          when: (v) => v.kind === "储能",
        }),
        field("storage_capacity_kwh", "储能容量（kWh）", "number", {
          min: 1,
          when: (v) => v.kind === "储能",
        }),
        field("power_kw", "充放电功率（kW）", "number", {
          min: 1,
          when: (v) => v.kind === "储能",
        }),
        field("efficiency", "充放电效率", "number", {
          min: 0.1,
          max: 1,
          precision: 3,
          when: (v) => v.kind === "储能",
        }),
        field("green_peak_kw", "绿电情景峰值（kW）", "number", {
          when: (v) => v.kind === "绿电",
        }),
        field("effective_start", "生效开始", "datetime"),
        field("effective_end", "生效结束", "datetime"),
        evidence(),
      ],
      {
        ...r,
        power_kw: r.charge_discharge_bounds?.power_kw,
        efficiency: r.charge_discharge_bounds?.efficiency || 0.92,
        effective_start: localDate(r.effective_start || Date.now()),
        effective_end: localDate(r.effective_end || Date.now() + 86400000),
      },
      "resource.configure",
      r,
      "energy-resources",
    );
  const detail = (resource, r) => {
    const buttons = [];
    const add = (label, operation, fn) =>
      a.can(operation) &&
      buttons.push(
        <Button key={label} onClick={fn}>
          {label}
        </Button>,
      );
    if (resource === "energy-resources")
      add("维护生效边界", "resource.write", () => configureEnergy(r));
    if (resource === "stations")
      add("维护计价与服务", "resource.write", () =>
        a.openForm(
          "计价与服务条件",
          [
            field("electricity", "参考电费（元/kWh）", "number"),
            field("service", "服务费（元/kWh）", "number"),
            field("inventory", "核验电池库存（组）", "number"),
            field("service_minutes", "服务时长（分钟）", "number", { min: 1 }),
            evidence(),
          ],
          {
            electricity: r.price_curve?.[0]?.electricity || 0.68,
            service: r.price_curve?.[0]?.service || 0.6,
            inventory: r.inventory || 0,
            service_minutes: r.service_minutes || 40,
          },
          (v) =>
            a.execute("resource.configure", r.id, {
              ...v,
              resource,
              expected_version: r.version,
              price_curve: Array.from({ length: 24 }, (_, hour) => ({
                hour,
                electricity: v.electricity,
                service: v.service,
              })),
            }),
        ),
      );
    if (resource === "assets" && r.kind === "电池" && r.station_id)
      add("核验可用库存", "asset.write", () =>
        form(
          "核验电池可用",
          [
            field("soc", "核验SOC（%）", "number", { min: 80, max: 100 }),
            evidence(),
          ],
          { soc: r.soc || 80 },
          "asset.ready",
          r,
        ),
      );
    if (r.comparison && r.status === "条件比选")
      add("推荐条件可行布局", "planning.write", () =>
        form(
          "推荐布局",
          [
            field("candidate_id", "推荐候选点", "select", {
              options: r.comparison
                .filter((c) => c.feasible)
                .map((c) => ({ value: c.candidate_id, label: c.name })),
            }),
            evidence(),
          ],
          {},
          "planning.recommend",
          r,
          resource,
        ),
      );
    if (resource === "forecasts")
      add("对照核验样本", "forecast.run", async () => {
        const x = await a.execute("forecast.evaluate", r.id, {
          expected_version: r.version,
        });
        a.showDetail("forecast-evaluations", x.id);
      });
    if (resource === "assets") {
      add("登记租赁", "asset.write", () =>
        form(
          "登记资产租赁",
          [
            field("lessor", "出租主体"),
            field("start_at", "租赁开始", "datetime"),
            field("finish_at", "租赁结束", "datetime"),
            field("amount", "租金（元）", "number"),
            evidence(),
          ],
          {
            start_at: localDate(),
            finish_at: localDate(Date.now() + 30 * 86400000),
            amount: 0,
          },
          "asset.lease",
          r,
        ),
      );
      add("登记维保", "asset.write", () =>
        form(
          "登记资产维保",
          [
            field("note", "维保内容", "textarea"),
            field("maintenance_state", "维保状态", "select", {
              options: ["已完成", "检修中"].map((value) => ({
                value,
                label: value,
              })),
            }),
            field("due_at", "下次维保时间", "datetime", { required: false }),
            evidence(),
          ],
          { maintenance_state: "已完成" },
          "asset.maintenance",
          r,
        ),
      );
      if (r.kind === "电池")
        add("登记电池去向", "asset.write", () =>
          form(
            "电池出入站登记",
            [
              field("station_id", "去向场站", "select", {
                options: opts("stations"),
                required: false,
              }),
              field("vehicle_id", "去向车辆", "select", {
                options: opts("vehicles"),
                required: false,
              }),
              evidence(),
            ],
            {},
            "asset.move",
            r,
          ),
        );
    }
    if (resource === "integrations") {
      add("维护来源映射", "data.write", () =>
        a.openForm(
          "维护来源映射",
          [
            field("connector", "接入方式"),
            field("external_key", "外部对象编码"),
            field("vehicle_id", "内部车辆", "select", {
              options: opts("vehicles"),
            }),
            field("unit", "电量单位", "select", {
              options: ["kWh", "Wh"].map((value) => ({ value, label: value })),
            }),
            field("coordinates", "坐标系", "select", {
              options: ["GCJ-02", "WGS84"].map((value) => ({
                value,
                label: value,
              })),
            }),
            evidence(),
          ],
          {
            connector: r.connector || "测算资料接入",
            unit: "kWh",
            coordinates: "GCJ-02",
          },
          (v) =>
            a.execute("resource.configure", r.id, {
              resource,
              expected_version: r.version,
              connector: v.connector,
              mapping: {
                external_key: v.external_key,
                vehicle_id: v.vehicle_id,
                unit: v.unit,
                coordinates: v.coordinates,
              },
              evidence: v.evidence,
            }),
        ),
      );
      add(r.status === "已暂停" ? "恢复来源" : "暂停来源", "data.write", () =>
        form(
          r.status === "已暂停" ? "恢复来源" : "暂停来源",
          [field("reason", "影响与恢复说明", "textarea")],
          {},
          r.status === "已暂停" ? "integration.resume" : "integration.pause",
          r,
        ),
      );
    }
    if (resource === "replacements")
      add("维护合作关系", "resource.write", () =>
        form(
          "维护合作关系",
          [
            field("partner", "合作主体"),
            field("valid_until", "合作有效期", "datetime"),
            field("contact", "联系人"),
            evidence(),
          ],
          r,
          "resource.configure",
          r,
          resource,
        ),
      );
    if (resource === "energy-plans" && r.status === "已确认计划")
      add("记录执行反馈", "energy.write", () =>
        form(
          "记录协同反馈",
          [
            field("session_ids", "已核验作业编号", "text", { required: false }),
            evidence(),
          ],
          {},
          "energy.feedback",
          r,
        ),
      );
    if (resource === "demands" && ["草稿", "已确认"].includes(r.status)) {
      add("维护需求", "demand.write", () =>
        form(
          "维护运输需求",
          [
            field("name", "需求名称"),
            field("quantity", "需求运量（吨）", "number", { min: 0.001 }),
            field("cargo", "货物"),
            field("origin", "装货位置"),
            field("destination", "卸货位置"),
          ],
          { ...r, quantity: r.quantity_kg / 1000 },
          "demand.edit",
          r,
        ),
      );
      add("终止后续拆分", "demand.write", () =>
        form(
          "终止后续拆分",
          [field("reason", "终止原因", "textarea")],
          {},
          "demand.cancel",
          r,
        ),
      );
    }
    return buttons;
  };
  return { detail, configureEnergy };
}
export function AdvancedRecord({ row, a }) {
  const listNodes = row.plan?.nodes || row.nodes;
  return (
    <>
      {row.constraint_violations?.length > 0 && (
        <Alert
          type="warning"
          message={row.constraint_violations
            .map((v) => v.kind + " " + (v.object_id || v.vehicle_id || ""))
            .join("；")}
        />
      )}
      {listNodes?.length > 0 && (
        <Card title="计划节点">
          <Table
            size="small"
            rowKey={(_, i) => i}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 540 }}
            dataSource={listNodes}
            columns={[
              col("节点", "kind"),
              col("开始", "start_at", time),
              col("结束", "finish_at", time),
              col("到达SOC", "soc_after", (v) =>
                v == null ? "—" : format(v) + "%",
              ),
            ]}
          />
        </Card>
      )}
      {row.alternatives && (
        <Card title="补能候选比较">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={row.alternatives}
            columns={[
              col("候选", "name"),
              col("参考等待（分钟）", "wait_minutes", (v) => format(v)),
              col("已知费用", "known_cost_cents", money),
              col("约束", "feasible", (v) => (
                <Pill>{v ? "条件可行" : "存在冲突"}</Pill>
              )),
            ]}
          />
          {row.status === "待确认" && (
            <div className="card-body row wrap">
              {row.alternatives
                .filter((x) => x.feasible)
                .map((x) => (
                  <Button
                    key={x.id}
                    disabled={!a.can("charging.write")}
                    onClick={() =>
                      a.openForm(
                        "确认补能候选",
                        [
                          {
                            key: "evidence",
                            label: "时效与电量复核依据",
                            type: "textarea",
                            required: true,
                          },
                        ],
                        {},
                        (v) =>
                          a.execute("charging.apply", row.id, {
                            ...v,
                            alternative_id: x.id,
                            expected_version: row.version,
                          }),
                      )
                    }
                  >
                    采用{x.name}
                  </Button>
                ))}
            </div>
          )}
        </Card>
      )}
      {row.strategies && (
        <Card title="同边界策略比较">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 540 }}
            dataSource={row.strategies}
            columns={[
              col("策略", "name"),
              col("已知费用", "known_cost_cents", (v) =>
                v == null ? "—" : money(v),
              ),
              col("覆盖率", "coverage", (v) => format(v * 100) + "%"),
              col("约束", "feasible", (v) => (
                <Pill>{v ? "条件可行" : "缺项或冲突"}</Pill>
              )),
              col("缺项", "missing", (v) => v.join("、")),
            ]}
          />
          {row.status === "待确认" && (
            <div className="card-body row">
              {row.strategies
                .filter((s) => s.feasible)
                .map((s) => (
                  <Button
                    key={s.id}
                    onClick={() =>
                      a.openForm(
                        "确认能源策略",
                        [
                          {
                            key: "evidence",
                            label: "协同计划核对依据",
                            type: "textarea",
                            required: true,
                          },
                        ],
                        {},
                        (v) =>
                          a.execute("energy.confirm", row.id, {
                            ...v,
                            strategy_id: s.id,
                            expected_version: row.version,
                          }),
                      )
                    }
                  >
                    采用{s.name}
                  </Button>
                ))}
            </div>
          )}
        </Card>
      )}
      {row.comparison && (
        <Card title="布局与建设顺序">
          <Table
            rowKey="candidate_id"
            size="small"
            pagination={false}
            scroll={{ x: 900 }}
            dataSource={row.comparison}
            columns={[
              col("候选点", "name"),
              col("覆盖率", "coverage_ratio", (v) =>
                v == null ? "缺坐标" : format(v * 100) + "%",
              ),
              col("绕行（km）", "detour_km", (v) => format(v)),
              col(
                "车辆 / 工位",
                "vehicles",
                (_, r) => r.vehicles + " / " + r.devices,
              ),
              col("等待（分钟）", "wait_minutes", (v) => format(v)),
              col("日用电", "energy_kwh", (v) => format(v)),
              col("年已知费用", "known_annual_cost_cents", money),
              col("约束", "feasible", (v) =>
                v ? "条件可行" : "待核查/容量不足",
              ),
            ]}
          />
          {row.comparison.map((r) => (
            <div className="card-body" key={r.candidate_id}>
              <h3>{r.name}</h3>
              <p className="muted small">
                用地：{r.engineering_conditions.land} · 接电：
                {r.engineering_conditions.grid} · 通行：
                {r.engineering_conditions.road}
              </p>
              <Table
                rowKey="name"
                size="small"
                pagination={false}
                dataSource={r.phases}
                columns={[
                  col("建设阶段", "name"),
                  col("需求量（吨）", "daily_quantity"),
                  col("车辆", "vehicles"),
                  col("工位", "devices"),
                ]}
              />
            </div>
          ))}
        </Card>
      )}
      {row.samples && (
        <Card title="预测与核验对照">
          <Table
            size="small"
            rowKey={(_, i) => i}
            pagination={{ pageSize: 10 }}
            dataSource={row.samples}
            columns={[
              col("时段/计划", "hour", (_, r) => r.hour ?? r.plan_id),
              col("预测", "predicted", (v) => format(v)),
              col("核验样本", "actual", (v) => format(v)),
              col("偏差", "error", (v) => format(v)),
            ]}
          />
          <div className="card-body">
            有效样本 {row.valid_samples} · 平均绝对偏差 {format(row.mae)}
            <Source text={row.scope} />
          </div>
        </Card>
      )}
      {row.lease && (
        <Card title="资产租赁">
          <div className="card-body">
            {row.lease.lessor} · {time(row.lease.start_at)} —{" "}
            {time(row.lease.finish_at)} · {money(row.lease.amount_cents)}
          </div>
        </Card>
      )}
      {row.assumptions && <Source text={row.assumptions.join("；")} />}
    </>
  );
}
