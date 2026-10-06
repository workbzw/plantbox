import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { WarehouseRepository } from "../server/repository.ts";
import type { EventType } from "./domain/warehouse.ts";
import { sampleHandlingPlan } from "./forkliftMotion.ts";
import { LivePlayback, businessHandlingPlan } from "./runtime/livePlayback.ts";
import { truckFootprint } from "./truckMotion.ts";
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
const begin = (r: WarehouseRepository, id: string) => {
  for (const type of ["arrive", "dock", "start"] as const) send(r, type, id);
};
const distance = (
  a: { x: number; y?: number; z: number },
  b: { x: number; y?: number; z: number },
) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
function drain(p: LivePlayback) {
  for (let i = 0; i < 4000 && p.getState().pending; i++) p.advance(1);
  assert.equal(p.getState().pending, 0, "playback queue must finish");
}

test("confirmed transitions queue once, pause safely, and preserve authoritative snapshots", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    const p = new LivePlayback(),
      baseline = r.snapshot();
    p.ingest(baseline);
    for (const type of ["arrive", "dock", "start"] as const)
      p.ingest(send(r, type));
    const snapshot = r.snapshot(),
      frozen = JSON.stringify(snapshot);
    p.ingest(snapshot);
    p.ingest(baseline);
    assert.equal(p.getState().pending, 3);
    assert.equal(p.shipments.get("SHP-78442")!.status, "expected");
    p.advance(4);
    const at4 = structuredClone(p.shipments.get("SHP-78442")!.truck);
    assert.equal(at4.visible, true);
    p.setPaused(true);
    p.advance(60);
    assert.deepEqual(p.shipments.get("SHP-78442")!.truck, at4);
    p.ingest(send(r, "confirm_pallet", "SHP-78442", "KLY-1-001"));
    assert.equal(p.getState().pending, 4);
    p.setPaused(false);
    p.setSpeed(4);
    p.advance(1);
    assert.ok(distance(at4, p.shipments.get("SHP-78442")!.truck) > 0.1);
    drain(p);
    assert.equal(p.shipments.get("SHP-78442")!.status, "handling");
    assert.equal(p.pallets.get("KLY-1-001")!.location, "truck");
    assert.equal(JSON.stringify(snapshot), frozen);
    const reload = new LivePlayback();
    reload.ingest(r.snapshot());
    assert.equal(reload.getState().pending, 0);
    assert.equal(reload.pallets.get("KLY-1-001")!.location, "truck");
  } finally {
    r.close();
  }
});
for (const [id, dock, prefix] of [
  ["SHP-78442", 0, "KLY-1"],
  ["SHP-78447", 1, "KLY-2"],
] as const) {
  test(`${id}: arbitrary scan order preserves pallet identity and continuous pickup, transport and placement`, () => {
    const r = new WarehouseRepository(":memory:", true);
    try {
      begin(r, id);
      const p = new LivePlayback();
      p.ingest(r.snapshot());
      const originals = [3, 0].map(
        (slot) =>
          p.pallets.get(`${prefix}-${String(slot + 1).padStart(3, "0")}`)!,
      );
      for (const pallet of originals)
        p.ingest(send(r, "confirm_pallet", id, pallet.id));
      let oldFork = structuredClone(p.forklifts.get(dock)!.pose),
        prev = originals.map((pallet) => p.palletPose(pallet.id));
      let maxJump = 0,
        maxForkJump = 0,
        carried = false;
      for (let i = 0; i < 40000 && p.getState().pending; i++) {
        p.advance(0.01);
        const fork = p.forklifts.get(dock)!.pose;
        maxForkJump = Math.max(maxForkJump, distance(fork, oldFork));
        oldFork = { ...fork };
        carried ||= fork.carrying;
        originals.forEach((pallet, j) => {
          const next = p.palletPose(pallet.id);
          assert.ok(next.visible);
          maxJump = Math.max(
            maxJump,
            distance(prev[j].position, next.position),
          );
          prev[j] = next;
          assert.equal(p.pallets.get(pallet.id), pallet);
        });
      }
      assert.ok(carried);
      assert.equal(p.getState().pending, 0);
      assert.ok(maxJump < 0.04, `cargo jumped ${maxJump}m`);
      assert.ok(maxForkJump < 0.04, `forklift jumped ${maxForkJump}m`);
      for (const pallet of originals)
        assert.equal(pallet.location, dock === 1 ? "storage" : "truck");
      const home = sampleHandlingPlan(
        businessHandlingPlan(dock === 1, dock, 0),
        0,
        dock,
        false,
      );
      assert.ok(distance(home, p.forklifts.get(dock)!.pose) < 1e-7);
    } finally {
      r.close();
    }
  });
}
test("missed polling events reconstruct the full workflow; cargo leaves only with its truck", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    const p = new LivePlayback();
    p.ingest(r.snapshot());
    begin(r, "SHP-78442");
    for (let i = 1; i <= 6; i++)
      send(r, "confirm_pallet", "SHP-78442", `KLY-1-00${i}`);
    send(r, "complete");
    send(r, "depart");
    const final = r.snapshot();
    p.ingest({ ...final, events: [] });
    assert.equal(p.getState().pending, 11);
    let departing = false;
    for (let i = 0; i < 15000 && p.getState().pending; i++) {
      p.advance(0.1);
      if (p.getState().label === "车辆驶离") {
        departing = true;
        assert.equal(p.shipments.get("SHP-78442")!.status, "completed");
        assert.equal(p.forklifts.get(0)!.pose.stage, "waiting");
        for (let j = 1; j <= 6; j++)
          assert.equal(
            p.palletPose(`KLY-1-00${j}`).visible,
            p.shipments.get("SHP-78442")!.truck.visible,
          );
      }
    }
    assert.ok(departing);
    assert.equal(p.getState().pending, 0);
    assert.equal(p.shipments.get("SHP-78442")!.status, "departed");
    assert.equal(p.palletPose("KLY-1-001").visible, false);
    assert.deepEqual(r.snapshot(), final);
  } finally {
    r.close();
  }
});
test("interleaved arrivals yield to docking; all three confirmed workflows finish without truck overlap", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    const p = new LivePlayback();
    p.ingest(r.snapshot());
    const ids = r.snapshot().shipments.map((s) => s.id);
    for (const type of ["arrive", "dock", "start"] as const)
      for (const id of ids) p.ingest(send(r, type, id));
    for (const pallet of r.snapshot().pallets.filter((v) => v.shipmentId))
      p.ingest(send(r, "confirm_pallet", pallet.shipmentId!, pallet.id));
    for (const type of ["complete", "depart"] as const)
      for (const id of ids) p.ingest(send(r, type, id));
    for (let i = 0; i < 20000 && p.getState().pending; i++) {
      p.advance(0.2);
      const trucks = [...p.shipments.values()]
        .filter((s) => s.truck.visible)
        .map((s) => {
          const f = truckFootprint(s.truck);
          return [f[0], f[1], f[3], f[2]];
        });
      for (let a = 0; a < trucks.length; a++)
        for (let b = a + 1; b < trucks.length; b++) {
          const pa = trucks[a],
            pb = trucks[b];
          const separated = [pa, pb].some((poly) =>
            poly.some((v, i) => {
              const next = poly[(i + 1) % 4],
                ax = v.z - next.z,
                az = next.x - v.x;
              const x = pa.map((v) => v.x * ax + v.z * az),
                y = pb.map((v) => v.x * ax + v.z * az);
              return (
                Math.max(...x) <= Math.min(...y) ||
                Math.max(...y) <= Math.min(...x)
              );
            }),
          );
          assert.ok(separated, "moving trucks must not overlap");
        }
    }
    assert.equal(p.getState().pending, 0);
    for (const id of ids) assert.equal(p.shipments.get(id)!.status, "departed");
    for (const pallet of p.pallets.values())
      if (pallet.shipmentId === "SHP-78447")
        assert.ok(
          p.palletPose(pallet.id).visible && pallet.location === "storage",
        );
  } finally {
    r.close();
  }
});

