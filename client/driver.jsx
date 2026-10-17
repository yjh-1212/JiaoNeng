import React, { useState, useEffect } from "react";
import { Button, Input } from "@lobehub/ui";
import { Tabs, Empty, Alert } from "antd";
import {
  ClipboardList,
  Zap,
  UserRound,
  ArrowLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { useApp } from "./context";
import { detail } from "./api";
import { Card, Pill, Source, format, time } from "./ui";
import DriverEnergy, { DriverEnergyHint } from "./driver-energy";
import DriverIncidents, { DriverIncidentHint } from "./driver-incidents";
export default function Driver({ page }) {
  const a = useApp(),
    [selected, setSelected] = useState(null),
    [task, setTask] = useState(null),
    [tab, setTab] = useState("active"),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (selected)
      detail("tasks", selected)
        .then(setTask)
        .catch((e) => setError(e.message));
    else setTask(null);
  }, [selected, a.revision]);
  useEffect(() => {
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const feedback = a.intentDraft?.feedback || params.get("feedback") === "1";
    setTab(feedback ? "feedback" : "active");
    setSelected(
      page === "m-tasks" && !feedback
        ? a.intentDraft?.task_id ||
            new URLSearchParams(location.hash.split("?")[1] || "").get(
              "task",
            ) ||
            null
        : null,
    );
    setError("");
  }, [page, a.intentDraft]);
  const tasks = a.boot.tasks.filter(
    (t) =>
      (tab === "history"
        ? ["已完成", "已取消", "余量已终止"].includes(t.status)
        : !["已完成", "已取消", "余量已终止"].includes(t.status)) &&
      (!query || t.code.includes(query)),
  );
  const action = (label, type, payload = {}) => (
    <Button
      type="primary"
      onClick={async () => {
        try {
          await a.execute(type, task.id, {
            expected_version: task.version,
            ...payload,
          });
        } catch (e) {
          setError(e.message);
        }
      }}
    >
      {label}
    </Button>
  );
  let footer;
  if (task) {
    const tr = task.trips?.find(
      (x) => !["已卸货", "已核验"].includes(x.status),
    );
    if (task.status === "待接收")
      footer = (
        <>
          <Button
            onClick={() =>
              a.openForm(
                "拒绝任务",
                [
                  {
                    key: "reason",
                    label: "拒绝原因",
                    type: "textarea",
                    required: true,
                  },
                ],
                {},
                (v) =>
                  a.execute("task.reject", task.id, {
                    ...v,
                    expected_version: task.version,
                  }),
              )
            }
          >
            拒绝任务
          </Button>
          {action("接收任务", "task.accept")}
        </>
      );
    else if (task.status === "已接收")
      footer = action("开始任务", "task.start");
    else if (task.status === "执行中")
      footer = tr ? (
        <Button type="primary" onClick={() => a.driverTrip(task, tr)}>
          {tr.status === "待装货"
            ? "反馈装货完成"
            : tr.status === "已装货"
              ? "开始运输"
              : "反馈卸货交付"}
        </Button>
      ) : (
        <>
          <Button
            onClick={() =>
              a
                .execute("trip.create", task.id, {
                  expected_version: task.version,
                })
                .catch((e) => setError(e.message))
            }
          >
            登记新车次
          </Button>
          <Button type="primary" onClick={() => a.submitCompletion(task)}>
            提交完工
          </Button>
        </>
      );
    else if (task.status === "退回补充")
      footer = (
        <Button type="primary" onClick={() => a.submitCompletion(task)}>
          补充后重新提交
        </Button>
      );
  }
  return (
    <div className="phone-wrap">
      <header className="phone-header">
        <div className="row">
          {task && (
            <button
              className="icon-btn"
              aria-label="返回任务列表"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h1>
            {page === "m-tasks"
              ? "我的任务"
              : page === "m-energy"
                ? "补能安排"
                : "我的"}
          </h1>
        </div>
        <Pill>司机工作区</Pill>
      </header>
      {page === "m-tasks" && !task && (
        <div className="phone-tabs">
          {[
            ["active", "当前任务"],
            ["history", "历史任务"],
            ["feedback", "异常反馈"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <main className="phone-content">
        {error && <Alert type="error" message={error} />}{" "}
        {page === "m-tasks" ? (
          task ? (
            <>
              <Card>
                <div className="row between">
                  <h2>{task.code}</h2>
                  <Pill>{task.status}</Pill>
                </div>
                <p className="route-title">
                  {a.boot.orders?.find((o) => o.id === task.order_id)?.origin ||
                    "装货场"}{" "}
                  →{" "}
                  {a.boot.orders?.find((o) => o.id === task.order_id)
                    ?.destination || "卸货场"}
                </p>
                <p className="muted">
                  {a.label("vehicle_id", task.vehicle_id)}
                </p>
                <div className="task-facts" style={{ marginTop: 18 }}>
                  <span>
                    计划量<strong>{format(task.quantity_kg / 1000)} t</strong>
                  </span>
                  <span>
                    报告量<strong>{format(task.reported_kg / 1000)} t</strong>
                  </span>
                  <span>
                    已核验<strong>{format(task.verified_kg / 1000)} t</strong>
                  </span>
                  <span>
                    车次<strong>{task.trips.length}车次</strong>
                  </span>
                </div>
              </Card>
              <DriverEnergyHint task={task} />
              <DriverIncidentHint task={task} />
              {task.return_reason && (
                <Alert
                  type="warning"
                  message={"退回补充：" + task.return_reason}
                />
              )}
              <Card>
                <h2>车次与执行过程</h2>
                <div className="timeline-events">
                  {task.trips.length ? (
                    task.trips.map((tr) => (
                      <div key={tr.id}>
                        <div className="row between">
                          <strong>{tr.code}</strong>
                          <Pill>{tr.status}</Pill>
                        </div>
                        <p>
                          {format(tr.delivered_kg / 1000)} t ·{" "}
                          {time(tr.occurred_at)}
                        </p>
                        <p>
                          {tr.delivery_evidence ||
                            tr.loading_evidence ||
                            "等待节点反馈"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <Empty description="暂无车次" />
                  )}
                </div>
              </Card>
              <div className="row between">
                <Button type="link" onClick={() => a.reportAlert(task)}>
                  报告异常
                </Button>
                <Button
                  type="link"
                  onClick={() => a.go("m-energy", { task_id: task.id })}
                >
                  查看补能安排
                </Button>
              </div>
              <Source row={task} />
            </>
          ) : tab === "feedback" ? (
            <DriverIncidents
              taskId={
                a.intentDraft?.feedback
                  ? a.intentDraft.task_id
                  : new URLSearchParams(location.hash.split("?")[1] || "").get(
                        "feedback",
                      ) === "1"
                    ? new URLSearchParams(
                        location.hash.split("?")[1] || "",
                      ).get("task")
                    : undefined
              }
            />
          ) : (
            <>
              <Input
                aria-label="搜索本人任务"
                placeholder="搜索任务编号"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {tasks.map((t) => (
                <button
                  key={t.id}
                  className="card task-card"
                  onClick={() => setSelected(t.id)}
                >
                  <div className="row between">
                    <h2>{t.code}</h2>
                    <Pill>{t.status}</Pill>
                  </div>
                  <p className="route-title">{t.name}</p>
                  <div className="row between">
                    <span>
                      {a.label("vehicle_id", t.vehicle_id)} ·{" "}
                      {format(t.quantity_kg / 1000)} t
                    </span>
                    <ChevronRight size={18} />
                  </div>
                </button>
              ))}
              {!tasks.length && (
                <Card>
                  <Empty description="暂无当前任务" />
                </Card>
              )}
            </>
          )
        ) : page === "m-energy" ? (
          <DriverEnergy />
        ) : (
          <>
            <Card>
              <h2>{a.boot.user.name}</h2>
              <Button type="link" onClick={a.editProfile}>
                维护个人信息
              </Button>
              <p className="muted" style={{ marginTop: 12 }}>
                {a.label("driver_id", a.boot.user.driver_id)} · 司机
              </p>
            </Card>
            <Card>
              <div className="action-list">
                <button
                  onClick={() => {
                    a.go("m-tasks");
                    setTab("history");
                  }}
                >
                  <strong>历史任务</strong>
                  <ChevronRight size={16} />
                </button>
              </div>
            </Card>
            <Button danger icon={LogOut} onClick={a.logout}>
              退出登录
            </Button>
          </>
        )}
      </main>
      {footer && <div className="phone-action">{footer}</div>}
      <nav className="phone-nav" aria-label="司机导航">
        {[
          ["m-tasks", "任务", ClipboardList],
          ["m-energy", "补能", Zap],
          ["m-profile", "我的", UserRound],
        ].map(([route, label, Icon]) => (
          <button
            key={route}
            className={page === route ? "active" : ""}
            onClick={() => a.go(route)}
          >
            <Icon size={21} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
