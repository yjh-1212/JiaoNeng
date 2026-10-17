import React, { useEffect, useRef, useState } from "react";
import { Button, Alert, Pagination, Tabs, Empty, Spin } from "antd";
import { RefreshCw } from "lucide-react";
import { useApp } from "./context";
import { request } from "./api";
import { Card, Pill, format, time, money } from "./ui";
import { EnergyForm, field, localTime, iso } from "./energy-panels";
import "./energy-workbench.css";

function useDriverEnergy(query) {
  const a = useApp(),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0),
    seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    request("/api/energy-workspace/charging?" + new URLSearchParams(query))
      .then((r) => {
        if (n === seq.current) {
          setData(r);
          setError("");
        }
      })
      .catch((e) => {
        if (n === seq.current) setError(e.message);
      })
      .finally(() => {
        if (n === seq.current) setLoading(false);
      });
    return () => seq.current++;
  }, [JSON.stringify(query), a.revision, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
export function DriverEnergyHint({ task }) {
  const a = useApp(),
    { data, error } = useDriverEnergy({
      task: task.id,
      pageSize: 1,
      driver_stage: "pending",
    }),
    row = data?.items?.[0];
  if (error) return <Alert type="warning" title={error} />;
  if (!row) return null;
  return (
    <Card title="下一次补能">
      <strong>{row.station_name}</strong>
      <p>
        {time(row.arrival_at)} ·{" "}
        {row.station_mode === "换电"
          ? `换电 ${format(row.capacity_kwh)} kWh规格`
          : `预计充电 ${format(row.quantity_kwh)} kWh`}
      </p>
      <Button onClick={() => a.go("m-energy", { task_id: task.id })}>
        查看本任务补能安排
      </Button>
    </Card>
  );
}
export default function DriverEnergy() {
  const a = useApp(),
    [query, setQuery] = useState(() => ({
      task:
        a.intentDraft?.task_id ||
        new URLSearchParams(location.hash.split("?")[1] || "").get("task") ||
        "",
      driver_stage: "pending",
      page: 1,
      pageSize: 10,
    })),
    [form, setForm] = useState(null);
  const { data, error, loading, reload } = useDriverEnergy(query);
  useEffect(() => {
    setQuery((q) => ({
      ...q,
      task:
        a.intentDraft?.task_id ||
        new URLSearchParams(location.hash.split("?")[1] || "").get("task") ||
        "",
      page: 1,
    }));
  }, [a.intentDraft]);
  function arrive(r) {
    setForm({
      title: "反馈到站",
      row: r,
      resource: "charging",
      summary: `${r.station_name} · ${r.vehicle_code}`,
      initial: { arrived_at: localTime() },
      fields: [
        field("arrived_at", "实际到站时间", "datetime"),
        field("evidence", "到站说明", "textarea"),
      ],
      submit: (v, version, key) =>
        a.execute(
          "driver.arrive",
          null,
          {
            ...v,
            arrived_at: iso(v.arrived_at),
            plan_id: r.id,
            expected_version: version,
          },
          key,
        ),
    });
  }
  function report(r) {
    setForm({
      title: "补能异常反馈",
      fields: [
        field("reason", "异常情况", "textarea"),
        field("evidence", "现场依据", "textarea"),
      ],
      submit: (v, _, key) =>
        a.execute("driver.energy-alert", null, { ...v, plan_id: r.id }, key),
    });
  }
  return (
    <>
      <div className="row between">
        <span className="muted small">本人有效补能安排</span>
        <Button
          aria-label="刷新补能安排"
          icon={<RefreshCw size={15} />}
          onClick={reload}
        >
          刷新
        </Button>
      </div>
      {query.task && (
        <Alert
          type="info"
          title="当前任务补能安排"
          action={
            <Button
              size="small"
              onClick={() => {
                setQuery((q) => ({ ...q, task: "", page: 1 }));
                history.replaceState(null, "", "#m-energy");
              }}
            >
              查看全部
            </Button>
          }
        />
      )}
      <Tabs
        activeKey={query.driver_stage}
        onChange={(driver_stage) =>
          setQuery((q) => ({ ...q, driver_stage, page: 1 }))
        }
        items={[
          ["pending", "待执行"],
          ["running", "进行中"],
          ["ended", "已结束"],
        ].map(([key, label]) => ({
          key,
          label: `${label} ${data?.driver_counts?.[key] || 0}`,
        }))}
      />
      {error && <Alert type="error" title={error} />}
      <Spin spinning={loading}>
        {(data?.items || []).map((r) => (
          <Card key={r.id} className="driver-energy-card">
            <div className="row between">
              <strong>{r.station_name}</strong>
              <Pill>
                {r.status === "已取消" ? "已取消" : r.execution_status}
              </Pill>
            </div>
            <p className="muted small">
              {r.code} · {r.vehicle_code}
            </p>
            <div className="task-facts">
              <span>
                预计到站<strong>{time(r.arrival_at)}</strong>
              </span>
              <span>
                {r.station_mode === "换电" ? "换电规格" : "预计补能"}
                <strong>
                  {format(
                    r.station_mode === "换电" ? r.capacity_kwh : r.quantity_kwh,
                  )}{" "}
                  kWh
                </strong>
              </span>
            </div>
            <p className="small">
              预计服务结束 {time(r.finish_at)} ·{" "}
              {r.wait_minutes == null
                ? "等待待测算"
                : `参考等待${format(r.wait_minutes)}分钟`}
            </p>
            {r.visit && (
              <p className="small">
                到站 {time(r.visit.arrived_at)}
                {r.visit.device_id ? " · " + r.visit.device_id : ""}
                {r.visit.start_at ? " · 开始 " + time(r.visit.start_at) : ""}
              </p>
            )}
            {r.sessions.map((s) => (
              <p key={s.id} className="small">
                实际 {format(s.quantity_kwh)} kWh · {s.status}
              </p>
            ))}
            <p className="driver-change">
              版本 {r.version}
              {r.adjustment_reason || r.review_evidence
                ? " · 调整：" + (r.adjustment_reason || r.review_evidence)
                : ""}
              {r.risks.length ? " · " + r.risks.join("；") : ""}
            </p>
            <div className="energy-inline-actions">
              {r.task_id && (
                <Button onClick={() => a.go("m-tasks", { task_id: r.task_id })}>
                  查看关联任务
                </Button>
              )}
              {r.stage !== "ended" && (
                <>
                  {Number.isFinite(r.longitude) &&
                    Number.isFinite(r.latitude) && (
                      <a
                        className="ant-btn ant-btn-default"
                        href={`https://uri.amap.com/navigation?to=${r.longitude},${r.latitude},${encodeURIComponent(r.station_name)}&mode=car&coordinate=gaode&callnative=1`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        导航到站
                      </a>
                    )}
                  {r.status === "已确认" && !r.visit && !r.sessions.length && (
                    <Button type="primary" onClick={() => arrive(r)}>
                      反馈到站
                    </Button>
                  )}
                  <Button onClick={() => report(r)}>报告异常</Button>
                </>
              )}
            </div>
          </Card>
        ))}
        {!loading && !data?.items?.length && (
          <Empty description="暂无此类补能安排" />
        )}
      </Spin>
      <Pagination
        simple
        current={query.page}
        total={data?.total || 0}
        pageSize={10}
        onChange={(page) => setQuery((q) => ({ ...q, page }))}
      />
      {form && (
        <EnergyForm
          config={form}
          onClose={() => setForm(null)}
          onDone={reload}
        />
      )}
    </>
  );
}
