import { request } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { createWarehouseServer } from "./app.ts";
import { WarehouseRepository } from "./repository.ts";
import type { WarehouseSnapshot } from "../src/domain/warehouse.ts";
test("HTTP enforces authentication, origin, JSON and domain validation, and serves authoritative snapshots", async () => {
  const r = new WarehouseRepository(":memory:", true);
  const server = createWarehouseServer(r, { token: "test-only-secret-token" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = {
    Authorization: "Bearer test-only-secret-token",
    "Content-Type": "application/json",
  };
  try {
    assert.equal((await fetch(base + "/api/v1/snapshot")).status, 401);
    assert.equal(
      (
        await fetch(base + "/api/v1/snapshot", {
          headers: { ...headers, Origin: "https://unknown.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/v1/commands", {
          method: "POST",
          headers,
          body: "broken",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/api/v1/commands", {
          method: "POST",
          headers,
          body: JSON.stringify({
            id: "bad",
            type: "depart",
            shipmentId: "SHP-78442",
          }),
        })
      ).status,
      409,
    );
    const c = { id: "arrive-once", type: "arrive", shipmentId: "SHP-78442" };
    const results = await Promise.all(
      [1, 2].map(() =>
        fetch(base + "/api/v1/commands", {
          method: "POST",
          headers,
          body: JSON.stringify(c),
        }),
      ),
    );
    assert.ok(results.every((r) => r.ok));
    const snapshot = (await (
      await fetch(base + "/api/v1/snapshot", { headers })
    ).json()) as WarehouseSnapshot;
    assert.equal(snapshot.events.length, 1);
    assert.equal(
      snapshot.shipments.find((s) => s.id === c.shipmentId)?.status,
      "arrived",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    r.close();
  }
});

test("a loopback service without a token rejects untrusted Host headers", async () => {
  const r = new WarehouseRepository(":memory:");
  const server = createWarehouseServer(r);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/snapshot`,
        { headers: { Host: "untrusted.example" } },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    r.close();
  }
});
