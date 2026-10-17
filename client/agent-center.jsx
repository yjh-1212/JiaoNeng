import React, { useEffect, useRef, useState } from "react";
import { Button } from "@lobehub/ui";
import {
  Input,
  Select,
  Alert,
  Empty,
  Drawer,
  Descriptions,
  Tag,
  Dropdown,
  Modal,
  Form,
} from "antd";
import {
  Plus,
  Home,
  LayoutGrid,
  Search,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  MoreHorizontal,
  Square,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Route,
  Truck,
  Zap,
  ShieldCheck,
  MapPinned,
  Info,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { agents, agentByCode, resourceLabels } from "../shared/agents";
import { useApp } from "./context";
import { request, detail } from "./api";
import { Heading, format, time, Pill } from "./ui";
import avatar from "./assets/jiaoneng-ai-v2.png";
import "./agent-center.css";
const icons = {
  package: Package,
  route: Route,
  truck: Truck,
  zap: Zap,
  shield: ShieldCheck,
  map: MapPinned,
};
const stamp = (d) =>
  new Date(d).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  });
const factsLabels = {
  quantity_kg: "计划运量（kg）",
  verified_kg: "核验交付（kg）",
  reported_kg: "司机申报（kg）",
  quantity_kwh: "补能电量（kWh）",
  start_at: "开始时间",
  finish_at: "完成期限",
  arrival_at: "预计到站",
  vehicle_id: "车辆",
  driver_id: "司机",
  station_id: "场站",
  soc: "SOC（%）",
  power_kw: "功率（kW）",
  capacity_kwh: "电池容量（kWh）",
  payload_kg: "载重（kg）",
  status: "状态",
  cargo: "货物",
  origin: "起运地",
  destination: "目的地",
  source_time: "数据时间",
  compatibility: "适配规格",
  trigger: "触发依据",
  severity: "等级",
  report: "报告",
  instruction: "处理要求",
  name: "名称",
  code: "编号",
};
const inputText = (v) =>
  typeof v === "object"
    ? v?.name || "待补充"
    : v == null
      ? "待补充"
      : String(v);
