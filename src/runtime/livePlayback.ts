import type { Quaternion, Vector } from "../cargoSnapshot.ts";
import {
  loadOnFork,
  multiplyRotation,
  transformPoint,
  yaw,
} from "../cargoSnapshot.ts";
import { SITE } from "../config/site.ts";
import type {
  Pallet,
  Shipment,
  ShipmentStatus,
  WarehouseSnapshot,
} from "../domain/warehouse.ts";
import type { ForkliftPose, HandlingPlan } from "../forkliftMotion.ts";
import { jobPlan, sampleHandlingPlan } from "../forkliftMotion.ts";
import {
  FLOOR_Y,
  FORKLIFT,
  LOAD_END,
  SLOT_Z,
  STORAGE_X,
  TRUCK_BED_Y,
} from "../logistics.ts";
import type { TruckPose } from "../truckMotion.ts";
import { truckFootprint, truckPose } from "../truckMotion.ts";

type ActionKind =
  | "arrive"
  | "dock"
  | "start"
  | "pallet"
  | "complete"
  | "depart";
interface Action {
  kind: ActionKind;
  shipmentId: string;
  palletId?: string;
}
interface ActiveAction extends Action {
  elapsed: number;
  duration: number;
  plan?: HandlingPlan;
}
export interface VisualShipment {
  data: Shipment;
  status: ShipmentStatus;
  truck: TruckPose;
  door: number;
}
export interface VisualForklift {
  pose: ForkliftPose;
  wheels: number[];
}
export interface PlaybackView {
  pending: number;
  pendingByShipment: Record<string, number>;
  active: string | null;
  label: string;
  paused: boolean;
  speed: number;
}
export interface MaterialPose {
  position: Vector;
  rotation: Quaternion;
  visible: boolean;
}
const ranks: Record<ShipmentStatus, number> = {
  expected: 0,
  arrived: 1,
  docked: 2,
  handling: 3,
  completed: 4,
  departed: 5,
};
const labels: Record<ActionKind, string> = {
  arrive: "车辆驶入",
  dock: "倒车靠台",
  start: "开始装卸",
  pallet: "叉车搬运",
  complete: "作业完成",
  depart: "车辆驶离",
};
const dockIndex = (id: string) => SITE.docks.findIndex((d) => d.id === id);
function initialTruck(status: ShipmentStatus, dock: number): TruckPose {
  const pose = truckPose(
    status === "expected"
      ? 0
      : status === "arrived"
        ? 30
        : status === "departed"
          ? 825
          : 50,
    dock,
  );
  return {
    ...pose,
    visible: status !== "expected" && status !== "departed",
    speed: 0,
    reversing: false,
  };
}
export function businessHandlingPlan(
  inbound: boolean,
  dock: number,
  slot: number,
) {
  return jobPlan(0, dock, slot, {
    inbound,
    sourceBase: inbound ? TRUCK_BED_Y : FLOOR_Y,
    destinationBase: inbound ? FLOOR_Y : TRUCK_BED_Y,
    fromSlot: 0,
    returnSlot: 0,
  });
}
function overlap(a: Vector2[], b: Vector2[]) {
  return [a, b].every((polygon) =>
    polygon.every((v, i) => {
      const w = polygon[(i + 1) % polygon.length],
        axis = { x: v.z - w.z, z: w.x - v.x };
      const pa = a.map((p) => p.x * axis.x + p.z * axis.z),
        pb = b.map((p) => p.x * axis.x + p.z * axis.z);
      return (
        Math.min(...pa) < Math.max(...pb) && Math.min(...pb) < Math.max(...pa)
      );
    }),
  );
}
type Vector2 = { x: number; z: number };
function footprint(p: TruckPose) {
  const points = truckFootprint(p);
  // truckFootprint returns a pair of sides; SAT needs vertices in perimeter order.
  return [points[0], points[1], points[3], points[2]];
}

