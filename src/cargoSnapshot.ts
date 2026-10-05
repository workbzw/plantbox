import {
  CYCLE,
  DEPART_END,
  DOCK_X,
  FLOOR_Y,
  FORKLIFT,
  JOB_SECONDS,
  LOAD_START,
  PALLET,
  SLOT_Z,
  STOCK_LAYERS,
  STORAGE_X,
  TRUCK_BED_Y,
  TRUCK_OFFSETS,
} from "./logistics.ts";
import {
  deliveryTime,
  forkliftPose,
  jobPlan,
  palletId,
} from "./forkliftMotion.ts";
import type { ForkliftPose } from "./forkliftMotion.ts";
import { truckPose } from "./truckMotion.ts";

export type Vector = { x: number; y: number; z: number };
export type Quaternion = Vector & { w: number };
export type CargoState =
  | "source"
  | "carried"
  | "received"
  | "loaded"
  | "departed";
export interface CargoSnapshot {
  id: string;
  dock: number;
  cycle: number;
  slot: number;
  state: CargoState;
  onTruck: boolean;
  delivered: boolean;
  position: Vector;
  rotation: Quaternion;
}
export const yaw = (angle: number): Quaternion => ({
  x: 0,
  y: Math.sin(angle / 2),
  z: 0,
  w: Math.cos(angle / 2),
});
export function multiplyRotation(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
export function transformPoint(v: Vector, q: Quaternion, p: Vector) {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y,
    iy = q.w * v.y + q.z * v.x - q.x * v.z,
    iz = q.w * v.z + q.x * v.y - q.y * v.x,
    iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: p.x + ix * q.w - iw * q.x - iy * q.z + iz * q.y,
    y: p.y + iy * q.w - iw * q.y - iz * q.x + ix * q.z,
    z: p.z + iz * q.w - iw * q.z - ix * q.y + iy * q.x,
  };
}
export function forkTransform(p: ForkliftPose) {
  const sy = Math.sin(p.rot / 2),
    cy = Math.cos(p.rot / 2),
    sx = Math.sin(p.tilt / 2),
    cx = Math.cos(p.tilt / 2);
  return {
    position: {
      x: p.x + p.lift * Math.sin(p.tilt) * Math.sin(p.rot),
      y: FLOOR_Y + p.lift * Math.cos(p.tilt),
      z: p.z + p.lift * Math.sin(p.tilt) * Math.cos(p.rot),
    },
    rotation: { x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx },
  };
}
export function loadOnFork(p: ForkliftPose) {
  const f = forkTransform(p);
  return {
    position: transformPoint(
      {
        x: 0,
        y: FORKLIFT.tineThickness / 2 - PALLET.deckBottom,
        z: FORKLIFT.cargoZ,
      },
      f.rotation,
      f.position,
    ),
    rotation: f.rotation,
  };
}
export function truckCargoPose(localTime: number, dock: number, slot: number) {
  const p = truckPose(localTime, dock);
  return {
    position: transformPoint(
      { x: 0.65, y: TRUCK_BED_Y, z: SLOT_Z[slot] - 8.7 },
      yaw(p.rot),
      { x: p.x, y: 0, z: p.z },
    ),
    rotation: yaw(p.rot + Math.PI * 1.5),
  };
}

// Shared by the visible startup scene and Rapier reconstruction, so handing
// control to physics preserves every pallet's identity, location and ledger.
export function cargoSnapshot(
  dock: number,
  cycle: number,
  slot: number,
  localTime: number,
): CargoSnapshot {
  const inbound = dock === 1;
  const delivered = localTime >= deliveryTime(cycle, dock, slot);
  const departed =
    delivered && !inbound && localTime >= cycle * CYCLE + DEPART_END;
  const loaded = delivered && !inbound && !departed;
  const pickup =
    cycle * CYCLE +
    LOAD_START +
    slot * JOB_SECONDS +
    jobPlan(cycle, dock, slot).pickupAt;
  const carried = !delivered && localTime >= pickup;
  let position: Vector = {
    x: DOCK_X[dock] + STORAGE_X,
    y: FLOOR_Y + (inbound ? cycle : STOCK_LAYERS - 1 - cycle) * PALLET.height,
    z: SLOT_Z[slot],
  };
  let rotation = yaw(Math.PI / 2);
  if ((inbound && !delivered) || loaded)
    ({ position, rotation } = truckCargoPose(localTime, dock, slot));
  if (carried)
    ({ position, rotation } = loadOnFork(forkliftPose(localTime, dock)));
  return {
    id: palletId(dock, cycle, slot),
    dock,
    cycle,
    slot,
    position,
    rotation,
    delivered,
    onTruck: loaded || (inbound && !carried && !delivered),
    state: delivered
      ? inbound
        ? "received"
        : departed
          ? "departed"
          : "loaded"
      : carried
        ? "carried"
        : "source",
  };
}
export function materialSnapshot(time: number): CargoSnapshot[] {
  const cargo: CargoSnapshot[] = [];
  for (let dock = 0; dock < 3; dock++) {
    const localTime = time + TRUCK_OFFSETS[dock];
    for (let cycle = 0; cycle < STOCK_LAYERS; cycle++) {
      if (dock === 1 && cycle > Math.floor(localTime / CYCLE)) break;
      for (let slot = 0; slot < SLOT_Z.length; slot++)
        cargo.push(cargoSnapshot(dock, cycle, slot, localTime));
    }
  }
  return cargo;
}
