import { must, text, number } from "./db.mjs";
import { get, allowed, version } from "./repository.mjs";
import { transportCommand } from "./transport.mjs";

// Each composite command runs inside the HTTP command transaction and idempotency boundary.
export function workbenchCommand(db, user, type, id, b) {
  if (type === "demand.save") {
    allowed(user, "demand.write");
    const result = transportCommand(
      db,
      user,
      id ? "demand.edit" : "demand.create",
      id,
      b,
    );
    let row = get(db, user, "demands", result.id);
    if (b.confirm === true && row.status === "草稿") {
      transportCommand(db, user, "demand.confirm", row.id, {
        expected_version: row.version,
      });
      row = get(db, user, "demands", row.id);
    }
    return { id: row.id, record: row };
  }
  if (type === "order.save") {
    allowed(user, "order.write");
    const original = id ? get(db, user, "orders", id) : null;
    if (original && original.status !== "草稿")
      must(
        !b.demand_id || b.demand_id === original.demand_id,
        "已确认订单不能切换来源需求",
      );
    const result = transportCommand(
      db,
      user,
      original
        ? original.status === "草稿"
          ? "order.edit"
          : "order.amend"
        : "order.create",
      id,
      b,
    );
    let row = get(db, user, "orders", result.id);
    if (b.confirm === true && row.status === "草稿") {
      transportCommand(db, user, "order.confirm", row.id, {
        expected_version: row.version,
      });
      row = get(db, user, "orders", row.id);
    }
    return { id: row.id, record: row };
  }
  if (type === "order.generate") {
    allowed(user, "order.write");
    const demand = get(db, user, "demands", id);
    version(demand, b);
    must(demand.status === "已确认", "请先确认需求，再生成订单");
    must(
      Array.isArray(b.items) && b.items.length >= 1 && b.items.length <= 20,
      "每次安排1至20个运输批次",
    );
    const total = b.items.reduce(
      (sum, item) =>
        sum + Math.round(number(item.quantity, "批次运量", 0.001, 1e6) * 1000),
      0,
    );
    must(
      total <= demand.quantity_kg - demand.allocated_kg,
      "本次分配超出需求可分配量，请核对最新余量",
    );
    const rows = [];
    for (const item of b.items) {
      const created = transportCommand(db, user, "order.create", null, {
        ...item,
        name: text(item.name, "批次名称", 100),
        demand_id: demand.id,
        cargo: demand.cargo,
        origin: demand.origin,
        destination: demand.destination,
      });
      if (b.confirm === true)
        transportCommand(db, user, "order.confirm", created.id, {
          expected_version: 1,
        });
      rows.push(get(db, user, "orders", created.id));
    }
    return {
      id: demand.id,
      ids: rows.map((r) => r.id),
      orders: rows,
      confirmed: b.confirm === true,
      demand: get(db, user, "demands", demand.id),
    };
  }
}
