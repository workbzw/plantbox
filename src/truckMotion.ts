import { CYCLE, phaseAt } from "./simulation.ts";
import { DEPART_END, DOCK_X, LOAD_END } from "./logistics.ts";
export { DOCK_X } from "./logistics.ts";

// The rendered vehicle is a rigid box truck. Its tandem rear axles are treated
// as one effective axle; a semi-trailer would require a separate hitch model.
export const TRUCK_GEOMETRY = {
  rearAxleZ: -3.335,
  frontAxleZ: 3.15,
  wheelbase: 6.485,
  halfTrack: 1.31,
  wheelRadius: 0.57,
  halfWidth: 1.58,
  rear: -4.97,
  front: 4.49,
} as const;
const PARKED_REAR_Z = 8.7 + TRUCK_GEOMETRY.rearAxleZ;
const ALIGN_REAR_Z = 15.5;
const DEPART_TURN_Z = 20;
const ENTRY_X = 58;
const EXIT_X = 58;
export const MIN_TURN_RADIUS = 9.5;
const RAMP = 0.18;
const TURN_LENGTH = ((Math.PI / 2) * MIN_TURN_RADIUS) / (1 - RAMP);
const STEPS = 1200;
const WHEELS = [-1.31, 1.31].flatMap((x) =>
  [-3.95, -2.72, 3.15].map((z) => ({ x, z })),
);

function curvature(u: number) {
  const edge = Math.min(u, 1 - u);
  return (
    (edge < RAMP ? (1 - Math.cos((Math.PI * edge) / RAMP)) / 2 : 1) /
    MIN_TURN_RADIUS
  );
}

function heading(u: number) {
  const rampIntegral = (t: number) =>
    (t - (RAMP / Math.PI) * Math.sin((Math.PI * t) / RAMP)) / 2;
  const integral =
    u < RAMP
      ? rampIntegral(u)
      : u > 1 - RAMP
        ? 1 - RAMP - rampIntegral(1 - u)
        : u - RAMP / 2;
  return (integral * TURN_LENGTH) / MIN_TURN_RADIUS;
}

function wheelFactor(x: number, z: number, k: number) {
  return Math.hypot(1 - x * k, (z - TRUCK_GEOMETRY.rearAxleZ) * k);
}

// Integrate the rear-axle path by arc length, with smooth steering entry/exit.
// No independent interpolation of vehicle position and heading is permitted.
const turn = [
  {
    x: 0,
    z: 0,
    forwardWheels: WHEELS.map(() => 0),
    reverseWheels: WHEELS.map(() => 0),
  },
];
for (let i = 1; i <= STEPS; i++) {
  const u = (i - 0.5) / STEPS,
    ds = TURN_LENGTH / STEPS;
  const angle = heading(u),
    k = curvature(u),
    previous = turn[i - 1];
  turn.push({
    x: previous.x + Math.sin(angle) * ds,
    z: previous.z + Math.cos(angle) * ds,
    forwardWheels: WHEELS.map(
      (w, j) => previous.forwardWheels[j] + wheelFactor(w.x, w.z, k) * ds,
    ),
    reverseWheels: WHEELS.map(
      (w, j) => previous.reverseWheels[j] + wheelFactor(w.x, w.z, -k) * ds,
    ),
  });
}
const TURN_OFFSET = turn[STEPS].x;
export const ENTRY_LANE_Z = ALIGN_REAR_Z + TURN_OFFSET;
export const EXIT_LANE_Z = DEPART_TURN_Z + TURN_OFFSET;

function sampleTurn(distance: number) {
  const u = Math.max(0, Math.min(1, distance / TURN_LENGTH));
  const index = Math.min(STEPS - 1, Math.floor(u * STEPS));
  const fraction = u * STEPS - index;
  const a = turn[index],
    b = turn[index + 1];
  const lerp = (a: number, b: number) => a + (b - a) * fraction;
  return {
    x: lerp(a.x, b.x),
    z: lerp(a.z, b.z),
    angle: heading(u),
    curvature: curvature(u),
    forwardWheels: a.forwardWheels.map((s, i) => lerp(s, b.forwardWheels[i])),
    reverseWheels: a.reverseWheels.map((s, i) => lerp(s, b.reverseWheels[i])),
  };
}

// Raised-cosine acceleration and braking: finite acceleration, zero speed at
// both stops, constant crawl in between. Time only controls distance travelled.
function travel(
  time: number,
  start: number,
  end: number,
  length: number,
  acceleration: number,
  braking: number,
) {
  const duration = end - start,
    t = Math.max(0, Math.min(duration, time - start));
  const maxSpeed = length / (duration - (acceleration + braking) / 2);
  if (t < acceleration)
    return {
      distance:
        maxSpeed *
        (t / 2 -
          (acceleration / (2 * Math.PI)) *
            Math.sin((Math.PI * t) / acceleration)),
      speed: (maxSpeed * (1 - Math.cos((Math.PI * t) / acceleration))) / 2,
    };
  const remaining = duration - t;
  if (remaining < braking)
    return {
      distance:
        length -
        maxSpeed *
          (remaining / 2 -
            (braking / (2 * Math.PI)) *
              Math.sin((Math.PI * remaining) / braking)),
      speed: (maxSpeed * (1 - Math.cos((Math.PI * remaining) / braking))) / 2,
    };
  return { distance: maxSpeed * (t - acceleration / 2), speed: maxSpeed };
}

