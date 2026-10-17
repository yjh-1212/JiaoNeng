import fs from "node:fs";
import path from "node:path";
export function loadConfig() {
  const c = {
    amapKey: process.env.AMAP_JSAPI_KEY || "",
    amapSecurity: process.env.AMAP_SECURITY_CODE || "",
    amapService: process.env.AMAP_SERVICE_KEY || "",
    deepseekKey: process.env.DEEPSEEK_API_KEY || "",
    deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-flash",
  };
  const dir = path.resolve("api_key");
  if (!fs.existsSync(dir)) return c;
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(txt|json|env)$/i.test(file)) continue;
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    if (/deepseek/i.test(file)) {
      c.deepseekKey ||= content.match(/sk-[A-Za-z0-9_-]{16,}/)?.[0] || "";
    }
    if (/高德|amap/i.test(file)) {
      let kind = "amapKey";
      for (const line of content.split(/\r?\n/)) {
        if (/安全|security/i.test(line)) kind = "amapSecurity";
        else if (/web服务|webservice|服务端/i.test(line)) kind = "amapService";
        else if (/jsapi|web端|javascript/i.test(line)) kind = "amapKey";
        const value = line.match(/\b[a-f0-9]{32}\b/i)?.[0];
        if (value && kind) c[kind] ||= value;
      }
    }
  }
  return c;
}
