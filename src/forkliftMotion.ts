import {
  CYCLE,
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
} from "./logistics.ts";

export type HandlingStage =
  | "waiting"
  | "align"
  | "insert"
  | "lift"
  | "clear"
  | "lower"
  | "transport"
  | "raise"
  | "place"
  | "release"
  | "withdraw"
  | "return";
export const handlingLabels: Record<HandlingStage, string> = {
  waiting: "停车待命",
  align: "对准托盘孔",
  insert: "低速插叉",
  lift: "停稳举升",
  clear: "直线退离货位",
  lower: "降至运输高度",
  transport: "低位带载运输",
  raise: "停稳调整卸货高度",
  place: "慢速送入货位",
  release: "落货并解除支承",
  withdraw: "空叉退出",
  return: "空载返回货位",
};
export interface ForkliftPose {
  x: number;
  z: number;
  rot: number;
  frontX: number;
  frontZ: number;
  lift: number;
  tilt: number;
  curvature: number;
  speed: number;
  distance: number;
  stage: HandlingStage;
  job: number;
  cycle: number;
  carrying: boolean;
  delivered: boolean;
}
type State = { x: number; z: number; rot: number; lift: number; tilt: number };
type Segment = {
  start: number;
  duration: number;
  from: State;
  to: State;
  distance: number;
  curvature: number;
  stage: HandlingStage;
  travelStart: number;
};
interface Plan {
  segments: Segment[];
  pickupAt: number;
  deliveryAt: number;
  finishAt: number;
}
const ready = { yard: 6, truck: 3.9 };
const radius = FORKLIFT.radius;
const corridorX = ready.yard - radius;
const corridorZ = 14.1;
const quarter = Math.PI / 2;
const yawEast = Math.PI / 2,
  yawWest = Math.PI * 1.5;
const plans = new Map<string, Plan>();
const supportHeight = (base: number) =>
  base + PALLET.deckBottom - FORKLIFT.tineThickness / 2 - FLOOR_Y;
const low = supportHeight(FLOOR_Y + 0.2);
const empty = 0.07;

function integrate(from: State, distance: number, curvature: number) {
  const rot = from.rot + distance * curvature;
  return Math.abs(curvature) < 1e-10
    ? {
        ...from,
        x: from.x + Math.sin(rot) * distance,
        z: from.z + Math.cos(rot) * distance,
        rot,
      }
    : {
        ...from,
        x: from.x + (Math.cos(from.rot) - Math.cos(rot)) / curvature,
        z: from.z + (Math.sin(rot) - Math.sin(from.rot)) / curvature,
        rot,
      };
}

export function jobPlan(cycle: number, dock: number, slot: number): Plan {
  const key = `${cycle}:${dock}:${slot}`;
  const cached = plans.get(key);
  if (cached) return cached;
  const inbound = dock === 1,
    z = SLOT_Z[slot];
  let state: State = {
    x: inbound ? ready.truck : ready.yard,
    z,
    rot: inbound ? yawWest : yawEast,
    lift: empty,
    tilt: 0,
  };
  let time = 0,
    distance = 0;
  const segments: Segment[] = [];
  const add = (
    to: State,
    duration: number,
    stage: HandlingStage,
    travel = 0,
    k = 0,
  ) => {
    segments.push({
      start: time,
      duration,
      from: { ...state },
      to: { ...to },
      distance: travel,
      curvature: k,
      stage,
      travelStart: distance,
    });
    state = to;
    time += duration;
    distance += travel;
  };
  const wait = (
    duration: number,
    stage: HandlingStage,
    height = state.lift,
    tilt = state.tilt,
  ) => add({ ...state, lift: height, tilt }, duration, stage);
  const move = (
    travel: number,
    k: number,
    speed: number,
    stage: HandlingStage,
  ) => {
    if (Math.abs(travel) < 1e-6) return;
    add(
      integrate(state, travel, k),
      Math.abs(travel) / speed + 0.6,
      stage,
      travel,
      k,
    );
  };
  const turn = (
    sign: number,
    k: number,
    speed: number,
    stage: HandlingStage,
  ) => {
    wait(0.35, stage);
    move(sign * quarter * radius, k / radius, speed, stage);
  };
  const toHolding = (fromYard: boolean, loaded: boolean) => {
    const stage = loaded ? "transport" : "return",
      speed = loaded ? 0.36 : 1.05;
    turn(-1, fromYard ? -1 : 1, speed, stage);
    move(-(corridorZ - state.z), 0, loaded ? 1 : 1.45, stage);
    turn(-1, -1, speed, stage);
    wait(0.6, stage);
  };
  const fromHolding = (toYard: boolean, targetZ: number, loaded: boolean) => {
    const stage = loaded ? "transport" : "return",
      speed = loaded ? 0.36 : 1.05;
    turn(1, -1, speed, stage);
    move(state.z - (targetZ + radius), 0, loaded ? 1 : 1.45, stage);
    turn(1, toYard ? -1 : 1, speed, stage);
  };
  const sourceBase = inbound
    ? TRUCK_BED_Y
    : FLOOR_Y + Math.max(0, STOCK_LAYERS - 1 - cycle) * PALLET.height;
  const destinationBase = inbound
    ? FLOOR_Y + cycle * PALLET.height
    : TRUCK_BED_Y;
  const sourceFront = inbound
    ? 1.85
    : STORAGE_X - (FORKLIFT.cargoZ - FORKLIFT.frontAxle);
  const destinationFront = inbound
    ? STORAGE_X - (FORKLIFT.cargoZ - FORKLIFT.frontAxle)
    : 1.85;
  wait(4, "align", supportHeight(sourceBase) - 0.012, 0);
  move(Math.abs(sourceFront - state.x), 0, 0.35, "insert");
  const pickupAt = time;
  wait(2.2, "lift", supportHeight(sourceBase + 0.13), 0);
  wait(1, "lift", state.lift, -0.045);
  move(
    -Math.abs(sourceFront - (inbound ? ready.truck : ready.yard)),
    0,
    0.45,
    "clear",
  );
  wait(4.5, "lower", low, -0.045);
  toHolding(!inbound, true);
  fromHolding(inbound, z, true);
  wait(1, "raise", state.lift, 0);
  wait(3.5, "raise", supportHeight(destinationBase + 0.14), 0);
  move(Math.abs(destinationFront - state.x), 0, 0.35, "place");
  wait(2.5, "release", supportHeight(destinationBase) - 0.02, 0);
  wait(1.2, "release");
  const deliveryAt = time;
  move(
    -Math.abs(destinationFront - (inbound ? ready.yard : ready.truck)),
    0,
    0.5,
    "withdraw",
  );
  wait(3, "lower", empty, 0);
  toHolding(inbound, false);
  fromHolding(!inbound, SLOT_Z[(slot + 1) % 6], false);
  const finishAt = time;
  if (finishAt > JOB_SECONDS)
    throw new Error(`Forklift job exceeds available time: ${key}: ${finishAt}`);
  wait(JOB_SECONDS - time, "waiting");
  const plan = { segments, pickupAt, deliveryAt, finishAt };
  plans.set(key, plan);
  return plan;
}

