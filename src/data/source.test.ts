import test from "node:test";
import assert from "node:assert/strict";
import { createHttpSource } from "./httpSource.ts";
import { WarehouseRepository } from "../../server/repository.ts";
import { createDemoSource } from "./demoSource.ts";
import { useSimulationStore } from "../state/simulationStore.ts";
import { useUIStore } from "../state/uiStore.ts";
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
test("demo adapters publish simulation data while interface state stays independent", () => {
  useSimulationStore.getState().reset();
  const source = createDemoSource(),
    stop = source.start();
  const camera = useUIStore.getState().camera,
    before = source.getState().snapshot!;
  source.replenish!("PPE-010", 96);
  const after = source.getState().snapshot!;
  assert.equal(after.mode, "demo");
  assert.equal(
    after.inventory.find((i) => i.id === "PPE-010")!.stock,
    before.inventory.find((i) => i.id === "PPE-010")!.stock + 96,
  );
  assert.deepEqual(useUIStore.getState().camera, camera);
  stop();
  useSimulationStore.getState().reset();
});
test("HTTP adapters reject incompatible snapshots, retain stale data on failure, and recover", async () => {
  const repo = new WarehouseRepository(":memory:", true),
    snapshot = repo.snapshot();
  repo.close();
  const original = globalThis.fetch;
  const source = createHttpSource();
  try {
    globalThis.fetch = async () => Response.json(snapshot);
    await source.refresh();
    assert.equal(source.getState().connection, "connected");
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };
    await source.refresh();
    assert.equal(source.getState().connection, "offline");
    assert.deepEqual(source.getState().snapshot, snapshot);
    globalThis.fetch = async () =>
      Response.json({ ...snapshot, schemaVersion: 99 });
    await source.refresh();
    assert.equal(source.getState().connection, "offline");
    globalThis.fetch = async () => Response.json(snapshot);
    await source.refresh();
    assert.equal(source.getState().connection, "connected");
  } finally {
    globalThis.fetch = original;
  }
});
test("a stale poll cannot roll back a command; late responses after stop are ignored", async () => {
  const repo = new WarehouseRepository(":memory:", true),
    old = repo.snapshot();
  const latest = repo.execute({
    id: "latest",
    type: "arrive",
    shipmentId: "SHP-78442",
  });
  repo.close();
  const original = globalThis.fetch;
  let resolvePoll!: (response: Response) => void;
  try {
    globalThis.fetch = async (_url, init) =>
      init?.method === "POST"
        ? Response.json(latest)
        : new Promise<Response>((resolve) => {
            resolvePoll = resolve;
          });
    const source = createHttpSource(),
      stop = source.start();
    await source.execute!({
      id: "latest",
      type: "arrive",
      shipmentId: "SHP-78442",
    });
    resolvePoll(Response.json(old));
    await flush();
    assert.equal(source.getState().snapshot!.revision, latest.revision);
    stop();
    const stoppedSource = createHttpSource(),
      stopAgain = stoppedSource.start();
    stopAgain();
    resolvePoll(Response.json(latest));
    await flush();
    assert.equal(stoppedSource.getState().snapshot, null);
  } finally {
    globalThis.fetch = original;
  }
});
