import { create } from "zustand";
import type { DeliveryRecord } from "../logistics.ts";
import { DEMO_END, SKUS } from "../simulation.ts";
interface SimulationState {
  time: number;
  paused: boolean;
  simulationReady: boolean;
  speed: number;
  adjustments: Record<string, number>;
  deliveries: DeliveryRecord[] | undefined;
  setDeliveries: (records: DeliveryRecord[]) => void;
  tick: (dt: number) => void;
  togglePause: () => void;
  setSpeed: (speed: number) => void;
  replenish: (sku: string, amount: number) => void;
  reset: () => void;
}
/** Demo state only. Never writes to the HTTP source or to persisted inventory. */
export const useSimulationStore = create<SimulationState>((set) => ({
  time: 86,
  paused: false,
  simulationReady: false,
  speed: 1,
  adjustments: {},
  deliveries: undefined,
  setDeliveries: (deliveries) => set({ deliveries }),
  tick: (dt) =>
    set((s) => {
      if (!s.simulationReady || s.paused || !Number.isFinite(dt) || dt <= 0)
        return s;
      const time = Math.min(DEMO_END, s.time + dt * s.speed);
      return { time, paused: time === DEMO_END || s.paused };
    }),
  togglePause: () =>
    set((s) => (s.time >= DEMO_END ? s : { paused: !s.paused })),
  setSpeed: (speed) => {
    if ([1, 5, 10].includes(speed)) set({ speed });
  },
  replenish: (sku, amount) =>
    set((s) =>
      !SKUS.some((item) => item.id === sku) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
        ? s
        : {
            adjustments: {
              ...s.adjustments,
              [sku]: (s.adjustments[sku] ?? 0) + amount,
            },
          },
    ),
  reset: () =>
    set({
      time: 86,
      paused: false,
      speed: 1,
      adjustments: {},
      deliveries: undefined,
    }),
}));
