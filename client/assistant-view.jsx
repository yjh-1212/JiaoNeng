import React, { useState } from "react";
import { Button } from "@lobehub/ui";
import { Empty, Alert, Input } from "antd";
import { useApp } from "./context";
import { request, detail } from "./api";
import { Heading, Card, Pill, time } from "./ui";
export default function AssistantWorkspace() {
  const a = useApp(),
    [messages, setMessages] = useState([]),
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [prepared, setPrepared] = useState(null);
  const send = async (q = value) => {
    if (!q.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setValue("");
    setBusy(true);
    setError("");
    try {
      const r = await request("/api/assistant", {
        method: "POST",
        body: { question: q },
      });
      setMessages((m) => [...m, { role: "assistant", text: r.answer, ...r }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const evidence = async (ref) => {
    if (ref.resource === "summary") {
      a.go("overview");
      return;
    }
    try {
      const latest = await detail(ref.resource || "orders", ref.id);
      if (latest.version !== ref.version)
        a.message.info(
          "资料已更新，回答引用版本 " +
            ref.version +
            "，当前版本 " +
            latest.version,
        );
      a.showDetail(ref.resource || "orders", ref.id);
    } catch (e) {
      a.message.error(e.message);
    }
  };
  const prepare = () =>
    a.openForm(
      "整理运输条件",
      [
        {
          key: "order_id",
          label: "来源订单",
          type: "select",
          required: true,
          options: a.boot.orders
            .filter((o) => o.status === "已确认")
            .map((o) => ({ value: o.id, label: o.code + " · " + o.name })),
        },
      ],
      { order_id: a.boot.orders.find((o) => o.status === "已确认")?.id },
      async (v) => {
        const r = await a.execute("assistant.prepare", null, v);
        setPrepared(r.preparation);
      },
    );
  return (
    <>
      <Heading title="智能助手">
        <Button
          disabled={!a.can("simulation.run") || !a.can("ai.use")}
          onClick={prepare}
        >
          整理运输条件
        </Button>
      </Heading>
      <Card className="assistant-layout">
        <aside className="conversation-list">
          <h2>业务对话</h2>
          <Button
            style={{ marginTop: 16, width: "100%" }}
            onClick={() => {
              setMessages([]);
              setError("");
              setPrepared(null);
            }}
          >
            新建对话
          </Button>
        </aside>
        <section className="conversation-area">
          <div className="messages">
            {!messages.length && (
              <Empty description="查询业务、整理条件或解释结果" />
            )}
            {messages.map((m, i) => (
              <div key={i} className={"message " + m.role}>
                <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
                {m.role === "assistant" && (
                  <>
                    <div className="row wrap" style={{ marginTop: 12 }}>
                      <Pill>{m.model ? "AI · 测算资料" : "资料核查"}</Pill>
                      <span className="small muted">{time(m.data_time)}</span>
                      {m.refs?.slice(0, 3).map((ref) => (
                        <Button
                          key={ref.resource + ref.id}
                          size="small"
                          onClick={() => evidence(ref)}
                        >
                          {ref.code}
                        </Button>
                      ))}
                      {m.evidence_refs?.length > 0 && (
                        <Button
                          size="small"
                          onClick={() =>
                            a.panel(
                              "本次引用资料",
                              <div className="stack">
                                {m.evidence_refs.map((ref) => (
                                  <Button
                                    key={ref.resource + ref.id}
                                    onClick={() => evidence(ref)}
                                  >
                                    {ref.code} · 版本 {ref.version}
                                  </Button>
                                ))}
                              </div>,
                            )
                          }
                        >
                          全部依据
                        </Button>
                      )}
                    </div>
                    <div className="row" style={{ marginTop: 12 }}>
                      {m.intent === "dispatch" ? (
                        <Button size="small" onClick={prepare}>
                          核对运输条件
                        </Button>
                      ) : (
                        m.suggestion && (
                          <Button
                            size="small"
                            onClick={() => a.go(m.suggestion.route)}
                          >
                            进入业务工作区
                          </Button>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
            {prepared && (
              <Card title="待核对运输条件">
                <div className="card-body stack">
                  <dl className="kv">
                    <dt>订单</dt>
                    <dd>
                      {a.label("order_id", prepared.order_id)} · 版本
                      {prepared.order_version}
                    </dd>
                    <dt>运力 / 场站</dt>
                    <dd>
                      {prepared.vehicle_ids
                        .map((v) => a.label("vehicle_id", v))
                        .join("、")}{" "}
                      / {a.label("station_id", prepared.station_id)}
                    </dd>
                    <dt>初始SOC / 参考余量</dt>
                    <dd>
                      {prepared.soc}% / {prepared.reserve_soc}%
                    </dd>
                  </dl>
                  {prepared.missing.length > 0 ? (
                    <Alert
                      type="warning"
                      message={prepared.missing.join("、")}
                    />
                  ) : (
                    <Button
                      type="primary"
                      onClick={() => a.go("simulation", prepared)}
                    >
                      进入交能推演
                    </Button>
                  )}
                </div>
              </Card>
            )}
            {error && <Alert type="error" message={error} />}
          </div>
          <div className="assistant-suggestions">
            {[
              "今天的运输任务有什么风险？",
              "解释最近的排队和负荷预测",
              "有哪些费用还未核验？",
            ].map((q) => (
              <Button
                key={q}
                size="small"
                disabled={busy}
                onClick={() => send(q)}
              >
                {q}
              </Button>
            ))}
          </div>
          <div className="composer">
            <Input.TextArea
              aria-label="业务问题"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 5 }}
              placeholder="输入业务问题"
            />
            <Button
              type="primary"
              loading={busy}
              disabled={!value.trim() || !a.can("ai.use")}
              onClick={() => send()}
            >
              发送
            </Button>
          </div>
        </section>
      </Card>
    </>
  );
}
