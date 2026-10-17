import React, { useEffect, useRef, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { Alert, Button } from "antd";
import { request } from "./api";
export default function PlanningMap({
  sites,
  selected,
  onSelect,
  orderId,
  stationId,
}) {
  const host = useRef(),
    map = useRef(),
    sdk = useRef(),
    callback = useRef(onSelect),
    [attempt, retry] = useState(0),
    [generation, setGeneration] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [route, setRoute] = useState(null),
    [roadError, setRoadError] = useState("");
  callback.current = onSelect;
  const padding = () =>
    innerWidth > 1000 ? [65, 350, 65, 315] : [50, 35, 50, 35];
  useEffect(() => {
    let live = true,
      m,
      observer;
    setError("");
    setBusy(true);
    if (host.current) host.current.dataset.mapReady = "false";
    const timer = setTimeout(() => {
      if (live) {
        setBusy(false);
        setError("地图加载超时，请重试");
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
        sdk.current = A;
        if (A.getConfig) A.getConfig().appname = "amap-jsapi-skill";
        m = new A.Map(host.current, {
          center: [107.65, 35.76],
          zoom: 11,
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
          resizeEnable: true,
        });
        map.current = m;
        m.addControl(new A.Scale());
        observer = new ResizeObserver(() => m.resize());
        observer.observe(host.current);
        m.on("complete", () => {
          if (live) {
            clearTimeout(timer);
            setBusy(false);
            setError("");
            host.current.dataset.mapReady = "true";
          }
        });
        setGeneration((n) => n + 1);
      })
      .catch(() => {
        if (live) {
          clearTimeout(timer);
          setBusy(false);
          setError("高德地图暂不可用，请检查服务后重试");
        }
      });
    return () => {
      live = false;
      clearTimeout(timer);
      observer?.disconnect();
      m?.destroy();
      if (map.current === m) map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    let live = true;
    setRoute(null);
    setRoadError("");
    if (!orderId) return;
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
      .catch((e) => {
        if (live) setRoadError(e.message);
      });
    return () => {
      live = false;
    };
  }, [orderId, stationId, attempt]);
  useEffect(() => {
    const m = map.current,
      A = sdk.current;
    if (!m || !A) return;
    const overlays = [];
    for (const s of sites) {
      if (!Number.isFinite(s.longitude) || !Number.isFinite(s.latitude))
        continue;
      const span = document.createElement("span");
      span.className = "planning-marker" + (s.id === selected ? " active" : "");
      span.textContent = s.name;
      const marker = new A.Marker({
        position: [s.longitude, s.latitude],
        title: s.name,
        label: { content: span.outerHTML, direction: "top" },
        zIndex: s.id === selected ? 120 : 80,
      });
      marker.on("click", () => callback.current?.(s.id));
      overlays.push(marker);
    }
    if (route?.coordinates?.length > 1) {
      const line = new A.Polyline({
        path: route.coordinates,
        strokeColor: "#2875d6",
        strokeWeight: 5,
        strokeOpacity: 0.8,
        showDir: true,
      });
      overlays.push(line);
      host.current.dataset.routePoints = String(route.coordinates.length);
    } else delete host.current.dataset.routePoints;
    if (overlays.length) {
      m.add(overlays);
      m.setFitView(overlays, true, padding());
      host.current.dataset.zoom = String(m.getZoom());
    }
    return () => {
      if (map.current === m) m.remove(overlays);
    };
  }, [generation, JSON.stringify(sites), selected, route]);
  return (
    <div className="planning-map">
      <div className="planning-map-host" ref={host} aria-label="场站规划地图" />
      <div className="planning-map-message">
        {busy && !error && <span>正在加载地图…</span>}
        {error && (
          <Alert
            type="warning"
            title={error}
            action={<Button onClick={() => retry((n) => n + 1)}>重试</Button>}
          />
        )}
        {roadError && (
          <Alert
            type="warning"
            title={"道路路线未加载：" + roadError}
            action={
              <Button onClick={() => retry((n) => n + 1)}>重试路线</Button>
            }
          />
        )}
      </div>
      <div className="planning-map-legend">
        候选布局 · 测算业务图层
        {route
          ? " · 蓝线：道路规划路线"
          : !orderId
            ? " · 引用订单后可查看道路路线"
            : ""}
      </div>
      <div className="planning-map-controls">
        <Button aria-label="规划地图放大" onClick={() => map.current?.zoomIn()}>
          ＋
        </Button>
        <Button
          aria-label="规划地图缩小"
          onClick={() => map.current?.zoomOut()}
        >
          －
        </Button>
      </div>
    </div>
  );
}
