import AssistantWorkspace from "./assistant-view";
import ReportingWorkspace from "./report-view";
import React, { useState, useEffect } from "react";
import { Button } from "@lobehub/ui";
import {
  Input,
  Select,
  InputNumber,
  Tabs,
  Table,
  Alert,
  Empty,
  Checkbox,
  Slider,
} from "antd";
import { Plus, ArrowRight, RefreshCw } from "lucide-react";
import { useApp } from "./context";
import { request, list, detail } from "./api";
import {
  Heading,
  Card,
  DataTable,
  col,
  stateCol,
  Pill,
  Source,
  Stat,
  format,
  money,
  time,
} from "./ui";
import BusinessMap from "./map";
export { default as Overview } from "./overview-workbench";
export function ResourcePage() {
  const a = useApp(),
    [tab, setTab] = useState("vehicles");
  return (
    <>
      <Heading title="运力档案">
        <Button
          type="primary"
          icon={Plus}
          disabled={!a.can("resource.write")}
          onClick={() => a.createPhysical(tab)}
        >
          登记{tab === "vehicles" ? "车辆" : "司机"}
        </Button>
      </Heading>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "vehicles", label: "车辆档案" },
            { key: "drivers", label: "司机档案" },
          ]}
        />
        <DataTable
          key={tab}
          resource={tab}
          columns={
            tab === "vehicles"
              ? [
                  col("车辆编号", "code"),
                  col("车型 / 电量", "name", (_, r) => (
                    <>
                      {r.name}
                      <p className="small muted">
                        {r.capacity_kwh} kWh · {format(r.payload_kg / 1000)} t
                      </p>
                    </>
                  )),
                  col("当前司机", "driver_id", (v) => a.label("driver_id", v)),
                  col("SOC", "soc", (v) => format(v) + "%"),
                  stateCol,
                ]
              : [
                  col("司机编号", "code"),
                  col("姓名", "name"),
                  col("驾驶资格", "license"),
                  col("可用窗口", "available_window"),
                  stateCol,
                ]
          }
        />
      </Card>
    </>
  );
}
export function Stations() {
  const a = useApp(),
    [tab, setTab] = useState("stations");
  return (
    <>
      <Heading title="场站运营">
        <Button
          disabled={!a.can("resource.write")}
          onClick={() =>
            a.openForm(
              "登记设备工位",
              [
                {
                  key: "station_id",
                  label: "所属场站",
                  type: "select",
                  required: true,
                  options: a.boot.stations.map((s) => ({
                    value: s.id,
                    label: s.name,
                  })),
                },
                { key: "code", label: "工位编码", required: true },
                { key: "name", label: "工位名称", required: true },
                {
                  key: "power_kw",
                  label: "额定功率（kW）",
                  type: "number",
                  required: true,
                  min: 1,
                },
                { key: "compatibility", label: "设备适配", required: true },
                {
                  key: "evidence",
                  label: "资料依据",
                  type: "textarea",
                  required: true,
                },
              ],
              {
                station_id: "S001",
                power_kw: 240,
                compatibility: "QY-SWAP-A（测算适配）",
              },
              (v) => a.execute("device.create", null, v),
            )
          }
        >
          登记设备工位
        </Button>
        {tab === "stations" && (
          <Button
            type="primary"
            icon={Plus}
            disabled={!a.can("resource.write")}
            onClick={() => a.createPhysical("stations")}
          >
            登记场站
          </Button>
        )}
        {tab === "sessions" && (
          <Button
            type="primary"
            icon={Plus}
            disabled={!a.can("session.write")}
            onClick={a.editSession}
          >
            登记实际作业
          </Button>
        )}
      </Heading>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "stations", label: "场站" },
            { key: "devices", label: "设备工位" },
            { key: "sessions", label: "实际作业" },
          ]}
        />
        <DataTable
          key={tab}
          resource={tab}
          columns={
            tab === "stations"
              ? [
                  col("场站编号", "code"),
                  col("场站名称", "name"),
                  col("补能方式", "mode"),
                  col("有效供电", "power_kw", (v) => format(v) + " kW"),
                  stateCol,
                ]
              : tab === "devices"
                ? [
                    col("工位编号", "code"),
                    col("所属场站", "station_id", (v) =>
                      a.label("station_id", v),
                    ),
                    col("运行状态", "status", (v) => <Pill>{v}</Pill>),
                    col("连接状态", "connection", (v) => <Pill>{v}</Pill>),
                    col("有效功率", "power_kw", (v) => format(v) + " kW"),
                  ]
                : [
                    col("作业编号", "code"),
                    col("车辆", "vehicle_id", (v) => a.label("vehicle_id", v)),
                    col("场站", "station_id", (v) => a.label("station_id", v)),
                    col("电量", "quantity_kwh", (v) => format(v) + " kWh"),
                    col("来源金额", "amount_cents", money),
                    stateCol,
                  ]
          }
        />
      </Card>
    </>
  );
}
export function Charging() {
  const a = useApp(),
    [tab, setTab] = useState("list"),
    [forecast, setForecast] = useState(null),
    [error, setError] = useState("");
  return (
    <>
      <Heading title="补能调度">
        <Button
          onClick={() =>
            a.panel(
              "到站预测历史",
              <DataTable
                resource="forecasts"
                filters={{ kind: "queue" }}
                columns={[
                  col("预测编号", "code"),
                  col("名称", "name"),
                  stateCol,
                ]}
              />,
            )
          }
        >
          预测历史
        </Button>
        <Button
          type="primary"
          icon={Plus}
          disabled={!a.can("charging.write")}
          onClick={a.editCharging}
        >
          新增补能安排
        </Button>
      </Heading>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "list", label: "补能计划" },
            { key: "sequence", label: "时序与预测" },
          ]}
          tabBarExtraContent={
            tab === "sequence" ? (
              <div className="row">
                <Button
                  disabled={!a.can("forecast.run")}
                  onClick={async () => {
                    try {
                      const r = await a.execute("charging.optimize");
                      a.showDetail("charging-optimizations", r.id);
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  比较时序调整
                </Button>
                <Button
                  disabled={!a.can("forecast.run")}
                  onClick={async () => {
                    try {
                      const r = await a.execute("forecast.queue", null, {
                        use_reference: true,
                      });
                      setForecast(r);
                      setError("");
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  预测未来需求
                </Button>
              </div>
            ) : null
          }
        />
        {tab === "list" ? (
          <DataTable
            resource="charging"
            columns={[
              col("安排编号", "code"),
              col("车辆 / 任务", "vehicle_id", (_, r) => (
                <>
                  {a.label("vehicle_id", r.vehicle_id)}
                  <p className="small muted">{a.label("task_id", r.task_id)}</p>
                </>
              )),
              col("场站", "station_id", (v) => a.label("station_id", v)),
              col("预计到站", "arrival_at", time),
              col("预计补能量", "quantity_kwh", (v) => format(v) + " kWh"),
              stateCol,
            ]}
          />
        ) : (
          <div className="card-body stack">
            {error && <Alert type="error" message={error} />}
            <div className="scheduling">
              {a.boot.charging.map((c) => (
                <div className="schedule-row" key={c.id}>
                  <button
                    className="inline-link"
                    onClick={() => a.showDetail("charging", c.id)}
                  >
                    {a.label("vehicle_id", c.vehicle_id)}
                  </button>
                  <div className="schedule-track">
                    <button
                      className="schedule-block energy"
                      onClick={() => a.showDetail("charging", c.id)}
                    >
                      {time(c.arrival_at)} ·{" "}
                      {a.label("station_id", c.station_id)} ·{" "}
                      {format(c.quantity_kwh)} kWh
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {forecast ? (
              <>
                <Table
                  rowKey="plan_id"
                  pagination={false}
                  scroll={{ x: 700 }}
                  dataSource={forecast.items}
                  columns={[
                    col("补能计划", "plan_id"),
                    col("场站", "station_id", (v) => a.label("station_id", v)),
                    col("预计服务", "start_at", time),
                    col("等待（分钟）", "wait_minutes"),
                    col("服务（分钟）", "service_minutes"),
                  ]}
                />
                <Source text={forecast.assumptions.join("；")} />
              </>
            ) : (
              <Empty description="暂无预测" />
            )}
          </div>
        )}
      </Card>
    </>
  );
}
export function LoadChart({ series }) {
  const [table, setTable] = useState(false),
    [selected, setSelected] = useState(null),
    rows = series || [],
    max = Math.max(1, ...rows.map((x) => x.actual_kw || x.predicted_kw || 0));
  const path = (key) =>
    rows
      .map((r, i) =>
        r[key] == null
          ? ""
          : `${i === 0 || rows[i - 1][key] == null ? "M" : "L"} ${40 + (i * 700) / Math.max(1, rows.length - 1)} ${210 - (r[key] / max) * 170}`,
      )
      .join(" ");
  return (
    <>
      <div className="row between">
        <span className="muted small">分时负荷 · kW · 测算资料</span>
        <Button size="small" onClick={() => setTable(!table)}>
          {table ? "查看图表" : "查看数据表"}
        </Button>
      </div>
      {table ? (
        <Table
          rowKey="hour"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            col("时段", "hour", (v) => String(v).padStart(2, "0") + ":00"),
            col("实际", "actual_kw", (v) => (v == null ? "缺测" : v)),
            col("预测", "predicted_kw", (v) => (v == null ? "未计算" : v)),
          ]}
        />
      ) : (
        <svg
          className="chart"
          viewBox="0 0 780 250"
          role="img"
          aria-label="分时负荷曲线，提供数据表"
        >
          <path
            d={path("actual_kw")}
            fill="none"
            stroke="var(--info)"
            strokeWidth="3"
          />
          <path
            d={path("predicted_kw")}
            fill="none"
            stroke="var(--success)"
            strokeWidth="2.5"
            strokeDasharray="6 5"
          />
          {rows.map((r, i) =>
            r.actual_kw == null ? null : (
              <g key={r.hour} onClick={() => setSelected(r)}>
                <circle
                  cx={40 + (i * 700) / Math.max(1, rows.length - 1)}
                  cy={210 - (r.actual_kw / max) * 170}
                  r="3"
                  fill="var(--info)"
                />
                {i % 3 === 0 && (
                  <text
                    x={40 + (i * 700) / Math.max(1, rows.length - 1)}
                    y="240"
                    fill="var(--secondary)"
                    fontSize="12"
                    textAnchor="middle"
                  >
                    {r.hour}:00
                  </text>
                )}
              </g>
            ),
          )}
        </svg>
      )}
      <div className="chart-legend">
        <span>━ 实际样例</span>
        <span>┄ 预测情景</span>
        {selected && (
          <span>
            {selected.hour}:00 · {selected.actual_kw} kW
          </span>
        )}
      </div>
    </>
  );
}
export function Energy() {
  const a = useApp(),
    [tab, setTab] = useState("load"),
    [series, setSeries] = useState([]),
    [meter, setMeter] = useState("station"),
    [plan, setPlan] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    list(meter === "station" ? "loads" : "device-loads", {
      pageSize: 100,
      station: "S001",
      device: meter === "station" ? undefined : meter,
    })
      .then((r) => setSeries(r.items.sort((x, y) => x.hour - y.hour)))
      .catch((e) => setError(e.message));
  }, [a.revision, meter]);
  return (
    <>
      <Heading title="能源管理">
        <Select
          aria-label="计量对象"
          value={meter}
          style={{ width: 190 }}
          options={[
            { value: "station", label: "场站独立总表" },
            ...a.boot.devices
              .filter((d) => d.station_id === "S001")
              .map((d) => ({ value: d.id, label: d.name })),
          ]}
          onChange={setMeter}
        />
        <Button
          onClick={() =>
            a.panel(
              "预测历史",
              <DataTable
                resource="forecasts"
                filters={{ kind: "load" }}
                columns={[
                  col("预测编号", "code"),
                  col("预测名称", "name"),
                  stateCol,
                ]}
              />,
            )
          }
        >
          预测历史
        </Button>
        <Button
          disabled={!a.can("forecast.run")}
          onClick={async () => {
            try {
              const r = await a.execute("forecast.load");
              setSeries(r.series);
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          预测分时负荷
        </Button>
      </Heading>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "load", label: "负荷与预测" },
            { key: "plans", label: "策略与计划" },
            { key: "energy-resources", label: "能源资源" },
          ]}
        />
        <div className="card-body stack">
          {error && <Alert type="error" message={error} />}{" "}
          {tab === "energy-resources" ? (
            <>
              <Button
                disabled={!a.can("resource.write")}
                onClick={() => a.createPhysical("energy-resources")}
              >
                登记能源资源
              </Button>
              <DataTable
                resource="energy-resources"
                columns={[
                  col("资源编号", "code"),
                  col("资源名称", "name"),
                  col("类别", "kind"),
                  stateCol,
                ]}
              />
            </>
          ) : tab === "load" ? (
            <LoadChart series={series} />
          ) : (
            <>
              <div className="row">
                <Button
                  disabled={!a.can("energy.write")}
                  onClick={async () =>
                    setPlan(await a.execute("energy.compare"))
                  }
                >
                  比较能源策略
                </Button>
              </div>
              {plan && (
                <div className="note">
                  <strong>{plan.name || "错峰补能协同草案"}</strong>
                  <p>峰值参考 {format(plan.peak_kw)} kW · 不含储能设备控制</p>
                  <Button
                    type="primary"
                    onClick={async () => a.showDetail("energy-plans", plan.id)}
                  >
                    核对协同计划
                  </Button>
                </div>
              )}
              <DataTable
                resource="energy-plans"
                columns={[
                  col("计划编号", "code"),
                  col("策略名称", "name"),
                  col("生成时间", "created_at", time),
                  stateCol,
                ]}
              />
            </>
          )}
        </div>
      </Card>
      <Source text="缺测保留断点；预测情景不作为模型精度通过证据。" />
    </>
  );
}
export function Planning({ deployment = false }) {
  const a = useApp(),
    [point, setPoint] = useState(a.boot.candidates[0]?.id),
    [quantity, setQuantity] = useState(1200),
    [distance, setDistance] = useState(20),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("conditions");
  const title = deployment ? "资源投放" : "场站规划";
  return (
    <>
      <Heading title={title}>
        <Button
          disabled={!a.can("planning.write")}
          onClick={() =>
            a.openForm(
              "布局与阶段比选",
              [
                {
                  key: "candidate_ids",
                  label: "候选点范围",
                  type: "select",
                  multiple: true,
                  required: true,
                  options: a.boot.candidates.map((p) => ({
                    value: p.id,
                    label: p.name,
                  })),
                },
                {
                  key: "daily_quantity",
                  label: "日运输需求（吨）",
                  type: "number",
                  required: true,
                  min: 1,
                },
                {
                  key: "distance_km",
                  label: "参考单趟距离（km）",
                  type: "number",
                  required: true,
                  min: 0.1,
                },
                {
                  key: "hours",
                  label: "每日工时（小时）",
                  type: "number",
                  required: true,
                  min: 1,
                  max: 24,
                },
                {
                  key: "operating_days",
                  label: "年运营天数",
                  type: "number",
                  required: true,
                  min: 1,
                  max: 366,
                },
              ],
              {
                candidate_ids: a.boot.candidates.map((p) => p.id),
                daily_quantity: quantity,
                distance_km: distance,
                hours: 8,
                operating_days: 300,
              },
              async (v) => {
                const r = await a.execute(
                  deployment ? "deployment.compare" : "planning.compare",
                  null,
                  v,
                );
                a.showDetail(deployment ? "deployment" : "planning", r.id);
              },
            )
          }
        >
          布局与阶段比选
        </Button>
        <Button disabled={!a.can("planning.write")} onClick={a.analyzeDemand}>
          运输需求分析
        </Button>
        <Button
          disabled={!a.can("planning.write")}
          onClick={() =>
            a.panel(
              "候选点资料",
              <div className="stack">
                <Button
                  disabled={!a.can("resource.write")}
                  onClick={() => a.createPhysical("candidates")}
                >
                  登记候选点
                </Button>
                <DataTable
                  resource="candidates"
                  columns={[
                    col("候选点", "name"),
                    col("容量（kW）", "capacity_kw"),
                    stateCol,
                  ]}
                />
              </div>,
            )
          }
        >
          候选点资料
        </Button>
      </Heading>
      <Card title="规划条件">
        <div className="card-body">
          <div className="conditions-grid">
            <div className="field">
              <label>候选场站</label>
              <Select
                aria-label="规划候选点"
                value={point}
                onChange={(v) => {
                  setPoint(v);
                  setResult(null);
                }}
                options={a.boot.candidates.map((x) => ({
                  value: x.id,
                  label: x.name + (x.status === "待核实" ? " · 待核实" : ""),
                }))}
              />
            </div>
            <div className="field">
              <label>日运输需求（吨）</label>
              <InputNumber
                aria-label="日运输需求"
                value={quantity}
                onChange={(v) => {
                  setQuantity(v);
                  setResult(null);
                }}
                min={1}
              />
            </div>
            <div className="field">
              <label>单趟距离（km）</label>
              <InputNumber
                aria-label="规划单趟距离"
                value={distance}
                onChange={(v) => {
                  setDistance(v);
                  setResult(null);
                }}
                min={0.1}
              />
            </div>
            <div className="field">
              <label>测算口径</label>
              <div className="read-only">参考条件 · 测算资料</div>
            </div>
          </div>
          <div className="form-footer">
            <Source text="载重、工时和电池配比是测算情景；不代替项目用地、接电与投资审批。" />
            <Button
              type="primary"
              disabled={!a.can("planning.write")}
              onClick={async () => {
                try {
                  setResult(
                    await a.execute(
                      deployment ? "deployment.run" : "planning.run",
                      null,
                      {
                        candidate_id: point,
                        daily_quantity: quantity,
                        distance_km: distance,
                      },
                    ),
                  );
                  setError("");
                  setTab("result");
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              {deployment ? "测算资源投放" : "测算当前条件"}
            </Button>
          </div>
          {error && <Alert type="error" message={error} />}
        </div>
      </Card>
      <div className="grid2">
        <Card title="候选布局">
          <BusinessMap />
        </Card>
        <Card title="规划成果">
          {result ? (
            <div className="card-body stack">
              <Pill>条件推荐</Pill>
              <div className="grid2">
                <Stat label="建议车辆" value={result.vehicles} unit="辆" />
                <Stat label="建议电池" value={result.batteries} unit="组" />
              </div>
              <dl className="kv">
                <dt>预计车次</dt>
                <dd>{result.trips}车次/日</dd>
                <dt>单车次周期</dt>
                <dd>{result.cycle_minutes}分钟</dd>
              </dl>
              <Source text={result.assumptions.join("；")} />
              <Button
                type="primary"
                onClick={() =>
                  a.showDetail(
                    deployment ? "deployment" : "planning",
                    result.id,
                  )
                }
              >
                核对推荐成果
              </Button>
            </div>
          ) : (
            <div className="state-page">
              <Empty description="暂无规划成果" />
            </div>
          )}
        </Card>
      </div>
      <Card title="历史成果">
        <DataTable
          resource={deployment ? "deployment" : "planning"}
          columns={[
            col("成果编号", "code"),
            col("成果名称", "name"),
            col("生成时间", "created_at", time),
            stateCol,
          ]}
        />
      </Card>
    </>
  );
}
export function Reports() {
  return <ReportingWorkspace />;
}

const generic = {
  assets: [
    "资产管理",
    [
      col("资产编号", "code"),
      col("资产名称", "name"),
      col("类型", "kind"),
      col("持有主体", "holder"),
      stateCol,
    ],
  ],
  replacements: [
    "运力合作",
    [
      col("合作编号", "code"),
      col("合作名称", "name"),
      col("合作主体", "partner"),
      col("方案数量", "quantity"),
      stateCol,
    ],
  ],
  entities: [
    "基础资料",
    [
      col("资料编号", "code"),
      col("名称", "name"),
      col("类型", "kind"),
      stateCol,
    ],
  ],
  integrations: [
    "数据管理",
    [
      col("来源编号", "code"),
      col("来源名称", "name"),
      col("接入方式", "connector"),
      col("覆盖率", "coverage", (v) => (v == null ? "—" : v + "%")),
      col("最后同步", "last_sync", time),
      stateCol,
    ],
  ],
  users: [
    "用户权限",
    [
      col("登录账号", "username"),
      col("姓名", "name"),
      col("角色", "role", (v) => (v === "admin" ? "管理员" : "司机")),
      col("账号状态", "enabled", (v) => <Pill>{v ? "有效" : "停用"}</Pill>),
    ],
  ],
  parameters: [
    "系统设置",
    [
      col("参数编号", "code"),
      col("主题", "name"),
      col("依据类型", "evidence_type"),
      col("当前候选", "candidate"),
      stateCol,
    ],
  ],
  alerts: [
    "预警处置",
    [
      col("预警编号", "code"),
      col("关注事件", "name"),
      col("对象", "object"),
      col("等级", "severity", (v) => <Pill>{v}</Pill>),
      col("触发时间", "created_at", time),
      stateCol,
    ],
  ],
};
export function GenericWorkspace({ page }) {
  const a = useApp(),
    [tab, setTab] = useState(page),
    [error, setError] = useState("");
  const [title, columns] = generic[page];
  const resource =
    page === "parameters" && tab === "rules"
      ? "rules"
      : page === "parameters" && tab === "audit"
        ? "audit"
        : page === "integrations" && tab === "quality"
          ? "quality"
          : page === "entities" && tab === "sources"
            ? "sources"
            : page;
  const cols =
    resource === "rules"
      ? [
          col("规则名称", "name"),
          col("对象", "kind"),
          col("参考阈值", "threshold"),
          stateCol,
        ]
      : resource === "audit"
        ? [
            col("业务动作", "action"),
            col("关联对象", "entity_id"),
            col("记录时间", "created_at", time),
          ]
        : resource === "quality"
          ? [
              col("记录编号", "code"),
              col("来源", "name"),
              col("更正内容", "correction"),
              stateCol,
            ]
          : resource === "sources"
            ? [
                col("资料标题", "title"),
                col("类型", "kind"),
                col("发布日期", "published_at"),
                col("引用链接", "url", (v) => (
                  <a href={v} target="_blank" rel="noreferrer">
                    查看依据
                  </a>
                )),
              ]
            : columns;
  return (
    <>
      <Heading title={title}>
        {page === "assets" && (
          <Button
            disabled={!a.can("asset.write")}
            onClick={() =>
              a
                .execute("asset.review-expiry")
                .then((r) => a.message.info("租赁到期 " + r.count + " 项"))
                .catch((e) => a.message.error(e.message))
            }
          >
            核查租赁到期
          </Button>
        )}
        {["assets", "replacements", "entities", "integrations"].includes(
          page,
        ) && (
          <Button
            type="primary"
            disabled={!a.can("resource.write")}
            icon={Plus}
            onClick={() => a.createResource(page)}
          >
            新增
            {page === "assets" ? "资产" : page === "entities" ? "资料" : "记录"}
          </Button>
        )}
        {page === "users" && (
          <Button
            type="primary"
            icon={Plus}
            disabled={!a.can("user.manage")}
            onClick={a.editUser}
          >
            配置账号
          </Button>
        )}
        {page === "alerts" && (
          <Button type="primary" onClick={a.reportAlert}>
            登记异常
          </Button>
        )}
      </Heading>
      <Card>
        {["parameters", "integrations", "entities"].includes(page) && (
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={
              page === "parameters"
                ? [
                    { key: page, label: "参数版本" },
                    { key: "audit", label: "审计记录" },
                    { key: "rules", label: "预警规则" },
                  ]
                : page === "integrations"
                  ? [
                      { key: page, label: "数据来源" },
                      { key: "quality", label: "质量纠正" },
                    ]
                  : [
                      { key: page, label: "业务资料" },
                      { key: "sources", label: "公开参考" },
                    ]
            }
          />
        )}
        {resource === "rules" && (
          <div className="card-body">
            <Button disabled={!a.can("resource.write")} onClick={a.createRule}>
              登记测算规则
            </Button>
          </div>
        )}
        <DataTable
          key={resource}
          resource={resource}
          columns={cols}
          onView={
            resource === "sources"
              ? (r) =>
                  a.panel(
                    "公开依据",
                    <div className="stack">
                      <h2>{r.title}</h2>
                      <p>{r.limitations}</p>
                      <a href={r.url} target="_blank" rel="noreferrer">
                        打开原始资料
                      </a>
                    </div>,
                  )
              : undefined
          }
        />
      </Card>
    </>
  );
}
export function Monitoring() {
  const a = useApp(),
    [selected, setSelected] = useState(a.boot.vehicles[0]?.id),
    [trace, setTrace] = useState(null),
    [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!playing || !trace?.items.length) return;
    const timer = setInterval(
      () =>
        setCursor((n) => {
          if (n >= trace.items.length - 1) {
            setPlaying(false);
            return n;
          }
          return n + 1;
        }),
      600,
    );
    return () => clearInterval(timer);
  }, [playing, trace]);
  return (
    <>
      <Heading title="运行监测">
        <div className="row">
          <Select
            aria-label="监测车辆"
            value={selected}
            onChange={setSelected}
            style={{ width: 180 }}
            options={a.boot.vehicles.map((v) => ({
              value: v.id,
              label: v.code,
            }))}
          />
          <Button
            onClick={async () => {
              try {
                const r = await request("/api/telemetry/" + selected);
                setTrace({ ...r, items: r.items.reverse() });
                setCursor(0);
                setPlaying(false);
                setError("");
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            历史轨迹
          </Button>
        </div>
      </Heading>
      <Card title="车辆与场站分布">
        <BusinessMap trace={trace?.items} cursor={cursor} />
      </Card>
      {error && <Alert type="error" message={error} />}{" "}
      {trace && (
        <Card title="历史片段 · 测算">
          <div className="card-body stack">
            <div className="row between">
              <Button
                onClick={() => {
                  if (cursor >= trace.items.length - 1) setCursor(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? "暂停回放" : "回放采样"}
              </Button>
              <span>
                {time(trace.items[cursor]?.occurred_at)} ·{" "}
                {trace.items[cursor]?.soc}%
              </span>
            </div>
            <Slider
              aria-label="轨迹采样时刻"
              min={0}
              max={Math.max(0, trace.items.length - 1)}
              value={cursor}
              onChange={(n) => {
                setCursor(n);
                setPlaying(false);
              }}
            />
            <Source text="按来源采样回放；间隔超过10分钟不连接为真实路线。无发生事件不编造运输节点。" />
            {trace.events?.length > 0 && (
              <Table
                rowKey="id"
                pagination={false}
                dataSource={trace.events}
                columns={[
                  col("节点", "kind"),
                  col("发生", "occurred_at", time),
                  col("接收", "received_at", time),
                ]}
              />
            )}
            <Table
              rowKey="id"
              size="small"
              scroll={{ x: 500 }}
              pagination={{ pageSize: 10 }}
              dataSource={trace.items}
              columns={[
                col("时间", "occurred_at", time),
                col("经度", "longitude", (v) => format(v, 5)),
                col("纬度", "latitude", (v) => format(v, 5)),
                col("SOC", "soc", (v) => format(v) + "%"),
                col("速度", "speed_kmh", (v) => format(v) + " km/h"),
              ]}
            />
          </div>
        </Card>
      )}
      <Card title="车辆状态">
        <DataTable
          resource="vehicles"
          columns={[
            col("车辆", "code"),
            col("SOC", "soc", (v) => format(v) + "%"),
            col("当前司机", "driver_id", (v) => a.label("driver_id", v)),
            col("来源时间", "source_time", time),
            col("数据状态", "data_state", (v) => <Pill>{v || "待核实"}</Pill>),
            stateCol,
          ]}
        />
      </Card>
    </>
  );
}
export function Assistant() {
  return <AssistantWorkspace />;
}
