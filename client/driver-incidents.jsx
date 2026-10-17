import React, { useState } from "react";
import { Button, Alert, Empty, Pagination, Tag, Timeline } from "antd";
import { useApp } from "./context";
import { Card, Pill, time } from "./ui";
import { EnergyForm, field } from "./energy-panels";
import { useSafety } from "./safety-panels";

export function DriverIncidentHint({ task }) {
  const a = useApp(),
    r = useSafety("/api/safety/incidents", {
      task: task.id,
      stage: "open",
      pageSize: 1,
    });
  return r.data?.total ? (
    <div className="safety-note">
      <b>当前任务有 {r.data.total} 项待处理异常</b>
      <p>
        {r.data.items[0]?.instruction || "管理员正在核实处理，请查看最新进展"}
      </p>
      <Button
        onClick={() => a.go("m-tasks", { task_id: task.id, feedback: true })}
      >
        查看异常进展
      </Button>
    </div>
  ) : null;
}
export default function DriverIncidents({ taskId }) {
  const a = useApp(),
    [page, setPage] = useState(1),
    [stage, setStage] = useState("open"),
    [bump, setBump] = useState(0),
    [form, setForm] = useState(null),
    r = useSafety(
      "/api/safety/incidents",
      { task: taskId, stage, page, pageSize: 10 },
      bump,
    );
  const feedback = (row) =>
    setForm({
      title: "补充异常情况",
      resource: "alerts",
      row,
      fields: [
        field("report", "补充情况", "textarea"),
        field("evidence", "现场凭证", "textarea", { required: false }),
      ],
      submit: (v, version, key) =>
        a.execute(
          "incident.driver-feedback",
          row.id,
          { ...v, expected_version: version },
          key,
        ),
    });
  const acknowledge = (row) =>
    setForm({
      title: "确认收到处置要求",
      resource: "alerts",
      row,
      summary: row.instruction,
      fields: [
        field("confirm", "确认收到", "select", {
          options: [{ value: "yes", label: "已阅读并确认收到当前要求" }],
        }),
      ],
      submit: (v, version, key) =>
        a.execute(
          "incident.driver-ack",
          row.id,
          {
            expected_version: version,
            instruction_revision: row.instruction_revision,
          },
          key,
        ),
    });
  return (
    <div className="safety-driver-feedback">
      <div className="row between">
        <Button
          type={stage === "open" ? "primary" : "default"}
          onClick={() => {
            setStage("open");
            setPage(1);
          }}
        >
          待处理
        </Button>
        <Button
          type={stage === "closed" ? "primary" : "default"}
          onClick={() => {
            setStage("closed");
            setPage(1);
          }}
        >
          已关闭
        </Button>
        <Button onClick={() => setBump((n) => n + 1)}>刷新进展</Button>
      </div>
      {taskId && (
        <Button onClick={() => a.go("m-tasks", { feedback: true })}>
          查看本人全部异常
        </Button>
      )}
      {r.error && (
        <Alert
          type="error"
          title={r.error}
          action={<Button onClick={() => setBump((n) => n + 1)}>重试</Button>}
        />
      )}
      {!r.busy && !r.data?.total && !r.error && (
        <Empty description="暂无本人关联异常" />
      )}
      {r.data?.items.map((row) => (
        <Card key={row.id}>
          <div className="row between">
            <h3>{row.name}</h3>
            <Pill>{row.status_label}</Pill>
          </div>
          <small>
            {row.code} · {time(row.created_at)}
          </small>
          <p>{row.report}</p>
          <div className="safety-action-links">
            {row.tasks.map((t) => (
              <Button
                size="small"
                key={t.id}
                onClick={() => a.go("m-tasks", { task_id: t.id })}
              >
                {t.code}
              </Button>
            ))}
          </div>
          {row.instruction && (
            <section className="safety-note">
              <b>执行要求 · 版本 {row.instruction_revision}</b>
              <p>{row.instruction}</p>
              <Tag color={row.acknowledged ? "green" : "gold"}>
                {row.acknowledged ? "已确认收到" : "等待本人确认"}
              </Tag>
            </section>
          )}
          {row.history.length > 0 && (
            <Timeline
              items={row.history.slice(-3).map((h, i) => ({
                key: i,
                children: (
                  <span>
                    {time(h.at)} · {h.note || h.label}
                  </span>
                ),
              }))}
            />
          )}
          {row.driver_feedback.map((f, i) => (
            <p key={i}>
              本人补充：{f.report} · {time(f.at)}
            </p>
          ))}
          {row.result && (
            <p>
              处理结果：{row.result.summary} · {row.result.recovery}
            </p>
          )}
          {row.stage !== "closed" && (
            <div className="safety-action-links">
              {row.instruction && !row.acknowledged && (
                <Button type="primary" onClick={() => acknowledge(row)}>
                  确认收到
                </Button>
              )}
              <Button onClick={() => feedback(row)}>补充情况</Button>
            </div>
          )}
        </Card>
      ))}
      <Pagination
        current={page}
        total={r.data?.total || 0}
        pageSize={10}
        showSizeChanger={false}
        onChange={setPage}
        simple
      />
      {form && (
        <EnergyForm
          config={form}
          onClose={() => setForm(null)}
          onDone={() => setBump((n) => n + 1)}
        />
      )}
    </div>
  );
}
