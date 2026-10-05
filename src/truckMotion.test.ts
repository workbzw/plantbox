import assert from "node:assert/strict";
import test from "node:test";
import { CYCLE, phaseAt, TRUCKS } from "./simulation.ts";
import {
  DOCK_X,
  frontWheelAngle,
  MIN_TURN_RADIUS,
  TRUCK_GEOMETRY,
  truckFootprint,
  truckPose,
} from "./truckMotion.ts";

import { LOAD_END, DEPART_END, SLOT_Z, STORAGE_X } from "./logistics.ts";

type Point = { x: number; z: number };
function intersects(a: Point[], b: Point[]) {
  // Separating-axis test: both rectangles' edges, including mirrors.
  for (const polygon of [a, b]) {
    for (const [i, j] of [
      [0, 1],
      [0, 2],
    ]) {
      const dx = polygon[j].x - polygon[i].x;
      const dz = polygon[j].z - polygon[i].z;
      const pa = a.map((p) => p.x * dz - p.z * dx);
      const pb = b.map((p) => p.x * dz - p.z * dx);
      if (
        Math.max(...pa) < Math.min(...pb) ||
        Math.max(...pb) < Math.min(...pa)
      )
        return false;
    }
  }
  return true;
}
function box(x: number, z: number, width: number, depth: number) {
  return [-1, 1].flatMap((side) =>
    [-1, 1].map((end) => ({
      x: x + (side * width) / 2,
      z: z + (end * depth) / 2,
    })),
  );
}

test("rear axle obeys the bicycle constraint in forward and reverse, with bounded steering", () => {
  const h = 0.001;
  for (let dock = 0; dock < 3; dock++) {
    for (let t = 0.1; t < DEPART_END - 0.6; t += 0.073) {
      const a = truckPose(t - h, dock),
        b = truckPose(t + h, dock),
        p = truckPose(t, dock);
      const vx = (b.rearX - a.rearX) / (2 * h),
        vz = (b.rearZ - a.rearZ) / (2 * h);
      const lateral = vx * Math.cos(p.rot) - vz * Math.sin(p.rot);
      const forward = vx * Math.sin(p.rot) + vz * Math.cos(p.rot);
      const yawRate = (b.rot - a.rot) / (2 * h);
      assert.ok(
        Math.abs(lateral) < 0.003,
        `lateral slip ${lateral} at dock ${dock}, t=${t}`,
      );
      assert.ok(Math.abs(forward - p.speed) < 0.003);
      assert.ok(Math.abs(yawRate - p.speed * p.curvature) < 0.003);
      assert.ok(Math.abs(p.curvature) <= 1 / MIN_TURN_RADIUS + 1e-10);
      for (const side of [-1, 1])
        assert.ok(
          Math.abs(
            frontWheelAngle(p.curvature, side * TRUCK_GEOMETRY.halfTrack),
          ) <
            (39 * Math.PI) / 180,
        );
    }
  }
});

test("changing gears and dock handoffs are continuous, with a stop and a straight final approach", () => {
  for (let dock = 0; dock < 3; dock++) {
    for (const t of [
      28.6,
      30,
      30.6,
      49.7,
      50,
      LOAD_END,
      LOAD_END + 1.2,
      LOAD_END + 10.5,
      LOAD_END + 20,
      DEPART_END - 0.5,
    ]) {
      const a = truckPose(t - 0.0001, dock),
        b = truckPose(t + 0.0001, dock);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.001);
      assert.ok(Math.abs(a.rot - b.rot) < 0.001);
      a.wheelTravel.forEach((s, i) =>
        assert.ok(Math.abs(s - b.wheelTravel[i]) < 0.001),
      );
    }
    for (const t of [29, 30, 30.5, 49.8, 50, LOAD_END + 0.5])
      assert.ok(Math.abs(truckPose(t, dock).speed) < 1e-10);
    assert.ok(truckPose(35, dock).speed < 0);
    assert.ok(truckPose(45, dock).speed < truckPose(48, dock).speed);
    for (const t of [45, 48, 49.5, 50, 100, 169]) {
      const p = truckPose(t, dock);
      assert.ok(Math.abs(p.x - DOCK_X[dock]) < 0.001);
      assert.ok(Math.abs(p.rot) < 0.001);
    }
    assert.equal(truckPose(50, dock).z, 8.7);
    assert.ok(truckPose(LOAD_END + 30, dock).speed > 0);
    assert.equal(phaseAt(DEPART_END - 0.1).phase, "departing");
    assert.equal(truckPose(DEPART_END, dock).visible, false);
  }
});

test("wheel travel reverses with the truck and Ackermann inner wheels steer more tightly", () => {
  for (let dock = 0; dock < 3; dock++) {
    const a = truckPose(34, dock),
      b = truckPose(35, dock);
    assert.ok(b.wheelTravel.every((s, i) => s < a.wheelTravel[i]));
    assert.ok(frontWheelAngle(0.1, 1.31) > frontWheelAngle(0.1, -1.31));
    assert.ok(
      Math.abs(frontWheelAngle(-0.1, -1.31)) >
        Math.abs(frontWheelAngle(-0.1, 1.31)),
    );
    const start = truckPose(0, dock),
      end = truckPose(CYCLE - 0.001, dock),
      next = truckPose(CYCLE, dock);
    assert.ok(
      next.wheelTravel.every((s, i) => Math.abs(s - end.wheelTravel[i]) < 1e-8),
    );
    assert.ok(next.wheelTravel.every((s, i) => s > start.wheelTravel[i]));
  }
});

test("complete swept bodies clear neighboring trucks, fences, buildings, pallets and lamp posts", () => {
  const obstacles = [
    box(-8, -7.5, 34.6, 21.8), // warehouse/platform ends at z=3.4
    box(14, -12.5, 8.4, 9.4),
    box(35.5, 21.3, 3.9, 3.5),
    box(41.5, 23.3, 0.6, 0.6),
    box(-41.5, 6.9, 0.2, 60),
    box(-10, 36.8, 63, 0.2),
    ...DOCK_X.flatMap((x) =>
      SLOT_Z.map((z) => box(x + STORAGE_X, z, 1.2, 0.8)),
    ),
    ...[-29, 16, 34].flatMap((x) => [-20, 17].map((z) => box(x, z, 0.3, 0.3))),
    ...[-29, -15, -1, 13].map((x) => box(x, 36.4, 1.8, 1.8)),
  ];
  for (let time = 0; time < CYCLE; time += 0.025) {
    const poses = TRUCKS.map((truck, i) => truckPose(time + truck.offset, i));
    const footprints = poses.map(truckFootprint);
    for (let i = 0; i < 3; i++) {
      if (!poses[i].visible) continue;
      for (let j = i + 1; j < 3; j++) {
        if (poses[j].visible)
          assert.ok(
            !intersects(footprints[i], footprints[j]),
            `trucks ${i}/${j} intersect at ${time}`,
          );
      }
      obstacles.forEach((obstacle, j) =>
        assert.ok(
          !intersects(footprints[i], obstacle),
          `truck ${i} hits obstacle ${j} at ${time}`,
        ),
      );
    }
  }
});
