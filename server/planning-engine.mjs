import { must, number, text } from "./db.mjs";

export const defaults = {
  daily_quantity: 1200,
  distance_km: 20,
  payload_tonnes: 30,
  hours: 8,
  start_hour: 8,
  loaded_speed: 35,
  empty_speed: 45,
  loading_minutes: 10,
  unloading_minutes: 10,
  energy_per_km: 1.58,
  battery_kwh: 350,
  device_power: 240,
  efficiency: 0.92,
  utilization: 0.8,
  reserve_ratio: 0.1,
  phase_one_quantity: 600,
  compatibility: "QY-SWAP-A（仿真适配）",
};
export function period(b) {
  must(
    /^\d{4}-\d{2}-\d{2}$/.test(b.start_date || "") &&
      /^\d{4}-\d{2}-\d{2}$/.test(b.finish_date || ""),
    "请选择有效基准日期",
  );
  const start = +new Date(b.start_date + "T00:00:00+08:00"),
    end = +new Date(b.finish_date + "T00:00:00+08:00") + 86400000;
  must(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      end - start <= 366 * 86400000,
    "基准期须为1至366天",
  );
  for (const [v, n] of [
    [b.start_date, start],
    [b.finish_date, end - 86400000],
  ])
    must(
      new Date(n + 8 * 3600000).toISOString().slice(0, 10) === v,
      "基准日期不存在",
    );
  return { start, end, days: (end - start) / 86400000 };
}
export function validateConditions(b) {
  const ranges = {
    daily_quantity: [0.001, 100000],
    distance_km: [0.1, 2000],
    payload_tonnes: [1, 100],
    hours: [0.5, 24],
    start_hour: [0, 23.5],
    loaded_speed: [1, 100],
    empty_speed: [1, 100],
    loading_minutes: [1, 240],
    unloading_minutes: [1, 240],
    energy_per_km: [0.1, 10],
    battery_kwh: [50, 1500],
    device_power: [10, 1000],
    efficiency: [0.5, 1],
    utilization: [0.1, 0.95],
    reserve_ratio: [0, 1],
    phase_one_quantity: [0.001, 100000],
  };
  const labels = {
    daily_quantity: "日运输需求",
    distance_km: "单程距离",
    payload_tonnes: "有效载重",
    hours: "作业时长",
    start_hour: "开工时刻",
    loaded_speed: "重载速度",
    empty_speed: "空载速度",
    loading_minutes: "装载时间",
    unloading_minutes: "卸载时间",
    energy_per_km: "参考能耗",
    battery_kwh: "电池容量",
    device_power: "充电功率",
    efficiency: "充电效率",
    utilization: "服务利用率上限",
    reserve_ratio: "备车比例",
    phase_one_quantity: "一期运量",
  };
  const c = {};
  for (const [k, [min, max]] of Object.entries(ranges))
    c[k] = number(b[k], labels[k], min, max);
  must(c.start_hour + c.hours <= 24, "作业窗口不能跨越当日24点");
  must(c.phase_one_quantity <= c.daily_quantity, "一期运量不能超过最终日运量");
  c.compatibility = text(b.compatibility, "兼容规格", 100);
  return c;
}
// Erlang C: Poisson arrivals and exponential service, illustrative steady-state queue.
export function queueMinutes(arrivals, serviceMinutes, servers) {
  if (!arrivals) return 0;
  if (servers <= 0 || servers > 10000) return null;
  const offered = (arrivals * serviceMinutes) / 60,
    rho = offered / servers;
  if (rho >= 1) return null;
  let blocking = 1;
  for (let k = 1; k <= servers; k++)
    blocking = (offered * blocking) / (k + offered * blocking);
  const waitProbability = blocking / (1 - rho + rho * blocking);
  return (waitProbability * serviceMinutes) / (servers - offered);
}
export const rounded = (v, d = 1) =>
  Number.isFinite(v) ? Number(v.toFixed(d)) : null;
