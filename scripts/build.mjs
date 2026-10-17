import esbuild from "esbuild";
import fs from "node:fs";
export const options = {
  entryPoints: ["client/app.jsx"],
  bundle: true,
  outdir: "dist",
  entryNames: "app",
  assetNames: "assets/[name]-[hash]",
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: {
    ".woff2": "dataurl",
    ".woff": "dataurl",
    ".png": "file",
    ".webp": "file",
    ".svg": "dataurl",
  },
};
export function html() {
  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync(
    "dist/index.html",
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>交能融合智能体平台</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
  );
}
if (process.argv[1]?.endsWith("build.mjs")) {
  await esbuild.build(options);
  html();
  console.log("前端构建完成");
}
