import React, { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@lobehub/ui";
import { Plus, Minus, LocateFixed, Layers, Info } from "lucide-react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { request } from "./api";
import { useApp } from "./context";

const valid = (p) =>
  Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const EMPTY_TRACE = [];
export default function BusinessMap({
  order,
  candidate,
  stationId,
  onSelect,
  trace = EMPTY_TRACE,
  cursor = 0,
}) {
  const a = useApp(),
    host = useRef(),
    instance = useRef(),
    api = useRef(),
    [attempt, setAttempt] = useState(0),
    [generation, setGeneration] = useState(0),
    [loading, setLoading] = useState(true),
    [failure, setFailure] = useState(""),
    [showVehicles, setVehicles] = useState(true),
    [route, setRoute] = useState(null),
    [routeLoading, setRouteLoading] = useState(false),
    [routeError, setRouteError] = useState("");
  const selectedStation = candidate?.station_id || stationId,
    stations = a.boot.stations || [],
    station = stations.find((s) => s.id === selectedStation),
    routeKey = order
      ? JSON.stringify([
          order.id,
          order.origin_coords,
          order.destination_coords,
          selectedStation,
          station?.longitude,
          station?.latitude,
        ])
      : "",
    points = useMemo(
      () =>
        [
          ...(order && valid(order.origin_coords)
            ? [
                {
                  id: "origin",
                  name: order.origin,
                  coords: order.origin_coords,
                  kind: "起",
                },
              ]
            : []),
          ...stations
            .filter((s) => !order || s.id === selectedStation)
            .map((s) => ({
              id: s.id,
              name: s.name,
              coords: [s.longitude, s.latitude],
              station: s,
              kind: "补",
            })),
          ...(order && valid(order.destination_coords)
            ? [
                {
                  id: "destination",
                  name: order.destination,
                  coords: order.destination_coords,
                  kind: "终",
                },
              ]
            : []),
        ].filter((p) => valid(p.coords)),
      [order, stations, selectedStation],
    );

  useEffect(() => {
    let live = true,
      map;
    setLoading(true);
    setFailure("");
    if (host.current) host.current.dataset.mapReady = "false";
    const timeout = setTimeout(() => {
      if (live) {
        setLoading(false);
        setFailure("地图加载超时，请检查网络后重试");
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
        }).catch(() => {
          AMapLoader.reset();
          document
            .querySelectorAll('script[src^="https://webapi.amap.com/maps?"]')
            .forEach((s) => s.remove());
          throw new Error("SDK_LOAD_FAILED");
        });
      })
      .then((AMap) => {
        if (!live || !AMap) return;
        if (AMap.getConfig) AMap.getConfig().appname = "amap-jsapi-skill";
        api.current = AMap;
        map = new AMap.Map(host.current, {
          zoom: 11,
          center: [107.64, 35.75],
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
          resizeEnable: true,
        });
        instance.current = map;
        map.addControl(new AMap.Scale());
        map.on("complete", () => {
          if (!live || !host.current) return;
          clearTimeout(timeout);
          host.current.dataset.mapReady = "true";
          setLoading(false);
          setFailure("");
        });
        setGeneration((n) => n + 1);
      })
      .catch((error) => {
        if (!live) return;
        clearTimeout(timeout);
        setLoading(false);
        setFailure(
          error?.code === "NOT_CONFIGURED"
            ? "高德地图尚未配置"
            : "高德地图暂不可用，请检查网络或地图授权后重试",
        );
      });
    return () => {
      live = false;
      clearTimeout(timeout);
      map?.destroy();
      if (instance.current === map) instance.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    let live = true;
    setRoute(null);
    setRouteError("");
    setRouteLoading(!!order);
    if (!order) return;
    const params = new URLSearchParams({
      order_id: order.id,
      ...(selectedStation ? { station_id: selectedStation } : {}),
    });
    request("/api/maps/route?" + params)
      .then((data) => {
        if (live) {
          setRoute({ ...data, key: routeKey });
          setRouteLoading(false);
        }
      })
      .catch((error) => {
        if (live) {
          setRouteError(error.message);
          setRouteLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [routeKey, attempt]);

  useEffect(() => {
    const map = instance.current,
      AMap = api.current;
    if (!map || !AMap) return;
    const overlays = points.map((p) => {
      const text = document.createElement("span");
      text.textContent = p.name;
      const marker = new AMap.Marker({
        position: p.coords,
        title: p.name,
        label: { content: text.outerHTML, direction: "top" },
      });
      marker.on("click", () =>
        p.station ? a.showDetail("stations", p.id) : onSelect?.(p),
      );
      return marker;
    });
    map.add(overlays);
    if (overlays.length) map.setFitView(overlays, true, [75, 140, 65, 75]);
    return () => {
      if (instance.current === map) map.remove(overlays);
    };
  }, [generation, points]);

  useEffect(() => {
    const map = instance.current,
      AMap = api.current;
    if (!map || !AMap || !route || route.key !== routeKey) return;
    const line = new AMap.Polyline({
      path: route.coordinates,
      strokeColor: "#2774d6",
      strokeWeight: 6,
      strokeOpacity: 0.95,
      isOutline: true,
      outlineColor: "#ffffff",
      borderWeight: 2,
      lineJoin: "round",
      lineCap: "round",
      showDir: true,
    });
    map.add(line);
    map.setFitView([line], true, [75, 140, 65, 75]);
    host.current.dataset.routePoints = String(route.coordinates.length);
    return () => {
      if (instance.current === map) {
        map.remove(line);
        if (host.current) delete host.current.dataset.routePoints;
      }
    };
  }, [generation, route, routeKey]);

  useEffect(() => {
    const map = instance.current,
      AMap = api.current;
    if (!map || !AMap || !showVehicles) return;
    const overlays = (a.boot.vehicles || [])
      .filter((v) => valid([v.longitude, v.latitude]))
      .map((v) => {
        const marker = new AMap.CircleMarker({
          center: [v.longitude, v.latitude],
          radius: 5,
          fillColor: "#b57825",
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
        });
        marker.on("click", () => a.showDetail("vehicles", v.id));
        return marker;
      });
    map.add(overlays);
    return () => {
      if (instance.current === map) map.remove(overlays);
    };
  }, [generation, showVehicles, a.boot.vehicles]);

  useEffect(() => {
    const map = instance.current,
      AMap = api.current;
    if (!map || !AMap || !trace.length) return;
    const overlays = [];
    for (let i = 1; i < trace.length; i++) {
      if (
        new Date(trace[i].occurred_at) - new Date(trace[i - 1].occurred_at) >
        10 * 60000
      )
        continue;
      const path = [trace[i - 1], trace[i]].map((p) => [
        p.longitude,
        p.latitude,
      ]);
      if (path.every(valid))
        overlays.push(
          new AMap.Polyline({ path, strokeColor: "#245DA8", strokeWeight: 4 }),
        );
    }
    const current = trace[Math.max(0, Math.min(cursor, trace.length - 1))];
    if (current && valid([current.longitude, current.latitude]))
      overlays.push(
        new AMap.CircleMarker({
          center: [current.longitude, current.latitude],
          radius: 9,
          fillColor: "#B42336",
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 3,
        }),
      );
    map.add(overlays);
    if (overlays.length) map.setFitView(overlays, true, [75, 140, 65, 75]);
    return () => {
      if (instance.current === map) map.remove(overlays);
    };
  }, [generation, trace, cursor]);

  const retry = () => setAttempt((n) => n + 1);
  return (
    <div className="map-frame">
      <div className="map-brand">高德地图</div>
      {(loading || failure || routeLoading || routeError) && (
        <div
          className="map-feedback"
          role={failure || routeError ? "alert" : "status"}
        >
          <span>
            {failure ||
              routeError ||
              (loading ? "正在加载高德地图…" : "正在规划道路路线…")}
          </span>
          {(failure || routeError) && (
            <Button size="small" onClick={retry}>
              重试加载
            </Button>
          )}
        </div>
      )}
      <div
        className="amap-container"
        ref={host}
        aria-label="高德运输与补能地图"
      />
      <div className="map-tools">
        <Button
          aria-label="地图放大"
          icon={Plus}
          onClick={() => instance.current?.zoomIn()}
        />
        <Button
          aria-label="地图缩小"
          icon={Minus}
          onClick={() => instance.current?.zoomOut()}
        />
        <Button
          aria-label="重置地图视野"
          icon={LocateFixed}
          onClick={() => instance.current?.setFitView()}
        />
        <Button
          aria-label="切换车辆图层"
          aria-pressed={showVehicles}
          icon={Layers}
          onClick={() => setVehicles((v) => !v)}
        />
      </div>
      <div className="map-caption">
        <span>
          <i className="legend-node" />
          补能场站
        </span>
        {route?.key === routeKey && (
          <span>高德道路路线 · {(route.distance_m / 1000).toFixed(1)} km</span>
        )}
        <span>坐标以业务来源为准</span>
        {route?.key === routeKey && (
          <Button
            type="text"
            size="small"
            icon={Info}
            aria-label="查看道路路线依据"
            onClick={() =>
              a.panel(
                "道路路线依据",
                <div className="stack">
                  <p>{route.note}</p>
                  <p>来源：高德V5驾车路径规划</p>
                  <p>
                    获取时间：
                    {new Date(route.fetched_at).toLocaleString("zh-CN")}
                  </p>
                  <p>
                    道路里程 {(route.distance_m / 1000).toFixed(1)} km
                    {route.duration_s
                      ? " · 参考行驶 " +
                        Math.round(route.duration_s / 60) +
                        " 分钟"
                      : ""}
                  </p>
                </div>,
              )
            }
          />
        )}
      </div>
    </div>
  );
}
