import React, { useState, useEffect } from "react";
import { Button } from "@lobehub/ui";
import { Select, Tabs, Table, Alert } from "antd";
import { useApp } from "./context";
import { request } from "./api";
import {
  Heading,
  Card,
  Stat,
  col,
  DataTable,
  Pill,
  format,
  money,
  Source,
} from "./ui";
export default function ReportingWorkspace() {
  const a = useApp(),
    [filters, setFilters] = useState({}),
    [period, setPeriod] = useState("all"),
    [tab, setTab] = useState("costs"),
    [report, setReport] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    request(
      "/api/reports?" +
        new URLSearchParams(
          Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
        ),
    )
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [JSON.stringify(filters), a.revision]);
  const s = report?.summary;
  return (
    <>
      <Heading title="经营分析">
        <Button
          type="primary"
          disabled={!a.can("cost.write")}
          onClick={() => a.editCost()}
        >
          登记费用
        </Button>
      </Heading>
      <Card>
        <div className="query-bar">
          <Select
            aria-label="统计区间"
            value={period}
            style={{ width: 150 }}
            options={[
              { value: "all", label: "全部区间" },
              { value: "7", label: "最近7天" },
              { value: "30", label: "最近30天" },
            ]}
            onChange={(v) => {
              setPeriod(v);
              setFilters((f) => ({
                ...f,
                from:
                  v === "all"
                    ? undefined
                    : new Date(Date.now() - Number(v) * 86400000).toISOString(),
                to: undefined,
              }));
            }}
          />
          <Select
            aria-label="统计主体"
            allowClear
            placeholder="全部主体"
            style={{ width: 230 }}
            value={filters.owner}
            options={a.boot.organizations.map((o) => ({
              value: o.id,
              label: o.name,
            }))}
            onChange={(owner) => setFilters((f) => ({ ...f, owner }))}
          />
          <Select
            aria-label="统计场站"
            allowClear
            placeholder="全部场站"
            style={{ width: 200 }}
            value={filters.station}
            options={a.boot.stations.map((o) => ({
              value: o.id,
              label: o.name,
            }))}
            onChange={(station) => setFilters((f) => ({ ...f, station }))}
          />
          <Button
            onClick={() => {
              setFilters({});
              setPeriod("all");
            }}
          >
            重置范围
          </Button>
          <Source text={report?.scope?.time_basis} />
        </div>
      </Card>
      {error && <Alert type="error" message={error} />}
      <div className="grid3">
        <Stat
          label="已知预计费用"
          value={s ? money(s.estimated_cost_cents) : "—"}
          onClick={() => setTab("costs")}
        />
        <Stat
          label="已核验实际费用"
          value={s ? money(s.actual_cost_cents) : "—"}
          onClick={() => setTab("costs")}
        />
        <Stat
          label="已核验交付量"
          value={format(s?.verified_tonnes)}
          unit="吨"
          onClick={() => setTab("tasks")}
        />
      </div>
      <Card title="费用与运营结果">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "costs", label: "运输成本" },
            { key: "energy-costs", label: "能源费用" },
            { key: "tasks", label: "任务差异" },
            { key: "vehicle", label: "按车辆" },
            { key: "station", label: "按场站" },
            { key: "reports", label: "分析报表" },
          ]}
        />
        {["costs", "energy-costs"].includes(tab) ? (
          <DataTable
            key={tab + JSON.stringify(filters)}
            resource="costs"
            filters={filters}
            columns={[
              col("费用编号", "code"),
              col("关联任务", "task_id", (v) => a.label("task_id", v)),
              col("说明", "name"),
              col("属性", "nature", (v) => <Pill>{v}</Pill>),
              col("金额", "amount_cents", money),
              col("包含费用", "included"),
              col("状态", "status", (v) => <Pill>{v}</Pill>),
            ]}
          />
        ) : tab === "tasks" ? (
          <Table
            size="small"
            rowKey="id"
            scroll={{ x: 900 }}
            dataSource={report?.details || []}
            columns={[
              col("任务", "code", (_, r) => (
                <Button type="link" onClick={() => a.showDetail("tasks", r.id)}>
                  {r.code}
                </Button>
              )),
              col("核验量（吨）", "verified_kg", (v) => format(v / 1000)),
              col("预计", "expected_cents", money),
              col("实际", "actual_cents", money),
              col("差异", "difference_cents", (v) =>
                v == null ? "不可比" : money(v),
              ),
              col("缺项", "missing_categories", (v) => v.join("、")),
              col("单位成本（元/吨）", "unit_cost_cents_per_tonne", (v) =>
                v == null ? "—" : format(v / 100, 2),
              ),
            ]}
          />
        ) : ["vehicle", "station"].includes(tab) ? (
          <Table
            rowKey="id"
            size="small"
            dataSource={
              report?.[tab === "vehicle" ? "by_vehicle" : "by_station"] || []
            }
            columns={[
              col("业务对象", "id", (v) =>
                a.label(tab === "vehicle" ? "vehicle_id" : "station_id", v),
              ),
              col("任务数", "count"),
              col("核验交付（吨）", "verified_kg", (v) => format(v / 1000)),
              col("预计费用", "expected_cents", money),
              col("核验费用", "actual_cents", money),
            ]}
          />
        ) : (
          <div className="card-body grid3">
            <Stat
              label="核验补能电量"
              value={format(s?.actual_energy)}
              unit="kWh"
              onClick={() => a.go("stations")}
            />
            <Stat
              label="当前任务"
              value={s?.active_tasks ?? "—"}
              onClick={() => a.go("tasks")}
            />
            <Stat
              label="待处置事件"
              value={s?.open_alerts ?? "—"}
              onClick={() => a.go("alerts")}
            />
          </div>
        )}
      </Card>
      <Source text="预计与核验费用分列；完整类别或核验交付量缺失时不计算完整单位成本。" />
    </>
  );
}
