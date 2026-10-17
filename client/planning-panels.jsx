import React, { useEffect, useRef, useState } from "react";
import {
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Alert,
  Table,
  Tabs,
  Descriptions,
} from "antd";
import { useApp } from "./context";
import { request } from "./api";
import { format, time, Pill } from "./ui";

export function PlanningEditor({ project, options, onClose, onSaved }) {
  const a = useApp(),
    [form] = Form.useForm(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [source, setSource] = useState(null),
    [, redrawDraft] = useState(0),
    [opts, setOpts] = useState(options),
    dirty = useRef(false),
    key = useRef(null),
    draftKey = `planner-draft-${a.user.id}-${project?.id || "new"}`;
  const savedDraft = useRef(null);
  if (savedDraft.current === null) {
    try {
      savedDraft.current = JSON.parse(
        localStorage.getItem(draftKey) || "false",
      );
    } catch {
      savedDraft.current = false;
    }
  }
  const initial = project
    ? {
        ...project,
        use_business: !!project.business_snapshot,
        conditions: { ...project.conditions },
      }
    : {
        name: "煤运走廊规划（测算）",
        owner_id: opts.owner_id,
        start_date: opts.defaults.start_date,
        finish_date: opts.defaults.finish_date,
        conditions: opts.defaults,
        sites: opts.candidates.slice(0, 20).map((p) => ({
          candidate_id: p.id,
          supply_kw: p.capacity_kw,
          other_load_kw: 0,
          land_verified: false,
          grid_verified: false,
          access_verified: false,
        })),
      };
  const persist = () => {
    dirty.current = true;
    key.current = null;
    try {
      localStorage.setItem(draftKey, JSON.stringify(form.getFieldsValue(true)));
    } catch {}
  };
  const close = () => {
    if (busy) return;
    if (dirty.current)
      a.confirm("关闭条件填写", "未保存条件已留作本机草稿。", onClose);
    else onClose();
  };
  useEffect(
    () =>
      a.registerLeaveGuard?.((next) => {
        if (busy) return;
        if (dirty.current)
          a.confirm("离开条件填写", "未保存条件已留作本机草稿。", next);
        else next();
      }),
    [busy],
  );
  useEffect(() => {
    let live = true;
    const id = form.getFieldValue("owner_id");
    if (id)
      request("/api/planner/options?owner_id=" + encodeURIComponent(id))
        .then((r) => {
          if (live) setOpts(r);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [a.revision]);
  async function importData() {
    setBusy(true);
    setError("");
    try {
      const v = form.getFieldsValue(true);
      const r = await request(
        "/api/planner/business?" +
          new URLSearchParams({
            owner_id: v.owner_id,
            start_date: v.start_date,
            finish_date: v.finish_date,
          }),
      );
      setSource(r);
      if (r.daily_quantity > 0) {
        const distances = r.corridors.filter((l) =>
          Number.isFinite(l.distance_km),
        );
        const total = distances.reduce((s, l) => s + l.quantity, 0),
          distance = total
            ? distances.reduce((s, l) => s + l.quantity * l.distance_km, 0) /
              total
            : v.conditions.distance_km;
        form.setFieldsValue({
          use_business: true,
          conditions: {
            daily_quantity: r.daily_quantity,
            distance_km: Math.round(distance * 10) / 10,
            phase_one_quantity: Math.min(
              v.conditions.phase_one_quantity,
              r.daily_quantity,
            ),
          },
        });
        persist();
      } else setError("该主体与区间没有可计入的有效运量，手填条件已保留。");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    try {
      const v = await form.validateFields();
      setBusy(true);
      setError("");
      key.current ||= crypto.randomUUID();
      const r = await a.execute(
        project ? "planner.update" : "planner.create",
        project?.id,
        { ...v, ...(project ? { expected_version: project.version } : {}) },
        key.current,
      );
      dirty.current = false;
      localStorage.removeItem(draftKey);
      onSaved(r.project);
    } catch (e) {
      if (!e.errorFields) setError(e.message);
      if (e.code !== "NETWORK") key.current = null;
    } finally {
      setBusy(false);
    }
  }
  const num = (name, label, min, max, step = 1) => (
    <Form.Item
      key={name}
      name={["conditions", name]}
      label={label}
      rules={[{ required: true, message: "请填写" + label }]}
    >
      <InputNumber min={min} max={max} step={step} />
    </Form.Item>
  );
  return (
    <Drawer
      open
      title={project ? "调整规划条件" : "新建规划项目"}
      width={860}
      className="planning-editor"
      onClose={close}
      maskClosable={false}
      footer={
        <div className="planning-footer">
          <Button disabled={busy} onClick={close}>
            取消
          </Button>
          <Button
            type="primary"
            aria-label="保存条件"
            loading={busy}
            onClick={submit}
          >
            保存条件
          </Button>
        </div>
      }
    >
      {error && <Alert type="error" title={error} showIcon />}
      {savedDraft.current && (
        <Alert
          type="info"
          title="发现未提交的本机草稿"
          action={
            <Button
              onClick={() => {
                form.setFieldsValue(savedDraft.current);
                dirty.current = true;
                savedDraft.current = false;
                setError("");
                redrawDraft((n) => n + 1);
              }}
            >
              恢复草稿
            </Button>
          }
        />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        onValuesChange={persist}
      >
        <h3>项目与业务范围</h3>
        <div className="planning-form-grid">
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: "请填写项目名称" }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="owner_id"
            label="业务主体"
            rules={[{ required: true }]}
          >
            <Select
              disabled={!!project}
              options={a.boot.organizations.map((o) => ({
                value: o.id,
                label: o.name,
              }))}
              onChange={async (id) => {
                setBusy(true);
                setError("");
                try {
                  const r = await request(
                    "/api/planner/options?owner_id=" + id,
                  );
                  setOpts(r);
                  form.setFieldsValue({
                    sites: r.candidates.map((p) => ({
                      candidate_id: p.id,
                      supply_kw: p.capacity_kw,
                      other_load_kw: 0,
                    })),
                    use_business: false,
                  });
                  setSource(null);
                  persist();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="start_date"
            label="基准开始日期"
            rules={[{ required: true }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item
            name="finish_date"
            label="基准结束日期"
            rules={[{ required: true }]}
          >
            <Input type="date" />
          </Form.Item>
        </div>
        <div className="planning-import">
          <Button disabled={busy} onClick={importData}>
            引用需求与订单
          </Button>
          <span>
            {source
              ? `${source.refs.length}条有效记录 · 日均 ${format(source.daily_quantity)} 吨 · ${source.excluded.length}条时窗缺失未计入`
              : "按主体及基准期引用，保留手工调整"}
          </span>
        </div>
        <Form.Item name="use_business" hidden>
          <Input />
        </Form.Item>
        <h3>
          运输与补能条件 <small>测算参数</small>
        </h3>
        <div className="planning-form-grid four">
          {num("daily_quantity", "日运输需求（吨）", 0.001, 100000, 0.1)}
          {num("distance_km", "单程距离（km）", 0.1, 2000, 0.1)}
          {num("payload_tonnes", "有效载重（吨）", 1, 100, 0.1)}
          {num("battery_kwh", "电池容量（kWh）", 50, 1500)}
          {num("start_hour", "开工时刻（时）", 0, 23.5, 0.5)}
          {num("hours", "作业时长（小时）", 0.5, 24, 0.5)}
          {num("loaded_speed", "重载速度（km/h）", 1, 100)}
          {num("empty_speed", "空载速度（km/h）", 1, 100)}
          {num("loading_minutes", "装载时间（分钟）", 1, 240)}
          {num("unloading_minutes", "卸载时间（分钟）", 1, 240)}
          {num("energy_per_km", "参考能耗（kWh/km）", 0.1, 10, 0.01)}
          {num("device_power", "充电功率（kW）", 10, 1000)}
          {num("efficiency", "充电效率", 0.5, 1, 0.01)}
          {num("utilization", "服务利用率上限", 0.1, 0.95, 0.01)}
          {num("reserve_ratio", "备车比例", 0, 1, 0.01)}
          {num("phase_one_quantity", "一期日运量（吨）", 0.001, 100000, 0.1)}
        </div>
        <Form.Item
          name={["conditions", "compatibility"]}
          label="补能兼容规格"
          rules={[{ required: true, message: "请填写补能兼容规格" }]}
        >
          <Input maxLength={100} />
        </Form.Item>
        <h3>候选布局</h3>
        <Form.List
          name="sites"
          rules={[
            {
              validator: async (_, v) => {
                if (!v?.length) throw Error("请选择至少一个候选点");
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map(({ key, name }) => (
                <section className="planning-site-editor" key={key}>
                  <div className="planning-form-grid">
                    <Form.Item
                      name={[name, "candidate_id"]}
                      label="候选点"
                      rules={[{ required: true, message: "请选择候选点" }]}
                    >
                      <Select
                        options={opts.candidates.map((p) => ({
                          value: p.id,
                          label: p.name,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[name, "station_id"]}
                      label="关联既有场站（扩容时选择）"
                    >
                      <Select
                        allowClear
                        options={opts.stations.map((p) => ({
                          value: p.id,
                          label: p.name + " · " + p.mode,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[name, "supply_kw"]}
                      label="供电上限（kW）"
                    >
                      <InputNumber min={0} max={1e7} placeholder="待核实" />
                    </Form.Item>
                    <Form.Item
                      name={[name, "other_load_kw"]}
                      label="其他负荷（kW）"
                      rules={[{ required: true, message: "请填写其他负荷" }]}
                    >
                      <InputNumber min={0} max={1e7} />
                    </Form.Item>
                    <Form.Item
                      name={[name, "detour_km"]}
                      label="道路绕行（km）"
                    >
                      <InputNumber min={0} max={1000} placeholder="未测算" />
                    </Form.Item>
                    <Form.Item name={[name, "detour_basis"]} label="绕行依据">
                      <Input maxLength={500} placeholder="填写时须附道路依据" />
                    </Form.Item>
                  </div>
                  <div className="planning-site-checks">
                    {[
                      ["land_verified", "用地已核实"],
                      ["grid_verified", "接电已核实"],
                      ["access_verified", "重卡通行已核实"],
                    ].map(([k, l]) => (
                      <Form.Item
                        key={k}
                        name={[name, k]}
                        label={l}
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                    ))}
                    <Button danger onClick={() => remove(name)}>
                      移除
                    </Button>
                  </div>
                </section>
              ))}
              <Form.ErrorList errors={errors} />
              <Button
                disabled={fields.length >= 20}
                onClick={() => add({ other_load_kw: 0 })}
              >
                添加候选布局
              </Button>
              {!opts.candidates.length && (
                <Alert
                  type="warning"
                  title="当前主体暂无候选点"
                  action={
                    <Button onClick={() => a.createPhysical("candidates")}>
                      登记候选点
                    </Button>
                  }
                />
              )}
            </>
          )}
        </Form.List>
      </Form>
    </Drawer>
  );
}

export function PlanningEvidence({ solution, project, onClose }) {
  const s = solution,
    b = s?.business_snapshot,
    stock = s?.inventory;
  const inventory = (kind) => (
    <Table
      size="small"
      rowKey="id"
      dataSource={stock?.[kind] || []}
      pagination={{
        defaultPageSize: 10,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50, 100],
      }}
      columns={[
        { title: "编号", dataIndex: "code" },
        { title: "资源", dataIndex: "name" },
        {
          title: "可用",
          dataIndex: "eligible",
          render: (v) => (v ? "是" : "否"),
        },
        {
          title: "排除理由",
          dataIndex: "reasons",
          render: (v) => v.join("；") || "窗口、状态及规格符合",
        },
      ]}
    />
  );
  return (
    <Drawer
      open
      title="测算依据"
      width={820}
      onClose={onClose}
      className="planning-evidence"
    >
      <Alert type="info" title="条件测算 · 测算资料，非工程审批或实测预测" />
      <Tabs
        items={[
          {
            key: "formula",
            label: "公式与口径",
            children: (
              <div className="stack">
                <Descriptions
                  bordered
                  size="small"
                  column={1}
                  items={[
                    {
                      key: 1,
                      label: "计算时间",
                      children: time(s?.generated_at),
                    },
                    {
                      key: 2,
                      label: "运输循环",
                      children:
                        "重载行驶＋空载返回＋装载＋卸载＋按单循环能耗分摊的补能分钟",
                    },
                    {
                      key: 3,
                      label: "车辆",
                      children:
                        "执行车辆＝所需趟次÷每车可完成趟数向上取整；总量＝执行车辆＋向上取整备车",
                    },
                    {
                      key: 4,
                      label: "工位",
                      children:
                        "日用电量÷单工位功率÷运营小时÷服务利用率上限，向上取整；安装总量不低于既有适配工位",
                    },
                    {
                      key: 5,
                      label: "排队",
                      children:
                        "M/M/c稳态情景；随机到站/指数服务；利用率≥1时不输出有限等待。未包含峰时分布、社会车辆和故障，不能当实测预测",
                    },
                    {
                      key: 6,
                      label: "库存",
                      children: stock?.basis || "尚未测算",
                    },
                    {
                      key: 7,
                      label: "供电",
                      children:
                        "既有全部工位装机功率＋新增工位×设计功率＋其他负荷；未知容量标待核实，用地、接电及重卡通行分别核对",
                    },
                    {
                      key: 8,
                      label: "费用",
                      children:
                        "缺少采购、租赁及工程报价；不输出投资回报或完整成本。随车电池随车辆配置，不重复计投资",
                    },
                  ]}
                />
                <pre className="planning-json">
                  {JSON.stringify(
                    s?.conditions || project?.conditions,
                    null,
                    2,
                  )}
                </pre>
              </div>
            ),
          },
          {
            key: "sources",
            label: "业务来源",
            children: (
              <>
                <p>{b?.basis || "手工条件；没有引用业务运量"}</p>
                {b && (
                  <>
                    <p>
                      计划 {format(b.quantity_tonnes)} 吨 · 核验交付{" "}
                      {format(b.verified_tonnes)} 吨（单列） · 引用时间{" "}
                      {time(b.generated_at)}
                    </p>
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={b.refs}
                      pagination={{
                        defaultPageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                      }}
                      columns={[
                        {
                          title: "类型",
                          dataIndex: "resource",
                          render: (v) => (v === "orders" ? "订单" : "需求余量"),
                        },
                        { title: "编号", dataIndex: "code" },
                        { title: "版本", dataIndex: "version" },
                        {
                          title: "区间运量（吨）",
                          dataIndex: "quantity_tonnes",
                        },
                      ]}
                    />
                    <h4>未计入记录</h4>
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={b.excluded}
                      columns={[
                        { title: "编号", dataIndex: "code" },
                        { title: "原因", dataIndex: "reason" },
                      ]}
                      pagination={{ defaultPageSize: 10 }}
                    />
                  </>
                )}
              </>
            ),
          },
          {
            key: "vehicles",
            label: "车辆明细",
            children: inventory("vehicles"),
          },
          { key: "drivers", label: "司机明细", children: inventory("drivers") },
          {
            key: "sites",
            label: "候选约束",
            children: (s?.sites || []).map((p) => (
              <section className="planning-site-editor" key={p.id}>
                <b>{p.name}</b> <Pill>{p.status}</Pill>
                <p>
                  供电需求 {format(p.required_power_kw)} / 可用{" "}
                  {format(p.supply_kw)} kW
                </p>
                <p>
                  {p.issues.join("；") || "计算硬约束未见违反"}
                  {p.unknown.length ? " · 待核实：" + p.unknown.join("、") : ""}
                </p>
                <p>
                  绕行依据：{p.detour_basis || "未测算"}
                  ；覆盖比例：未完成路网覆盖分析
                </p>
              </section>
            )),
          },
        ]}
      />
    </Drawer>
  );
}
