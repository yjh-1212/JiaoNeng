import test from "node:test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";
import { normal, boundary, permission } from "./ac-cases.mjs";
const records = [],
  out =
    process.env.AC_RESULTS_PATH ||
    "docs/development/05-acceptance/ac-results.json";
for (let n = 1; n <= 57; n++)
  test("REQ-" + String(n).padStart(3, "0") + " 正常、边界、权限", async (t) => {
    const f = await fixture(),
      id = "AC-" + String(n).padStart(3, "0");
    let probe;
    const check = async (suffix, label, fn) => {
      await t.test(id + suffix + " " + label, async () => {
        try {
          await fn();
          records.push({
            acceptance_id: id + suffix,
            status: "PASS",
            evidence: "tests/ac-cases.mjs",
            executed_at: new Date().toISOString(),
            model_service: "deterministic test double; no external calls",
          });
        } catch (e) {
          records.push({
            acceptance_id: id + suffix,
            status: "FAIL",
            failure: e.message,
            executed_at: new Date().toISOString(),
          });
          throw e;
        } finally {
          fs.writeFileSync(
            out,
            JSON.stringify(
              {
                status:
                  records.length === 171
                    ? records.every((r) => r.status === "PASS")
                      ? "PASS"
                      : "FAIL"
                    : "IN_PROGRESS",
                executed: records.length,
                records,
              },
              null,
              2,
            ),
          );
        }
      });
    };
    try {
      assert(normal[n]);
      await check("", "正常", async () => (probe = await normal[n](f)));
      await check("-B", "边界/异常", () => boundary(n, f));
      await check("-P", "权限/隔离", () => permission(n, f, probe));
      if (f.state?.metrics)
        fs.writeFileSync(
          "docs/development/05-acceptance/api-benchmark.json",
          JSON.stringify(f.state.metrics, null, 2),
        );
    } finally {
      await f.close();
    }
  });
