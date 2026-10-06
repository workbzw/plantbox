import { SITE } from "./config/site.ts";
export const DOCK_X = SITE.docks.map((dock) => dock.x);
export const TRUCK_OFFSETS = [0, 72, 161] as const;
export const LOAD_START = 50;
export const JOB_SECONDS = 120;
export const PALLETS_PER_TRUCK = 6;
export const LOAD_END = LOAD_START + JOB_SECONDS * PALLETS_PER_TRUCK;
export const DEPART_END = LOAD_END + 55;
export const CYCLE = DEPART_END + 15;
export const STOCK_LAYERS = 3;
export const FLOOR_Y = 0.025;
export const TRUCK_BED_Y = 1.405;
export const PALLET = {
  width: 0.8,
  depth: 1.2,
  height: 0.72,
  deckBottom: 0.125,
} as const;
export const FORKLIFT = {
  frontAxle: 0.5,
  rearAxle: -0.8,
  wheelbase: 1.3,
  track: 1.46,
  cargoZ: 1.7,
  tineZ: 1.72,
  tineLength: 1.22,
  tineWidth: 0.085,
  tineThickness: 0.055,
  tineX: 0.16,
  radius: 1.05,
} as const;
export const SLOT_Z = [4.45, 5.5, 6.55, 7.6, 8.65, 9.7] as const;
export const STORAGE_X = 8.5;
export interface DeliveryRecord {
  id: string;
  dock: number;
  cycle: number;
  slot: number;
  time: number;
}