function fraction(t: number, duration: number) {
  const a = Math.min(0.6, duration / 3),
    vmax = 1 / (duration - a);
  if (t < a)
    return {
      p: vmax * (t / 2 - (a / (2 * Math.PI)) * Math.sin((Math.PI * t) / a)),
      v: (vmax * (1 - Math.cos((Math.PI * t) / a))) / 2,
    };
  const left = duration - t;
  if (left < a)
    return {
      p:
        1 -
        vmax *
          (left / 2 - (a / (2 * Math.PI)) * Math.sin((Math.PI * left) / a)),
      v: (vmax * (1 - Math.cos((Math.PI * left) / a))) / 2,
    };
  return { p: vmax * (t - a / 2), v: vmax };
}

export function forkliftPose(localTime: number, dock: number): ForkliftPose {
  const t = ((localTime % CYCLE) + CYCLE) % CYCLE,
    cycle = Math.max(0, Math.floor(localTime / CYCLE));
  const active = t >= LOAD_START && t < LOAD_END && cycle < STOCK_LAYERS;
  const job = active
    ? Math.min(5, Math.floor((t - LOAD_START) / JOB_SECONDS))
    : 0;
  const jobTime = active ? t - LOAD_START - job * JOB_SECONDS : 0;
  const plan = jobPlan(Math.min(cycle, STOCK_LAYERS - 1), dock, job);
  const segment =
    plan.segments.find((s) => jobTime < s.start + s.duration) ??
    plan.segments.at(-1)!;
  const f = fraction(Math.max(0, jobTime - segment.start), segment.duration);
  const smooth = f.p * f.p * (3 - 2 * f.p);
  const p = integrate(segment.from, segment.distance * f.p, segment.curvature);
  p.lift = segment.from.lift + (segment.to.lift - segment.from.lift) * smooth;
  p.tilt = segment.from.tilt + (segment.to.tilt - segment.from.tilt) * smooth;
  return {
    frontX: p.x + DOCK_X[dock],
    frontZ: p.z,
    x: p.x + DOCK_X[dock] - FORKLIFT.frontAxle * Math.sin(p.rot),
    z: p.z - FORKLIFT.frontAxle * Math.cos(p.rot),
    rot: p.rot,
    lift: active ? p.lift : empty,
    tilt: active ? p.tilt : 0,
    curvature: active ? segment.curvature : 0,
    speed: active ? segment.distance * f.v : 0,
    distance: segment.travelStart + segment.distance * f.p,
    stage: active ? segment.stage : "waiting",
    job,
    cycle,
    carrying: active && jobTime >= plan.pickupAt && jobTime < plan.deliveryAt,
    delivered: active && jobTime >= plan.deliveryAt,
  };
}

export function deliveryTime(cycle: number, dock: number, slot: number) {
  return (
    cycle * CYCLE +
    LOAD_START +
    slot * JOB_SECONDS +
    jobPlan(cycle, dock, slot).deliveryAt
  );
}
export function completedJobs(localTime: number, dock: number) {
  const cycle = Math.floor(localTime / CYCLE);
  return SLOT_Z.filter(
    (_, slot) => localTime >= deliveryTime(Math.max(0, cycle), dock, slot),
  ).length;
}
export function palletId(dock: number, cycle: number, slot: number) {
  return `PAL-${dock + 1}-${cycle + 1}-${slot + 1}`;
}
export const FORKLIFT_CORRIDOR = { x: corridorX, z: corridorZ };
