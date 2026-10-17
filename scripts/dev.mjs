import esbuild from "esbuild";
import { options, html } from "./build.mjs";
const ctx = await esbuild.context({ ...options, minify: false });
await ctx.watch();
await ctx.rebuild();
html();
await import("../server/index.mjs");
