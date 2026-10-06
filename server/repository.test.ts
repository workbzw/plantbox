import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { WarehouseRepository } from "./repository.ts";
import type { EventType } from "../src/domain/warehouse.ts";
const send = (
  r: WarehouseRepository,
  type: EventType,
  shipmentId = "SHP-78442",
  palletId?: string,
) =>
  r.execute({
    id: randomUUID(),
    type,
    shipmentId,
    ...(palletId ? { palletId } : {}),
  });
const begin = (r: WarehouseRepository, id = "SHP-78442") => {
  for (const t of ["arrive", "dock", "start"] as const) send(r, t, id);
};
test("outbound manifest updates stock exactly once, keeps cargo aboard, and departure does not deduct again", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    const before = r.snapshot();
    begin(r);
    const ids = before.pallets
      .filter((p) => p.shipmentId === "SHP-78442")
      .map((p) => p.id);
    for (const id of ids) send(r, "confirm_pallet", "SHP-78442", id);
    const loaded = r.snapshot();
    assert.equal(
      loaded.inventory.find((i) => i.id === "PKG-001")!.stock,
      before.inventory.find((i) => i.id === "PKG-001")!.stock - 144,
    );
    assert.ok(
      loaded.pallets
        .filter((p) => ids.includes(p.id))
        .every((p) => p.location === "truck" && p.confirmed),
    );
    send(r, "complete");
    const departed = send(r, "depart");
    assert.deepEqual(departed.inventory, loaded.inventory);
    assert.ok(
      departed.pallets
        .filter((p) => ids.includes(p.id))
        .every((p) => p.location === "departed"),
    );
    assert.equal(
      departed.events.filter((e) => e.type === "confirm_pallet").length,
      6,
    );
  } finally {
    r.close();
  }
});
test("inbound unloading adds manifest quantities and retains received pallets after the truck leaves", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    const before = r.snapshot();
    begin(r, "SHP-78447");
    const ids = before.pallets
      .filter((p) => p.shipmentId === "SHP-78447")
      .map((p) => p.id);
    for (const id of ids) send(r, "confirm_pallet", "SHP-78447", id);
    send(r, "complete", "SHP-78447");
    const after = send(r, "depart", "SHP-78447");
    assert.equal(
      after.inventory.find((i) => i.id === "STO-020")!.stock,
      before.inventory.find((i) => i.id === "STO-020")!.stock + 72,
    );
    assert.ok(
      after.pallets
        .filter((p) => ids.includes(p.id))
        .every((p) => p.location === "storage"),
    );
  } finally {
    r.close();
  }
});
test("retries are idempotent, conflicting ids and duplicate scans cannot create a second movement", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    begin(r);
    const c = {
      id: "retry-1",
      type: "confirm_pallet",
      shipmentId: "SHP-78442",
      palletId: "KLY-1-001",
    };
    const first = r.execute(c);
    assert.deepEqual(r.execute(c), first);
    assert.throws(() => r.execute({ ...c, palletId: "KLY-1-002" }), /操作编号/);
    assert.throws(() => r.execute({ ...c, id: "retry-2" }), /重复扫码/);
    assert.deepEqual(r.snapshot(), first);
  } finally {
    r.close();
  }
});
test("wrong manifests, missing pallets and illegal transitions leave the database unchanged", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    let before = r.snapshot();
    assert.throws(() => send(r, "depart"), /状态/);
    assert.throws(
      () => send(r, "confirm_pallet", "SHP-78442", "KLY-1-001"),
      /开始/,
    );
    assert.deepEqual(r.snapshot(), before);
    begin(r);
    before = r.snapshot();
    assert.throws(
      () => send(r, "confirm_pallet", "SHP-78442", "KLY-2-001"),
      /不匹配/,
    );
    assert.throws(
      () => send(r, "confirm_pallet", "SHP-78442", "MISSING"),
      /不存在/,
    );
    assert.throws(() => send(r, "complete"), /未确认/);
    assert.throws(
      () =>
        r.execute({
          id: "attack",
          type: "confirm_pallet",
          shipmentId: "SHP-78442",
          palletId: "KLY-1-001",
          quantity: -99,
        }),
      /未知字段/,
    );
    assert.deepEqual(r.snapshot(), before);
  } finally {
    r.close();
  }
});
test("ledger and idempotency survive service restart; sample initialization never replaces business data", () => {
  const dir = mkdtempSync(join(tmpdir(), "plantbox-db-"));
  const file = join(dir, "warehouse.sqlite");
  let r = new WarehouseRepository(file, true);
  try {
    const c = { id: "persist-1", type: "arrive", shipmentId: "SHP-78442" };
    const before = r.execute(c);
    r.close();
    r = new WarehouseRepository(file, true);
    assert.deepEqual(r.snapshot(), before);
    assert.deepEqual(r.execute(c), before);
  } finally {
    r.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("empty databases have no invented inventory or shipments", () => {
  const r = new WarehouseRepository(":memory:");
  try {
    const s = r.snapshot();
    assert.equal(s.sampleData, false);
    assert.equal(s.shipments.length, 0);
    assert.equal(s.inventory.length, 0);
    assert.equal(s.occupiedPallets, 0);
  } finally {
    r.close();
  }
});
