import test from "node:test";
import assert from "node:assert/strict";
import { createRoadRouter } from "../server/maps.mjs";
import { createApp } from "../server/app.mjs";
import { database } from "../server/db.mjs";

const points = [
  [107.57, 35.72],
  [107.58, 35.73],
  [107.72, 35.78],
];
const reply = () =>
  Response.json({
    status: "1",
    route: {
      paths: [
        {
          distance: "19073",
          cost: { duration: "1880" },
          steps: [
            { polyline: "107.57,35.72;107.58,35.73" },
            { polyline: "107.58,35.73;107.61,35.74;107.72,35.78" },
          ],
        },
      ],
    },
  });

test("roads use the station waypoint, remove duplicate junctions and coalesce/cache requests", async () => {
  const calls = [];
  const router = createRoadRouter({
    key: "private-service-key",
    fetcher: async (url) => {
      calls.push(new URL(url));
      return reply();
    },
  });
  const [first, second] = await Promise.all([router(points), router(points)]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin, "https://restapi.amap.com");
  assert.equal(calls[0].searchParams.get("waypoints"), "107.580000,35.730000");
  assert.equal(calls[0].searchParams.get("show_fields"), "cost,polyline");
  assert.equal(first.coordinates.length, 4);
  assert.equal(first.distance_m, 19073);
  assert.deepEqual(first, second);
  assert(!JSON.stringify(first).includes("private-service-key"));
  await router(points);
  assert.equal(calls.length, 1);
  await router([points[0], [107.59, 35.73], points[2]]);
  assert.equal(calls.length, 2);
});

test("missing coordinates, malformed or failed upstream routes never produce a straight line fallback", async () => {
  let calls = 0;
  const router = createRoadRouter({
    key: "test",
    fetcher: async () => {
      calls++;
      return Response.json({
        status: "0",
        info: "INVALID_USER_KEY",
        key: "secret",
      });
    },
  });
  await assert.rejects(router([undefined, points[2]]), {
    code: "MAP_COORDINATES_REQUIRED",
  });
  await assert.rejects(router([[181, 35], points[2]]), {
    code: "MAP_COORDINATES_REQUIRED",
  });
  assert.equal(calls, 0);
  await assert.rejects(router(points), { code: "MAP_ROUTE_UNAVAILABLE" });
  await assert.rejects(router(points), { code: "MAP_ROUTE_UNAVAILABLE" });
  assert.equal(calls, 2);
  await assert.rejects(
    createRoadRouter({
      key: "test",
      fetcher: async () =>
        Response.json({
          status: "1",
          route: {
            paths: [
              {
                distance: "50",
                steps: [{ polyline: "107.57,35.72;107.72,35.78" }],
              },
            ],
          },
        }),
    })(points),
    { code: "MAP_ROUTE_EMPTY" },
  );
});

test("road API preserves login, subject scope and driver boundaries; sends only origin as cross-site referrer", async (t) => {
  const db = database(":memory:");
  let calls = 0;
  const { app } = createApp({
    db,
    config: { amapService: "test" },
    mapFetch: async () => {
      calls++;
      return reply();
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const html = await fetch(base);
  assert.equal(
    html.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(html.headers.get("x-content-type-options"), "nosniff");
  const order = db
      .prepare("SELECT id FROM orders WHERE owner_id='ORG-N' LIMIT 1")
      .get().id,
    station = db
      .prepare("SELECT id FROM stations WHERE owner_id='ORG-N' LIMIT 1")
      .get().id,
    other = db
      .prepare("SELECT id FROM stations WHERE owner_id='ORG-S' LIMIT 1")
      .get().id,
    southOrder = db
      .prepare("SELECT id FROM orders WHERE owner_id='ORG-S' LIMIT 1")
      .get().id;
  const url = (o = order, s = station) =>
    base +
    "/api/maps/route?" +
    new URLSearchParams({ order_id: o, station_id: s });
  assert.equal((await fetch(url())).status, 401);
  const login = async (username) => {
    const r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "JiaoNeng2026!" }),
    });
    assert.equal(r.status, 200);
    return { Cookie: r.headers.get("set-cookie").split(";")[0] };
  };
  const admin = await login("admin"),
    north = await login("north"),
    driver = await login("driver01");
  assert.equal(
    (await fetch(url(order, other), { headers: admin })).status,
    422,
  );
  assert.equal(
    (await fetch(url(southOrder, other), { headers: north })).status,
    404,
  );
  assert.equal((await fetch(url(), { headers: driver })).status, 403);
  assert.equal(calls, 0);
  const response = await fetch(url(), { headers: admin });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source, "AMAP_V5_DRIVING");
  assert.equal(calls, 1);
});
