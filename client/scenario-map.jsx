import React, { useState, useEffect, useRef, useMemo } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { Button } from "@lobehub/ui";
import { Plus, Minus, LocateFixed, Layers } from "lucide-react";
import { request } from "./api";
import { phases, positionAt, stationAt } from "./simulation-playback";
const good = (p) => p && Number.isFinite(p.lng) && Number.isFinite(p.lat);
export default function ScenarioMap({
  inputs,
  plan,
  routes = {},
  stations = [],
  clock,
  picking,
  onPick,
  onVehicle,
  onStation,
  leftOpen,
  rightOpen,
  rightPanelWidth = 282,
  regional = false,
  selectedRouteKey = null,
  focusedStationId = null,
}) {
  const host = useRef(),
    map = useRef(),
    sdk = useRef(),
    cars = useRef([]),
    stationMarkers = useRef([]),
    routeLines = useRef([]),
    [ready, setReady] = useState(0),
    [attempt, retry] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [layers, setLayers] = useState({
      vehicles: true,
      stations: true,
      alternatives: false,
    });
  const points = useMemo(
    () => [
      ...(good(inputs?.origin)
        ? [{ ...inputs.origin, id: "origin", kind: "起", color: "#2677c9" }]
        : []),
      ...stations
        .filter((s) => layers.stations)
        .map((s) => ({
          id: s.id,
          name: s.name,
          lng: s.longitude,
          lat: s.latitude,
          kind: "补",
          station: s,
          color:
            (plan?.station_stats.find((t) => t.id === s.id)?.peak_waiting ||
              0) > 3
              ? "#d68721"
              : "#26856b",
        })),
      ...(good(inputs?.destination)
        ? [
            {
              ...inputs.destination,
              id: "destination",
              kind: "终",
              color: "#bd2340",
            },
          ]
        : []),
    ],
    [inputs?.origin, inputs?.destination, stations, plan, layers.stations],
  );
  useEffect(() => {
    let live = true,
      instance;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      if (live) {
        setLoading(false);
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
        }).catch((error) => {
          AMapLoader.reset();
          document
            .querySelectorAll('script[src^="https://webapi.amap.com/maps?"]')
            .forEach((s) => s.remove());
          throw error;
        });
      })
      .then((api) => {
        if (!live || !api) return;
        if (api.getConfig) api.getConfig().appname = "amap-jsapi-skill";
        sdk.current = api;
        instance = new api.Map(host.current, {
          center: regional ? [103.8,37.2] : [107.64, 35.75],
          zoom: regional ? 4 : 9,
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
          features: ["bg", "road"],
          showLabel: true,
          resizeEnable: true,
        });
        map.current = instance;
        instance.addControl(new api.Scale());
        instance.on("complete", () => {
          if (live && host.current) {
            clearTimeout(timer);
            setLoading(false);
            host.current.dataset.mapReady = "true";
          }
        });
        setReady((n) => n + 1);
      })
      .catch(() => {
        if (live) {
          clearTimeout(timer);
          setLoading(false);
          setError("高德底图暂不可用，请检查网络或授权");
        }
      });
    return () => {
      live = false;
      clearTimeout(timer);
      instance?.destroy();
      if (map.current === instance) map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const click = (e) => {
      if (picking)
        onPick?.({
          name:
            "地图选点 " +
            e.lnglat.getLng().toFixed(4) +
            "," +
            e.lnglat.getLat().toFixed(4),
          lng: Number(e.lnglat.getLng().toFixed(6)),
          lat: Number(e.lnglat.getLat().toFixed(6)),
        });
    };
    m.on("click", click);
    return () => m.off("click", click);
  }, [ready, picking, onPick]);
  useEffect(()=>{const s=stations.find(s=>s.id===focusedStationId);if(s&&map.current){map.current.setZoomAndCenter(12,[s.longitude,s.latitude]);}},[ready,focusedStationId]);
  useEffect(() => {
    const m = map.current,
      A = sdk.current;
    if (!m || !A) return;
    stationMarkers.current = [];
    const overlays = points.map((p) => {
      const content = document.createElement("button");
      content.type = "button";
      content.className = "scene-map-pin";
      content.style.setProperty("--pin", p.color);
      content.textContent = p.kind;
      content.setAttribute("aria-label", p.name);
      const label = document.createElement("span");
      label.textContent = p.name;
      const marker = new A.Marker({
        position: [p.lng, p.lat],
        content,
        anchor: "center",
        title: p.name,
          label: regional && p.station ? undefined : { content: label.outerHTML, direction: "top" },
        zIndex: p.station ? 110 : 140,
      });
      if (p.station)
        stationMarkers.current.push({
          point: p,
          marker,
          el: content,
          lastLabel: "",
        });
      marker.on("click", () => (p.station ? onStation?.(p.id) : null));
      return marker;
    });
    m.add(overlays);
    return () => {
      if (map.current === m) m.remove(overlays);
    };
  }, [ready, points]);
  const fit = () => {
    const m = map.current;
    if (!m) return;
    const desktop = matchMedia("(min-width:801px)").matches;
    if(regional&&!routeLines.current.length)return;
    // AMap avoidance order is top, bottom, left, right (not CSS shorthand).
    m.setFitView(routeLines.current.length ? routeLines.current : null, true, [
      85,
      regional ? (desktop ? 75 : 735) : 155,
      desktop && leftOpen ? 365 : 65,
      desktop && rightOpen ? (innerWidth <= 1200 ? 380 : rightPanelWidth) + 44 : 65,
    ]);
  };
  useEffect(()=>{if(!map.current)return;const resize=()=>requestAnimationFrame(()=>{map.current?.resize();fit();});addEventListener('resize',resize);return()=>removeEventListener('resize',resize);},[ready,rightOpen,leftOpen,selectedRouteKey,regional]);
  useEffect(() => {
    const m = map.current,
      A = sdk.current;
    if (!m || !A) return;
    const keys = new Set(
        plan?.vehicles.flatMap((v) =>
          v.nodes.filter((n) => n.path_key).map((n) => n.path_key),
        ) || [],
      ),
      overlays = [], mainLines=[];
    if(selectedRouteKey) keys.add(selectedRouteKey);
    for (const [key, r] of Object.entries(routes)) {
      if (!keys.has(key) && !layers.alternatives && !regional) continue;
      const main = keys.has(key),
        line = new A.Polyline({
          path: r.coordinates,
          strokeColor: main ? "#2677c9" : "#91a7be",
          strokeOpacity: main ? 0.88 : 0.4,
          strokeWeight: main ? 5 : 3,
          strokeStyle: main ? "solid" : "dashed",
          isOutline: main,
          outlineColor: "#fff",
          borderWeight: 1,
          lineJoin: "round",
          zIndex: main ? 70 : 50,
        });
      overlays.push(line);
      if(main)mainLines.push(line);
    }
    m.add(overlays);
    routeLines.current=regional?mainLines:overlays;
    fit();
    if (host.current)
      host.current.dataset.routePoints = String(
        overlays.length
          ? Math.max(...Object.values(routes).map((r) => r.coordinates.length))
          : 0,
      );
    return () => {
      if (map.current === m) m.remove(overlays);
    };
  }, [
    ready,
    routes,
    plan?.id,
    selectedRouteKey,
    layers.alternatives,
    leftOpen,
    rightOpen,
    inputs?.origin,
    inputs?.destination,
  ]);
  useEffect(() => {
    const m = map.current,
      A = sdk.current;
    if (!m || !A) return;
    const markers = (plan?.vehicles || []).map((v) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "scene-vehicle";
      el.textContent = v.id.slice(-2);
      el.setAttribute("aria-label", "查看推演车辆" + v.id);
      el.addEventListener("click", () => onVehicle?.(v.id));
      const marker = new A.Marker({
        content: el,
        position: good(inputs.origin)
          ? [inputs.origin.lng, inputs.origin.lat]
          : [107.64, 35.75],
        anchor: "center",
        zIndex: 200,
      });
      return { v, el, marker };
    });
    cars.current = markers;
    m.add(markers.map((x) => x.marker));
    return () => {
      if (map.current === m) m.remove(markers.map((x) => x.marker));
      cars.current = [];
    };
  }, [ready, plan]);
  useEffect(() => {
    for (const s of stationMarkers.current) {
      const stats = plan?.station_stats.find((x) => x.id === s.point.id);
      if (!stats) continue;
      const state = stationAt(stats, clock),
        label =
          s.point.name +
          " · 占用" +
          state.occupied +
          "/" +
          stats.slots +
          " · 排队" +
          state.waiting;
      s.el.textContent = state.waiting ? String(state.waiting) : "补";
      s.el.style.setProperty(
        "--pin",
        state.waiting > 3 ? "#bd2340" : state.waiting ? "#d68721" : "#26856b",
      );
      if (label !== s.lastLabel) {
        const text = document.createElement("span");
        text.textContent = label;
        s.marker.setLabel({ content: text.outerHTML, direction: "top" });
        s.lastLabel = label;
      }
    }
    const positions = cars.current.map((c) => ({
        ...c,
        state: positionAt(c.v, clock, routes, inputs, stations),
      })),
      groups = new Map();
    for (const c of positions) {
      if (!c.state.position) continue;
      const key = c.state.position.map((n) => n.toFixed(4)).join(",");
      const group = groups.get(key) || [];
      group.push(c);
      groups.set(key, group);
    }
    for (const group of groups.values())
      group.forEach((c, index) => {
        const cols = Math.ceil(Math.sqrt(group.length));
        c.marker.setOffset(
          new sdk.current.Pixel(
            ((index % cols) - (cols - 1) / 2) * 26,
            Math.floor(index / cols) * 22 - 12,
          ),
        );
      });
    for (const { v, el, marker, state } of positions) {
      if (!state.position) continue;
      marker.setPosition(state.position);
      el.dataset.phase = state.kind;
      el.title =
        v.id +
        " · " +
        state.label +
        " · SOC " +
        Math.max(0, state.soc).toFixed(1) +
        "%";
      layers.vehicles ? marker.show() : marker.hide();
    }
  }, [clock, ready, plan, routes, inputs, stations, layers.vehicles]);
  return (
    <>
      <div
        ref={host}
        className="scene-map-canvas"
        aria-label="高德交能推演地图"
      />
      <div className="scene-map-layers">
        <span>高德道路</span>
        {[
          ["vehicles", "车辆"],
          ["stations", "场站"],
          ["alternatives", "候选路线"],
        ].map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(e) =>
                setLayers({ ...layers, [key]: e.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>
      {(loading || error || picking) && (
        <div className="scene-map-status" role={error ? "alert" : "status"}>
          {picking
            ? "点击地图选择" + (picking === "origin" ? "装载点" : "卸载点")
            : error || "正在加载高德底图…"}
          {error && (
            <Button size="small" onClick={() => retry((n) => n + 1)}>
              重新加载
            </Button>
          )}
        </div>
      )}
      <div className="scene-map-controls">
        <Button
          size="small"
          icon={Plus}
          aria-label="推演地图放大"
          onClick={() => map.current?.zoomIn()}
        />
        <Button
          size="small"
          icon={Minus}
          aria-label="推演地图缩小"
          onClick={() => map.current?.zoomOut()}
        />
        <Button
          size="small"
          icon={LocateFixed}
          aria-label="适配推演全程"
          onClick={fit}
        />
      </div>
    </>
  );
}
