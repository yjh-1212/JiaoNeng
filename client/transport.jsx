import React, { useState, useEffect } from "react";
import { Button } from "@lobehub/ui";
import {
  Select,
  InputNumber,
  Checkbox,
  Tabs,
  Steps,
  Table,
  Alert,
  Empty,
} from "antd";
import { Plus, CheckCircle2, ArrowRight } from "lucide-react";
import { useApp } from "./context";
import { detail, list } from "./api";
import {
  Heading,
  Card,
  DataTable,
  col,
  stateCol,
  Pill,
  Source,
  format,
  money,
  time,
} from "./ui";
import BusinessMap from "./map";
export function Simulation() {
  const a = useApp(),
    available = (o) =>
      a.boot.vehicles.filter(
        (v) =>
          v.status === "可用" &&
          v.driver_id &&
          v.owner_id === o?.owner_id &&
          a.boot.drivers.some(
            (d) =>
              d.id === v.driver_id &&
              d.status === "可用" &&
              d.owner_id === o?.owner_id,
          ) &&
          !a.boot.tasks.some(
            (t) =>
              ["待接收", "已接收", "执行中", "待核验", "退回补充"].includes(
                t.status,
              ) &&
              (t.vehicle_id === v.id || t.driver_id === v.driver_id),
          ),
      ),
    orders = a.boot.orders.filter((o) => o.status === "已确认"),
    focusedOrder =
      orders.find((o) => o.id === a.intentDraft?.order_id) || orders[0],
    [orderId, setOrder] = useState(a.intentDraft?.order_id || orders[0]?.id),
    [vehicles, setVehicles] = useState(
      a.intentDraft?.vehicle_ids ||
        available(focusedOrder)
          .slice(0, 2)
          .map((v) => v.id),
    ),
    [stationId, setStation] = useState(
      a.intentDraft?.station_id ||
        a.boot.stations.find(
          (s) => s.owner_id === focusedOrder?.owner_id && s.status === "运营中",
        )?.id,
    ),
    [soc, setSoc] = useState(a.intentDraft?.soc ?? 74),
    [reserve, setReserve] = useState(a.intentDraft?.reserve_soc ?? 20),
    [reference, setReference] = useState(true),
    [sim, setSim] = useState(null),
    [selected, setSelected] = useState("A"),
    [collapsed, setCollapsed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (a.intentDraft?.simulation_id)
      detail("simulations", a.intentDraft.simulation_id)
        .then((r) => {
          setSim(r);
          setSelected(r.selected || "A");
        })
        .catch((e) => setError(e.message));
  }, [a.intentDraft?.simulation_id]);
  const order = orders.find((o) => o.id === orderId),
    candidate = sim?.candidates.find((c) => c.id === selected);
  const change = (fn) => (v) => {
    fn(v);
    setDirty(true);
  };
  async function run() {
    setBusy(true);
    setError("");
    try {
      const r = await a.execute("simulation.run", null, {
        order_id: orderId,
        vehicle_ids: vehicles,
        station_id: stationId,
        soc,
        reserve_soc: reserve,
        use_reference: reference,
      });
      setSim(r.simulation);
      setSelected(r.simulation.candidates.find((c) => c.feasible)?.id || "A");
      setDirty(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="simulation-page">
      <Heading title="交能推演" />
      <Card
        title="运输与补能条件"
        className="sim-conditions"
        extra={
          <Button type="text" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "展开条件" : "收起条件"}
          </Button>
        }
      >
        <div className="card-body">
          {collapsed ? (
            <div className="row between">
              <span>
                {order?.code} · {format(order?.quantity_kg / 1000)} t ·{" "}
                {vehicles.length}辆
              </span>
              <Pill>参考测算</Pill>
            </div>
          ) : (
            <>
              <div className="conditions-grid">
                <div className="field">
                  <label>来源订单</label>
                  <Select
                    disabled={busy}
                    aria-label="来源订单"
                    value={orderId}
                    onChange={change((v) => {
                      setOrder(v);
                      const o = orders.find((o) => o.id === v);
                      setStation(
                        a.boot.stations.find(
                          (s) =>
                            s.owner_id === o?.owner_id && s.status === "运营中",
                        )?.id,
                      );
                      setVehicles(
                        available(o)
                          .slice(0, 2)
                          .map((x) => x.id),
                      );
                    })}
                    options={orders.map((o) => ({
                      value: o.id,
                      label: o.code,
                    }))}
                  />
                </div>
                <div className="field">
                  <label>装货位置</label>
                  <div className="read-only">{order?.origin || "—"}</div>
                </div>
                <div className="field">
                  <label>卸货位置</label>
                  <div className="read-only">{order?.destination || "—"}</div>
                </div>
                <div className="field">
                  <label>计划运量</label>
                  <div className="read-only">
                    {format(order?.quantity_kg / 1000)} t
                  </div>
                </div>
                <div className="field field-wide">
                  <label>运输时窗</label>
                  <div className="read-only">
                    {time(order?.start_at)} — {time(order?.finish_at)}
                  </div>
                </div>
                <div className="field field-wide">
                  <label>候选车辆</label>
                  <Select
                    disabled={busy}
                    mode="multiple"
                    optionFilterProp="label"
                    aria-label="候选车辆"
                    value={vehicles}
                    onChange={change(setVehicles)}
                    options={available(order).map((v) => ({
                      value: v.id,
                      label: v.code,
                    }))}
                  />
                </div>
                <div className="field">
                  <label>补能场站</label>
                  <Select
                    disabled={busy}
                    aria-label="补能场站"
                    value={stationId}
                    onChange={change(setStation)}
                    options={a.boot.stations
                      .filter((s) => s.owner_id === order?.owner_id)
                      .map((s) => ({ value: s.id, label: s.name }))}
                  />
                </div>
                <div className="field">
                  <label>初始SOC（%）</label>
                  <InputNumber
                    disabled={busy}
                    aria-label="初始SOC"
                    min={0}
                    max={100}
                    value={soc}
                    onChange={change(setSoc)}
                  />
                </div>
                <div className="field">
                  <label>到站余量（%）</label>
                  <InputNumber
                    disabled={busy}
                    aria-label="到站余量"
                    min={5}
                    max={50}
                    value={reserve}
                    onChange={change(setReserve)}
                  />
                </div>
                <div className="field">
                  <label>单趟运输距离</label>
                  <div className="read-only">
                    {order?.distance_km} km · 测算
                  </div>
                </div>
              </div>
              <div className="form-footer">
                <Checkbox
                  disabled={busy}
                  checked={reference}
                  onChange={(e) => {
                    setReference(e.target.checked);
                    setDirty(true);
                  }}
                >
                  参考条件测算
                </Checkbox>
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!order || !a.can("simulation.run")}
                  onClick={run}
                >
                  {sim ? "调整条件重算" : "开始推演"}
                </Button>
              </div>
            </>
          )}
          {error && (
            <Alert
              className="inline-error"
              type="error"
              showIcon
              message={error}
            />
          )}
        </div>
      </Card>
      {dirty && sim && (
        <Alert type="warning" message="条件已变化，请重算后确认" />
      )}
      <div className="simulation-results">
        <div className="simulation-map-area">
          <BusinessMap
            order={order}
            candidate={dirty ? null : candidate}
            stationId={stationId}
          />
          <div className="phase-timeline">
            {[
              [order?.start_at, "装货 / 发车", order?.origin],
              [candidate?.finish_at, "交付 / 返程", order?.destination],
            ].map(([v, l, place]) => (
              <div className="phase" key={l}>
                <small>{l} · 预计</small>
                <strong>{place || "—"}</strong>
                <p>{time(v)}</p>
              </div>
            ))}
          </div>
        </div>
        <Card
          className="simulation-solutions"
          title="运输方案"
          extra={
            <span className="small">
              {sim ? <Pill>{sim.status}</Pill> : "0 条方案"}
            </span>
          }
        >
          <div className="sim-right">
            {!sim ? (
              <Empty description="暂无方案" />
            ) : (
              <div className="stack">
                <div className="candidate-grid">
                  {sim.candidates.map((c) => (
                    <button
                      key={c.id}
                      className={
                        "candidate-card " + (selected === c.id ? "chosen" : "")
                      }
                      aria-pressed={selected === c.id}
                      onClick={() => setSelected(c.id)}
                    >
                      <strong>{c.name}</strong>
                      <b>{money(c.known_cost_cents)}</b>
                      <small>补能费用 · 等待 {c.wait_minutes} 分钟</small>
                      <Pill>{c.feasible ? "条件可行" : "时效/电量冲突"}</Pill>
                    </button>
                  ))}
                </div>
                {candidate && (
                  <>
                    <h2>方案详情</h2>
                    <div className="constraint-row">
                      <CheckCircle2 size={15} />
                      {candidate.feasible ? "参考约束通过" : "未满足参考约束"}
                    </div>
                    <dl className="candidate-facts">
                      <div>
                        <dt>用车 / 车次</dt>
                        <dd>
                          {candidate.assignments.length}辆 / {candidate.trips}
                          车次
                        </dd>
                      </div>
                      <div>
                        <dt>预计完成</dt>
                        <dd>{time(candidate.finish_at)}</dd>
                      </div>
                      <div>
                        <dt>预计里程</dt>
                        <dd>{format(candidate.distance_km)} km</dd>
                      </div>
                      <div>
                        <dt>预计用电</dt>
                        <dd>{format(candidate.energy_kwh)} kWh</dd>
                      </div>
                    </dl>
                    {candidate.constraint_violations?.length > 0 && (
                      <Alert
                        type="warning"
                        message={candidate.constraint_violations
                          .map(
                            (x) =>
                              x.kind +
                              " " +
                              (x.vehicle_id || x.object_id || ""),
                          )
                          .join("；")}
                      />
                    )}
                    <div className="simulation-detail-actions">
                      <Button
                        onClick={() =>
                          a.panel(
                            "方案节点时序",
                            <Table
                              rowKey={(_, i) => i}
                              size="small"
                              scroll={{ x: 650 }}
                              pagination={{ pageSize: 10 }}
                              dataSource={candidate.assignments.flatMap((x) =>
                                x.nodes.map((n) => ({
                                  ...n,
                                  vehicle_id: x.vehicle_id,
                                })),
                              )}
                              columns={[
                                col("车辆", "vehicle_id", (v) =>
                                  a.label("vehicle_id", v),
                                ),
                                col("节点", "kind"),
                                col("开始", "start_at", time),
                                col("结束", "finish_at", time),
                              ]}
                            />,
                          )
                        }
                      >
                        节点时序
                      </Button>
                      <Source
                        row={sim}
                        text={candidate.exclusions.join("；")}
                      />
                    </div>
                    <div className="route-segments">
                      <div>
                        <h3>{order?.origin}</h3>
                      </div>
                      <div>
                        <h3>
                          {
                            a.boot.stations.find(
                              (s) => s.id === candidate.station_id,
                            )?.name
                          }
                        </h3>
                      </div>
                      <div>
                        <h3>{order?.destination}</h3>
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        a.panel(
                          "方案对比",
                          <Table
                            rowKey="id"
                            pagination={false}
                            scroll={{ x: 460 }}
                            dataSource={sim.candidates}
                            columns={[
                              col("方案", "name"),
                              col("已知费用", "known_cost_cents", money),
                              col("等待（分钟）", "wait_minutes"),
                              col("完成", "finish_at", time),
                            ]}
                          />,
                        )
                      }
                    >
                      方案对比
                    </Button>
                    <div className="plan-confirm">
                      {sim.status === "已确认" ? (
                        <Button
                          type="primary"
                          className="form-primary"
                          onClick={() => a.go("tasks")}
                        >
                          核对派单
                        </Button>
                      ) : (
                        <Button
                          type="primary"
                          className="form-primary"
                          disabled={
                            dirty ||
                            !candidate.feasible ||
                            !a.can("simulation.confirm")
                          }
                          onClick={() =>
                            a.confirm(
                              "确认选中方案",
                              `${order?.code} · ${candidate.name}；形成待派发任务，不直接派单。`,
                              async () => {
                                await a.execute("simulation.confirm", sim.id, {
                                  expected_version: sim.version,
                                  candidate_id: selected,
                                });
                                setSim(await detail("simulations", sim.id));
                              },
                            )
                          }
                        >
                          确认选中方案
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
export { default as Tasks } from "./task-workbench";