export function sizeFleet(c, quantity = c.daily_quantity) {
  const cycleEnergy = 2 * c.distance_km * c.energy_per_km,
    charging = (cycleEnergy / (c.device_power * c.efficiency)) * 60,
    cycle =
      (c.distance_km / c.loaded_speed) * 60 +
      (c.distance_km / c.empty_speed) * 60 +
      c.loading_minutes +
      c.unloading_minutes +
      charging,
    cycles = Math.floor((c.hours * 60) / cycle),
    trips = Math.ceil(quantity / c.payload_tonnes),
    operating = cycles > 0 ? Math.ceil(trips / cycles) : null,
    reserve =
      operating === null ? null : Math.ceil(operating * c.reserve_ratio),
    energy = (trips * cycleEnergy) / c.efficiency,
    chargers = Math.ceil(energy / (c.device_power * c.hours * c.utilization));
  return {
    quantity,
    trips,
    cycles,
    cycle_minutes: rounded(cycle),
    cycle_energy_kwh: rounded(cycleEnergy),
    operating,
    reserve,
    vehicles: operating === null ? null : operating + reserve,
    daily_energy_kwh: rounded(energy),
    chargers,
    transport_feasible: cycles > 0 && cycleEnergy <= c.battery_kwh * 0.8,
    reasons: [
      ...(cycles === 0 ? ["作业窗口不足以完成一次完整运输及补能循环"] : []),
      ...(cycleEnergy > c.battery_kwh * 0.8
        ? ["单循环能耗超过80%电池可用容量，需调整途中补能或路线"]
        : []),
    ],
  };
}
export function siteResult(c, size, point, config, devices) {
  const installed = devices.filter((d) => d.station_id === config.station_id),
    existing = installed.filter(
      (d) =>
        d.station_id === config.station_id &&
        d.connection === "在线" &&
        ["空闲", "占用"].includes(d.status) &&
        d.compatibility === c.compatibility &&
        d.power_kw >= c.device_power,
    ).length,
    total = Math.max(existing, size.chargers),
    added = Math.max(0, total - existing),
    existingPower = installed.reduce((sum, d) => sum + d.power_kw, 0),
    installedPower = existingPower + added * c.device_power,
    required = installedPower + config.other_load_kw,
    supply = config.supply_kw,
    issues = [
      ...size.reasons,
      ...(config.mode === "换电" ? ["本次纯充电规划不支持换电布局"] : []),
      ...(supply !== null && required > supply ? ["供电容量不足"] : []),
    ],
    unknown = [
      ...(supply === null ? ["接电容量"] : []),
      ...["land_verified", "grid_verified", "access_verified"]
        .filter((k) => !config[k])
        .map(
          (k) =>
            ({
              land_verified: "用地",
              grid_verified: "接电",
              access_verified: "重卡通行",
            })[k],
        ),
    ],
    service = ((c.battery_kwh * 0.6) / (c.device_power * c.efficiency)) * 60,
    arrivals =
      (size.daily_energy_kwh * c.efficiency) / (c.battery_kwh * 0.6) / c.hours,
    wait = queueMinutes(arrivals, service, total);
  return {
    id: point.id,
    name: point.name,
    longitude: point.longitude,
    latitude: point.latitude,
    candidate_version: point.version,
    ...config,
    existing,
    total,
    added,
    existing_installed_power_kw: existingPower,
    installed_power_kw: installedPower,
    required_power_kw: rounded(required),
    supply_kw: supply,
    wait_minutes: rounded(wait),
    wait_basis: "M/M/c稳态情景；均匀到站、指数服务，非实测排队预测",
    coverage_percent: null,
    detour_km: config.detour_km,
    feasible: issues.length === 0,
    issues,
    unknown,
    status: issues.length
      ? "条件不满足"
      : unknown.length
        ? "待核实"
        : "条件可行",
  };
}
