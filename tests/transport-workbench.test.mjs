import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ok } from "./helpers.mjs";
const dates = () => {
  const d = new Date();
  d.setHours(6, 0, 0, 0);
  return {
    start_at: d.toISOString(),
    finish_at: new Date(+d + 12 * 3600000).toISOString(),
  };
};
const demandBody = {
  name: "CR2煤炭周需求",
  owner_id: "ORG-N",
  quantity: 1000,
  cargo: "原煤",
  origin: "CR2装载场",
  destination: "CR2集运中心",
};
const batch = (quantity, name = "CR2运输批次") => ({
  name,
  quantity,
  distance_km: 14,
  ...dates(),
});
async function createDemand(f) {
  return ok(await f.cmd("demand.save", null, { ...demandBody, confirm: true }))
    .record;
}

test("CR2 需求保存并确认、资料边界与主体操作授权", async () => {
  const f = await fixture();
  try {
    const d = await createDemand(f);
    assert.equal(d.status, "已确认");
    assert.equal(d.quantity_kg, 1000000);
    const changed = ok(
      await f.cmd("demand.save", d.id, {
        ...demandBody,
        name: "CR2修订需求",
        expected_version: d.version,
      }),
    );
    assert.equal(changed.record.name, "CR2修订需求");
    assert.equal(
      (
        await f.cmd("demand.save", d.id, {
          ...demandBody,
          expected_version: d.version,
        })
      ).statusCode,
      409,
    );
    const north = await f.login("north"),
      driver = await f.login("driver01");
    assert.equal(
      (await north.cmd("demand.save", null, { ...demandBody, confirm: true }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await driver.cmd("order.generate", d.id, {
          expected_version: changed.record.version,
          items: [batch(10)],
          confirm: true,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.cmd("demand.save", null, {
          ...demandBody,
          owner_id: "UNAUTHORIZED",
        })
      ).statusCode,
      403,
    );
  } finally {
    await f.close();
  }
});

test("CR2 多批确认、运量守恒、版本冲突和请求幂等", async () => {
  const f = await fixture();
  try {
    const d = await createDemand(f),
      key = crypto.randomUUID(),
      body = {
        expected_version: d.version,
        items: [batch(400, "第一批"), batch(350, "第二批")],
        confirm: true,
      };
    const r = ok(await f.cmd("order.generate", d.id, body, key));
    assert.equal(r.orders.length, 2);
    assert(
      r.orders.every(
        (o) =>
          o.status === "已确认" &&
          o.cargo === d.cargo &&
          o.origin === d.origin &&
          o.owner_id === d.owner_id,
      ),
    );
    assert.equal(r.demand.allocated_kg, 750000);
    const duplicate = ok(await f.cmd("order.generate", d.id, body, key));
    assert.deepEqual(duplicate.ids, r.ids);
    assert.equal((await f.get("demands", d.id)).order_count, 2);
    assert.equal(
      (await f.cmd("order.generate", d.id, { ...body, items: [batch(100)] }))
        .statusCode,
      409,
    );
    assert.equal(
      (
        await f.cmd("order.generate", d.id, {
          expected_version: r.demand.version,
          items: [batch(300)],
          confirm: true,
        })
      ).statusCode,
      422,
    );
    assert.equal((await f.get("demands", d.id)).allocated_kg, 750000);
    assert.equal(
      (
        await f.cmd("demand.save", d.id, {
          ...demandBody,
          cargo: "精煤",
          expected_version: r.demand.version,
        })
      ).statusCode,
      422,
    );
  } finally {
    await f.close();
  }
});

test("CR2 草稿不占量，单批错误整批回滚且不残留命令结果", async () => {
  const f = await fixture();
  try {
    const d = await createDemand(f);
    const drafts = ok(
      await f.cmd("order.generate", d.id, {
        expected_version: d.version,
        items: [batch(300), batch(200)],
        confirm: false,
      }),
    );
    assert.equal(drafts.demand.allocated_kg, 0);
    assert(drafts.orders.every((o) => o.status === "草稿"));
    const before = f.db.prepare("SELECT count(*) n FROM orders").get().n,
      key = crypto.randomUUID();
    const r = await f.cmd(
      "order.generate",
      d.id,
      {
        expected_version: d.version,
        items: [batch(100), { ...batch(100), finish_at: "invalid" }],
        confirm: true,
      },
      key,
    );
    assert.equal(r.statusCode, 422);
    assert.equal(f.db.prepare("SELECT count(*) n FROM orders").get().n, before);
    assert.equal((await f.get("demands", d.id)).allocated_kg, 0);
    assert.equal(
      f.db
        .prepare("SELECT count(*) n FROM command_results WHERE command_key=?")
        .get(key).n,
      0,
    );
    const empty = await f.cmd("order.generate", d.id, {
      expected_version: d.version,
      items: [],
      confirm: true,
    });
    assert.equal(empty.statusCode, 422);
  } finally {
    await f.close();
  }
});

test("CR2 订单保存确认原子性、来源不能被确认后切换及并发超分配保护", async () => {
  const f = await fixture();
  try {
    const d = await createDemand(f),
      body = {
        ...batch(600),
        demand_id: d.id,
        cargo: d.cargo,
        origin: d.origin,
        destination: d.destination,
        confirm: true,
      };
    const results = await Promise.all([
      f.cmd("order.save", null, body),
      f.cmd("order.save", null, body),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 422]);
    assert.equal((await f.get("demands", d.id)).allocated_kg, 600000);
    const order = results.find((r) => r.statusCode === 200).record;
    const r = await f.cmd("order.save", order.id, {
      ...body,
      demand_id: "DM2",
      expected_version: order.version,
      reason: "错误切换",
    });
    assert.equal(r.statusCode, 422);
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM orders WHERE demand_id=?").get(d.id)
        .n,
      1,
    );
  } finally {
    await f.close();
  }
});

test("CR2 全量组合查询、关联计数与SQL核验量，分配不代替交付", async () => {
  const f = await fixture();
  try {
    const d = await createDemand(f);
    const r = ok(
      await f.cmd("order.generate", d.id, {
        expected_version: d.version,
        items: [batch(400, "CR2唯一订单")],
        confirm: true,
      }),
    );
    const filtered = ok(
      await f.admin.req(
        "/api/resources/orders?demand=" +
          d.id +
          "&cargo=原煤&origin=CR2装&destination=CR2集&sort=finish_at&direction=asc&pageSize=1",
      ),
    );
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].id, r.orders[0].id);
    const parent = await f.get("demands", d.id);
    assert.equal(parent.order_count, 1);
    assert.equal(parent.verified_kg, 0);
    assert.equal(parent.allocated_kg, 400000);
    const q = ok(
      await f.admin.req("/api/resources/demands?q=CR2装&allocation=partial"),
    );
    assert(q.items.some((x) => x.id === d.id));
    const actual = await f.get("orders", "O001"),
      sum = f.db
        .prepare("SELECT sum(verified_kg) n FROM tasks WHERE order_id=?")
        .get(actual.id).n;
    assert.equal(actual.verified_kg, sum);
    const driver = await f.login("driver01");
    assert.equal((await driver.req("/api/resources/demands")).statusCode, 403);
  } finally {
    await f.close();
  }
});
