import assert from "node:assert/strict";
import test from "node:test";
import {
  CYCLE,
  DEPART_END,
  FORKLIFT,
  JOB_SECONDS,
  LOAD_END,
  LOAD_START,
  PALLET,
  SLOT_Z,
  STOCK_LAYERS,
  TRUCK_OFFSETS,
  TRUCK_BED_Y,
} from "./logistics.ts";
import { deliveryTime, forkliftPose, jobPlan } from "./forkliftMotion.ts";
import { HandlingPhysics, initHandlingPhysics } from "./handlingPhysics.ts";
import { handledPallets, inventoryAt, SKUS, TRUCKS } from "./simulation.ts";
import { truckPose } from "./truckMotion.ts";

test("rear-steered forklift obeys front-axle rolling constraints and stops for lift/gear changes", () => {
  for (let dock = 0; dock < 3; dock++) {
    for (
      let t = LOAD_START + 0.01;
      t < LOAD_START + JOB_SECONDS * 6 - 0.01;
      t += 0.083
    ) {
      const h = 0.0001,
        a = forkliftPose(t - h, dock),
        b = forkliftPose(t + h, dock),
        p = forkliftPose(t, dock);
      const vx = (b.frontX - a.frontX) / (2 * h),
        vz = (b.frontZ - a.frontZ) / (2 * h);
      assert.ok(Math.abs(vx * Math.cos(p.rot) - vz * Math.sin(p.rot)) < 0.001);
      assert.ok(
        Math.abs((b.rot - a.rot) / (2 * h) - p.speed * p.curvature) < 0.001,
      );
      if (Math.abs(b.lift - a.lift) > 1e-6) assert.ok(Math.abs(p.speed) < 1e-8);
      if (p.carrying && Math.abs(p.curvature) > 0.1) {
        assert.ok(p.lift < 0.4, "never turn with an elevated pallet");
        assert.ok(Math.abs(p.speed) <= 0.361, "loaded turns must be slow");
      }
      assert.ok(Math.abs(p.curvature) <= 1 / FORKLIFT.radius + 1e-8);
    }
    for (let job = 0; job < 6; job++) {
      const plan = jobPlan(0, dock, job);
      assert.ok(plan.finishAt < JOB_SECONDS);
      for (const segment of plan.segments) {
        const t = LOAD_START + job * JOB_SECONDS + segment.start;
        const a = forkliftPose(t - 0.00001, dock),
          b = forkliftPose(t + 0.00001, dock);
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.001);
        assert.ok(Math.abs(a.rot - b.rot) < 0.001);
      }
    }
  }
});

test("30-minute physical flow preserves pallet identity, supports loads and confirms inventory by actual delivery", async () => {
  await initHandlingPhysics();
  const engine = new HandlingPhysics(0);
  try {
    const outgoing = engine.cargo.filter((p) => p.dock !== 1);
    assert.equal(outgoing.length, 2 * STOCK_LAYERS * SLOT_Z.length);
    const handles = new Map(outgoing.map((p) => [p.id, p.body.handle]));
    let constraints = 0,
      received = 0,
      movingLoads = 0,
      fullTrucks = 0;
    for (let t = 1; t <= 1800; t++) {
      engine.advanceTo(t);
      assert.deepEqual(engine.failures, [], `physical failure at ${t}`);
      assert.equal(
        new Set(engine.deliveries.map((e) => e.id)).size,
        engine.deliveries.length,
      );
      for (const item of engine.cargo) {
        if (item.dock !== 1)
          assert.equal(item.body.handle, handles.get(item.id));
        if (item.joint) {
          constraints++;
          assert.equal(item.state, "carried");
        }
        if (item.state === "departed") {
          assert.equal(item.body.isEnabled(), false);
          assert.ok(
            t + TRUCK_OFFSETS[item.dock] >= item.cycle * CYCLE + DEPART_END,
          );
          assert.equal(item.onTruck, false);
        } else {
          assert.equal(item.body.isEnabled(), true);
          assert.ok(
            item.body.translation().y > -0.02,
            `${item.id} falls through floor`,
          );
        }
        if (item.state === "loaded") {
          assert.equal(item.onTruck, true);
          assert.equal(
            item.joint,
            undefined,
            "loaded pallet must be released from forks",
          );
          const truck = truckPose(
            engine.time + TRUCK_OFFSETS[item.dock],
            item.dock,
          );
          const position = item.body.translation(),
            anchor = item.truckAnchor!.position;
          const dx = position.x - truck.x,
            dz = position.z - truck.z;
          const x = dx * Math.cos(truck.rot) - dz * Math.sin(truck.rot);
          const z = dx * Math.sin(truck.rot) + dz * Math.cos(truck.rot);
          assert.ok(
            Math.abs(x - anchor.x) < 0.0001 && Math.abs(z - anchor.z) < 0.0001,
            `${item.id} must follow its truck through the departure turn`,
          );
          assert.ok(Math.abs(x - 0.65) < 0.075);
          assert.ok(Math.abs(z - (SLOT_Z[item.slot] - 8.7)) < 0.18);
          assert.ok(Math.abs(position.y - TRUCK_BED_Y) < 0.075);
          if (truck.speed > 0.1) movingLoads++;
        }
      }
      for (const dock of [0, 2]) {
        const loaded = engine.cargo.filter(
          (p) => p.dock === dock && p.state === "loaded",
        );
        if (loaded.length === SLOT_Z.length) fullTrucks++;
        for (let i = 0; i < loaded.length; i++) {
          for (let j = i + 1; j < loaded.length; j++) {
            assert.ok(
              Math.abs(
                loaded[i].truckAnchor!.position.z -
                  loaded[j].truckAnchor!.position.z,
              ) > PALLET.width,
              "loaded pallets must occupy separate, non-overlapping truck slots",
            );
          }
        }
      }
      const nextReceived = engine.cargo.filter(
        (p) => p.state === "received",
      ).length;
      assert.ok(nextReceived >= received);
      received = nextReceived;
    }
    assert.ok(
      constraints > 100,
      "loads must be physically supported during transport",
    );
    assert.equal(received, 13);
    assert.ok(movingLoads > 100, "cargo must stay aboard departing trucks");
    assert.ok(
      fullTrucks > 100,
      "all six delivered pallets must remain in each truck",
    );
    assert.equal(engine.cargo.filter((p) => p.state === "departed").length, 24);
    const stocks = inventoryAt(1800, {}, engine.deliveries);
    for (const truck of TRUCKS) {
      const count = engine.deliveries.filter(
        (d) => d.dock === truck.dock,
      ).length;
      assert.equal(count, handledPallets(1800 + truck.offset, truck.dock));
      assert.equal(
        stocks[truck.sku].stock,
        SKUS[truck.sku].stock +
          count * truck.units * (truck.direction === "inbound" ? 1 : -1),
      );
    }
    assert.equal(
      engine.cargo.filter((p) => p.dock !== 1).length,
      outgoing.length,
      "no replacement cargo is spawned on forks",
    );
  } finally {
    engine.dispose();
  }
});

