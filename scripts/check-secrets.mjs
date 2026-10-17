import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { loadConfig } from "../server/config.mjs";
const config = loadConfig();
const secrets = [
  config.deepseekKey,
  config.amapSecurity,
  config.amapService,
].filter((v) => v && v.length > 8);
const findings = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(m?js|jsx|css|html|json|csv|md|txt|log|map)$/i.test(e.name)) {
      const value = fs.readFileSync(p, "utf8");
      if (secrets.some((s) => value.includes(s)))
        findings.push(p.replaceAll("\\", "/"));
    }
  }
}
for (const dir of [
  "client",
  "server",
  "scripts",
  "tests",
  "dist",
  "docs/development",
])
  walk(dir);
const report = {
  checked_at: new Date().toISOString(),
  status: findings.length ? "FAIL" : "PASS",
  plaintext_server_secret_occurrences: findings.length,
  files: findings,
  scope:
    "正式源码、构建产物、测试、开发文档与日志；浏览器JSAPI公开Key不作为服务端秘密",
};
fs.writeFileSync(
  "docs/development/04-integration/secret-scan.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
assert.equal(findings.length, 0, "服务端密钥不得进入源码、构建产物或开发证据");
