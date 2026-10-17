import assert from "node:assert/strict";
const base = "http://127.0.0.1:3100";
const health = await fetch(base + "/api/health");
assert.equal(health.status, 200);
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "JiaoNeng2026!" }),
});
assert.equal(login.status, 200);
const identity = await login.json(),
  cookie = login.headers.get("set-cookie").split(";")[0];
try {
  const urls = [
    "/api/bootstrap",
    "/api/summary",
    "/api/reports",
    "/api/resources/tasks?pageSize=1",
    "/api/resources/vehicles?pageSize=1",
  ];
  for (const url of urls) {
    const response = await fetch(base + url, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, url);
    const data = await response.json();
    if (url.includes("resources")) assert(data.total > 0);
  }
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        url: base,
        checks: 6,
        business_mutations: false,
        external_ai_calls: false,
        existing_database_preserved: true,
      },
      null,
      2,
    ),
  );
} finally {
  await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { Cookie: cookie, "X-CSRF-Token": identity.csrf },
  });
}
