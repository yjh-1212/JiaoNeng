import { must, number } from "./db.mjs";
export function compareEnergy(
  station,
  loads,
  resources,
  effectiveAt = new Date(),
) {
  const curve = station.price_curve;
  must(curve?.length === 24, "计价时段不完整");
  const valid = loads.filter((p) => p.actual_kw != null);
  must(valid.length, "缺少负荷样本");
  const usable = resources.filter(
      (r) =>
        r.status === "仿真已核验" &&
        new Date(r.effective_start) <= effectiveAt &&
        new Date(r.effective_end) > effectiveAt,
    ),
    grid = usable.find((r) => r.kind === "电网"),
    green = usable.find((r) => r.kind === "绿电"),
    storage = usable.find((r) => r.kind === "储能");
  const limit = grid
    ? Math.min(
        grid.grid_capacity_kw,
        grid.transformer_limit_kw,
        station.power_kw,
      )
    : station.power_kw;
  const prices = curve
      .map((p) => p.electricity + p.service)
      .sort((a, b) => a - b),
    cheap = prices[5],
    expensive = prices[18];
  const options = [
    { id: "base", name: "原时序", green: false, storage: false },
    { id: "green", name: "绿电优先", green: true, storage: false },
    { id: "storage", name: "绿电与储能协同", green: true, storage: true },
  ];
  return options.map((o) => {
    const missing = [];
    if (o.green && !green) missing.push("绿电分时出力与有效期");
    if (o.storage && !storage) missing.push("储能容量、SOC、功率与效率");
    let stored = storage
      ? (storage.storage_capacity_kwh * storage.storage_soc) / 100
      : 0;
    const initial = stored,
      capacity = storage?.storage_capacity_kwh || 0,
      bounds = storage?.charge_discharge_bounds || {},
      eff = bounds.efficiency || 1,
      min = (capacity * (bounds.min_soc ?? 20)) / 100,
      max = (capacity * (bounds.max_soc ?? 90)) / 100,
      power = bounds.power_kw || 0,
      series = [],
      violations = [];
    let cost = 0;
    for (let hour = 0; hour < 24; hour++) {
      const row = loads.find((p) => p.hour === hour),
        tariff = curve.find((p) => p.hour === hour),
        price = tariff.electricity + tariff.service;
      if (row?.actual_kw == null) {
        series.push({
          hour,
          demand_kw: null,
          grid_kw: null,
          cost_cents: null,
          quality: "缺测",
        });
        continue;
      }
      const generation =
        o.green && green
          ? green.green_output_series.find((p) => p.hour === hour)?.kw
          : null;
      let supply = Math.max(0, row.actual_kw - (generation || 0)),
        charging = 0,
        discharging = 0;
      if (o.storage && storage && !missing.length) {
        if (price <= cheap) {
          charging = Math.min(
            power,
            (max - stored) / eff,
            Math.max(0, limit - supply),
          );
          stored += charging * eff;
          supply += charging;
        } else if (price >= expensive) {
          discharging = Math.min(power, (stored - min) * eff, supply);
          stored -= discharging / eff;
          supply -= discharging;
        }
        if (hour === 23 && stored < initial) {
          const extra = Math.min(
            power - charging,
            (initial - stored) / eff,
            Math.max(0, limit - supply),
          );
          charging += extra;
          stored += extra * eff;
          supply += extra;
        }
      }
      if (supply > limit + 0.001)
        violations.push({ hour, kind: "共享供电上限", actual: supply, limit });
      const cents = Math.round(supply * price * 100);
      cost += cents;
      series.push({
        hour,
        demand_kw: row.actual_kw,
        green_kw: generation,
        grid_kw: supply,
        charge_kw: charging,
        discharge_kw: discharging,
        storage_soc: capacity ? (stored / capacity) * 100 : null,
        cost_cents: cents,
      });
    }
    if (o.storage && storage && stored < initial - 0.001)
      violations.push({
        kind: "期末储能不足以同口径比较",
        initial_kwh: initial,
        final_kwh: stored,
      });
    return {
      ...o,
      available: !missing.length,
      missing,
      feasible: !missing.length && !violations.length,
      known_cost_cents: missing.length ? null : cost,
      coverage: valid.length / 24,
      series,
      violations,
      initial_storage_kwh: initial,
      final_storage_kwh: stored,
      resource_versions: usable.map((r) => ({ id: r.id, version: r.version })),
      storage_control: false,
    };
  });
}
