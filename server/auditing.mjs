import { insert, uid, now } from "./db.mjs";
const tables = [
  "orders",
  "demands",
  "tasks",
  "trips",
  "simulations",
  "vehicles",
  "drivers",
  "stations",
  "devices",
  "charging",
  "sessions",
  "costs",
  "alerts",
  "records",
];
function find(db, id) {
  if (!id) return null;
  for (const table of tables) {
    const r = db
      .prepare(`SELECT id,owner_id,version FROM ${table} WHERE id=?`)
      .get(id);
    if (r) return r;
  }
  return null;
}
export function auditSuccess(db, user, type, id, body, output, key) {
  const ids = output.ids || [id || output.id || "batch"],
    groups = new Map();
  for (const target of ids) {
    const r = find(db, target),
      owner = r?.owner_id || user.scopes[0],
      group = groups.get(owner) || [];
    group.push({ id: target, version: r?.version ?? null });
    groups.set(owner, group);
  }
  for (const [owner, targets] of groups)
    insert(db, "audit", {
      id: uid("AUD"),
      user_id: user.id,
      owner_id: owner,
      action: type,
      entity_id: targets.length === 1 ? targets[0].id : "batch",
      before_version: body.expected_version || null,
      after_version: targets.length === 1 ? targets[0].version : null,
      created_at: now(),
      data: {
        command_key: key,
        result_ids: targets.map((t) => t.id),
        created_id: output.id || null,
        source: "LOCAL_BUSINESS_OPERATION",
        result: "SUCCEEDED",
      },
    });
}