test("a missing source pallet cannot be picked, loaded or counted by a timer", async () => {
  await initHandlingPhysics();
  const engine = new HandlingPhysics(50),
    id = "PAL-1-1-1";
  try {
    const item = engine.cargo.find((p) => p.id === id)!;
    item.body.setTranslation({ x: -35, y: 0.025, z: 0 }, true);
    engine.advanceTo(deliveryTime(0, 0, 0) + 2);
    assert.equal(item.state, "source");
    assert.equal(item.joint, undefined);
    assert.ok(!engine.deliveries.some((e) => e.id === id));
    assert.equal(
      inventoryAt(engine.time, {}, engine.deliveries)[0].stock,
      SKUS[0].stock,
    );
    assert.ok(engine.failures.some((f) => f.includes(id)));
  } finally {
    engine.dispose();
  }
});

test("replay retains loaded cargo until departure and starts the next outbound trip empty", async () => {
  await initHandlingPhysics();
  const engine = new HandlingPhysics(0);
  try {
    for (const dock of [0, 2]) {
      for (const localTime of [
        deliveryTime(0, dock, 0) + 1,
        LOAD_END + 25,
        DEPART_END + 1,
        CYCLE + 1,
      ]) {
        engine.reset(localTime - TRUCK_OFFSETS[dock]);
        const cargo = engine.cargo.filter(
          (p) => p.dock === dock && p.cycle === 0,
        );
        const delivered = cargo.filter(
          (p) => deliveryTime(0, dock, p.slot) <= localTime,
        );
        const hasLeft = localTime >= DEPART_END;
        assert.equal(
          engine.deliveries.filter((d) => d.dock === dock).length,
          delivered.length,
        );
        for (const item of delivered) {
          assert.equal(item.state, hasLeft ? "departed" : "loaded");
          assert.equal(item.body.isEnabled(), !hasLeft);
        }
        if (hasLeft)
          assert.equal(
            engine.cargo.filter((p) => p.dock === dock && p.onTruck).length,
            0,
          );
        else {
          const positions = delivered.map((p) => ({ ...p.body.translation() }));
          engine.advanceTo(engine.time + 0.1);
          if (localTime > LOAD_END)
            assert.notDeepEqual(
              delivered.map((p) => ({ ...p.body.translation() })),
              positions,
            );
        }
        assert.deepEqual(engine.failures, []);
      }
    }
  } finally {
    engine.dispose();
  }
});

test("gravity acts on independent cargo and replay snapshots do not duplicate received goods", async () => {
  await initHandlingPhysics();
  const engine = new HandlingPhysics(850);
  try {
    const before = engine.cargo
      .filter((p) => p.state === "received")
      .map((p) => p.id);
    assert.equal(before.length, 6);
    const item = engine.cargo.find(
      (p) => p.dock === 0 && p.cycle === 2 && p.slot === 0,
    )!;
    item.body.setTranslation({ x: -35, y: 3, z: 0 }, true);
    engine.advanceTo(851);
    assert.ok(
      item.body.translation().y < 1,
      "unconstrained cargo must fall under gravity",
    );
    engine.reset(850);
    assert.deepEqual(
      engine.cargo.filter((p) => p.state === "received").map((p) => p.id),
      before,
    );
    const saved = engine.cargo.map((p) => [p.id, { ...p.body.translation() }]);
    engine.advanceTo(850);
    assert.deepEqual(
      engine.cargo.map((p) => [p.id, { ...p.body.translation() }]),
      saved,
      "paused cargo must not advance",
    );
    const holes = FORKLIFT.tineX + FORKLIFT.tineWidth / 2;
    assert.ok(
      holes < 0.32 - 0.065 && FORKLIFT.tineX - FORKLIFT.tineWidth / 2 > 0.065,
    );
    assert.ok(FORKLIFT.tineLength >= (PALLET.depth * 2) / 3);
    assert.equal(TRUCK_OFFSETS.length, 3);
    assert.ok(CYCLE > JOB_SECONDS * 6);
  } finally {
    engine.dispose();
  }
});
