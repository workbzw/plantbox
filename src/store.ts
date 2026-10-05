import { create } from "zustand";
import type { Selection } from "./simulation.ts";
import { DEMO_END, SKUS } from "./simulation.ts";
import type { DeliveryRecord } from "./logistics.ts";
export type CameraView = "overview" | "dock" | "storage" | "top" | "interior";
export type Page = "scene" | "inventory" | "shipments" | "activity";
interface AppState {
  time: number;
  paused: boolean;
  simulationReady: boolean;
  speed: number;
  page: Page;
  selected: Selection;
  roofOpen: boolean;
  labels: boolean;
  quality: "high" | "balanced";
  camera: { view: CameraView; seq: number; zoom: number; rotation: number };
  adjustments: Record<string, number>;
  notice: string | null;
  deliveries: DeliveryRecord[] | undefined;
  setDeliveries: (records: DeliveryRecord[]) => void;
  tick: (dt: number) => void;
  togglePause: () => void;
  setSpeed: (v: number) => void;
  setPage: (page: Page) => void;
  select: (selection: Selection) => void;
  toggleRoof: () => void;
  toggleLabels: () => void;
  setQuality: (v: "high" | "balanced") => void;
  setCamera: (view: CameraView) => void;
  zoomCamera: (dir: number) => void;
  rotateCamera: () => void;
  replenish: (sku: string, amount: number) => void;
  notify: (text: string | null) => void;
  reset: () => void;
}
export const useStore = create<AppState>((set) => ({
  time: 86,
  paused: false,
  simulationReady: false,
  speed: 1,
  page: "scene",
  selected: { kind: "site", id: "WH-01" },
  roofOpen: false,
  labels: true,
  quality:
    typeof window !== "undefined" && window.innerWidth < 850
      ? "balanced"
      : "high",
  adjustments: {},
  notice: null,
  deliveries: undefined,
  setDeliveries: (deliveries) => set({ deliveries }),
  camera: { view: "overview", seq: 0, zoom: 1, rotation: 0 },
  tick: (dt) =>
    set((s) => {
      if (!s.simulationReady || s.paused || !Number.isFinite(dt) || dt <= 0)
        return s;
      const time = Math.min(DEMO_END, s.time + dt * s.speed);
      return time === DEMO_END
        ? {
            time,
            paused: true,
            notice: "30 分钟作业场景已演示完成，可在设置中重置后再次运行。",
          }
        : { time };
    }),
  togglePause: () =>
    set((s) =>
      s.time >= DEMO_END
        ? { notice: "演示已完成，请在设置中重置模拟。" }
        : { paused: !s.paused },
    ),
  setSpeed: (speed) => set({ speed }),
  setPage: (page) => set({ page }),
  select: (selected) => set({ selected }),
  toggleRoof: () => set((s) => ({ roofOpen: !s.roofOpen })),
  toggleLabels: () => set((s) => ({ labels: !s.labels })),
  setQuality: (quality) => set({ quality }),
  setCamera: (view) =>
    set((s) => ({
      camera: { view, seq: s.camera.seq + 1, zoom: 1, rotation: 0 },
      ...(view === "interior" ? { roofOpen: true } : {}),
    })),
  zoomCamera: (dir) =>
    set((s) => ({
      camera: {
        ...s.camera,
        zoom: Math.max(0.55, Math.min(2.2, s.camera.zoom + dir * 0.18)),
        seq: s.camera.seq + 1,
      },
    })),
  rotateCamera: () =>
    set((s) => ({
      camera: {
        ...s.camera,
        rotation: s.camera.rotation + Math.PI / 2,
        seq: s.camera.seq + 1,
      },
    })),
  replenish: (sku, amount) =>
    set((s) => {
      const item = SKUS.find((i) => i.id === sku);
      if (!item || !Number.isInteger(amount) || amount <= 0) return s;
      return {
        adjustments: {
          ...s.adjustments,
          [sku]: (s.adjustments[sku] ?? 0) + amount,
        },
        notice: `已补充 ${item.name} ${amount} ${item.unit}，库存看板已更新`,
      };
    }),
  notify: (notice) => set({ notice }),
  reset: () =>
    set((s) => ({
      time: 86,
      paused: false,
      speed: 1,
      adjustments: {},
      deliveries: undefined,
      selected: { kind: "site", id: "WH-01" },
      camera: { view: "overview", seq: s.camera.seq + 1, zoom: 1, rotation: 0 },
      roofOpen: false,
      notice: "模拟已恢复初始状态",
    })),
}));
