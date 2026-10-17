import { BusinessError, must } from "./db.mjs";

export const validCoordinate = (p) =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every(Number.isFinite) &&
  p[0] >= 73 &&
  p[0] <= 136 &&
  p[1] >= 3 &&
  p[1] <= 54;

export function createRoadRouter({
  key,
  fetcher = fetch,
  minIntervalMs = 650,
}) {
  const cache = new Map(),
    pending = new Map();
  let queue = Promise.resolve(),
    lastRequest = 0;
  return async function route(points, options = {}) {
    must(key, "高德道路服务尚未配置", 503, "NOT_CONFIGURED");
    must(
      points.length >= 2 && points.length <= 18 && points.every(validCoordinate),
      "装卸点或补能站缺少有效坐标，请先维护位置",
      422,
      "MAP_COORDINATES_REQUIRED",
    );
    const coords = points.map((p) => p.map((n) => n.toFixed(6)).join(","));
    const strategy=String(options.strategy ?? 32);
    must(['32','34','36','37','38'].includes(strategy),'路线策略无效');
    const cacheKey = strategy+':'+coords.join(";");
    const prior = cache.get(cacheKey);
    if (prior && prior.expires > Date.now()) return prior.value;
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const work = (async () => {
      const url = new URL("https://restapi.amap.com/v5/direction/driving");
      url.search = new URLSearchParams({
        key,
        origin: coords[0],
        destination: coords.at(-1),
        ...(coords.length > 2 ? { waypoints: coords.slice(1,-1).join(';') } : {}),
        strategy,
        show_fields: "cost,polyline",
      }).toString();
      let data;
      try {
        const perform = async () => {
          for (let attempt = 0; attempt < 2; attempt++) {
            const delay = Math.max(0, lastRequest + minIntervalMs - Date.now());
            if (delay)
              await new Promise((resolve) => setTimeout(resolve, delay));
            lastRequest = Date.now();
            const response = await fetcher(url, {
              signal: AbortSignal.timeout(12000),
              redirect: "error",
            });
            if (!response.ok) throw new Error();
            const body = await response.json();
            if (body.infocode !== "10021" || attempt) return body;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        };
        const job = queue.then(perform, perform);
        queue = job.catch(() => {});
        data = await job;
      } catch {
        throw new BusinessError(
          "道路路线服务暂不可用，请稍后重试",
          502,
          "MAP_ROUTE_UNAVAILABLE",
        );
      }
      must(
        data.status === "1",
        "高德道路规划未成功，请检查服务授权后重试",
        502,
        "MAP_ROUTE_UNAVAILABLE",
      );
      const path = data.route?.paths?.[0],
        coordinates = [];
      for (const step of path?.steps || []) {
        for (const part of (step.polyline || "").split(";")) {
          const point = part.split(",").map(Number);
          must(
            validCoordinate(point),
            "道路路线数据不完整，请重试",
            502,
            "MAP_ROUTE_INVALID",
          );
          if (
            !coordinates.length ||
            point.some((n, i) => n !== coordinates.at(-1)[i])
          )
            coordinates.push(point);
        }
      }
      must(
        coordinates.length > 2 && Number(path?.distance) > 0,
        "未找到可用道路路线，请核对位置后重试",
        502,
        "MAP_ROUTE_EMPTY",
      );
      const value = {
        coordinates,
        distance_m: Number(path.distance),
        duration_s: Number(path.cost?.duration) || null,
        strategy,
        tolls_yuan: path.cost?.tolls==null?null:Number(path.cost.tolls),
        roads:[...new Set((path.steps||[]).map(s=>s.road_name).filter(Boolean))].sort((a,b)=>{const distance=name=>(path.steps||[]).filter(s=>s.road_name===name).reduce((sum,s)=>sum+(Number(s.step_distance||s.distance)||0),0);return distance(b)-distance(a);}).slice(0,12),
        source: "AMAP_V5_DRIVING",
        source_url: "https://lbs.amap.com/api/webservice/guide/api/newroute",
        fetched_at: new Date().toISOString(),
        profile: "GENERAL_DRIVING",
        note: "高德通用道路参考；货车限行、承载与具体进出场道路待核验",
      };
      for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k);
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { value, expires: Date.now() + 3600000 });
      return value;
    })();
    pending.set(cacheKey, work);
    try {
      return await work;
    } finally {
      pending.delete(cacheKey);
    }
  };
}
