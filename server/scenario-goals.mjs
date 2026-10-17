import { must, number } from "./db.mjs";
import { simulateCandidate, validateInputs } from "./scenario-engine.mjs";

export const goalLabels = {
  existing: "用现有车辆运完",
  deadline: "指定时间前运完",
  economy: "按期完成且更省钱",
};
export function validateGoal(inputs) {
  if (!inputs.goal) return validateInputs(inputs); // CR-008 records keep their original calculation contract.
  must(goalLabels[inputs.goal], "运输目标无效");
  must(["actual", "reference"].includes(inputs.resource_mode), "运力范围无效");
  const vehicle_limit = number(inputs.vehicle_limit, "运力上限", 1, 60);
  must(Number.isInteger(vehicle_limit), "运力上限必须为整数");
  must(inputs.vehicle_count <= vehicle_limit, "参与车辆数超过运力上限");
  must(Number.isFinite(+new Date(inputs.start_at)), "请填写有效开始时间");
  const deadline =
    inputs.goal === "existing"
      ? new Date(+new Date(inputs.start_at) + 7 * 86400000).toISOString()
      : inputs.deadline;
  return validateInputs({ ...inputs, deadline, vehicle_limit });
}
const costPerTonne = (c) =>
  c.metrics.delivered_kg
    ? Math.round((c.metrics.total_cost_cents * 1000) / c.metrics.delivered_kg)
    : null;
export function planSummary(c) {
  return c
    ? {
        id: c.id,
        name: c.name,
        vehicle_count: c.metrics.vehicle_count,
        finish_at: c.metrics.finish_at,
        total_cost_cents: c.metrics.total_cost_cents,
        unit_cost_cents: costPerTonne(c),
        quantity_kg: c.metrics.delivered_kg,
        feasible: c.feasible,
      }
    : null;
}
export function solveTransportGoal(
  inputs,
  network,
  stations,
  background,
  fleet,
) {
  const i = validateGoal(inputs),
    actualCount = fleet.length,
    limit = Math.min(
      i.vehicle_limit,
      i.resource_mode === "actual" ? actualCount : 60,
      Math.ceil(i.quantity / i.payload),
    ),
    all = [],
    modes = ["time", "cost", "balanced"];
  // Counts are exhaustively evaluated within the declared range; do not assume monotonic queues.
  const counts =
    i.goal === "existing"
      ? [Math.min(i.vehicle_count, limit)]
      : Array.from({ length: limit }, (_, n) => n + 1);
  for (const n of counts.filter((n) => n > 0)) {
    for (const mode of modes) {
      const modelInputs = { ...i, vehicle_count: n, objective: "balanced" },
        c = simulateCandidate(
          modelInputs,
          network,
          stations,
          background,
          `G${n}-${mode}`,
          mode,
        );
      c.input_overrides = { vehicle_count: n, deadline: i.deadline };
      c.metrics.unit_cost_cents = costPerTonne(c);
      c.metrics.fleet_gap = Math.max(0, c.metrics.vehicle_count - actualCount);
      // Partial last trips are accounted exactly using each vehicle's completed trips.
      c.metrics.delivered_by_deadline_kg = c.vehicles.reduce((sum, v) => {
        const trips = v.nodes.filter((n) => n.kind === "unload");
        return (
          sum +
          trips.reduce(
            (s, n, index) =>
              s +
              (+new Date(n.finish_at) <=
              Math.min(
                +new Date(i.deadline),
                +new Date(i.start_at) + i.max_driver_hours * 3600000,
              )
                ? Math.min(
                    Math.round(i.payload * 1000),
                    Math.max(
                      0,
                      v.quantity_kg - index * Math.round(i.payload * 1000),
                    ),
                  )
                : 0),
            0,
          )
        );
      }, 0);
      all.push(c);
    }
  }
  const feasible = all.filter((c) => c.feasible),
    byTime = (a, b) => a.metrics.duration_minutes - b.metrics.duration_minutes,
    byCost = (a, b) =>
      a.metrics.total_cost_cents - b.metrics.total_cost_cents || byTime(a, b),
    minCount = feasible.length
      ? Math.min(...feasible.map((c) => c.metrics.vehicle_count))
      : null,
    least = feasible
      .filter((c) => c.metrics.vehicle_count === minCount)
      .sort(byCost)[0],
    cheap = [...feasible].sort(byCost)[0],
    baseCount = Math.min(
      i.goal !== "existing" && i.resource_mode === "actual"
        ? actualCount
        : i.vehicle_count,
      limit,
    ),
    base = all
      .filter((c) => c.input_overrides.vehicle_count === baseCount)
      .sort(
        (a, b) => Number(b.feasible) - Number(a.feasible) || byTime(a, b),
      )[0];
  const picks = [],
    add = (c, name) => {
      if (!c) return;
      const signature = [
        c.metrics.vehicle_count,
        c.metrics.finish_at,
        c.metrics.total_cost_cents,
        c.metrics.queue_minutes,
        c.feasible,
      ].join("|");
      if (picks.some((x) => x.signature === signature)) return;
      picks.push({ ...c, name, signature });
    };
  if (i.goal === "existing") {
    add(base, i.resource_mode === "actual" ? "现有运力方案" : "参考运力方案");
    if (cheap && cheap.id !== base?.id) add(cheap, "较低成本方案");
  } else {
    if (i.goal === "economy") {
      add(cheap, "较低成本方案");
      add(least, "最少车辆方案");
    } else {
      add(least, "按期完成方案");
      add(cheap, "较低成本方案");
    }
    add(base, i.resource_mode === "actual" ? "现有运力对照" : "当前车数对照");
  }
  if (!picks.length)
    add(
      [...all].sort(
        (a, b) =>
          b.metrics.delivered_by_deadline_kg -
            a.metrics.delivered_by_deadline_kg || byTime(a, b),
      )[0],
      "范围内较好方案",
    );
  const chosen = picks.find((c) => c.feasible),
    target = Math.round(i.quantity * 1000),
    bestDelivered = Math.min(
      target,
      Math.max(0, ...all.map((c) => c.metrics.delivered_by_deadline_kg)),
    );
  return {
    model: "GOAL-DISCRETE-EVENT-V2",
    goal: i.goal,
    goal_label: goalLabels[i.goal],
    candidates: picks.slice(0, 3),
    recommended_id: chosen?.id || null,
    routes: network,
    generated_at: new Date().toISOString(),
    source: "DERIVED_SIMULATION",
    input_kind: "业务模拟与高德道路参考",
    search: {
      evaluated: all.length,
      max_vehicles: limit,
      min_feasible_vehicles: minCount,
      available_vehicles: actualCount,
      resource_mode: i.resource_mode,
      exhaustive_within_limit: true,
    },
    no_solution: chosen
      ? null
      : {
          delivered_kg: bestDelivered,
          remaining_kg: target - bestDelivered,
          reasons:
            actualCount === 0 && i.resource_mode === "actual"
              ? ["所选范围没有符合条件的可用车辆"]
              : [
                  ...new Set(
                    all.flatMap((c) => c.violations.map((v) => v.message)),
                  ),
                ].slice(0, 5),
          suggestions: [
            "检查完成期限与可用运力范围",
            "检查装卸能力、司机工时及补能条件",
          ],
        },
    limitations: [
      "车辆数在指定范围内逐一计算，发车与补能采用三种启发式策略，不宣称全局最优",
      "社会车流为模拟到达；车型、装卸和成本参数需核实",
      "高德通用驾车路网未验证货车禁限行与矿内道路",
    ],
  };
}
