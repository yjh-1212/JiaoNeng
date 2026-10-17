import React, { useEffect, useRef, useState } from "react";
import {
  Drawer,
  Form,
  Input,
  Select,
  InputNumber,
  Button,
  Alert,
  Spin,
  Tabs,
  Descriptions,
  Table,
  Empty,
} from "antd";
import { useApp } from "./context";
import { request } from "./api";
import { format, time, money, col, Pill } from "./ui";
import avatar from "./assets/jiaoneng-ai-v2.png";
import AssistantWorkspace from "./assistant-view";

export const localTime = (v) => {
  const d = new Date(v || Date.now());
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const iso = (v) => (v ? new Date(v).toISOString() : undefined);
export function EnergyAI() {
  return null;
}
export const field = (key, label, type = "text", extra = {}) => ({
  key,
  label,
  type,
  required: true,
  ...extra,
});
export function EnergyForm({ config, onClose, onDone }) {
  const a = useApp(),
    [form] = Form.useForm(),
    [values, setValues] = useState(config.initial || {}),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(config.row?.version),
    dependencies = useRef({}),
    dirty = useRef(false),
    key = useRef(null);
  const close = () => {
    if (busy) return;
    if (dirty.current)
      a.confirm("关闭填写面板", "尚未提交的内容将被放弃。", onClose);
    else onClose();
  };
  useEffect(
    () =>
      a.registerLeaveGuard?.((next) => {
        if (busy) return;
        if (dirty.current)
          a.confirm("离开当前页面", "尚未提交的内容将被放弃。", next);
        else next();
      }),
    [busy],
  );
  async function submit() {
    try {
      const v = await form.validateFields();
      const commit = async () => {
        setBusy(true);
        setError(null);
        key.current = key.current || crypto.randomUUID();
        try {
          await config.submit(v, version, key.current, dependencies.current);
          dirty.current = false;
          onDone?.();
          onClose();
        } catch (e) {
          setError({ message: e.message, code: e.code, status: e.status });
          if (e.code !== "NETWORK") key.current = null;
        } finally {
          setBusy(false);
        }
      };
      if (config.confirm) a.confirm(config.title, config.confirm, commit);
      else await commit();
    } catch (e) {
      if (!e.errorFields) setError({ message: e.message });
    }
  }
  async function check() {
    setBusy(true);
    try {
      const r = await request("/api/commands/" + key.current);
      if (r.status === "COMPLETED") {
        a.resolvePending(key.current);
        await a.refresh();
        dirty.current = false;
        onDone?.();
        onClose();
      } else
        setError({
          message: "暂未查到成功结果；保留本次请求标识，可使用原请求重试。",
          code: "RETRY_SAME",
        });
    } catch (e) {
      setError({ message: e.message, code: "NETWORK" });
    } finally {
      setBusy(false);
    }
  }
  const fields =
    typeof config.fields === "function" ? config.fields(values) : config.fields;
  return (
    <Drawer
      open
      title={config.title}
      width={660}
      className="energy-drawer"
      destroyOnHidden
      onClose={close}
      maskClosable={false}
      footer={
        <div className="energy-form-footer">
          <Button onClick={close} disabled={busy}>
            取消
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={busy || error?.code === "NETWORK"}
            onClick={submit}
          >
            {config.submitLabel || "保存"}
          </Button>
        </div>
      }
    >
      {config.summary && (
        <div className="energy-form-summary">{config.summary}</div>
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          title={error.message}
          action={
            error.code === "NETWORK" ? (
              <Button size="small" onClick={check}>
                核查结果
              </Button>
            ) : error.status === 409 && config.resource && config.row ? (
              <Button
                size="small"
                onClick={async () => {
                  try {
                    const r = await request(
                      `/api/resources/${config.resource}/${encodeURIComponent(config.row.id)}`,
                    );
                    setVersion(r.version);
                    let dependencyText = "";
                    if (config.refreshDevice && values.device_id) {
                      const d = await request(
                        "/api/resources/devices/" +
                          encodeURIComponent(values.device_id),
                      );
                      dependencies.current[d.id] = d.version;
                      dependencyText = ` 工位当前为${d.status}／${d.connection}。`;
                    }
                    await a.refresh();
                    setError({
                      message:
                        "已读取最新版本，请核对当前记录后再提交；填写内容已保留。" +
                        dependencyText,
                    });
                  } catch (e) {
                    setError({ message: e.message });
                  }
                }}
              >
                读取最新版本
              </Button>
            ) : null
          }
        />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={config.initial}
        onValuesChange={(changed, all) => {
          dirty.current = true;
          config.onChange?.(changed, all, form);
          setValues(form.getFieldsValue());
        }}
        disabled={busy}
        requiredMark
      >
        {fields
          .filter((f) => !f.when || f.when(values))
          .map((f) => (
            <Form.Item
              key={f.key}
              name={f.key}
              label={f.label}
              rules={[
                { required: f.required, message: "请填写" + f.label },
                ...(f.rules || []),
              ]}
            >
              {f.type === "select" ? (
                <Select
                  aria-label={f.label}
                  mode={f.multiple ? "multiple" : undefined}
                  allowClear={!f.required}
                  showSearch
                  optionFilterProp="label"
                  options={f.options || []}
                  onChange={f.onChange}
                />
              ) : f.type === "number" ? (
                <InputNumber
                  aria-label={f.label}
                  min={f.min ?? 0}
                  max={f.max ?? 1000000}
                  precision={f.precision ?? 2}
                  style={{ width: "100%" }}
                />
              ) : f.type === "textarea" ? (
                <Input.TextArea
                  aria-label={f.label}
                  rows={3}
                  maxLength={2000}
                />
              ) : (
                <Input
                  aria-label={f.label}
                  type={
                    f.type === "datetime"
                      ? "datetime-local"
                      : f.type === "date"
                        ? "date"
                        : "text"
                  }
                  maxLength={f.type === "text" ? 2000 : undefined}
                />
              )}
            </Form.Item>
          ))}
      </Form>
    </Drawer>
  );
}
export function ChargingPanel({ id, onClose, onEdit, onArrive }) {
  const a = useApp(),
    [row, setRow] = useState(null),
    [error, setError] = useState(""),
    seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    request("/api/energy-workspace/charging/" + encodeURIComponent(id))
      .then((r) => {
        if (n === seq.current) setRow(r);
      })
      .catch((e) => setError(e.message));
    return () => seq.current++;
  }, [id, a.revision]);
  const open = (resource, target) => {
    onClose();
    a.showDetail(resource, target);
  };
  const sessions = row?.sessions || [];
  return (
    <Drawer
      open
      title="补能安排详情"
      width={780}
      className="energy-drawer"
      onClose={onClose}
    >
      {error && <Alert type="error" title={error} />}
      {!row ? (
        <Spin />
      ) : (
        <>
          <div className="energy-detail-heading">
            <strong>
              {row.vehicle_code} · {row.station_name}
            </strong>
            <Pill>{row.status}</Pill>
          </div>
          <div className="energy-lineage">
            {row.order_id && (
              <button
                className="inline-link"
                onClick={() => open("orders", row.order_id)}
              >
                {row.order_code}
              </button>
            )}
            {row.task_id && (
              <>
                <span>→</span>
                <button
                  className="inline-link"
                  onClick={() => open("tasks", row.task_id)}
                >
                  {row.task_code}
                </button>
              </>
            )}
            <span>→</span>
            <strong>{row.code}</strong>
          </div>
          {row.risks.length > 0 && (
            <Alert type="warning" title={row.risks.join("；")} />
          )}
          <Button
            onClick={() => {
              onClose();
              a.go("alerts", { plan_id: row.id });
            }}
          >
            查看关联异常
          </Button>
          <Tabs
            items={[
              {
                key: "plan",
                label: "计划安排",
                children: (
                  <>
                    <Descriptions
                      column={2}
                      items={[
                        ["司机", row.driver_name],
                        ["来源", row.task_id ? "运输任务" : "临时安排"],
                        ["补能方式", row.station_mode],
                        [
                          "需求",
                          row.station_mode === "换电"
                            ? `${format(row.capacity_kwh)} kWh规格`
                            : `${format(row.quantity_kwh)} kWh`,
                        ],
                        ["预计到站", time(row.arrival_at)],
                        ["预计服务结束", time(row.finish_at)],
                        ["运输截止", time(row.task_finish_at)],
                        ["当前版本", row.version],
                        ["执行状态", row.execution_status],
                        ["调整依据", row.adjustment_reason || "—"],
                      ].map(([label, children], key) => ({
                        key,
                        label,
                        children: children ?? "—",
                      }))}
                    />
                    <div className="energy-inline-actions">
                      {a.can("charging.write") &&
                        !row.visit &&
                        !sessions.length &&
                        row.status !== "已取消" && (
                          <Button onClick={() => onEdit(row)}>调整安排</Button>
                        )}
                      {a.can("session.write") &&
                        row.status === "已确认" &&
                        !row.visit &&
                        !sessions.length && (
                          <Button type="primary" onClick={() => onArrive(row)}>
                            登记到站
                          </Button>
                        )}
                    </div>
                  </>
                ),
              },
              {
                key: "actual",
                label: "实际作业",
                children: (
                  <>
                    <Descriptions
                      column={2}
                      items={
                        row.visit
                          ? [
                              ["到站", time(row.visit.arrived_at)],
                              ["开始", time(row.visit.start_at)],
                              ["结束", time(row.visit.finish_at)],
                              ["工位", row.visit.device_id],
                              ["现场状态", row.visit.status],
                            ].map(([label, children], key) => ({
                              key,
                              label,
                              children,
                            }))
                          : []
                      }
                    />
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      scroll={{ x: 600 }}
                      dataSource={sessions}
                      columns={[
                        col("作业", "code"),
                        col(
                          "实际电量",
                          "quantity_kwh",
                          (v) => format(v) + " kWh",
                        ),
                        col("来源金额", "amount_cents", money),
                        col("状态", "status"),
                        col("凭证", "evidence", (v) => v || "—"),
                        col("操作", "id", (v) => (
                          <Button
                            type="link"
                            onClick={() => open("sessions", v)}
                          >
                            查看作业
                          </Button>
                        )),
                      ]}
                    />
                  </>
                ),
              },
              {
                key: "history",
                label: "变更与依据",
                children: (
                  <>
                    <p>测算资料／人工登记；内部补能计划，非外部预约。</p>
                    {row.adjustment_reason && (
                      <p>调整：{row.adjustment_reason}</p>
                    )}
                    <Table
                      rowKey={(_, i) => i}
                      size="small"
                      pagination={false}
                      dataSource={row.audit}
                      columns={[
                        col("时间", "created_at", time),
                        col("操作", "action"),
                        col("版本", "after_version"),
                      ]}
                    />
                  </>
                ),
              },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}
export function EnergySourcePanel({ onClose, analysis }) {
  return (
    <Drawer open title="数据与口径" width={580} onClose={onClose}>
      <p>测算资料 · {time(analysis?.calculated_at)}</p>
      {analysis?.assumptions?.map((s) => (
        <p key={s}>{s}</p>
      ))}
      <p>
        当前已知费用来自所选日期、所选计量范围的已核验补能作业，未覆盖其他费用；预测和优化为参考情景。
      </p>
    </Drawer>
  );
}
