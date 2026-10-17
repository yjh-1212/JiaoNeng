import { AdvancedRecord } from "./advanced";
import React, { useState, useEffect, useRef } from "react";
import { Button, Input, DraggablePanel } from "@lobehub/ui";
import {
  Table,
  Select,
  Modal,
  InputNumber,
  Input as AntInput,
  Empty,
  Tabs,
  Alert,
  Spin,
} from "antd";
import { Search, X, Info, ChevronRight } from "lucide-react";
import { useApp } from "./context";
import { list, detail } from "./api";
export const format = (n, d = 1) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: d });
export const money = (c) => "¥ " + format(c / 100, 2);
export const time = (s) =>
  s
    ? new Date(s).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
export function Pill({ children }) {
  const label = String(children ?? "待核实"),
    cls = /关闭|已核验|已完成|已接收|可用|在线|已确认/.test(label)
      ? "success"
      : /失败|离线|退回|终止/.test(label)
        ? "danger"
        : /待|草稿|预测|条件|参考/.test(label)
          ? "warning"
          : "info";
  return (
    <span className={"pill " + cls}>
      <span className="status-dot" />
      {label}
    </span>
  );
}
export const Heading = ({ title, children }) => {
  const actions = React.Children.toArray(children);
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {actions.length > 0 && (
        <header className="page-action-bar">
          <div className="row actions">{actions}</div>
        </header>
      )}
    </>
  );
};
export const Card = ({ title, extra, children, className = "" }) => (
  <section className={"card " + className}>
    {(title || extra) && (
      <header className="card-head">
        <h2>{title}</h2>
        <div>{extra}</div>
      </header>
    )}
    {children}
  </section>
);
export const col = (title, key, render, extra = {}) => ({
  title,
  dataIndex: key,
  key,
  render,
  ...extra,
});
export const stateCol = col("状态", "status", (v) => <Pill>{v}</Pill>, {
  width: 128,
});
export function Source({ row, text }) {
  const a = useApp();
  return (
    <button
      className="source-note"
      aria-label="查看来源与口径"
      title="来源与口径"
      onClick={() =>
        a.panel(
          "来源与口径",
          <div className="stack">
            <Pill>{row?.source_label || "待核实资料"}</Pill>
            <h3>当前依据</h3>
            <p>
              {text ||
                row?.evidence ||
                row?.price_basis ||
                "请结合原始业务单据、资料来源和核验记录确认。"}
            </p>
            <dl className="kv">
              <dt>数据时间</dt>
              <dd>
                {time(
                  row?.source_time || row?.created_at || a.boot.server_time,
                )}
              </dd>
              <dt>适用范围</dt>
              <dd>当前记录及关联业务；公开车型参数需结合具体工况核验</dd>
              <dt>实际运行依据</dt>
              <dd>以项目车型、合同、设备与核验资料为准</dd>
            </dl>
          </div>,
        )
      }
    >
      <Info size={15} />
    </button>
  );
}
export const Stat = ({ label, value, unit, onClick }) => (
  <button className="stat" onClick={onClick}>
    <span>{label}</span>
    <strong>
      {value}
      <small>{unit}</small>
    </strong>
    <ChevronRight size={16} />
  </button>
);
export function DataTable({
  resource,
  columns,
  onView,
  extra,
  selection,
  onSelection,
  filters = {},
  emptyAction,
}) {
  const a = useApp(),
    [query, setQuery] = useState({ q: "", status: "", page: 1, pageSize: 10 }),
    [data, setData] = useState({ items: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const requestId = useRef(0);
  async function load() {
    const sequence = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await list(resource, { ...query, ...filters });
      if (sequence === requestId.current) setData(result);
    } catch (e) {
      if (sequence === requestId.current) setError(e.message);
    } finally {
      if (sequence === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(load, query.q ? 180 : 0);
    return () => {
      clearTimeout(t);
      requestId.current++;
    };
  }, [resource, JSON.stringify(query), JSON.stringify(filters), a.revision]);
  const cols = [...columns];
  if (onView !== false)
    cols.push({
      key: "action",
      title: "操作",
      width: 88,
      fixed: "right",
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          onClick={() => (onView ? onView(r) : a.showDetail(resource, r.id))}
        >
          查看
        </Button>
      ),
    });
  return (
    <div className="table-workspace">
      <div className="query-bar">
        <Input
          aria-label="搜索业务记录"
          prefix={<Search size={15} />}
          placeholder="编号、名称或关联对象"
          allowClear
          value={query.q}
          onChange={(e) => {
            setQuery({ ...query, q: e.target.value, page: 1 });
            onSelection?.([]);
          }}
        />
        <Select
          aria-label="状态筛选"
          placeholder="全部状态"
          allowClear
          style={{ width: 150 }}
          value={query.status || undefined}
          options={[
            ...new Set(data.items.map((r) => r.status).filter(Boolean)),
          ].map((value) => ({ value, label: value }))}
          onChange={(v) => {
            setQuery({ ...query, status: v || "", page: 1 });
            onSelection?.([]);
          }}
        />
        {a.user.role === "admin" && a.boot.organizations.length > 1 && (
          <Select
            aria-label="主体筛选"
            allowClear
            placeholder="全部主体"
            style={{ width: 210 }}
            value={query.owner}
            options={a.boot.organizations.map((o) => ({
              value: o.id,
              label: o.name,
            }))}
            onChange={(owner) => {
              setQuery({ ...query, owner, page: 1 });
              onSelection?.([]);
            }}
          />
        )}
        <Button
          onClick={() => {
            setQuery({ q: "", status: "", page: 1, pageSize: 10 });
            onSelection?.([]);
          }}
        >
          重置
        </Button>
        {extra}
        <span className="query-count">{data.total} 条</span>
      </div>
      {selection?.length > 0 && (
        <div className="selection-bar">
          已选 {selection.length} 项{emptyAction}
          <Button type="link" onClick={() => onSelection([])}>
            清除选择
          </Button>
        </div>
      )}
      {error ? (
        <div className="card-body">
          <Alert
            type="error"
            showIcon
            message={error}
            action={<Button onClick={load}>重试</Button>}
          />
        </div>
      ) : (
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={data.items}
          columns={cols}
          scroll={{ x: Math.max(720, cols.length * 115) }}
          rowSelection={
            selection
              ? { selectedRowKeys: selection, onChange: onSelection }
              : undefined
          }
          onChange={(pagination, filters, sorter) =>
            setQuery({
              ...query,
              page: pagination.current,
              pageSize: pagination.pageSize,
              sort: sorter.field,
              direction: sorter.order === "ascend" ? "asc" : "desc",
            })
          }
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total: data.total,
            pageSizeOptions: [10, 20, 50, 100],
            showSizeChanger: true,
            showTotal: (t) => "共 " + t + " 条",
          }}
          locale={{
            emptyText: (
              <Empty
                description={
                  query.q || query.status ? "没有符合条件的记录" : "暂无记录"
                }
              />
            ),
          }}
        />
      )}
    </div>
  );
}
export const labels = {
  code: "业务编号",
  name: "名称",
  owner_id: "归属主体",
  vehicle_id: "关联车辆",
  driver_id: "当前司机",
  task_id: "关联任务",
  order_id: "所属订单",
  station_id: "关联场站",
  demand_id: "来源需求",
  status: "业务状态",
  quantity_kg: "计划数量（吨）",
  reported_kg: "司机报告量（吨）",
  verified_kg: "核验交付量（吨）",
  loaded_kg: "装货量（吨）",
  delivered_kg: "交付量（吨）",
  soc: "SOC（%）",
  capacity_kwh: "电池容量（kWh）",
  payload_kg: "有效载重（吨）",
  power_kw: "有效功率（kW）",
  quantity_kwh: "计量电量（kWh）",
  amount_cents: "来源金额",
  start_at: "开始时间",
  finish_at: "完成时间",
  arrival_at: "预计到站",
  created_at: "登记时间",
  occurred_at: "发生时间",
  connection: "连接状态",
  nature: "预计/实际",
  category: "费用类别",
  included: "已包含费用",
  coverage: "费用范围",
  version: "当前版本",
  notification: "通知投递",
  remaining_reason: "未履约责任说明",
  return_reason: "退回原因",
  evidence: "业务依据",
  verification_evidence: "核验依据",
  completion_evidence: "完工凭证",
  loading_evidence: "装货凭证",
  delivery_evidence: "交付凭证",
  compatibility: "补能适配",
  mode: "补能方式",
  severity: "关注等级",
  trigger: "触发依据",
  assignee: "处理责任",
  report: "反馈情况",
  candidate: "候选值",
  evidence_type: "依据类型",
  basis: "公开依据",
  usage_boundary: "适用边界",
  project_evidence_needed: "项目核验项",
  proof: "投运证明",
  partner: "合作主体",
  note: "备注",
  land: "用地条件",
  grid: "接电条件",
  capacity_kw: "候选容量（kW）",
  vehicles: "建议车辆（辆）",
  batteries: "建议电池（组）",
  trips: "预计车次",
  daily_quantity: "日需求（吨）",
  distance_km: "单趟距离（km）",
  actual_kw: "实测样例功率（kW）",
  predicted_kw: "预测功率（kW）",
  role: "操作角色",
  username: "登录账号",
  enabled: "账号有效",
  source_label: "数据属性",
  data_state: "数据状态",
  age_minutes: "来源时延（分钟）",
  device_id: "作业工位",
  incoming_battery: "换入电池",
  outgoing_battery: "换出电池",
  available_window: "可用窗口",
  source_time: "来源采集时间",
  release_at: "预计释放时间",
  tariff_version: "计价版本",
  effective_start: "生效开始",
  effective_end: "生效结束",
  storage_soc: "储能SOC（%）",
  storage_capacity_kwh: "储能容量（kWh）",
  grid_capacity_kw: "接电容量（kW）",
  transformer_limit_kw: "共享供电上限（kW）",
  implemented_count: "核验实施数量",
  valid_until: "合作有效期",
  contact: "联系人",
  threshold: "参考阈值",
  max_age_minutes: "数据有效时长（分钟）",
  devices: "建议工位（个）",
  required_power_kw: "所需供电（kW）",
  daily_energy_kwh: "日补能需求（kWh）",
  spare_batteries: "备用电池（组）",
  capacity_feasible: "容量参考约束",
};
export function RecordDetail({ resource, row }) {
  const a = useApp(),
    visible = Object.entries(row).filter(
      ([k, v]) => labels[k] && typeof v !== "object" && v != null,
    );
  return (
    <div className="stack">
      <div className="object-title">
        <h2>{row.name || row.code}</h2>
        <Pill>{row.status}</Pill>
      </div>
      <dl className="kv">
        {visible.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{labels[k]}</dt>
            <dd>
              {k.endsWith("_id")
                ? a.label(k, v)
                : k.endsWith("_kg")
                  ? format(v / 1000, 3)
                  : k === "amount_cents"
                    ? money(v)
                    : k.endsWith("_at")
                      ? time(v)
                      : k === "role"
                        ? v === "admin"
                          ? "管理员"
                          : "司机"
                        : typeof v === "boolean"
                          ? v
                            ? "是"
                            : "否"
                          : String(v)}
            </dd>
          </React.Fragment>
        ))}
      </dl>
      {Array.isArray(row.corridors) && (
        <Card title="授权订单需求走廊">
          <Table
            rowKey="corridor"
            size="small"
            pagination={false}
            scroll={{ x: 650 }}
            dataSource={row.corridors}
            columns={[
              col("走廊", "corridor"),
              col("订单", "orders"),
              col("计划量（吨）", "planned_kg", (v) => format(v / 1000)),
              col("核验量（吨）", "verified_kg", (v) => format(v / 1000)),
              col("有效车次", "verified_trips"),
            ]}
          />
        </Card>
      )}
      {row.history?.length > 0 && (
        <Card
          title={
            ["demands", "orders"].includes(resource)
              ? "变更记录"
              : "资产事项历史"
          }
        >
          <Table
            rowKey={(r, i) => r.id || r.at || String(i)}
            size="small"
            pagination={false}
            dataSource={row.history}
            columns={
              ["demands", "orders"].includes(resource)
                ? [
                    col("时间", "at", time),
                    col("原版本", "prior_version"),
                    col("原运量（吨）", "prior_quantity_kg", (v, r) =>
                      format((v ?? r.quantity_kg) / 1000, 3),
                    ),
                    col("说明", "reason", (v) => v || "资料维护"),
                  ]
                : [
                    col("事项", "kind"),
                    col("内容", "note"),
                    col("时间", "occurred_at", time),
                    col("依据", "evidence"),
                  ]
            }
          />
        </Card>
      )}
      {row.changes?.length > 0 && (
        <Card title="时序调整对比">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 500 }}
            dataSource={row.changes}
            columns={[
              col("计划", "id"),
              col("调整前", "original_at", time),
              col("调整后", "arrival_at", time),
              col("参考时效", "feasible", (v) => (v ? "可行" : "冲突")),
            ]}
          />
        </Card>
      )}
      {Array.isArray(row.trips) && (
        <Card title="车次与执行">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 400 }}
            dataSource={row.trips}
            columns={[
              col("车次", "code"),
              col("报告交付", "delivered_kg", (v) => format(v / 1000) + " t"),
              stateCol,
            ]}
          />
        </Card>
      )}
      <AdvancedRecord row={row} a={a} />
      {a.detailActions(resource, row)}
      <Source row={row} />
    </div>
  );
}
export function PanelHost() {
  const a = useApp(),
    ref = useRef();
  useEffect(() => {
    if (!a.panelState) return;
    const prev = document.activeElement;
    setTimeout(() => ref.current?.querySelector("button")?.focus(), 50);
    const handle = (e) => {
      if (e.key === "Escape") a.closePanel();
      if (e.key === "Tab") {
        const nodes = [
          ...ref.current.querySelectorAll(
            'button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]',
          ),
        ].filter((n) => n.offsetParent !== null);
        if (!nodes.length) return;
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0].focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      prev?.focus();
    };
  }, [a.panelState]);
  return (
    a.panelState && (
      <div
        className="panel-mask"
        onMouseDown={(e) => e.target === e.currentTarget && a.closePanel()}
      >
        <div
          className="panel-container"
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
        >
          <DraggablePanel
            placement="right"
            mode="fixed"
            defaultSize={{ width: 560, height: "100%" }}
            minWidth={Math.min(440, innerWidth)}
            maxWidth={Math.min(880, innerWidth)}
            fullscreen={innerWidth < 768}
            expand
            onExpandChange={(v) => !v && a.closePanel()}
          >
            <header className="panel-header">
              <h2 id="detail-title">{a.panelState.title}</h2>
              <Button aria-label="关闭详情" icon={X} onClick={a.closePanel} />
            </header>
            <div className="panel-body">{a.panelState.body}</div>
          </DraggablePanel>
        </div>
      </div>
    )
  );
}
export function FormHost({ modal, close }) {
  const [values, setValues] = useState({}),
    [error, setError] = useState(""),
    [invalid, setInvalid] = useState({}),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setValues(modal?.initial || {});
    setError("");
    setInvalid({});
    setDirty(false);
  }, [modal]);
  if (!modal) return null;
  const cancel = () => {
    if (busy) return;
    if (dirty && !confirm("存在未保存内容，确定放弃？")) return;
    close();
  };
  const submit = async () => {
    const errors = {};
    for (const f of modal.fields.filter((f) => !f.when || f.when(values))) {
      if (
        f.required &&
        (values[f.key] == null || String(values[f.key]).trim() === "")
      )
        errors[f.key] = "请填写" + f.label;
      if (
        f.type === "number" &&
        values[f.key] != null &&
        (Number(values[f.key]) < (f.min ?? 0) ||
          Number(values[f.key]) > (f.max ?? 1e9))
      )
        errors[f.key] = "请输入有效的" + f.label;
    }
    setInvalid(errors);
    if (Object.keys(errors).length) {
      document.getElementById("field-" + Object.keys(errors)[0])?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await modal.submit(values);
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={modal.title}
      open
      centered
      width={600}
      onCancel={cancel}
      destroyOnHidden
      footer={
        <>
          <Button disabled={busy} onClick={cancel}>
            取消
          </Button>
          <Button type="primary" loading={busy} onClick={submit}>
            {modal.submitLabel || "保存并核对"}
          </Button>
        </>
      }
    >
      <div className="modal-form">
        {error && <Alert type="error" showIcon message={error} />}{" "}
        {modal.fields
          .filter((f) => !f.when || f.when(values))
          .map((f) => {
            const props = {
              id: "field-" + f.key,
              "aria-label": f.label,
              "aria-invalid": invalid[f.key] ? true : undefined,
              "aria-describedby": invalid[f.key] ? "error-" + f.key : undefined,
              value: values[f.key],
              onChange: (e) => {
                const v = e?.target ? e.target.value : e;
                setValues((x) => ({ ...x, [f.key]: v }));
                setInvalid((x) => ({ ...x, [f.key]: undefined }));
                setDirty(true);
              },
            };
            return (
              <div className="field" key={f.key}>
                <label htmlFor={props.id}>
                  {f.label}
                  {f.required && <span className="field-error"> *</span>}
                </label>
                {f.type === "select" ? (
                  <Select
                    {...props}
                    mode={f.multiple ? "multiple" : undefined}
                    options={
                      typeof f.options === "function"
                        ? f.options(values)
                        : f.options
                    }
                  />
                ) : f.type === "number" ? (
                  <InputNumber
                    {...props}
                    min={f.min ?? 0}
                    max={f.max}
                    precision={f.precision}
                    style={{ width: "100%" }}
                  />
                ) : f.type === "textarea" ? (
                  <AntInput.TextArea
                    {...props}
                    autoSize={{ minRows: 3, maxRows: 6 }}
                  />
                ) : f.type === "datetime" ? (
                  <input type="datetime-local" {...props} />
                ) : (
                  <Input
                    {...props}
                    type={f.type === "password" ? "password" : "text"}
                  />
                )}{" "}
                {invalid[f.key] && (
                  <small
                    id={"error-" + f.key}
                    role="alert"
                    className="field-error"
                  >
                    {invalid[f.key]}
                  </small>
                )}
              </div>
            );
          })}
      </div>
    </Modal>
  );
}
