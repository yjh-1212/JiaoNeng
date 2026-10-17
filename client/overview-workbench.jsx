import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Progress,
  Skeleton,
  Table,
  Tooltip,
} from "antd";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ExternalLink,
  Route,
  Send,
  ShieldCheck,
  Truck,
  Zap,
} from "lucide-react";
import { useApp } from "./context";
import { request } from "./api";
import { Heading, Pill, format, time } from "./ui";
import { taskStateName } from "./task-workbench";
import hero from "./assets/overview-energy-hub.webp";
import avatar from "./assets/jiaoneng-ai-v2.png";
import "./overview-workbench.css";

const prompts = [
  ["帮我整理一笔煤炭运输需求。", "DEMAND"],
  ["帮我梳理运输任务的执行进度。", "DISPATCH"],
  ["有哪些运输与补能异常需要关注？", "INCIDENT"],
];
const icons = {
  demand: FileText,
  order: ClipboardCheck,
  dispatch: Truck,
  verify: CheckCircle2,
  charging: Zap,
  alert: ShieldCheck,
};
const greeting = (value) => {
  const h = Number(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(value || Date.now())).find(part=>part.type==='hour').value,
  );
  return h < 6 ? "夜深了" : h < 12 ? "上午好" : h < 18 ? "下午好" : "晚上好";
};
const kg = (v) => format((v || 0) / 1000);
function Panel({ title, extra, children, className = "" }) {
  return (
    <section className={"ow-panel " + className}>
      <header className="ow-panel-heading">
        <h2>{title}</h2>
        {extra}
      </header>
      {children}
    </section>
  );
}
export default function OverviewWorkbench() {
  const a = useApp(),
    owner = "",
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0),
    [question, setQuestion] = useState(""),
    seq = useRef(0);
  const ai = a.can("ai.use") && a.can("read");
  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    setError("");
    request(
      "/api/overview" + (owner ? "?owner=" + encodeURIComponent(owner) : ""),
    )
      .then((r) => {
        if (n === seq.current) setData(r);
      })
      .catch((e) => {
        if (n === seq.current) setError(e.message);
      })
      .finally(() => {
        if (n === seq.current) setLoading(false);
      });
    return () => {
      seq.current++;
    };
  }, [owner, tick, a.revision]);
  const stats = data?.statistics,
    p = data?.progress;
  function openList(route, filters = {}) {
    if (["tasks", "demands", "orders"].includes(route))
      a.setTransportQueries((s) => ({
        ...s,
        [route]: {
          q: "",
          status: "",
          stage: "all",
          from: "",
          to: "",
          owner,
          page: 1,
          pageSize: 10,
          sort: "created_at",
          direction: "desc",
          ...filters,
        },
      }));
    if (route === "charging")
      a.setTransportQueries((s) => ({
        ...s,
        charging: {
          q: "",
          station: "",
          date: "",
          mode: "",
          status: "",
          stage: "all",
          task: "",
          order: "",
          page: 1,
          pageSize: 10,
          ...filters,
        },
      }));
    a.go(
      route,
      ["charging", "alerts"].includes(route)
        ? { owner_id: owner, ...filters }
        : null,
    );
  }
  function ask(text, capability = "AUTO") {
    if (!text.trim() || !ai) return;
    a.go("assistant", {
      return_hash: location.hash || "#overview",
      agent_entry: {
        capability,
        question: text.trim(),
        ...(owner ? { owner_id: owner } : {}),
      },
    });
  }
  const shortcuts = [
    {
      title: a.can("demand.write") ? "创建运输需求" : "查看运输需求",
      hint: "明确货物、运量与起终点",
      note: "从需求开始组织运输",
      Icon: FileText,
      tone: "red",
      run: () =>
        a.can("demand.write")
          ? a.editDemand(null, owner ? { owner_id: owner } : null)
          : openList("demands"),
    },
    {
      title: "交能方案推演",
      hint: "比较运输与补能方案",
      note: "核对运力、时效与成本",
      Icon: Route,
      tone: "blue",
      run: () => {
        if (owner)
          sessionStorage.setItem("simulation-owner-" + a.user.id, owner);
        a.go("simulation");
      },
    },
    {
      title: "运输任务调度",
      hint: "安排车辆、司机与任务",
      note: "跟进派单与执行进度",
      Icon: Truck,
      tone: "green",
      run: () => openList("tasks"),
    },
    {
      title: "补能调度安排",
      hint: "协同到站、工位与补能",
      note: "衔接运输执行与能源供给",
      Icon: Zap,
      tone: "purple",
      run: () => openList("charging"),
    },
  ];
  const metrics = [
    [
      "pending",
      "待派发任务",
      Truck,
      "red",
      () => openList("tasks", { stage: "pending" }),
    ],
    [
      "running",
      "执行中任务",
      Truck,
      "blue",
      () => openList("tasks", { stage: "running" }),
    ],
    [
      "verify",
      "待核验任务",
      ClipboardCheck,
      "orange",
      () => openList("tasks", { stage: "verify" }),
    ],
    [
      "verified_tonnes",
      "累计核验交付（吨）",
      CheckCircle2,
      "green",
      () => openList("tasks"),
    ],
  ];
  const columns = [
    {
      title: "任务 / 订单",
      key: "code",
      width: 154,
      render: (_, r) => (
        <div className="ow-two-lines">
          <button
            className="ow-code"
            onClick={() => a.go("tasks", { task_id: r.id })}
          >
            {r.code}
          </button>
          <small>{r.order_code || "—"}</small>
        </div>
      ),
    },
    {
      title: "运输线路 / 货物",
      key: "route",
      render: (_, r) => (
        <div className="ow-two-lines">
          <span title={r.origin + " → " + r.destination}>
            {r.origin || "待补充"} → {r.destination || "待补充"}
          </span>
          <small>
            {r.cargo || "待补充"} · {kg(r.quantity_kg)} 吨
          </small>
        </div>
      ),
    },
    {
      title: "车辆 / 司机",
      key: "vehicle",
      width: 120,
      render: (_, r) => (
        <div className="ow-two-lines">
          <span>{r.vehicle_code || "待安排"}</span>
          <small>{r.driver_name || "待安排"}</small>
        </div>
      ),
    },
    {
      title: "状态",
      key: "status",
      width: 85,
      render: (_, r) => <Pill>{taskStateName(r.status)}</Pill>,
    },
    {
      title: "核验交付",
      key: "verified",
      width: 94,
      render: (_, r) => kg(r.verified_kg) + " 吨",
    },
    {
      title: "操作",
      key: "action",
      width: 55,
      fixed: "right",
      render: (_, r) => (
        <button
          className="ow-action"
          onClick={() => a.go("tasks", { task_id: r.id })}
          aria-label={"查看任务 " + r.code}
        >
          查看
        </button>
      ),
    },
  ];
  return (
    <div className="overview-workbench">
      <Heading title="运营总览" />
      <section
        className="ow-welcome"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(9,36,57,.25),transparent),url(${hero})`,
        }}
      >
        <div>
          <span className="ow-eyebrow">交能融合 · 运营工作台</span>
          <h1>
            {greeting(data?.generated_at || a.boot.server_time)}，
            {owner
              ? a.boot.organizations.find((o) => o.id === owner)?.name
              : a.user.name}
          </h1>
          <p>让运输执行与能源补给高效协同</p>
        </div>
        <span className="ow-welcome-caption">联动每一程 · 协同每一度电</span>
      </section>
      <nav className="ow-shortcuts" aria-label="业务快捷入口">
        {shortcuts.map(({ title, hint, note, Icon, tone, run }) => (
          <button key={title} onClick={run}>
            <span className={"ow-shortcut-icon " + tone}>
              <Icon size={30} strokeWidth={1.7} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>
                {hint}
                <br />
                {note}
              </small>
            </span>
            <ArrowRight className="ow-shortcut-arrow" size={16} />
          </button>
        ))}
      </nav>
      <div className="ow-toolbar">
        <span>
          <i /> 运营数据{" "}
          <span className="ow-updated">
            {data ? "更新于 " + time(data.generated_at) : "正在读取业务数据"}
          </span>
        </span>
      </div>
      {error ? (
        <Alert
          showIcon
          type="error"
          title={"业务数据暂未加载：" + error}
          action={<Button onClick={() => setTick((n) => n + 1)}>重试</Button>}
        />
      ) : loading ? (
        <div className="ow-loading">
          <Skeleton active paragraph={{ rows: 9 }} />
        </div>
      ) : (
        data && (
          <div className={"ow-grid" + (!ai ? " without-ai" : "")}>
            <div className="ow-business">
              <div className="ow-upper">
                <Panel
                  title="运输概况"
                  extra={
                    <Tooltip title="当前主体范围全量统计；交付量与补能电量均为累计已核验值">
                      <span>{data.scope.label}</span>
                    </Tooltip>
                  }
                >
                  <div className="ow-metrics">
                    {metrics.map(([key, label, Icon, tone, run]) => (
                      <button key={key} onClick={run}>
                        <span className={"ow-metric-icon " + tone}>
                          <Icon size={19} />
                        </span>
                        <strong data-stat={key}>{format(stats[key])}</strong>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="ow-energy-strip">
                    <button
                      onClick={() => openList("charging", { stage: "pending" })}
                    >
                      <Zap size={13} /> 待补能 <b>{stats.pending_charging}</b>
                    </button>
                    <button onClick={() => a.go("stations")}>
                      <span className="ow-online-dot" />
                      在线工位{" "}
                      <b>
                        {stats.online_devices}/{stats.total_devices}
                      </b>
                    </button>
                    <Tooltip title="累计已核验补能作业电量">
                      <span>
                        核验电量 <b>{format(stats.verified_energy_kwh)}</b> kWh
                      </span>
                    </Tooltip>
                  </div>
                </Panel>
                <Panel
                  title="运输进度"
                  extra={
                    p && (
                      <button onClick={() => a.go("tasks", { task_id: p.id })}>
                        查看详情 <ArrowRight size={13} />
                      </button>
                    )
                  }
                >
                  {p ? (
                    <>
                      <div className="ow-progress-title">
                        <strong>{p.code}</strong>
                        <Pill>{taskStateName(p.status)}</Pill>
                      </div>
                      <p
                        className="ow-route"
                        title={p.origin + " → " + p.destination}
                      >
                        {p.origin || "待补充"} → {p.destination || "待补充"}
                        <span>
                          {p.cargo} · {kg(p.quantity_kg)} 吨
                        </span>
                      </p>
                      <div className="ow-stage-track">
                        {p.nodes.map((n, i) => (
                          <div key={n.label} className={"ow-stage " + n.state}>
                            <span>
                              {n.state === "done" ? (
                                <Check size={15} />
                              ) : i === 2 ? (
                                <Truck size={15} />
                              ) : (
                                <span>{i + 1}</span>
                              )}
                            </span>
                            <strong>{n.label}</strong>
                            <small>
                              {n.state === "done"
                                ? "已完成"
                                : n.state === "current"
                            ? ({'任务派发':'待派发','司机接单':'待接单','运输执行':p.status==='退回补充'?'待补充':'执行中','完工核验':'待核验'}[n.label])
                                  : "待执行"}
                            </small>
                          </div>
                        ))}
                      </div>
                      <div className="ow-progress-summary">
                        <span>
                          核验交付 {kg(p.verified_kg)} / {kg(p.quantity_kg)} 吨
                        </span>
                        <small>
                          已报送 {kg(p.reported_kg)} 吨
                          {p.latest_trip
                            ? " · 最近车次" + p.latest_trip.status
                            : ""}
                        </small>
                      </div>
                      <Progress
                        size="small"
                        percent={Math.min(
                          100,
                          Math.round(
                            (p.verified_kg / Math.max(p.quantity_kg, 1)) * 100,
                          ),
                        )}
                        showInfo={false}
                        strokeColor="#d6273d"
                      />
                    </>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="暂无运输任务"
                    />
                  )}
                </Panel>
              </div>
              <div className="ow-lower">
                <Panel
                  title="待办处理"
                  className="ow-todo-panel"
                  extra={<span>{data.todo_count} 项</span>}
                >
                  <div className="ow-todos">
                    {data.todos.map((t) => {
                      const Icon = icons[t.key];
                      return (
                        <button
                          key={t.key}
                          data-todo={t.key}
                          onClick={() =>
                            openList(t.route, {
                              ...(t.status ? { status: t.status } : {}),
                              ...(t.stage ? { stage: t.stage } : {}),
                            })
                          }
                        >
                          <span className={"ow-todo-icon " + t.key}>
                            <Icon size={18} />
                          </span>
                          <span>
                            <strong>
                              <b>{t.count}</b> {t.label}
                            </strong>
                            <small>{t.hint}</small>
                          </span>
                          <ArrowRight size={13} />
                        </button>
                      );
                    })}
                  </div>
                </Panel>
                <Panel
                  title="近期运输任务"
                  className="ow-task-panel"
                  extra={
                    <button onClick={() => openList("tasks")}>
                      全部任务 <ArrowRight size={13} />
                    </button>
                  }
                >
                  <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={data.items}
                    pagination={false}
                    size="small"
                    scroll={{ x: 760 }}
                    locale={{
                      emptyText: (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="暂无运输任务"
                        />
                      ),
                    }}
                  />
                </Panel>
              </div>
            </div>
            {ai && (
              <Panel
                title="交能 AI 助手"
                className="ow-ai-panel"
                extra={
                  <button
                    onClick={() =>
                      a.go("assistant", {
                        return_hash: location.hash,
                        agent_entry: {
                          capability: "AUTO",
                          ...(owner ? { owner_id: owner } : {}),
                        },
                      })
                    }
                  >
                    打开 <ExternalLink size={13} />
                  </button>
                }
              >
                <div className="ow-ai-intro">
                  <img src={avatar} alt="交能AI" />
                  <div>
                    <strong>你好，我是交能AI</strong>
                    <p>规划运输与补能，查询任务进度，梳理业务待办。</p>
                  </div>
                </div>
                <div className="ow-ai-prompts">
                  {prompts.map(([text, cap]) => (
                    <button key={text} onClick={() => ask(text, cap)}>
                      {text}
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
                <p className="ow-ai-note">
                  <ShieldCheck size={15} />
                  基于当前账号可见资料分析，业务办理由您核对确认。
                </p>
                <form
                  className="ow-ai-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(question);
                  }}
                >
                  <label htmlFor="overview-question">向交能AI提问</label>
                  <div>
                    <Input
                      id="overview-question"
                      aria-label="总览AI问题"
                      value={question}
                      maxLength={2000}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="输入您的业务问题…"
                    />
                    <Button
                      type="primary"
                      htmlType="submit"
                      aria-label="带入智能体中心"
                      disabled={!question.trim()}
                      icon={<ArrowRight size={18} />}
                    />
                  </div>
                </form>
              </Panel>
            )}
          </div>
        )
      )}
    </div>
  );
}
