import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const bootstrap =
  process.env.RENDER_BOOTSTRAP_DB || "deploy/render/jiaoneng.bootstrap.sqlite";
const target = process.env.DATABASE_PATH || "data/jiaoneng.sqlite";
const force = process.env.RENDER_FORCE_BOOTSTRAP !== "false";

if (!fs.existsSync(bootstrap)) {
  console.error(`缺少本地数据快照：${bootstrap}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
if (force || !fs.existsSync(target)) {
  fs.copyFileSync(bootstrap, target);
  for (const suffix of ["-wal", "-shm"]) {
    const side = target + suffix;
    if (fs.existsSync(side)) fs.unlinkSync(side);
  }
  console.log(`已导入本地数据快照 → ${target}`);
}

const child = spawn(process.execPath, ["server/index.mjs"], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
