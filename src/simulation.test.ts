import test from "node:test";
import assert from "node:assert/strict";
import {
  CYCLE,
  DEMO_END,
  handledPallets,
  inventoryAt,
  latestMovements,
  occupiedPallets,
  phaseAt,
  SKUS,
  TRUCKS,
} from "./simulation.ts";
import { LOAD_END } from "./logistics.ts";
import { deliveryTime } from "./forkliftMotion.ts";
import { useStore } from "./store.ts";

test("inventory changes once at the completed handling boundary", () => {
  const at = deliveryTime(0, 0, 0);
  assert.equal(handledPallets(at - 0.001), 0);
  assert.equal(handledPallets(at), 1);
  assert.equal(handledPallets(at + 0.001), 1);
  assert.equal(inventoryAt(at - 0.001)[0].stock - inventoryAt(at)[0].stock, 24);
  assert.equal(handledPallets(LOAD_END), 6);
  assert.equal(phaseAt(LOAD_END).phase, "departing");
  assert.equal(phaseAt(LOAD_END).completed, 6);
});

test("inventory remains continuous across vehicle cycle boundaries", () => {
  assert.equal(handledPallets(CYCLE - 0.001), 6);
  assert.equal(handledPallets(CYCLE), 6);
  assert.equal(handledPallets(deliveryTime(1, 0, 0)), 7);
  assert.equal(phaseAt(CYCLE).phase, "arriving");
  assert.deepEqual(
    inventoryAt(CYCLE - 0.001).map((i) => i.stock),
    inventoryAt(CYCLE).map((i) => i.stock),
  );
});

test("stock, reservations and pallet occupancy reconcile throughout the demo", () => {
  for (let time = 0; time <= DEMO_END; time += 5) {
    const inventory = inventoryAt(time);
    for (const item of inventory) {
      assert.ok(item.stock >= item.reserved);
      assert.equal(item.available + item.reserved, item.stock);
      assert.ok(item.available >= 0);
    }
    for (const truck of TRUCKS) {
      const delta =
        handledPallets(time + truck.offset, truck.dock) * truck.units;
      assert.equal(
        inventory[truck.sku].stock,
        SKUS[truck.sku].stock +
          (truck.direction === "inbound" ? delta : -delta),
      );
    }
    assert.ok(occupiedPallets(time) > 0 && occupiedPallets(time) < 1800);
  }
});

test("replenishment clears the warning and increases occupied pallet slots", () => {
  const before = inventoryAt(86).find((r) => r.id === "PPE-010")!;
  const after = inventoryAt(86, { "PPE-010": 96 }).find(
    (r) => r.id === "PPE-010",
  )!;
  assert.equal(before.low, true);
  assert.equal(after.low, false);
  assert.equal(after.stock - before.stock, 96);
  assert.equal(occupiedPallets(86, { "PPE-010": 96 }) - occupiedPallets(86), 6);
});

test("event ledger never includes future or duplicate events", () => {
  for (const time of [0, 70, 170, 400, 1800]) {
    const events = latestMovements(time);
    assert.equal(new Set(events.map((e) => e.id)).size, events.length);
    assert.ok(events.every((e) => e.time >= 0 && e.time <= time));
    assert.ok(events.every((e, i) => i === 0 || events[i - 1].time >= e.time));
  }
});

test("pause, speed, completion and reset share one deterministic clock", () => {
  useStore.getState().reset();
  useStore.setState({ simulationReady: true });
  useStore.getState().togglePause();
  useStore.getState().tick(10);
  assert.equal(useStore.getState().time, 86);
  useStore.getState().togglePause();
  useStore.getState().setSpeed(10);
  useStore.getState().tick(0.5);
  assert.equal(useStore.getState().time, 91);
  useStore.getState().tick(-3);
  assert.equal(useStore.getState().time, 91);
  useStore.getState().tick(1000);
  assert.equal(useStore.getState().time, DEMO_END);
  assert.equal(useStore.getState().paused, true);
  useStore.getState().replenish("PPE-010", 96);
  assert.equal(useStore.getState().adjustments["PPE-010"], 96);
  useStore.getState().reset();
  assert.deepEqual(useStore.getState().adjustments, {});
  assert.equal(useStore.getState().time, 86);
  assert.equal(useStore.getState().speed, 1);
});

test("startup freezes simulation time and preserves a user's pause until physics is ready", () => {
  useStore.getState().reset();
  useStore.setState({ simulationReady: false });
  useStore.getState().tick(10);
  assert.equal(useStore.getState().time, 86);
  assert.equal(useStore.getState().deliveries, undefined);
  useStore.getState().togglePause();
  useStore.setState({ simulationReady: true });
  useStore.getState().tick(10);
  assert.equal(useStore.getState().time, 86);
  useStore.getState().togglePause();
  useStore.getState().tick(0.5);
  assert.equal(useStore.getState().time, 86.5);
  useStore.getState().reset();
});