/** Presentation only: receives snapshots, never commands the service or changes its inventory. */
export class LivePlayback {
  readonly shipments = new Map<string, VisualShipment>();
  readonly pallets = new Map<string, Pallet>();
  readonly forklifts = new Map<number, VisualForklift>();
  private observed: WarehouseSnapshot | null = null;
  private queue: Action[] = [];
  private active: ActiveAction | null = null;
  private listeners = new Set<() => void>();
  private view: PlaybackView = {
    pending: 0,
    pendingByShipment: {},
    active: null,
    label: "动画已同步",
    paused: false,
    speed: 1,
  };
  private stage = "";
  private scheduleDirty = true;
  getState = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(
    label = this.active
      ? labels[this.active.kind]
      : this.queue.length
        ? "等待前车让行"
        : "动画已同步",
  ) {
    const pendingByShipment: Record<string, number> = {};
    for (const action of this.active
      ? [...this.queue, this.active]
      : this.queue)
      pendingByShipment[action.shipmentId] =
        (pendingByShipment[action.shipmentId] ?? 0) + 1;
    this.view = {
      ...this.view,
      pending: this.queue.length + Number(Boolean(this.active)),
      pendingByShipment,
      active: this.active?.shipmentId ?? null,
      label,
    };
    this.listeners.forEach((fn) => fn());
  }
  setPaused(paused: boolean) {
    this.view = { ...this.view, paused };
    this.publish();
  }
  setSpeed(speed: number) {
    if ([1, 2, 4].includes(speed)) {
      this.view = { ...this.view, speed };
      this.publish();
    }
  }
  ingest(snapshot: WarehouseSnapshot) {
    if (
      snapshot.mode !== "live" ||
      (this.observed && snapshot.revision <= this.observed.revision)
    )
      return;
    const previous = this.observed;
    this.observed = snapshot;
    for (const shipment of snapshot.shipments) {
      const dock = dockIndex(shipment.dockId);
      if (dock < 0) continue;
      const visual = this.shipments.get(shipment.id);
      if (!visual) {
        this.shipments.set(shipment.id, {
          data: { ...shipment },
          status: shipment.status,
          truck: initialTruck(shipment.status, dock),
          door: shipment.status === "handling" ? 1 : 0,
        });
        if (!this.forklifts.has(dock))
          this.forklifts.set(dock, {
            pose: sampleHandlingPlan(
              businessHandlingPlan(shipment.direction === "inbound", dock, 0),
              0,
              dock,
              false,
            ),
            wheels: [0, 0, 0, 0],
          });
      } else visual.data = { ...shipment };
    }
    for (const pallet of snapshot.pallets) {
      if (dockIndex(pallet.dockId) >= 0 && !this.pallets.has(pallet.id))
        this.pallets.set(pallet.id, { ...pallet });
    }
    if (previous) {
      // Diff against the last ACCEPTED snapshot, not the lagging visual state. This
      // covers missed polling events, and cannot enqueue the same pallet twice.
      const order = new Map(
        snapshot.events
          .slice()
          .reverse()
          .filter((e) => e.palletId)
          .map((e, i) => [e.palletId!, i]),
      );
      for (const shipment of snapshot.shipments) {
        const before = previous.shipments.find((s) => s.id === shipment.id);
        if (!before || !this.shipments.has(shipment.id)) continue;
        const from = ranks[before.status],
          to = ranks[shipment.status];
        for (const [rank, kind] of [
          [1, "arrive"],
          [2, "dock"],
          [3, "start"],
        ] as const)
          if (from < rank && to >= rank)
            this.queue.push({ kind, shipmentId: shipment.id });
        const delivered = snapshot.pallets.filter(
          (p) =>
            p.shipmentId === shipment.id &&
            p.confirmed &&
            previous.pallets.some((old) => old.id === p.id && !old.confirmed),
        );
        delivered.sort(
          (a, b) => (order.get(a.id) ?? a.slot) - (order.get(b.id) ?? b.slot),
        );
        for (const pallet of delivered)
          this.queue.push({
            kind: "pallet",
            shipmentId: shipment.id,
            palletId: pallet.id,
          });
        for (const [rank, kind] of [
          [4, "complete"],
          [5, "depart"],
        ] as const)
          if (from < rank && to >= rank)
            this.queue.push({ kind, shipmentId: shipment.id });
      }
    }
    this.scheduleDirty = true;
    this.publish();
  }
  private motionTime(action: Action, elapsed: number) {
    const dock = dockIndex(this.shipments.get(action.shipmentId)!.data.dockId);
    if (action.kind === "arrive") return elapsed;
    if (action.kind === "dock") return 30 + elapsed;
    // Remove only the demo's unrelated dispatch wait, preserving the actual path.
    return LOAD_END + [1.2, 20, 10.5][dock] + elapsed;
  }
  private duration(action: Action) {
    const dock = dockIndex(this.shipments.get(action.shipmentId)!.data.dockId);
    if (action.kind === "arrive") return 30;
    if (action.kind === "dock") return 20;
    if (action.kind === "depart") return 55 - [1.2, 20, 10.5][dock];
    return 2;
  }
  private clearRoad(action: Action) {
    if (!["arrive", "dock", "depart"].includes(action.kind)) return true;
    const dock = dockIndex(this.shipments.get(action.shipmentId)!.data.dockId);
    const obstacles = [...this.shipments.entries()]
      .filter(([id, s]) => id !== action.shipmentId && s.truck.visible)
      .map(([, s]) => footprint(s.truck));
    const duration = this.duration(action);
    for (let elapsed = 0; elapsed <= duration; elapsed += 0.1) {
      const body = footprint(truckPose(this.motionTime(action, elapsed), dock));
      if (obstacles.some((other) => overlap(body, other))) return false;
    }
    return true;
  }
  private startNext() {
    if (!this.scheduleDirty || !this.queue.length) return false;
    this.scheduleDirty = false;
    // One maneuver at a time keeps crossing routes clear. A blocked arrival may
    // yield to another truck docking; ordering within each shipment is retained.
    const index = this.queue.findIndex(
      (a, i) =>
        !this.queue.slice(0, i).some((b) => b.shipmentId === a.shipmentId) &&
        this.clearRoad(a),
    );
    if (index < 0) return false;
    const action = this.queue.splice(index, 1)[0];
    const shipment = this.shipments.get(action.shipmentId)!;
    const dock = dockIndex(shipment.data.dockId);
    const pallet = action.palletId
      ? this.pallets.get(action.palletId)
      : undefined;
    const plan = pallet
      ? businessHandlingPlan(
          shipment.data.direction === "inbound",
          dock,
          pallet.slot % SLOT_Z.length,
        )
      : undefined;
    this.active = {
      ...action,
      elapsed: 0,
      duration: plan?.finishAt ?? this.duration(action),
      plan,
    };
    if (action.kind === "arrive") shipment.truck.visible = true;
    this.stage = "";
    this.publish();
    return true;
  }
  advance(seconds: number) {
    if (this.view.paused || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = seconds * this.view.speed;
    while (remaining > 1e-8) {
      if (!this.active && !this.startNext()) return;
      const action = this.active!,
        shipment = this.shipments.get(action.shipmentId)!,
        dock = dockIndex(shipment.data.dockId);
      const step = Math.min(
        remaining,
        1 / 60,
        action.duration - action.elapsed,
      );
      remaining -= step;
      action.elapsed = Math.min(action.duration, action.elapsed + step);
      if (["arrive", "dock", "depart"].includes(action.kind)) {
        shipment.truck = truckPose(
          this.motionTime(action, action.elapsed),
          dock,
        );
      } else if (action.kind === "start" || action.kind === "complete") {
        const fraction = action.elapsed / action.duration;
        const smooth = fraction * fraction * (3 - 2 * fraction);
        shipment.door = action.kind === "start" ? smooth : 1 - smooth;
      } else if (action.plan) {
        const forklift = this.forklifts.get(dock)!;
        forklift.pose = sampleHandlingPlan(action.plan, action.elapsed, dock);
        const p = forklift.pose;
        forklift.wheels = forklift.wheels.map(
          (distance, i) =>
            distance +
            p.speed *
              step *
              Math.hypot(
                1 -
                  (i < 2 ? -FORKLIFT.track / 2 : FORKLIFT.track / 2) *
                    p.curvature,
                i % 2 === 0 ? FORKLIFT.wheelbase * p.curvature : 0,
              ),
        );
        if (action.elapsed >= action.plan.deliveryAt) {
          const pallet = this.pallets.get(action.palletId!)!;
          pallet.location =
            shipment.data.direction === "inbound" ? "storage" : "truck";
          pallet.confirmed = true;
        }
        if (this.stage !== p.stage) {
          this.stage = p.stage;
          this.publish();
        }
      }
      if (action.elapsed >= action.duration - 1e-8) {
        const next: Partial<Record<ActionKind, ShipmentStatus>> = {
          arrive: "arrived",
          dock: "docked",
          start: "handling",
          complete: "completed",
          depart: "departed",
        };
        if (next[action.kind]) shipment.status = next[action.kind]!;
        if (action.kind === "depart") {
          shipment.truck.visible = false;
          for (const pallet of this.pallets.values())
            if (
              pallet.shipmentId === shipment.data.id &&
              pallet.location === "truck"
            )
              pallet.location = "departed";
        }
        if (action.plan) {
          const forklift = this.forklifts.get(dock)!;
          forklift.pose = {
            ...forklift.pose,
            speed: 0,
            curvature: 0,
            stage: "waiting",
          };
        }
        shipment.truck.speed = 0;
        shipment.truck.reversing = false;
        this.active = null;
        this.scheduleDirty = true;
        this.publish();
      }
    }
  }
  palletPose(id: string): MaterialPose {
    const pallet = this.pallets.get(id)!;
    const dock = dockIndex(pallet.dockId);
    const shipment = pallet.shipmentId
      ? this.shipments.get(pallet.shipmentId)
      : undefined;
    const action = this.active;
    if (
      action?.palletId === id &&
      action.plan &&
      action.elapsed >= action.plan.pickupAt &&
      action.elapsed < action.plan.deliveryAt
    ) {
      const p = this.forklifts.get(dock)!.pose,
        pose = loadOnFork(p);
      const inbound = shipment!.data.direction === "inbound";
      const source = inbound ? TRUCK_BED_Y : FLOOR_Y,
        destination = inbound ? FLOOR_Y : TRUCK_BED_Y;
      // The fork enters beneath the deck. Cargo stays on its support until the
      // fork lifts it, and remains on the destination as the tines lower away.
      if (p.stage === "lift")
        pose.position.y = Math.max(source, pose.position.y);
      if (p.stage === "release")
        pose.position.y = Math.max(destination, pose.position.y);
      return { ...pose, visible: true };
    }
    if (pallet.location === "truck" || pallet.location === "departed") {
      const truck = shipment?.truck;
      if (!truck)
        return {
          position: { x: 0, y: 0, z: 0 },
          rotation: yaw(0),
          visible: false,
        };
      return {
        position: transformPoint(
          {
            x: 0.65,
            y: TRUCK_BED_Y,
            z: SLOT_Z[pallet.slot % SLOT_Z.length] - 8.7,
          },
          yaw(truck.rot),
          { x: truck.x, y: 0, z: truck.z },
        ),
        rotation: multiplyRotation(yaw(truck.rot), yaw(Math.PI * 1.5)),
        visible: pallet.location !== "departed" && truck.visible,
      };
    }
    return {
      position: {
        x:
          SITE.docks[dock].x +
          STORAGE_X +
          Math.floor(pallet.slot / SLOT_Z.length) * 1.5,
        y: FLOOR_Y,
        z: SLOT_Z[pallet.slot % SLOT_Z.length],
      },
      rotation: yaw(Math.PI / 2),
      visible: true,
    };
  }
}
