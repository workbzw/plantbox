import assert from "node:assert/strict";
import test from "node:test";
import type { EventType, WarehouseCommand } from "../domain/warehouse.ts";
import { LivePlayback } from "../runtime/livePlayback.ts";
import type { WarehouseDataSource } from "./source.ts";
import { createInteractiveSource } from "./interactiveSource.ts";

let sequence = 0;
const send = (
  source: WarehouseDataSource,
  type: EventType,
  shipmentId = "SHP-78442",
  palletId?: string,
) =>
  source.execute!({
    id: `cmd-${++sequence}`,
    type,
    shipmentId,
    ...(palletId ? { palletId } : {}),
  });
const begin = async (source: WarehouseDataSource, id = "SHP-78442") => {
  for (const type of ["arrive", "dock", "start"] as const)
    await send(source, type, id);
};

test("a full browser-only workflow changes stock once and drives the complete animation queue without HTTP", async () => {
  const source = createInteractiveSource();
  const initial = source.getState().snapshot!;
  const frozen = JSON.stringify(initial);
  const playback = new LivePlayback();
  playback.ingest(initial);
  const unsubscribe = source.subscribe(() =>
    playback.ingest(source.getState().snapshot!),
  );
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("No backend");
  };
  const stop = source.start();
  try {
    assert.equal(initial.mode, "interactive");
    assert.equal(initial.shipments.length, 3);
    assert.equal(initial.pallets.length, 24);
    assert.equal(playback.getState().pending, 0);
    for (const shipment of initial.shipments) {
      await begin(source, shipment.id);
      const manifest = initial.pallets.filter(
        (p) => p.shipmentId === shipment.id,
      );
      for (const pallet of [...manifest].reverse())
        await send(source, "confirm_pallet", shipment.id, pallet.id);
      const loaded = source.getState().snapshot!;
      const beforeStock = initial.inventory.find(
        (sku) => sku.id === shipment.skuId,
      )!.stock;
      const quantity = manifest.reduce((n, p) => n + p.quantity, 0);
      assert.equal(
        loaded.inventory.find((sku) => sku.id === shipment.skuId)!.stock,
        beforeStock + (shipment.direction === "inbound" ? quantity : -quantity),
      );
      assert.ok(
        loaded.pallets
          .filter((p) => p.shipmentId === shipment.id)
          .every(
            (p) =>
              p.confirmed &&
              p.location ===
                (shipment.direction === "inbound" ? "storage" : "truck"),
          ),
      );
      await send(source, "complete", shipment.id);
      await send(source, "depart", shipment.id);
      assert.deepEqual(source.getState().snapshot!.inventory, loaded.inventory);
    }
    await source.refresh();
    assert.equal(requests, 0);
    assert.equal(source.getState().connection, "connected");
    const final = source.getState().snapshot!;
    assert.equal(final.events.length, 33);
    assert.equal(
      final.events.filter((e) => e.type === "confirm_pallet").length,
      18,
    );
    assert.equal(playback.getState().pending, 33);
    assert.ok(
      final.pallets
        .filter((p) => p.shipmentId === "SHP-78447")
        .every((p) => p.location === "storage"),
    );
    assert.ok(
      final.pallets
        .filter((p) => p.shipmentId && p.shipmentId !== "SHP-78447")
        .every((p) => p.location === "departed"),
    );
    playback.setSpeed(4);
    for (let i = 0; i < 6000 && playback.getState().pending; i++)
      playback.advance(1);
    assert.equal(
      playback.getState().pending,
      0,
      "all three vehicles must finish without blocking the queue",
    );
    assert.ok(
      [...playback.shipments.values()].every(
        (s) => s.status === "departed" && !s.truck.visible,
      ),
    );
    assert.ok(
      initial.pallets
        .filter((p) => p.shipmentId === "SHP-78447")
        .every((p) => playback.palletPose(p.id).visible),
    );
    assert.equal(
      JSON.stringify(initial),
      frozen,
      "commands and playback must not mutate earlier snapshots",
    );
  } finally {
    globalThis.fetch = originalFetch;
    unsubscribe();
    stop();
  }
});

test("invalid transitions, wrong manifests and duplicate confirmations leave the browser ledger unchanged", async () => {
  const source = createInteractiveSource();
  const initial = source.getState().snapshot!;
  await assert.rejects(send(source, "depart"), /状态/);
  await assert.rejects(
    send(source, "confirm_pallet", "SHP-78442", "KLY-1-001"),
    /开始/,
  );
  assert.equal(source.getState().snapshot, initial);
  await begin(source);
  const before = source.getState().snapshot;
  await assert.rejects(send(source, "complete"), /未确认/);
  await assert.rejects(
    send(source, "confirm_pallet", "SHP-78442", "KLY-2-001"),
    /不匹配/,
  );
  await assert.rejects(
    send(source, "confirm_pallet", "SHP-78442", "MISSING"),
    /不存在/,
  );
  await assert.rejects(
    source.execute!({
      id: "bad",
      type: "confirm_pallet",
      shipmentId: "SHP-78442",
      palletId: "KLY-1-001",
      quantity: 999,
    } as WarehouseCommand),
    /未知字段/,
  );
  assert.equal(source.getState().snapshot, before);
  const command: WarehouseCommand = {
    id: "retry",
    type: "confirm_pallet",
    shipmentId: "SHP-78442",
    palletId: "KLY-1-001",
  };
  await source.execute!(command);
  const accepted = source.getState().snapshot;
  await source.execute!(command);
  assert.equal(source.getState().snapshot, accepted);
  await assert.rejects(
    source.execute!({ ...command, palletId: "KLY-1-002" }),
    /操作编号/,
  );
  await assert.rejects(
    source.execute!({ ...command, id: "duplicate" }),
    /重复扫码/,
  );
  assert.equal(source.getState().snapshot, accepted);
});

test("new demo sessions restore initial stock, manifests, events and animation state independently", async () => {
  const source = createInteractiveSource();
  await begin(source);
  await send(source, "confirm_pallet", "SHP-78442", "KLY-1-001");
  const changed = source.getState().snapshot!;
  const reset = createInteractiveSource().getState().snapshot!;
  assert.ok(
    reset.shipments.every((s) => s.status === "expected" && s.completed === 0),
  );
  assert.ok(reset.pallets.every((p) => !p.confirmed));
  assert.equal(reset.events.length, 0);
  assert.equal(reset.revision, 1);
  assert.equal(
    reset.inventory.find((i) => i.id === "PKG-001")!.stock,
    changed.inventory.find((i) => i.id === "PKG-001")!.stock + 24,
  );
  assert.equal(source.getState().snapshot, changed);
  const playback = new LivePlayback();
  playback.ingest(reset);
  assert.equal(playback.getState().pending, 0);
  assert.ok([...playback.shipments.values()].every((s) => !s.truck.visible));
});
