import RAPIER from "@dimforge/rapier3d-compat";
import type {
  Collider,
  RigidBody,
  World,
  ImpulseJoint,
} from "@dimforge/rapier3d-compat";
import {
  CYCLE,
  DEPART_END,
  DOCK_X,
  FLOOR_Y,
  FORKLIFT,
  JOB_SECONDS,
  LOAD_END,
  LOAD_START,
  PALLET,
  SLOT_Z,
  STOCK_LAYERS,
  STORAGE_X,
  TRUCK_BED_Y,
  TRUCK_OFFSETS,
} from "./logistics.ts";
import type { DeliveryRecord } from "./logistics.ts";
import {
  deliveryTime,
  forkliftPose,
  jobPlan,
  palletId,
} from "./forkliftMotion.ts";
import type { ForkliftPose } from "./forkliftMotion.ts";
import { truckPose } from "./truckMotion.ts";

type Vector = { x: number; y: number; z: number };
type Quaternion = Vector & { w: number };
export type CargoState =
  | "source"
  | "carried"
  | "received"
  | "loaded"
  | "departed";
export interface Cargo {
  id: string;
  dock: number;
  cycle: number;
  slot: number;
  body: RigidBody;
  state: CargoState;
  onTruck: boolean;
  truckAnchor?: { position: Vector; rotation: Quaternion };
  joint?: ImpulseJoint;
  released?: boolean;
}
let initPromise: Promise<void> | undefined;
export function initHandlingPhysics() {
  return (initPromise ??= RAPIER.init());
}
const STEP = 1 / 120;
const yaw = (angle: number): Quaternion => ({
  x: 0,
  y: Math.sin(angle / 2),
  z: 0,
  w: Math.cos(angle / 2),
});
function multiplyRotation(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
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
function transformPoint(v: Vector, q: Quaternion, p: Vector) {
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

/** Dynamic pallets are never parented to a forklift or assigned its velocity.
 * A contact-gated rigid constraint stabilizes the supported load in transport.
 * Releasing it before lowering restores gravity/contact placement. Initial
 * Snapshot reconstruction and cargo secured aboard trucks are the only pose writes.
 */
export class HandlingPhysics {
  world!: World;
  time = 0;
  cargo: Cargo[] = [];
  deliveries: DeliveryRecord[] = [];
  failures: string[] = [];
  private trucks: RigidBody[] = [];
  private chassis: RigidBody[] = [];
  private forks: RigidBody[] = [];
  private forkColliders: Collider[][] = [];
  constructor(time = 0) {
    this.reset(time);
  }
  private cuboid(
    body: RigidBody | undefined,
    size: Vector,
    center: Vector,
    mass?: number,
  ) {
    const collider = RAPIER.ColliderDesc.cuboid(
      size.x / 2,
      size.y / 2,
      size.z / 2,
    )
      .setTranslation(center.x, center.y, center.z)
      .setFriction(1.8)
      .setRestitution(0);
    if (mass !== undefined) collider.setMass(mass);
    return this.world.createCollider(collider, body);
  }
  reset(time: number) {
    this.world?.free();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.world.numSolverIterations = 8;
    this.time = time;
    this.cargo = [];
    this.deliveries = [];
    this.failures = [];
    this.trucks = [];
    this.chassis = [];
    this.forks = [];
    this.forkColliders = [];
    this.cuboid(
      undefined,
      { x: 180, y: 0.2, z: 100 },
      { x: 0, y: FLOOR_Y - 0.1, z: 0 },
    );
    for (let dock = 0; dock < 3; dock++) {
      const truck = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased(),
      );
      this.cuboid(
        truck,
        { x: 2.65, y: 0.15, z: 6.6 },
        { x: 0, y: 1.25, z: -1.6 },
      );
      this.cuboid(
        truck,
        { x: 0.08, y: 2.8, z: 6.6 },
        { x: -1.32, y: 2.58, z: -1.6 },
      );
      for (const z of [-4.86, 1.66])
        this.cuboid(truck, { x: 2.64, y: 2.8, z: 0.08 }, { x: 0, y: 2.58, z });
      this.trucks.push(truck);
      const chassis = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased(),
      );
      this.cuboid(
        chassis,
        { x: 1.4, y: 0.8, z: 1.95 },
        { x: 0, y: 0.65, z: -0.2 },
      );
      this.chassis.push(chassis);
      const fork = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased(),
      );
      const tines = [-FORKLIFT.tineX, FORKLIFT.tineX].map((x) =>
        this.cuboid(
          fork,
          {
            x: FORKLIFT.tineWidth,
            y: FORKLIFT.tineThickness,
            z: FORKLIFT.tineLength,
          },
          { x, y: 0, z: FORKLIFT.tineZ },
        ),
      );
      this.cuboid(
        fork,
        { x: 0.95, y: 0.72, z: 0.065 },
        { x: 0, y: 0.35, z: 1.045 },
      );
      this.forks.push(fork);
      this.forkColliders.push(tines);
      this.updateKinematics(dock, true);
      const localTime = time + TRUCK_OFFSETS[dock];
      for (let cycle = 0; cycle < STOCK_LAYERS; cycle++) {
        if (dock === 1 && cycle > Math.floor(localTime / CYCLE)) break;
        for (let slot = 0; slot < 6; slot++)
          this.createCargo(dock, cycle, slot, localTime);
      }
    }
  }
  private createCargo(
    dock: number,
    cycle: number,
    slot: number,
    localTime: number,
  ) {
    const id = palletId(dock, cycle, slot),
      inbound = dock === 1;
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
      ({ position, rotation } = this.truckCargoPose(localTime, dock, slot));
    if (carried)
      ({ position, rotation } = loadOnFork(forkliftPose(localTime, dock)));
    const onTruck = loaded || (inbound && !carried && !delivered);
    const type =
      loaded || (onTruck && localTime % CYCLE < LOAD_START)
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
        : RAPIER.RigidBodyDesc.dynamic();
    const body = this.world.createRigidBody(
      type
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setLinearDamping(0.15)
        .setAngularDamping(0.15)
        .setCcdEnabled(true),
    );
    for (const x of [-0.32, 0, 0.32])
      this.cuboid(
        body,
        { x: 0.13, y: 0.125, z: 1.2 },
        { x, y: 0.0625, z: 0 },
        3,
      );
    this.cuboid(
      body,
      { x: 0.8, y: 0.035, z: 1.2 },
      { x: 0, y: 0.1425, z: 0 },
      4,
    );
    this.cuboid(
      body,
      { x: 0.76, y: 0.56, z: 1.14 },
      { x: 0, y: 0.44, z: 0 },
      160,
    );
    if (departed) body.setEnabled(false);
    const item: Cargo = {
      id,
      dock,
      cycle,
      slot,
      body,
      onTruck,
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
    if (loaded) this.secureOnTruck(item);
    this.cargo.push(item);
    if (delivered)
      this.deliveries.push({
        id,
        dock,
        cycle,
        slot,
        time: deliveryTime(cycle, dock, slot) - TRUCK_OFFSETS[dock],
      });
  }
  private truckCargoPose(localTime: number, dock: number, slot: number) {
    const p = truckPose(localTime, dock),
      rotation = yaw(p.rot);
    return {
      position: transformPoint(
        { x: 0.65, y: TRUCK_BED_Y, z: SLOT_Z[slot] - 8.7 },
        rotation,
        { x: p.x, y: 0, z: p.z },
      ),
      rotation: yaw(p.rot + Math.PI * 1.5),
    };
  }
  private secureOnTruck(item: Cargo) {
    const truck = truckPose(this.time + TRUCK_OFFSETS[item.dock], item.dock);
    const inverse = yaw(-truck.rot),
      position = item.body.translation();
    // Preserve the actual settled pose when securing cargo; no snap to a slot.
    item.truckAnchor = {
      position: transformPoint(
        { x: position.x - truck.x, y: position.y, z: position.z - truck.z },
        inverse,
        { x: 0, y: 0, z: 0 },
      ),
      rotation: multiplyRotation(inverse, item.body.rotation()),
    };
    item.onTruck = true;
    item.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.setKinematic(item.body, position, item.body.rotation(), false);
  }
  private updateTruckCargo() {
    for (const item of this.cargo) {
      if (!item.onTruck) continue;
      const localTime = this.time + TRUCK_OFFSETS[item.dock];
      if (item.state === "loaded" && item.truckAnchor) {
        const truck = truckPose(localTime, item.dock);
        if (localTime >= item.cycle * CYCLE + DEPART_END) {
          // Retire this shipment only after its truck has driven out of view.
          item.state = "departed";
          item.onTruck = false;
          item.body.setEnabled(false);
          continue;
        }
        const rotation = yaw(truck.rot);
        this.setKinematic(
          item.body,
          transformPoint(item.truckAnchor.position, rotation, {
            x: truck.x,
            y: 0,
            z: truck.z,
          }),
          multiplyRotation(rotation, item.truckAnchor.rotation),
          false,
        );
      } else if (localTime % CYCLE < LOAD_START) {
        const pose = this.truckCargoPose(localTime, item.dock, item.slot);
        this.setKinematic(item.body, pose.position, pose.rotation, false);
      } else if (item.body.isKinematic()) {
        item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      }
    }
  }
  private setKinematic(
    body: RigidBody,
    position: Vector,
    rotation: Quaternion,
    instant: boolean,
  ) {
    if (instant) {
      body.setTranslation(position, false);
      body.setRotation(rotation, false);
    }
    body.setNextKinematicTranslation(position);
    body.setNextKinematicRotation(rotation);
  }
  private updateKinematics(dock: number, instant = false) {
    const localTime = this.time + TRUCK_OFFSETS[dock],
      p = forkliftPose(localTime, dock),
      t = truckPose(localTime, dock),
      f = forkTransform(p);
    this.setKinematic(
      this.trucks[dock],
      { x: t.x, y: 0.08, z: t.z },
      yaw(t.rot),
      instant,
    );
    this.setKinematic(
      this.chassis[dock],
      { x: p.x, y: FLOOR_Y, z: p.z },
      yaw(p.rot),
      instant,
    );
    this.setKinematic(this.forks[dock], f.position, f.rotation, instant);
  }
  hasForkContact(item: Cargo) {
    let touching = false;
    for (const tine of this.forkColliders[item.dock])
      this.world.contactPairsWith(tine, (collider) => {
        if (collider.parent()?.handle === item.body.handle) touching = true;
      });
    return touching;
  }
  private updateCargo() {
    for (const item of this.cargo) {
      if (
        item.state === "loaded" ||
        item.state === "departed" ||
        item.state === "received"
      )
        continue;
      const localTime = this.time + TRUCK_OFFSETS[item.dock],
        t = localTime % CYCLE;
      const p = forkliftPose(localTime, item.dock);
      if (item.joint) item.body.wakeUp();
      if (p.cycle === item.cycle && p.job === item.slot && p.carrying) {
        if (p.stage === "release") {
          if (item.joint) {
            this.world.removeImpulseJoint(item.joint, true);
            item.joint = undefined;
          }
          item.released = true;
        } else if (!item.joint && !item.released && this.hasForkContact(item)) {
          const sourceY =
            item.dock === 1
              ? TRUCK_BED_Y
              : FLOOR_Y + (STOCK_LAYERS - 1 - item.cycle) * PALLET.height;
          if (
            item.state === "carried" ||
            item.body.translation().y > sourceY + 0.035
          ) {
            const fork = this.forks[item.dock],
              f = fork.translation(),
              q = fork.rotation(),
              b = item.body.translation(),
              r = item.body.rotation();
            const inverse = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
            const anchor = transformPoint(
              { x: b.x - f.x, y: b.y - f.y, z: b.z - f.z },
              inverse,
              { x: 0, y: 0, z: 0 },
            );
            const frame = {
              x:
                inverse.w * r.x +
                inverse.x * r.w +
                inverse.y * r.z -
                inverse.z * r.y,
              y:
                inverse.w * r.y -
                inverse.x * r.z +
                inverse.y * r.w +
                inverse.z * r.x,
              z:
                inverse.w * r.z +
                inverse.x * r.y -
                inverse.y * r.x +
                inverse.z * r.w,
              w:
                inverse.w * r.w -
                inverse.x * r.x -
                inverse.y * r.y -
                inverse.z * r.z,
            };
            item.joint = this.world.createImpulseJoint(
              RAPIER.JointData.fixed(
                anchor,
                frame,
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 0, z: 0, w: 1 },
              ),
              fork,
              item.body,
              true,
            );
            item.joint.setContactsEnabled(false);
            item.state = "carried";
            item.onTruck = false;
          }
        }
      }
      const deliveredAt = deliveryTime(item.cycle, item.dock, item.slot);
      if (localTime < deliveredAt || t >= LOAD_END) continue;
      const position = item.body.translation(),
        inbound = item.dock === 1;
      const x = DOCK_X[item.dock] + (inbound ? STORAGE_X : 0.65);
      const y = inbound ? FLOOR_Y + item.cycle * PALLET.height : TRUCK_BED_Y;
      // The pallet must actually be on the truck bed / destination stack.
      // A scheduled timer alone never confirms delivery or updates inventory.
      if (
        item.state === "carried" &&
        Math.abs(position.x - x) < (inbound ? 0.12 : 0.065) &&
        Math.abs(position.z - SLOT_Z[item.slot]) < 0.18 &&
        Math.abs(position.y - y) < 0.075 &&
        Math.abs(item.body.linvel().y) < 0.25
      ) {
        item.state = inbound ? "received" : "loaded";
        item.onTruck = false;
        if (!inbound) this.secureOnTruck(item);
        this.deliveries.push({
          id: item.id,
          dock: item.dock,
          cycle: item.cycle,
          slot: item.slot,
          time: this.time,
        });
      } else if (
        localTime > deliveredAt + 1.5 &&
        !this.failures.some((message) => message.includes(item.id))
      ) {
        this.failures.push(
          `${item.id}: 托盘未落在目标货位 (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`,
        );
      }
    }
  }
  advanceTo(target: number) {
    if (target < this.time - STEP) {
      this.reset(target);
      return;
    }
    while (this.time + STEP <= target + 1e-8) {
      this.time += STEP;
      for (let dock = 0; dock < 3; dock++) this.updateKinematics(dock);
      const inboundCycle = Math.floor((this.time + TRUCK_OFFSETS[1]) / CYCLE);
      if (
        inboundCycle < STOCK_LAYERS &&
        !this.cargo.some(
          (item) => item.dock === 1 && item.cycle === inboundCycle,
        )
      ) {
        for (let slot = 0; slot < 6; slot++)
          this.createCargo(1, inboundCycle, slot, this.time + TRUCK_OFFSETS[1]);
      }
      this.updateTruckCargo();
      this.world.step();
      this.updateCargo();
    }
  }
  dispose() {
    this.world.free();
  }
}
