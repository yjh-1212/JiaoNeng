import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from 'node:async_hooks';
export const writeContext = new AsyncLocalStorage();
const businessTables = new Set(['demands','orders','vehicles','drivers','stations','devices','tasks','trips','simulations','charging','sessions','costs','alerts','records','telemetry']);
export const now = () => new Date().toISOString(),
  uid = (prefix = "R") => prefix + "-" + randomUUID();
export function database(
  filename = process.env.DATABASE_PATH || "data/jiaoneng.sqlite",
) {
  if (filename !== ":memory:")
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;",
  );
  db.exec(
    fs.readFileSync(
      fileURLToPath(new URL("./schema.sql", import.meta.url)),
      "utf8",
    ),
  );
  db.prepare("INSERT OR IGNORE INTO migrations VALUES(1,?)").run(now());
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function insert(db, table, row) {
  if(writeContext.getStore()==='operational' && businessTables.has(table)) {
    const cols=db.prepare('PRAGMA table_info('+table+')').all().map(x=>x.name);
    if(cols.includes('source')) row={...row,source:row.source==='PUBLIC_REFERENCE'?'PUBLIC_REFERENCE':/DERIVED/.test(row.source||'')?'ESTIMATED':'MANUAL_ENTRY'};
  }
  const columns = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
  ).run(
    ...columns.map((k) =>
      row[k] === null
        ? null
        : typeof row[k] === "boolean"
          ? Number(row[k])
          : typeof row[k] === "object"
            ? JSON.stringify(row[k])
            : row[k],
    ),
  );
  if(writeContext.getStore()==='operational'&&businessTables.has(table)&&row.id)db.prepare('INSERT OR IGNORE INTO operational_records(resource,id) VALUES(?,?)').run(table==='records'?row.resource:table,row.id);
  return row;
}
export function unpack(row) {
  if (!row) return null;
  const { data, ...base } = row;
  return {
    ...(data ? JSON.parse(data) : {}),
    ...base,
    source_label:
      {
        SIMULATED: "业务仿真",
        MANUAL_SIMULATION: "人工登记·仿真",
        DERIVED_SIMULATION: "条件测算",
        PUBLIC_REFERENCE: "公开参考",
        REFERENCE_PARAMETER: "参考参数草案",
        MANUAL_ENTRY: "人工登记",
        ESTIMATED: "预计结果",
      }[row.source] || row.source,
  };
}
export class BusinessError extends Error {
  constructor(message, status = 422, code = "BUSINESS_RULE", details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function must(condition, message, status = 422, code = "BUSINESS_RULE") {
  if (!condition) throw new BusinessError(message, status, code);
}
export function text(v, label, max = 2000) {
  must(
    typeof v === "string" && v.trim().length > 0 && v.trim().length <= max,
    `请填写有效的${label}（最多${max}字）`,
  );
  return v.trim();
}
export function number(v, label, min = 0, max = 1e9) {
  must(
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max,
    `${label}应在${min}至${max}之间`,
  );
  return v;
}
export const kg = (v) =>
  Math.round(number(v, "数量（吨）", 0.001, 1000000) * 1000);
