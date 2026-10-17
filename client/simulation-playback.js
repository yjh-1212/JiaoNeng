export const phases = {
  load_wait: "装载排队",
  load: "装载",
  drive: "行驶中",
  charge_wait: "补能排队",
  charge: "正在补能",
  unload_wait: "卸载排队",
  unload: "卸载中",
  return: "空载返程",
  done: "已完成",
  pending: "待发车",
  blocked: "执行受阻",
};
function interpolate(path, fraction) {
  if (!path?.length) return null;
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      x = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) * Math.PI) / 360),
      y = b[1] - a[1];
    lengths.push(lengths.at(-1) + Math.hypot(x, y));
  }
  const target = lengths.at(-1) * Math.max(0, Math.min(1, fraction));
  let index = lengths.findIndex((v) => v >= target);
  if (index <= 0) return path[0];
  const a = path[index - 1],
    b = path[index],
    part =
      (target - lengths[index - 1]) /
      (lengths[index] - lengths[index - 1] || 1);
  return a.map((v, i) => v + (b[i] - v) * part);
}
export function positionAt(car, clock, routes, inputs, stations) {
  const t = Number(clock),
    nodes = car.nodes,
    active = nodes.find(
      (n) => +new Date(n.start_at) <= t && +new Date(n.finish_at) > t,
    ),
    last = nodes.filter((n) => +new Date(n.finish_at) <= t).at(-1),
    origin = [inputs?.origin?.lng, inputs?.origin?.lat],
    destination = [inputs?.destination?.lng, inputs?.destination?.lat],
    lastStation = stations.find((s) => s.id === last?.station_id),
    restingPosition = last?.path_key
      ? routes[last.path_key]?.coordinates.at(-1)
      : lastStation
        ? [lastStation.longitude, lastStation.latitude]
        : last?.kind.startsWith("unload")
          ? destination
          : origin;
  if (!active && car.blocked && t >= +new Date(car.finish_at)) {
    return {
      kind: "blocked",
      label: "执行受阻",
      position: restingPosition,
      soc: last?.soc_end ?? inputs.initial_soc,
      distance_km: nodes
        .filter((n) => +new Date(n.finish_at) <= t)
        .reduce((sum, n) => sum + (n.distance_km || 0), 0),
    };
  }
  if (!active)
    return {
      kind: t < +new Date(car.start_at) ? "pending" : "done",
      label: t < +new Date(car.start_at) ? "待发车" : "已完成",
      position: t < +new Date(car.start_at) ? origin : restingPosition,
      soc: last?.soc_end ?? inputs.initial_soc,
      distance_km: nodes
        .filter((n) => +new Date(n.finish_at) <= t)
        .reduce((sum, n) => sum + (n.distance_km || 0), 0),
    };
  const f =
      (t - new Date(active.start_at)) /
      (new Date(active.finish_at) - new Date(active.start_at)),
    s = stations.find((s) => s.id === active.station_id),
    position = active.path_key
      ? interpolate(routes[active.path_key]?.coordinates, f)
      : s
        ? [s.longitude, s.latitude]
        : active.kind.startsWith("unload")
          ? destination
          : origin;
  return {
    kind: active.kind,
    label: phases[active.kind],
    position,
    soc: active.soc_start + (active.soc_end - active.soc_start) * f,
    node: active,
    distance_km:
      nodes
        .filter((n) => +new Date(n.finish_at) <= t)
        .reduce((sum, n) => sum + (n.distance_km || 0), 0) +
      (active.distance_km || 0) * f,
  };
}
export function stationAt(stats, clock) {
  const t = Number(clock),
    active = (stats.timeline || []).filter(
      (x) => +new Date(x.start_at) <= t && +new Date(x.finish_at) > t,
    ),
    waiting = (stats.timeline || []).filter(
      (x) => +new Date(x.arrival_at) <= t && +new Date(x.start_at) > t,
    );
  return {
    occupied: active.length,
    waiting: waiting.length,
    own: active.filter((x) => x.kind === "scenario").length,
    external: active.filter((x) => x.kind === "external").length,
    platform: active.filter((x) => x.kind === "platform").length,
  };
}
