import { createApp } from "./app.mjs";
const { app, db } = createApp();
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || "0.0.0.0";
const server = app.listen(port, host, () =>
  console.log(
    `交能平台服务：http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`,
  ),
);
process.on("SIGINT", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
