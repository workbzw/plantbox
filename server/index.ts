import { resolve } from "node:path";
import { createWarehouseServer } from "./app.ts";
import { WarehouseRepository } from "./repository.ts";
const host = process.env.PLANTBOX_HOST ?? "127.0.0.1";
const port = Number(process.env.PLANTBOX_PORT ?? 3001);
const token = process.env.PLANTBOX_API_TOKEN;
if (
  !["127.0.0.1", "localhost", "::1"].includes(host) &&
  (!token || token.length < 24)
)
  throw new Error(
    "Non-loopback binding requires PLANTBOX_API_TOKEN (at least 24 characters)",
  );
const repository = new WarehouseRepository(
  resolve(process.env.PLANTBOX_DB ?? "data/warehouse.sqlite"),
);
const server = createWarehouseServer(repository, {
  token,
  dist: resolve("dist"),
  allowedOrigins: (
    process.env.PLANTBOX_ORIGINS ??
    "http://localhost:5173,http://127.0.0.1:5173"
  ).split(","),
});
server.listen(port, host, () =>
  console.log(`Plantbox service: http://${host}:${port}`),
);
const close = () =>
  server.close(() => {
    repository.close();
    process.exit(0);
  });
process.once("SIGINT", close);
process.once("SIGTERM", close);