export interface TruckPose {
  x: number;
  z: number;
  rearX: number;
  rearZ: number;
  rot: number;
  curvature: number;
  speed: number;
  wheelTravel: number[];
  visible: boolean;
  reversing: boolean;
}

export function truckPose(time: number, dock: number): TruckPose {
  const { t, phase } = phaseAt(time),
    dockX = DOCK_X[dock];
  const setupX = dockX - TURN_OFFSET;
  const arrivalLength = ENTRY_X - setupX;
  const reverseStraight = ALIGN_REAR_Z - PARKED_REAR_Z;
  const reverseLength = TURN_LENGTH + reverseStraight;
  const departureStraight = DEPART_TURN_Z - PARKED_REAR_Z;
  const exitStraight = EXIT_X - (dockX + TURN_OFFSET);
  const departureLength = departureStraight + TURN_LENGTH + exitStraight;
  let rearX = dockX,
    rearZ = PARKED_REAR_Z,
    rot = 0,
    k = 0,
    speed = 0;
  const completedReverseWheels = turn[STEPS].reverseWheels.map(
    (s) => s + reverseStraight,
  );
  let wheels = completedReverseWheels.map((s) => arrivalLength - s);
  if (phase === "arriving") {
    const p = travel(t, 0, 28.6, arrivalLength, 2, 3.6);
    rearX = ENTRY_X - p.distance;
    rearZ = ENTRY_LANE_Z;
    rot = -Math.PI / 2;
    speed = p.speed;
    wheels = WHEELS.map(() => p.distance);
  } else if (phase === "docking") {
    // Stop before changing direction, then reverse with the cab swinging out.
    const p = travel(t, 30.6, 49.7, reverseLength, 1.8, 4);
    const curve = sampleTurn(p.distance);
    rearX = setupX + curve.z;
    rearZ = ENTRY_LANE_Z - curve.x - Math.max(0, p.distance - TURN_LENGTH);
    rot = -Math.PI / 2 + curve.angle;
    k = -curve.curvature;
    speed = -p.speed;
    wheels = curve.reverseWheels.map(
      (s) => arrivalLength - s - Math.max(0, p.distance - TURN_LENGTH),
    );
  } else if (phase === "departing" || phase === "transit") {
    // Fixed dispatch slots for this three-truck demo. Docks 2/3 give way to
    // the incoming vehicle before crossing its lane; all stay inside the
    // departure phase. This is not a general-purpose collision planner.
    const p = travel(
      t,
      LOAD_END + [1.2, 20, 10.5][dock],
      DEPART_END - 0.5,
      departureLength,
      3,
      2,
    );
    const turnDistance = Math.max(0, p.distance - departureStraight);
    const curve = sampleTurn(turnDistance);
    const tail = Math.max(0, turnDistance - TURN_LENGTH);
    rearX = dockX + curve.x + tail;
    rearZ = PARKED_REAR_Z + Math.min(p.distance, departureStraight) + curve.z;
    rot = curve.angle;
    k = curve.curvature;
    speed = p.speed;
    wheels = wheels.map(
      (s, i) =>
        s +
        Math.min(p.distance, departureStraight) +
        curve.forwardWheels[i] +
        tail,
    );
  }
  // Keep wheel angles continuous across a simulation cycle, including seeks.
  const cycle = Math.floor(time / CYCLE);
  wheels = wheels.map(
    (s, i) =>
      s +
      cycle *
        (arrivalLength -
          completedReverseWheels[i] +
          departureStraight +
          turn[STEPS].forwardWheels[i] +
          exitStraight),
  );
  return {
    rearX,
    rearZ,
    x: rearX - TRUCK_GEOMETRY.rearAxleZ * Math.sin(rot),
    z: rearZ - TRUCK_GEOMETRY.rearAxleZ * Math.cos(rot),
    rot,
    curvature: k,
    speed,
    wheelTravel: wheels,
    visible: phase !== "transit",
    reversing: phase === "docking",
  };
}

export function frontWheelAngle(k: number, x: number) {
  return Math.atan2(TRUCK_GEOMETRY.wheelbase * k, 1 - x * k);
}

/** Truck body + mirrors, for swept-envelope checks in the maneuvering yard. */
export function truckFootprint(p: TruckPose) {
  return [-1, 1].flatMap((side) =>
    [TRUCK_GEOMETRY.rear, TRUCK_GEOMETRY.front].map((z) => ({
      x:
        p.x +
        side * TRUCK_GEOMETRY.halfWidth * Math.cos(p.rot) +
        z * Math.sin(p.rot),
      z:
        p.z -
        side * TRUCK_GEOMETRY.halfWidth * Math.sin(p.rot) +
        z * Math.cos(p.rot),
    })),
  );
}
