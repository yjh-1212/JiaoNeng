import React, { useState, useRef, useEffect } from "react";
import { Input } from "antd";
import { Button } from "@lobehub/ui";
import {
  X,
  Send,
  RotateCcw,
  ArrowRight,
  Plus,
  MessageCircle,
} from "lucide-react";
import { request } from "./api";
import avatar from "./assets/jiaoneng-ai-v2.png";

export default function ScenarioChat({
  open,
  setOpen,
  scene,
  sourceType,
  sourceId,
  inputs,
  selected,
  dirty,
  busy,
  allowed,
  onApply,
  labels,
  valueText,
}) {
  const [messages, setMessages] = useState([]),
    [question, setQuestion] = useState(""),
    [waiting, setWaiting] = useState(false),
    [error, setError] = useState(""),
    [lastQuestion, setLastQuestion] = useState(""),
    launcher = useRef(),
    input = useRef(),
    tail = useRef(),
    active = useRef(true),
    ticket = useRef(0),
    sceneId = useRef(scene?.id);
  useEffect(
    () => () => {
      active.current = false;
      ticket.current++;
    },
    [],
  );
  useEffect(() => {
    if (open) {
      setTimeout(() => input.current?.focus(), 80);
      tail.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, waiting]);
  useEffect(() => {
    if (sceneId.current && scene?.id !== sceneId.current) {
      ticket.current++;
      setWaiting(false);
      setMessages([]);
      setError("");
    }
    sceneId.current = scene?.id;
  }, [scene?.id]);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  };
  const locked = !!scene?.generated_task_ids?.length;
  async function send(q = question, retry = false) {
    if (!q.trim() || waiting || !allowed || busy) return;
    const id = ++ticket.current;
    setError("");
    setLastQuestion(q);
    setQuestion("");
    setWaiting(true);
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 2400) }));
    if (retry && history.at(-1)?.role === "user") history.pop();
    if (!retry)
      setMessages((ms) => [
        ...ms,
        { id: crypto.randomUUID(), role: "user", text: q },
      ]);
    try {
      const r = await request("/api/scenarios/chat", {
        method: "POST",
        body: {
          question: q,
          history,
          ...(scene?.result
            ? {
                scenario_id: scene.id,
                expected_version: scene.version,
                candidate_id: selected,
              }
            : {
                source_resource: sourceType,
                source_id: sourceId,
                inputs: {
                  quantity: inputs.quantity,
                  goal: inputs.goal,
                  vehicle_count: inputs.vehicle_count,
                  resource_mode: inputs.resource_mode,
                },
              }),
        },
      });
      if (!active.current || id !== ticket.current) return;
      setMessages((ms) => [
        ...ms,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: r.reply.answer || r.reply.summary,
          model: r.reply.model,
          reply: r.reply,
        },
      ]);
    } catch (e) {
      if (active.current && id === ticket.current) setError(e.message);
    } finally {
      if (active.current && id === ticket.current) setWaiting(false);
    }
  }
  async function apply(message) {
    const done = await onApply(message.reply);
    if (done)
      setMessages((ms) => [
        ...ms.map((m) => (m.id === message.id ? { ...m, applied: true } : m)),
        {
          id: crypto.randomUUID(),
          role: "system",
          text: "已按确认条件重新测算，可在推荐方案中查看新结果。",
        },
      ]);
  }
  return (
    <>
      {open && (
        <section
          className="scenario-ai-window"
          role="dialog"
          aria-modal="false"
          aria-label="交能AI对话"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <header>
            <img src={avatar} alt="" />
            <div>
              <strong>交能AI</strong>
              <span>
                {scene?.result
                  ? dirty
                    ? "基于上次保存方案"
                    : scene.result.candidates.find((c) => c.id === selected)
                        ?.name || "本次推演"
                  : "运输与能源协同助手"}
              </span>
            </div>
            <Button
              size="small"
              type="text"
              icon={Plus}
              aria-label="新建交能AI对话"
              disabled={waiting}
              onClick={() => {
                setMessages([]);
                setError("");
                setQuestion("");
              }}
            />
            <Button
              size="small"
              type="text"
              icon={X}
              aria-label="关闭交能AI对话"
              onClick={close}
            />
          </header>
          <div
            className="scenario-ai-messages"
            role="log"
            aria-label="交能AI消息"
            aria-live="polite"
          >
            {!messages.length && (
              <div className="scenario-ai-welcome">
                <img src={avatar} alt="交能AI" />
                <strong>你好，我是交能AI</strong>
                <p>
                  {scene?.result
                    ? "可以帮你解释方案、比较取舍，也可以按你的想法调整后重算。"
                    : "告诉我你的运输目标，或先填写这批货，我会帮你理解测算条件。"}
                </p>
                <div>
                  {(scene?.result
                    ? [
                        "解释当前方案的主要瓶颈",
                        "各方案的成本有什么区别？",
                        "增加1个卸载车位，其他条件不变",
                      ]
                    : [
                        "我只有货量和起终点，怎么开始？",
                        "三个运输目标怎么选？",
                        "哪些条件需要我确认？",
                      ]
                  ).map((q) => (
                    <button
                      key={q}
                      disabled={!allowed || waiting || !!busy}
                      onClick={() => send(q)}
                    >
                      {q}
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div className={"scenario-ai-message " + m.role} key={m.id}>
                <span className="scenario-ai-role">
                  {m.role === "user"
                    ? "你"
                    : m.role === "assistant"
                      ? "交能AI"
                      : "系统"}
                </span>
                <div className="scenario-ai-bubble">{m.text}</div>
                {m.reply?.status === "ready" && (
                  <div className="scenario-ai-proposal">
                    <strong>待确认的调整</strong>
                    {m.reply.changes.map((c) => (
                      <div key={c.field}>
                        <span>{labels[c.field] || c.field}</span>
                        <span>
                          {valueText(c.field, c.before)}{" "}
                          <ArrowRight size={12} />{" "}
                          <b>{valueText(c.field, c.after)}</b>
                        </span>
                      </div>
                    ))}
                    {m.reply.unsupported?.map((x) => (
                      <small key={x}>{x}</small>
                    ))}
                    <Button
                      type="primary"
                      size="small"
                      disabled={
                        m.applied ||
                        locked ||
                        dirty ||
                        !!busy ||
                        !allowed ||
                        m.reply.expected_version !== scene?.version
                      }
                      loading={busy === "run"}
                      onClick={() => apply(m)}
                    >
                      {m.applied ? "已重新测算" : "按此条件重算"}
                    </Button>
                    {!m.applied &&
                      m.reply.expected_version !== scene?.version && (
                        <small>方案已更新，请重新提出调整。</small>
                      )}
                  </div>
                )}
                {m.reply?.status !== "ready" &&
                  m.reply?.unsupported?.map((x) => (
                    <small className="scenario-ai-model" key={x}>
                      {x}
                    </small>
                  ))}
                {m.model && (
                  <small className="scenario-ai-model">
                    AI分析 · 基于测算条件
                  </small>
                )}
              </div>
            ))}
            {waiting && (
              <div className="scenario-ai-thinking" role="status">
                <span />
                <span />
                <span />
                交能AI正在思考
              </div>
            )}
            {error && (
              <div className="scenario-ai-error" role="alert">
                <span>{error}</span>
                <Button
                  size="small"
                  type="text"
                  icon={RotateCcw}
                  onClick={() => send(lastQuestion, true)}
                  disabled={waiting || !!busy}
                >
                  重试
                </Button>
              </div>
            )}
            <div ref={tail} />
          </div>
          <div className="scenario-ai-composer">
            <Input.TextArea
              ref={input}
              aria-label="交能AI消息输入"
              value={question}
              maxLength={500}
              autoSize={{ minRows: 2, maxRows: 4 }}
              placeholder={
                allowed
                  ? "询问方案，或说说你想怎样调整…"
                  : "当前账号无AI对话权限"
              }
              disabled={!allowed || waiting || !!busy}
              onChange={(e) => setQuestion(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div>
              <small>
                {locked
                  ? "该场景已生成任务，可继续询问方案"
                  : dirty
                    ? "条件已修改，回复仍基于上次方案"
                    : "方案调整确认后才重算，任务由你最终生成"}
              </small>
              <Button
                type="primary"
                size="small"
                icon={Send}
                aria-label="发送交能AI消息"
                disabled={!question.trim() || waiting || !!busy || !allowed}
                onClick={() => send()}
              />
            </div>
          </div>
        </section>
      )}
      <button
        ref={launcher}
        className={"scenario-ai-launcher " + (open ? "active" : "")}
        aria-label={open ? "收起交能AI对话" : "打开交能AI对话"}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <img src={avatar} alt="" />
        <span>
          <MessageCircle size={12} />
          交能AI
        </span>
      </button>
    </>
  );
}
