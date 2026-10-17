import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { database, insert, now, transaction } from "../server/db.mjs";
import { seed } from "../server/seed.mjs";
test("磁盘迁移重复执行、重启持久化与SQLite一致性备份", () => {
  const folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "jiaoneng-verification-"),
    ),
    file = path.join(folder, "test.sqlite"),
    backup = path.join(folder, "backup.sqlite");
  let db;
  try {
    db = database(file);
    seed(db);
    const count = db.prepare("SELECT count(*) n FROM tasks").get().n;
    insert(db, "audit", {
      id: "REOPEN-CHECK",
      user_id: "U-ADMIN",
      owner_id: "ORG-N",
      action: "持久化验证",
      entity_id: "LOCAL-TEST",
      created_at: now(),
      data: { source: "SIMULATED" },
    });
    db.close();
    db = database(file);
    seed(db);
    assert.equal(db.prepare("SELECT count(*) n FROM tasks").get().n, count);
    assert(db.prepare("SELECT 1 FROM audit WHERE id='REOPEN-CHECK'").get());
    db.prepare("VACUUM INTO ?").run(backup);
    db.close();
    db = database(backup);
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db?.close();
    for (const name of [
      "test.sqlite",
      "test.sqlite-wal",
      "test.sqlite-shm",
      "backup.sqlite",
      "backup.sqlite-wal",
      "backup.sqlite-shm",
    ]) {
      const target = path.resolve(folder, name);
      assert.equal(path.dirname(target), folder);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(folder);
  }
});
test("任务列表与轨迹使用业务索引，千条样本查询记录实际时延", () => {
  const db = database(":memory:");
  try {
    seed(db);
    transaction(db, () => {
      for (let i = 0; i < 1000; i++)
        insert(db, "tasks", {
          id: "PERF-" + i,
          code: "PERF-" + i,
          name: "SQL仿真样本",
          owner_id: "ORG-N",
          order_id: "O001",
          vehicle_id: "V001",
          driver_id: "D001",
          status: "已取消",
          quantity_kg: 30000,
          start_at: "2026-10-01T00:00:00Z",
          finish_at: "2026-10-01T01:00:00Z",
          created_at: now(),
          source: "SIMULATED",
          data: {},
        });
    });
    const plan = db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE driver_id=? AND status=? ORDER BY created_at DESC LIMIT 20",
      )
      .all("D001", "已取消");
    assert(plan.some((r) => r.detail.includes("idx_tasks_driver_state")));
    const start = performance.now();
    const rows = db
      .prepare(
        "SELECT * FROM tasks WHERE driver_id=? AND status=? ORDER BY created_at DESC LIMIT 20",
      )
      .all("D001", "已取消");
    const elapsed = performance.now() - start;
    assert.equal(rows.length, 20);
    const result = {
      checked_at: now(),
      sample_tasks: db.prepare("SELECT count(*) n FROM tasks").get().n,
      list_query_ms: elapsed,
      query_plan: plan.map((r) => r.detail),
      performance_sla_confirmed: false,
    };
    fs.writeFileSync(
      "docs/development/02-backend/query-performance.json",
      JSON.stringify(result, null, 2),
    );
  } finally {
    db.close();
  }
});