export default function AgentCenter({compact=false}) {
  const a = useApp(),
    entry = a.intentDraft?.agent_entry || {},
    [context, setContext] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [cap, setCap] = useState(entry.capability || "AUTO"),
    [owner, setOwner] = useState(entry.owner_id || a.user.scopes[0]),
    [resource, setResource] = useState(entry.context_resource || ""),
    [objectId, setObjectId] = useState(entry.context_id || null),
    [conversation, setConversation] = useState(null),
    [home, setHome] = useState(compact ? false : !entry.question),
    [square, setSquare] = useState(false),
    [history, setHistory] = useState([]),
    [historyTotal, setHistoryTotal] = useState(0),
    [historyPage, setHistoryPage] = useState(1),
    [historyQuery, setHistoryQuery] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [archived, setArchived] = useState(false),
    [question, setQuestion] = useState(entry.question || ""),
    [busy, setBusy] = useState(false),
    [stopping, setStopping] = useState(false),
    [operation, setOperation] = useState(""),
    [lastQuestion, setLastQuestion] = useState(""),
    [lastKey, setLastKey] = useState(null),
    [sidebar, setSidebar] = useState(true),
    [source, setSource] = useState(null),
    [sourceError, setSourceError] = useState(""),
    [renaming, setRenaming] = useState(null),
    [title, setTitle] = useState(""),
    compose = useRef(),
    tail = useRef(),
    sourceTicket = useRef(0),
    historyTicket = useRef(0),
    run = useRef(0),
    controller = useRef(),
    conversationRef = useRef(null),
    returnHash = useRef(
      a.intentDraft?.return_hash ||
        sessionStorage.getItem("agent-return-" + a.user.id) ||
        "#overview",
    ),
    [draftFields, setDraftFields] = useState({});
  conversationRef.current = conversation;
  const active = agentByCode(cap),
    turns = conversation?.turns || [],
    blocked = !!conversation?.archived,
    accountKey = `agent-input-${a.user.id}-${compact?a.currentPage:'center'}-${conversation?.id || "new-" + cap + "-" + owner}`;
  useEffect(() => {
    sessionStorage.setItem("agent-return-" + a.user.id, returnHash.current);
    let live = true;
    request("/api/agents/context")
      .then(async (c) => {
        if (entry.context_resource && entry.context_id) {
          const r = await detail(entry.context_resource, entry.context_id);
          if (live) setOwner(r.owner_id);
        }
        if (live) {
          setContext(c);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    try {
      if(!conversation && entry.question) return;
      const saved = localStorage.getItem(accountKey);
      if (saved !== null) setQuestion(saved);
    } catch {}
  }, [accountKey]);
  useEffect(() => {
    try {
      localStorage.setItem(accountKey, question);
    } catch {}
  }, [question, accountKey]);
  useEffect(() => {
    if (busy && conversation?.id) {
      return a.registerLeaveGuard?.((next) =>
        a.confirm(
          "离开智能体中心",
          "分析仍在进行。停止分析并返回业务？",
          async () => {
            await stop();
            next();
          },
        ),
      );
    }
  }, [busy, conversation?.id]);
  async function loadHistory(page = 1, append = false) {
    const t = ++historyTicket.current;
    setHistoryError("");
    try {
      const d = await request(
        "/api/agents/conversations?" +
          new URLSearchParams({
            page,
            q: historyQuery,
            archived: archived ? "1" : "0",
          }),
      );
      if (t !== historyTicket.current) return;
      setHistory((h) => (append ? [...h, ...d.items] : d.items));
      setHistoryTotal(d.total);
      setHistoryPage(page);
    } catch (e) {
      if (t === historyTicket.current) setHistoryError(e.message);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => loadHistory(), historyQuery ? 200 : 0);
    return () => {
      clearTimeout(timer);
      historyTicket.current++;
    };
  }, [historyQuery, archived]);
  const replace = (id) => historyReplace(id);
  function historyReplace(id) {
    if(compact)return;
    window.history.replaceState(
      null,
      "",
      id ? "#assistant?conversation=" + encodeURIComponent(id) : "#assistant",
    );
  }
  useEffect(() => {
    if(compact)return;
    const id = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "conversation",
    );
    if (id) openHistory(id);
  }, []);
  async function openHistory(id) {
    if (busy) return;
    const t = ++sourceTicket.current;
    setLoading(true);
    setError("");
    try {
      const c = await request("/api/agents/conversations/" + id);
      if (t !== sourceTicket.current) return;
      setConversation(c);
      setCap(c.capability);
      setOwner(c.owner_id);
      setResource(c.context_resource || "");
      setObjectId(c.context_id);
      setHome(false);
      setSquare(false);
      replace(c.id);
    } catch (e) {
      if (t === sourceTicket.current) setError(e.message);
    } finally {
      if (t === sourceTicket.current) setLoading(false);
    }
  }
  function newConversation(code = cap) {
    if (busy) return;
    setConversation(null);
    setCap(code);
    setHome(code === "AUTO");
    setSquare(false);
    setError("");
    setOperation("");
    setLastQuestion("");
    setLastKey(null);
    setDraftFields({});
    replace(null);
  }
  function choose(code) {
    if (
      resource &&
      !agentByCode(code)?.resources.includes(resource) &&
      code !== "AUTO"
    ) {
      setResource("");
      setObjectId(null);
    }
    newConversation(code);
    setHome(false);
    setSquare(false);
  }
  async function send(q = question, key = null) {
    if (!q.trim() || busy || blocked) return;
    const ticket = ++run.current;
    setBusy(true);
    setStopping(false);
    setOperation("正在读取业务记录并生成分析…");
    setError("");
    setLastQuestion(q);
    const requestKey = key || crypto.randomUUID();
    setLastKey(requestKey);
    let c = conversation;
    try {
      if (!c) {
        const r = await request("/api/agents/conversations", {
          method: "POST",
          body: {
            capability: cap,
            owner_id: owner,
            ...(resource && objectId
              ? { context_resource: resource, context_id: objectId }
              : {}),
            draft: entry.draft || {},
          },
        });
        c = await request("/api/agents/conversations/" + r.id);
        setConversation(c);
        conversationRef.current = c;
        replace(c.id);
      }
      setHome(false);
      setSquare(false);
      controller.current = new AbortController();
      const result = await request(
        "/api/agents/conversations/" + c.id + "/messages",
        {
          method: "POST",
          body: { question: q, request_key: requestKey },
          signal: controller.current.signal,
        },
      );
      if (ticket !== run.current) return;
      setQuestion("");
      localStorage.removeItem(accountKey);
      setLastQuestion("");
      setLastKey(null);
      setOperation("");
      const updated = await request("/api/agents/conversations/" + c.id);
      setConversation(updated);
      setDraftFields(updated.draft || {});
      loadHistory();
    } catch (e) {
      if (ticket === run.current) {
        setOperation("");
        setError(e.code === "CANCELLED" ? "已停止分析，问题已保留" : e.message);
      }
    } finally {
      if (ticket === run.current) {
        setBusy(false);
        setStopping(false);
        controller.current = null;
      }
    }
  }
  async function stop() {
    if (!conversationRef.current) return;
    setStopping(true);
    try {
      await request(
        "/api/agents/conversations/" + conversationRef.current.id + "/cancel",
        { method: "POST", body: {} },
      );
      controller.current?.abort();
      run.current++;
      setBusy(false);
      setStopping(false);
      setOperation("已停止分析，问题已保留");
      const c = await request(
        "/api/agents/conversations/" + conversationRef.current.id,
      );
      setConversation(c);
      loadHistory();
    } catch (e) {
      setError(e.message);
      setStopping(false);
    }
  }
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns.length, busy]);
  function returnBusiness() {
    if (busy) {
      a.confirm("返回业务系统", "停止当前分析并返回？", async () => {
        await stop();
        leaveCenter();
      });
      return;
    }
    leaveCenter();
  }
  function leaveCenter() {
    if (a.closeAgentCenter) {
      a.closeAgentCenter();
      if(!compact)window.history.replaceState(null, "", returnHash.current);
      return;
    }
    const hash = returnHash.current,
      route = hash.slice(1).split("?")[0] || "overview";
    a.go(route);
    window.history.replaceState(null, "", hash);
  }
  async function updateConversation(row, action, body) {
    try {
      await request("/api/agents/conversations/" + row.id + "/" + action, {
        method: "POST",
        body: { expected_version: row.version, ...body },
      });
      if (conversation?.id === row.id) await openHistory(row.id);
      loadHistory();
    } catch (e) {
      setError(e.message);
    }
  }
  function goBusiness(resource, id, capability = cap) {
    const mapping = {
      demands: "demands",
      orders: "orders",
      tasks: "tasks",
      vehicles: "resources",
      drivers: "resources",
      charging: "charging",
      stations: "stations",
      devices: "stations",
      alerts: "alerts",
      "simulation-scenarios": "simulation",
      "planning-projects": "planning",
      "planning-solutions": "deployment",
      candidates: "planning",
    };
    const route =
      mapping[resource] || agentByCode(capability)?.route || "overview";
    const args = {
      ...(resource === "tasks" ? { task_id: id } : {}),
      ...(resource === "orders" ? { order_id: id } : {}),
      ...(resource === "charging" ? { plan_id: id } : {}),
      ...(resource === "stations" ? { station_id: id } : {}),
      ...(resource === "alerts" ? { incident_id: id } : {}),
    };
    if (["planning-projects", "planning-solutions"].includes(resource) && id) {
      const projectId =
        resource === "planning-projects"
          ? id
          : turns
              .flatMap((t) => t.response.samples || [])
              .flatMap((s) => s.items)
              .find((s) => s.id === id)?.project_id;
      if (projectId)
        sessionStorage.setItem("planner-project-" + a.user.id, projectId);
    }
    a.go(route, args);
  }
  async function showSource(r) {
    setSourceError("");
    setSource({ loading: true, ref: r });
    try {
      const row = await detail(r.resource, r.id);
      setSource({ row, ref: r });
    } catch (e) {
      setSourceError(e.message);
      setSource({ ref: r });
    }
  }
  async function handoff(kind, draft) {
    try {
      const h = await request(
        "/api/agents/conversations/" + conversation.id + "/handoff",
      );
      if (kind === "demand") {
        a.editDemand(null, {
          ...draft,
          owner_id: h.owner_id,
          origin: draft.origin?.name || draft.origin,
          destination: draft.destination?.name || draft.destination,
        });
        return;
      }
      sessionStorage.setItem("simulation-owner-" + a.user.id, h.owner_id);
      a.go("simulation", {
        agent_handoff: conversation.id,
        ...(h.resource === "orders"
          ? { order_id: h.id }
          : h.resource === "demands"
            ? { demand_id: h.id }
            : {}),
      });
    } catch (e) {
      setError(e.message);
    }
  }
  function renderTurn(t) {
    const r = t.response,
      agent = agentByCode(r.capability),
      Icon = icons[agent?.icon] || Route;
    return (
      <section className="ac-turn" key={t.id}>
        <div className="ac-user-message">{t.question}</div>
        <div className="ac-answer">
          <span className="ac-answer-avatar" style={{ color: agent?.color }}>
            <Icon size={20} />
          </span>
          <article>
            <div className="ac-answer-byline">
              <b>{agent?.name || "交能AI"}</b>
              <span>AI分析</span>
            </div>
            <p className="ac-answer-text">{r.answer}</p>
            {r.stale && (
              <Alert
                type="warning"
                title="引用资料已变化，历史回答仅供追溯，请重新分析后办理"
              />
            )}
            {r.statistics?.length > 0 && (
              <div className="ac-fact-summary">
                {r.statistics.map((s) => (
                  <div key={s.resource}>
                    <span>{s.label}</span>
                    <b>
                      {s.total}
                      <small> 条</small>
                    </b>
                  </div>
                ))}
              </div>
            )}
            {(r.samples || [])
              .filter((s) => s.items.length)
              .slice(0, 1)
              .map((s) => (
                <div className="ac-record-card" key={s.resource}>
                  <header>
                    <b>{s.label}</b>
                    <small>
                      {s.is_sample ? "参考记录" : "关联记录"} · 展示
                      {s.sample_count} / 共{s.total}
                    </small>
                  </header>
                  {s.items.slice(0, 4).map((row) => (
                    <button
                      key={row.id}
                      onClick={() =>
                        showSource({ resource: s.resource, ...row })
                      }
                    >
                      <span>
                        <b>{row.code || row.name}</b>
                        <small>{row.name !== row.code ? row.name : ""}</small>
                      </span>
                      <Pill>{row.status}</Pill>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              ))}
            {r.adjustment?.status === "ready" && (
              <div className="ac-condition-card">
                <header>
                  <b>待确认的调整</b>
                  <Tag>未应用</Tag>
                </header>
                <div className="ac-condition-grid">
                  {r.adjustment.changes.map((change) => (
                    <div key={change.field}>
                      <span>
                        {{
                          vehicle_count: "车辆数量",
                          unloading_slots: "卸载车位",
                          loading_slots: "装载车位",
                          deadline: "完成期限",
                          start_at: "开始时间",
                          target_soc: "目标SOC",
                          max_wait: "等待上限",
                          loading_minutes: "装载分钟",
                          unloading_minutes: "卸载分钟",
                          max_driver_hours: "司机工时",
                          vehicle_limit: "车辆上限",
                          goal: "运输目标",
                          resource_mode: "运力范围",
                        }[change.field] || "运输条件"}
                      </span>
                      <b>
                        {String(change.before)} → {String(change.after)}
                      </b>
                    </div>
                  ))}
                </div>
                <div className="ac-card-actions">
                  <Button
                    type="primary"
                    disabled={busy || r.stale || !a.can("simulation.run")}
                    onClick={() => handoff("simulation", r.draft)}
                  >
                    核对调整条件
                  </Button>
                </div>
              </div>
            )}
            {r.plans?.map((p) => (
              <div className="ac-plan-card" key={p.id}>
                <header>
                  <b>{p.name}</b>
                  <Pill>{p.status}</Pill>
                </header>
                {p.candidates.map((c) => (
                  <div className="ac-plan-row" key={c.id}>
                    <b>{c.name}</b>
                    <Pill>{c.feasible ? "条件可行" : "条件不满足"}</Pill>
                    <span>
                      {c.metrics?.vehicle_count != null
                        ? c.metrics.vehicle_count + "辆车"
                        : ""}
                    </span>
                    <span>
                      {c.metrics?.finish_at
                        ? "完成 " + time(c.metrics.finish_at)
                        : ""}
                    </span>
                  </div>
                ))}
                <Button
                  type="link"
                  onClick={() => handoff("simulation", r.draft)}
                >
                  打开交能推演
                </Button>
              </div>
            ))}
            {["DEMAND", "SIMULATION"].includes(r.capability) &&
              t.id === turns.at(-1)?.id && (
                <div className="ac-condition-card">
                  <header>
                    <b>运输条件</b>
                    <Tag>待确认</Tag>
                  </header>
                  <div className="ac-condition-grid">
                    {[
                      ["cargo", "货物"],
                      ["quantity", "运输量（吨）"],
                      ["origin", "起运地"],
                      ["destination", "目的地"],
                    ].map(([k, l]) => (
                      <div key={k}>
                        <span>{l}</span>
                        <b>
                          {inputText(
                            (Object.keys(draftFields).length
                              ? draftFields
                              : r.draft)?.[k],
                          )}
                        </b>
                      </div>
                    ))}
                  </div>
                  <div className="ac-card-actions">
                    <Button
                      type="primary"
                      disabled={r.stale || !a.can("simulation.run")}
                      onClick={() => handoff("simulation", r.draft)}
                    >
                      带入交能推演
                    </Button>
                    {r.capability === "DEMAND" && (
                      <Button
                        disabled={r.stale || !a.can("demand.write")}
                        onClick={() => handoff("demand", r.draft)}
                      >
                        填写需求草稿
                      </Button>
                    )}
                  </div>
                </div>
              )}
            {!["DEMAND", "SIMULATION"].includes(r.capability) && (
              <div className="ac-card-actions">
                <Button
                  disabled={r.stale}
                  onClick={() =>
                    goBusiness(
                      agentByCode(r.capability).resources[0] === conversation.context_resource
                        ? conversation.context_resource : null,
                      conversation.context_id,
                      r.capability,
                    )
                  }
                >
                  进入
                  {
                    {
                      DISPATCH: "运输任务",
                      CHARGING: "补能调度",
                      INCIDENT: "异常处置",
                      PLANNING: "规划工作区",
                    }[r.capability]
                  }
                </Button>
              </div>
            )}
            <footer className="ac-answer-footer">
              <span>{time(t.created_at)} · 测算资料</span>
              <button onClick={() => setSource({ evidence: r })}>
                查看依据 ({r.refs?.length || 0})
              </button>
            </footer>
          </article>
        </div>
      </section>
    );
  }
  const composer = (
    <form
      className="ac-composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Input.TextArea
        ref={compose}
        aria-label="向交能AI提问"
        autoSize={{ minRows: 2, maxRows: 6 }}
        placeholder={
          active
            ? "向" + active.name + "提问…"
            : "描述你的运输、补能或规划问题…"
        }
        value={question}
        maxLength={2000}
        disabled={busy || blocked}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
      />
      <footer>
        <span>
          <img src={avatar} alt="" />
          {active?.name || "交能AI助手"}
        </span>
        {busy ? (
          <Button
            aria-label="停止分析"
            loading={stopping}
            icon={Square}
            onClick={stop}
          >
            停止
          </Button>
        ) : (
          <Button
            type="primary"
            aria-label="发送问题"
            icon={ArrowUp}
            disabled={!question.trim() || blocked}
            htmlType="submit"
          />
        )}
      </footer>
    </form>
  );
  return (
    <div className={"agent-center" + (compact ? " ac-compact" : "") + (!sidebar ? " ac-sidebar-collapsed" : "")}>
      <Heading title="AI智能体中心" />
      <aside className="ac-sidebar">
        <button
          className="ac-brand"
          onClick={() => {
            newConversation("AUTO");
            setHome(true);
          }}
          disabled={busy}
        >
          <img src={avatar} alt="交能AI" />
          <span>
            <b>交能AI</b>
            <small>智能体中心</small>
          </span>
        </button>
        <Button
          type="primary"
          icon={Plus}
          block
          disabled={busy}
          onClick={() => newConversation()}
        >
          新建对话
        </Button>
        <nav>
          <button
            className={home && !square ? "active" : ""}
            disabled={busy}
            onClick={() => {
              newConversation("AUTO");
              setHome(true);
            }}
          >
            <Home size={18} />
            首页
          </button>
          <button
            className={square ? "active" : ""}
            disabled={busy}
            onClick={() => {
              setHome(true);
              setSquare(true);
            }}
          >
            <LayoutGrid size={18} />
            智能体广场<span>6</span>
          </button>
        </nav>
        <div className="ac-history-heading">
          <span>{archived ? "已归档对话" : "最近对话"}</span>
          <button
            aria-label="刷新历史对话"
            onClick={() => loadHistory()}
            disabled={busy}
          >
            <RotateCcw size={14} />
          </button>
          <button
            aria-label={archived ? "查看最近对话" : "查看归档对话"}
            onClick={() => setArchived(!archived)}
            disabled={busy}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
        <Input
          prefix={<Search size={14} />}
          aria-label="搜索历史对话"
          placeholder="搜索历史对话"
          value={historyQuery}
          onChange={(e) => setHistoryQuery(e.target.value)}
          allowClear
        />
        <div className="ac-history">
          {historyError && (
            <Alert
              type="error"
              title={historyError}
              action={<Button onClick={() => loadHistory()}>重试</Button>}
            />
          )}{" "}
          {history.map((h) => {
            const Icon = icons[agentByCode(h.capability)?.icon] || Route;
            return (
              <div
                className={
                  "ac-history-row" +
                  (conversation?.id === h.id ? " selected" : "")
                }
                key={h.id}
              >
                <button disabled={busy} onClick={() => openHistory(h.id)}>
                  <Icon size={15} />
                  <span>{h.title}</span>
                  <small>{stamp(h.updated_at)}</small>
                </button>
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    items: [
                      { key: "rename", label: "重命名" },
                      {
                        key: "archive",
                        label: h.archived ? "恢复对话" : "归档对话",
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === "rename") {
                        setRenaming(h);
                        setTitle(h.title);
                      } else
                        updateConversation(h, "archive", {
                          archived: !h.archived,
                        });
                    },
                  }}
                >
                  <button aria-label={"管理对话 " + h.title} disabled={busy}>
                    <MoreHorizontal size={14} />
                  </button>
                </Dropdown>
              </div>
            );
          })}
          {!history.length && !historyError && (
            <p>开始对话后，记录将保存在这里。</p>
          )}
          {history.length < historyTotal && (
            <Button
              type="link"
              onClick={() => loadHistory(historyPage + 1, true)}
            >
              加载更多
            </Button>
          )}
        </div>
        <div className="ac-sidebar-bottom">
          <button onClick={returnBusiness}>
            <ArrowLeft size={16} />
            返回业务系统
          </button>
          <div className="ac-account">
            <span>{a.user.name.slice(0, 1)}</span>
            <div>
              <b>{a.user.name}</b>
              <small>
                {context?.organizations.find((o) => o.id === owner)?.name ||
                  "当前授权主体"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <main className="ac-workspace">
        <header className="ac-topbar">
          <button
            className="ac-panel-toggle"
            aria-label="切换会话侧栏"
            onClick={() => setSidebar(!sidebar)}
          >
            {sidebar ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
          {!home ? (
            <Select
              aria-label="切换智能体"
              value={cap}
              disabled={busy}
              onChange={choose}
              options={[
                { value: "AUTO", label: "交能AI助手" },
                ...agents.map((g) => ({ value: g.code, label: g.name })),
              ]}
            />
          ) : (
            <span>{square ? "智能体广场" : "交能AI助手"}</span>
          )}
          <span className="ac-conversation-title">
            {conversation?.title === "新对话" ? "" : conversation?.title}
          </span>
          <button onClick={returnBusiness}>
            <ExternalLink size={16} />
            返回业务系统
          </button>
        </header>
        {error && (
          <Alert
            className="ac-error"
            type="error"
            title={error}
            action={
              <Button
                disabled={busy}
                onClick={() =>
                  lastQuestion
                    ? send(lastQuestion, lastKey)
                    : openHistory(conversation?.id)
                }
              >
                重试
              </Button>
            }
          />
        )}
        {blocked && (
          <Alert
            type="info"
            title="此对话已归档，可查看历史或恢复后继续"
            action={
              <Button
                onClick={() =>
                  updateConversation(conversation, "archive", {
                    archived: false,
                  })
                }
              >
                恢复对话
              </Button>
            }
          />
        )}
        {loading ? (
          <div className="ac-loading">正在载入智能体工作区…</div>
        ) : !context ? (
          <Empty description="智能体中心未能加载">
            <Button onClick={() => location.reload()}>重新加载</Button>
          </Empty>
        ) : home ? (
          <div className="ac-home">
            <section className="ac-banner" aria-label="交能AI介绍">
              <div>
                <span className="ac-banner-brand">交能AI</span>
                <h2>让运输与能源协同更清晰</h2>
                <p>从运输需求到资源规划，六个智能体协助您处理业务。</p>
              </div>
              <img src={avatar} alt="交能AI人物" />
            </section>
            {!square && composer}
            <div className="ac-agent-grid">
              {agents.map((g) => {
                const Icon = icons[g.icon];
                return (
                  <button
                    className="ac-agent-card"
                    key={g.code}
                    disabled={busy}
                    onClick={() => choose(g.code)}
                  >
                    <span
                      className="ac-agent-icon"
                      style={{ color: g.color, background: g.color + "12" }}
                    >
                      <Icon size={24} />
                    </span>
                    <div>
                      <strong>{g.name}</strong>
                      <p>{g.brief}</p>
                    </div>
                    <ArrowRight size={17} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="ac-chat">
            <div className="ac-messages" role="log" aria-label="智能体对话记录">
              {!turns.length && !busy && (
                <div className="ac-welcome">
                  <span className="ac-welcome-icon">
                    {(() => {
                      const Icon = icons[active?.icon] || Route;
                      return <Icon size={26} />;
                    })()}
                  </span>
                  <h1>{active?.name || "交能AI助手"}</h1>
                  <p>
                    {active?.intro ||
                      "描述你的业务问题，我会选择合适的智能体，结合授权资料给出分析。"}
                  </p>
                  <div className="ac-examples">
                    {(
                      (compact && entry.examples?.length ? entry.examples : active?.examples) || [
                        "帮我整理一批煤炭运输的条件。",
                        "哪些任务与补能安排需要关注？",
                      ]
                    ).map((q) => (
                      <button type="button" key={q} onClick={() => send(q)}>
                        <span>{q}</span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map(renderTurn)}
              {busy && (
                <>
                  <div className="ac-user-message">{lastQuestion}</div>
                  <div className="ac-progress" role="status">
                    <span />
                    {operation}
                  </div>
                </>
              )}
              {!busy && operation && <p className="ac-progress">{operation}</p>}
              <div ref={tail} />
            </div>
            <div className="ac-compose-area">
              {composer}
              <small>基于当前授权资料分析 · 业务办理需核对确认</small>
            </div>
          </div>
        )}
      </main>
      <Drawer
        open={!!source}
        onClose={() => {
          setSource(null);
          setSourceError("");
        }}
        title="业务依据"
        width={700}
        className="ac-source-drawer"
      >
        {sourceError && <Alert type="error" title={sourceError} />}{" "}
        {source?.loading ? (
          <p>正在读取来源…</p>
        ) : source?.evidence ? (
          <>
            <Pill>测算资料</Pill>
            <p>数据时间：{time(source.evidence.data_time)}</p>
            {source.evidence.limitations?.map((x) => (
              <p key={x}>{x}</p>
            ))}
            {source.evidence.refs?.map((r) => (
              <button
                className="ac-source-reference"
                key={r.resource + r.id}
                onClick={() => showSource(r)}
              >
                <span>
                  {resourceLabels[r.resource]} · {r.code}
                </span>
                <small>引用版本 {r.version}</small>
                <ArrowRight size={14} />
              </button>
            ))}
          </>
        ) : source?.row ? (
          <>
            <Pill>{source.row.source_label || "测算资料"}</Pill>
            <Descriptions
              column={1}
              bordered
              size="small"
              items={Object.entries(factsLabels)
                .filter(([k]) => source.row[k] != null)
                .map(([k, l]) => ({
                  key: k,
                  label: l,
                  children:
                    k.endsWith("_at") || k === "source_time"
                      ? time(source.row[k])
                      : typeof source.row[k] === "object"
                        ? JSON.stringify(source.row[k])
                        : String(source.row[k]),
                }))}
            />
            <p>
              引用版本 {source.ref.version} · 当前版本 {source.row.version}
            </p>
            <Button
              onClick={() => {
                goBusiness(source.ref.resource, source.ref.id);
                setSource(null);
              }}
            >
              打开业务页面
            </Button>
          </>
        ) : null}
      </Drawer>
      <Modal
        open={!!renaming}
        title="重命名对话"
        onCancel={() => setRenaming(null)}
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>取消</Button>
            <Button
              type="primary"
              disabled={!title.trim()}
              onClick={async () => {
                await updateConversation(renaming, "rename", { title });
                setRenaming(null);
              }}
            >
              保存名称
            </Button>
          </>
        }
      >
        <Input
          aria-label="对话名称"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Modal>
    </div>
  );
}
