import { loadConfig } from "../server/config.mjs";
import fs from "node:fs";
const c = loadConfig(),
  report = { checked_at: new Date().toISOString(), secrets_logged: false };
if (c.amapService) {
  try {
    const url = new URL("https://restapi.amap.com/v3/geocode/geo");
    url.searchParams.set("key", c.amapService);
    url.searchParams.set("address", "甘肃省庆阳市");
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) }),
      body = await r.json();
    report.amap_rest = {
      configured: true,
      http_status: r.status,
      valid: body.status === "1",
      code: body.infocode,
      city_match: !!body.geocodes?.length,
    };
  } catch (e) {
    report.amap_rest = { configured: true, valid: false, error: e.name };
  }
}
if (c.deepseekKey) {
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + c.deepseekKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: c.deepseekModel,
        messages: [{ role: "user", content: "接口连通性检查。请只回复OK。" }],
        thinking: { type: "disabled" },
        max_tokens: 64,
        stream: false,
      }),
      signal: AbortSignal.timeout(45000),
    });
    const body = await r.json();
    report.deepseek = {
      configured: true,
      http_status: r.status,
      valid: r.ok && !!body.choices?.[0]?.message?.content,
      model: body.model || c.deepseekModel,
      token_usage: body.usage?.total_tokens,
      error_code: r.ok ? undefined : body.error?.code,
    };
  } catch (e) {
    report.deepseek = { configured: true, valid: false, error: e.name };
  }
}
report.amap_jsapi = {
  configured: !!(c.amapKey && c.amapSecurity),
  browser_verified: false,
};
fs.writeFileSync(
  "docs/development/04-integration/live-services.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
