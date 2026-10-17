import React from "react";
import { Button } from "@lobehub/ui";
import { PanelRightClose, ChevronLeft, Truck, Bot, Info } from "lucide-react";
import { Pill, time, format, money } from "./ui";
export default function FloatingPlans({
  result,
  plan,
  scene,
  selected,
  setSelected,
  open,
  setOpen,
  dirty,
  busy,
  canAdopt,
  onAdopt,
  onTasks,
  onExplain,
  onEvidence,
}) {
  if (!result) return null;
  if (!open)
    return (
      <Button
        className="floating-plan-open"
        icon={ChevronLeft}
        onClick={() => setOpen(true)}
      >
        推荐方案
      </Button>
    );
  const locked = !!scene.generated_task_ids?.length,
    previous = result.previous_summary,
    unit = (c) =>
      c.metrics.unit_cost_cents ??
      (c.metrics.delivered_kg
        ? Math.round(
            (c.metrics.total_cost_cents * 1000) / c.metrics.delivered_kg,
          )
        : null);
  return (
    <aside className="floating-plans" aria-label="推荐方案">
      <header>
        <div>
          <strong>推荐方案</strong>
          <span>
            {result.recommended_id
              ? "按当前运输目标比选"
              : "当前范围暂无可行方案"}
          </span>
        </div>
        <Button
          type="text"
          size="small"
          icon={PanelRightClose}
          aria-label="收起推荐方案"
          onClick={() => setOpen(false)}
        />
      </header>
      <div className="floating-plans-scroll">
        {result.no_solution && (
          <div className="floating-no-solution">
            <strong>
              推演运量缺口 {format(result.no_solution.remaining_kg / 1000)} 吨
            </strong>
            <span>
              {result.no_solution.reasons[0] || "请调整运力或作业条件"}
            </span>
          </div>
        )}
        <div className="floating-plan-list" aria-label="候选运输方案">
          {result.candidates.map((c) => (
            <button
              key={c.id}
              aria-label={"选择方案" + c.name}
              aria-pressed={c.id === selected}
              className={
                "floating-plan-card " + (c.id === selected ? "selected" : "")
              }
              onClick={() => setSelected(c.id)}
            >
              <div className="floating-plan-name">
                <strong>{c.name}</strong>
                {c.id === result.recommended_id && (
                  <span className="floating-recommended">推荐</span>
                )}
                <span
                  className={
                    c.feasible ? "floating-feasible" : "floating-infeasible"
                  }
                >
                  {c.feasible ? "条件可行" : "条件不满足"}
                </span>
              </div>
              <div className="floating-plan-metrics">
                <div>
                  <span>参与车辆</span>
                  <b>
                    {c.metrics.vehicle_count}
                    <small> 辆</small>
                  </b>
                </div>
                <div>
                  <span>预计运完</span>
                  <b className="floating-finish">
                    {c.metrics.delivered_kg < scene.inputs.quantity * 1000
                      ? "未运完"
                      : time(c.metrics.finish_at)}
                  </b>
                </div>
                <div>
                  <span>测算元/吨</span>
                  <b>{unit(c) === null ? "—" : money(unit(c))}</b>
                </div>
                <div>
                  <span>累计排队</span>
                  <b>
                    {format(c.metrics.queue_minutes)}
                    <small> 分钟</small>
                  </b>
                </div>
              </div>
              <div className="floating-plan-bottom">
                <span>
                  总计 {money(c.metrics.total_cost_cents)} · 补能{" "}
                  {c.metrics.charge_count} 次
                </span>
                {c.metrics.fleet_gap > 0 ? (
                  <em>待匹配 {c.metrics.fleet_gap} 辆</em>
                ) : (
                  <span>{format(c.metrics.duration_minutes / 60, 1)} 小时</span>
                )}
              </div>
            </button>
          ))}
        </div>
        {!result.candidates.length && (
          <p className="floating-plan-empty">
            当前没有符合条件的车辆，可调整运力范围后重新测算。
          </p>
        )}
        {plan && (
          <div className="floating-plan-detail">
            <span>主要瓶颈</span>
            <p>{plan.bottleneck}</p>
            {plan.violations.slice(0, 3).map((v, n) => (
              <p className="floating-plan-risk" key={n}>
                {v.message}
              </p>
            ))}
            {plan.risks?.slice(0, 2).map((r) => (
              <p className="floating-plan-risk" key={r}>
                {r}
              </p>
            ))}
          </div>
        )}
        {previous && plan && (
          <div className="floating-plan-delta" aria-label="与上次方案比较">
            <span>较上次“{previous.name}”</span>
            <p>
              车辆{" "}
              {plan.metrics.vehicle_count - previous.vehicle_count >= 0
                ? "+"
                : ""}
              {plan.metrics.vehicle_count - previous.vehicle_count} 辆 · 完工{" "}
              {format(
                (new Date(plan.metrics.finish_at) -
                  new Date(previous.finish_at)) /
                  60000,
              )}{" "}
              分钟
            </p>
            <p>
              元/吨{" "}
              {previous.unit_cost_cents === null || unit(plan) === null
                ? "—"
                : money(unit(plan) - previous.unit_cost_cents)}
            </p>
            {previous.quantity_kg !== plan.metrics.delivered_kg && (
              <small>运量已变化，差值仅供参考</small>
            )}
          </div>
        )}
        <div className="floating-plan-source">
          <span>
            {result.search
              ? `已计算 ${result.search.evaluated} 种组合`
              : "原场景结果"}
          </span>
          <button onClick={onEvidence}>
            数据依据 <Info size={12} />
          </button>
        </div>
      </div>
      <footer>
        <Button size="small" icon={Bot} onClick={onExplain}>
          AI解读
        </Button>
        {locked ? (
          <Button type="primary" size="small" onClick={onTasks}>
            查看待派发任务
          </Button>
        ) : (
          <Button
            type="primary"
            size="small"
            icon={Truck}
            disabled={!plan?.feasible || dirty || !!busy || !canAdopt}
            onClick={onAdopt}
          >
            {scene.confirmed && scene.selected === selected
              ? "核对并生成任务"
              : "采用此方案"}
          </Button>
        )}
      </footer>
    </aside>
  );
}
