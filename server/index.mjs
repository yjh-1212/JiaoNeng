import { createApp } from "./app.mjs";
const { app, db } = createApp();
const port = Number(process.env.PORT || 3100);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`交能平台本地服务：http://127.0.0.1:${port}`),
);
process.on("SIGINT", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