test("the loading side opens while parked and closes before departure", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    send(r, "arrive");
    send(r, "dock");
    const p = new LivePlayback();
    p.ingest(r.snapshot());
    const shipment = p.shipments.get("SHP-78442")!;
    const parked = { ...shipment.truck };
    p.ingest(send(r, "start"));
    p.advance(1);
    assert.ok(shipment.door > 0 && shipment.door < 1);
    assert.deepEqual(shipment.truck, parked);
    p.advance(1);
    assert.equal(shipment.door, 1);
    for (let i = 1; i <= 6; i++)
      send(r, "confirm_pallet", "SHP-78442", `KLY-1-00${i}`);
    const loaded = new LivePlayback();
    loaded.ingest(r.snapshot());
    const truck = loaded.shipments.get("SHP-78442")!;
    loaded.ingest(send(r, "complete"));
    loaded.ingest(send(r, "depart"));
    loaded.advance(1);
    assert.ok(truck.door > 0 && truck.door < 1);
    assert.equal(truck.status, "handling");
    loaded.advance(1.1);
    assert.equal(truck.door, 0);
    assert.equal(truck.status, "completed");
    assert.ok(loaded.palletPose("KLY-1-001").visible);
  } finally {
    r.close();
  }
});

test("terminal feedback counts queued actions for each shipment independently", () => {
  const r = new WarehouseRepository(":memory:", true);
  try {
    const p = new LivePlayback();
    p.ingest(r.snapshot());
    p.ingest(send(r, "arrive", "SHP-78442"));
    p.ingest(send(r, "dock", "SHP-78442"));
    p.ingest(send(r, "arrive", "SHP-78447"));
    assert.deepEqual(p.getState().pendingByShipment, {
      "SHP-78442": 2,
      "SHP-78447": 1,
    });
    p.advance(1);
    assert.equal(p.getState().active, "SHP-78442");
    assert.equal(p.getState().pendingByShipment["SHP-78447"], 1);
    p.setPaused(true);
    p.advance(60);
    assert.equal(p.getState().pendingByShipment["SHP-78442"], 2);
    p.setPaused(false);
    drain(p);
    assert.deepEqual(p.getState().pendingByShipment, {});
  } finally {
    r.close();
  }
});
