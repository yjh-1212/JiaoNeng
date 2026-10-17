import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, Spin } from "antd";
import AMapLoader from "@amap/amap-jsapi-loader";
import { request } from "./api";

const point = (r) =>
  [r.longitude, r.latitude].every(
    (n) => typeof n === "number" && Number.isFinite(n),
  ) &&
  Math.abs(r.longitude) <= 180 &&
  Math.abs(r.latitude) <= 90;
export default function SafetyMap({
  rows = [],
  selected,
  onSelect,
  trace,
  cursor = 0,
  orderId,
  stationId,
}) {
  const host = useRef(),
    map = useRef(),
    api = useRef(),
    callback = useRef(onSelect),
    [attempt, setAttempt] = useState(0),
    [generation, setGeneration] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [route, setRoute] = useState(null),
    [routeError, setRouteError] = useState("");
  callback.current = onSelect;
  const fitPadding = () => {
    const root = host.current?.closest(".safety-monitor-workspace");
    if (!root || innerWidth <= 650) return [65, 50, 70, 50];
    const left =
      root.querySelector(".safety-object-panel")?.getBoundingClientRect()
        .width || 0;
    const right =
      root.querySelector(".safety-object-detail")?.getBoundingClientRect()
        .width || 0;
    const top =
      root.querySelector(".safety-filters")?.getBoundingClientRect().height ||
      80;
    return [
      Math.min(top + 110, root.clientHeight * 0.35),
      Math.min(right + 40, root.clientWidth * 0.34),
      70,
      Math.min(left + 40, root.clientWidth * 0.34),
    ];
  };
  useEffect(() => {
    let live = true,
      instance,
      observer;
    setBusy(true);
    setError("");
    const timer = setTimeout(() => {
      if (live) {
        setBusy(false);
        setError("地图加载超时，列表和任务仍可查看");
      }
    }, 20000);
    request("/api/maps/config")
      .then((c) => {
        if (!live) return;
        window._AMapSecurityConfig = { serviceHost: c.serviceHost };
        return AMapLoader.load({
          key: c.key,
          version: "2.0",
          plugins: ["AMap.Scale"],
        });
      })
      .then((A) => {
        if (!live || !A) return;
        api.current = A;
        if (A.getConfig) A.getConfig().appname = "amap-jsapi-skill";
        instance = new A.Map(host.current, {
          zoom: 10,
          center: [107.64, 35.75],
          viewMode: "2D",
          resizeEnable: true,
        });
        map.current = instance;
        observer = new ResizeObserver(() => instance?.resize());
        observer.observe(host.current);
        instance.addControl(new A.Scale());
        instance.on("complete", () => {
          if (live) {
            clearTimeout(timer);
            setBusy(false);
            setError("");
          }
        });
        setGeneration((n) => n + 1);
      })
      .catch(() => {
        if (live) {
          clearTimeout(timer);
          setBusy(false);
          setError("地图暂不可用，请检查地图服务后重试");
        }
      });
    return () => {
      live = false;
      clearTimeout(timer);
      observer?.disconnect();
      instance?.destroy();
      if (map.current === instance) map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    let live = true;
    setRoute(null);
    setRouteError("");
    if (!orderId || trace) return;
    request(
      "/api/maps/route?" +
        new URLSearchParams({
          order_id: orderId,
          ...(stationId ? { station_id: stationId } : {}),
        }),
    )
      .then((r) => {
        if (live) setRoute(r);
      })
      .catch(() => {
        if (live) setRouteError("计划路线暂不可用");
      });
    return () => {
      live = false;
    };
  }, [orderId, stationId, attempt, !!trace]);
  useEffect(() => {
    const m = map.current,
      A = api.current;
    if (!m || !A) return;
    const selectedRow = rows.find((r) => r.id === selected);
    const sites = [
      ...new Map(
        (selectedRow?.plans || []).filter(point).map((p) => [
          p.station_id,
          {
            id: p.station_id,
            code: p.station_name,
            longitude: p.longitude,
            latitude: p.latitude,
            site: true,
          },
        ]),
      ).values(),
    ];
    const overlays = [
      ...rows,
      ...sites.filter((s) => !rows.some((r) => r.id === s.id)),
    ]
      .filter(point)
      .map((r) => {
        const span = document.createElement("span");
        span.className = "safety-map-label";
        span.textContent = r.code;
        const marker = new A.Marker({
          position: [r.longitude, r.latitude],
          title: r.code,
          label: { content: span.outerHTML, direction: "top" },
          zIndex: r.id === selected ? 120 : 80,
        });
        if (!r.site) marker.on("click", () => callback.current?.(r.id));
        return marker;
      });
    if (overlays.length) {
      m.add(overlays);
      m.setFitView(overlays, false, fitPadding());
    }
    return () => {
      if (map.current === m) m.remove(overlays);
    };
  }, [
    generation,
    JSON.stringify(rows.map((r) => [r.id, r.code, r.longitude, r.latitude])),
    selected,
  ]);
  useEffect(() => {
    const m = map.current,
      A = api.current;
    if (!m || !A || !route?.coordinates?.length || trace) return;
    const line = new A.Polyline({
      path: route.coordinates,
      strokeColor: "#2774d6",
      strokeStyle: "dashed",
      strokeWeight: 5,
      strokeOpacity: 0.8,
    });
    m.add(line);
    m.setFitView([line], true, fitPadding());
    host.current.dataset.routePoints = String(route.coordinates.length);
    return () => {
      if (map.current === m) {
        m.remove(line);
        delete host.current.dataset.routePoints;
      }
    };
  }, [generation, route, !!trace]);
  useEffect(() => {
    const m = map.current,
      A = api.current;
    if (!m || !A || !trace?.items?.length) return;
    const items = trace.items,
      overlays = [];
    for (let i = 1; i < items.length; i++) {
      if (
        !point(items[i]) ||
        !point(items[i - 1]) ||
        new Date(items[i].occurred_at) - new Date(items[i - 1].occurred_at) >
          600000
      )
        continue;
      overlays.push(
        new A.Polyline({
          path: [items[i - 1], items[i]].map((r) => [r.longitude, r.latitude]),
          strokeColor: "#2774d6",
          strokeWeight: 4,
        }),
      );
    }
    const p = items[Math.min(cursor, items.length - 1)];
    if (point(p))
      overlays.push(
        new A.CircleMarker({
          center: [p.longitude, p.latitude],
          radius: 8,
          fillColor: "#be1230",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        }),
      );
    m.add(overlays);
    if (cursor === 0 && overlays.length)
      m.setFitView(overlays, true, fitPadding());
    return () => {
      if (map.current === m) m.remove(overlays);
    };
  }, [generation, trace, cursor]);
  return (
    <div className="safety-map">
      <div ref={host} className="safety-map-host" aria-label="运行监控地图" />
      {busy && !error && (
        <div className="safety-map-message">
          <Spin size="small" /> 加载地图
        </div>
      )}
      {error && (
        <Alert
          className="safety-map-message"
          type="warning"
          title={error}
          action={
            <Button size="small" onClick={() => setAttempt((n) => n + 1)}>
              重试
            </Button>
          }
        />
      )}
      <div className="safety-map-caption">
        <span>
          {trace ? "历史采样轨迹" : route ? "虚线：计划道路路线" : "对象位置"}
        </span>
        <span>本页对象 · 测算资料{routeError ? " · " + routeError : ""}</span>
      </div>
      <div className="safety-map-zoom">
        <Button aria-label="地图放大" onClick={() => map.current?.zoomIn()}>
          ＋
        </Button>
        <Button aria-label="地图缩小" onClick={() => map.current?.zoomOut()}>
          －
        </Button>
      </div>
    </div>
  );
}
