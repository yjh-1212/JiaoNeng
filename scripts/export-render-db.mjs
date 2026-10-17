import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const srcPath = process.env.DATABASE_PATH || "data/jiaoneng.sqlite";
const outPath =
  process.env.RENDER_BOOTSTRAP_DB || "deploy/render/jiaoneng.bootstrap.sqlite";

fs.mkdirSync(path.dirname(outPath), { recursive: true });
if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

const src = new DatabaseSync(srcPath);
src.exec("PRAGMA wal_checkpoint(TRUNCATE)");
const absOut = path.resolve(outPath).replaceAll("\\", "/");
src.exec(`VACUUM INTO '${absOut.replaceAll("'", "''")}'`);
src.close();

const db = new DatabaseSync(outPath, { readOnly: true });
const tables = [
  "organizations",
  "users",
  "demands",
  "orders",
  "vehicles",
  "drivers",
  "stations",
  "tasks",
];
for (const table of tables) {
  const n = db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  console.log(`${table}: ${n}`);
}
db.close();
console.log(`exported ${outPath} (${fs.statSync(outPath).size} bytes)`);
