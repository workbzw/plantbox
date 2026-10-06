import { create } from "zustand";
import { SITE } from "../config/site.ts";
export type CameraView = "overview" | "dock" | "storage" | "top" | "interior";
export type Page = "scene" | "inventory" | "shipments" | "activity";
export type Selection = {
  kind: "site" | "truck" | "forklift" | "container" | "pallet";
  id: string;
};
interface UIState {
  page: Page;
  selected: Selection;
  roofOpen: boolean;
  labels: boolean;
  quality: "high" | "balanced";
  camera: { view: CameraView; seq: number; zoom: number; rotation: number };
  notice: string | null;
  setPage: (page: Page) => void;
  select: (selection: Selection) => void;
  toggleRoof: () => void;
  toggleLabels: () => void;
  setQuality: (v: "high" | "balanced") => void;
  setCamera: (view: CameraView) => void;
  zoomCamera: (dir: number) => void;
  rotateCamera: () => void;
  notify: (text: string | null) => void;
  resetView: () => void;
}
export const useUIStore = create<UIState>((set) => ({
  page: "scene",
  selected: { kind: "site", id: SITE.id },
  roofOpen: false,
  labels: true,
  quality:
    typeof window !== "undefined" && window.innerWidth < 850
      ? "balanced"
      : "high",
  camera: { view: "overview", seq: 0, zoom: 1, rotation: 0 },
  notice: null,
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
  notify: (notice) => set({ notice }),
  resetView: () =>
    set((s) => ({
      selected: { kind: "site", id: SITE.id },
      roofOpen: false,
      camera: { view: "overview", seq: s.camera.seq + 1, zoom: 1, rotation: 0 },
    })),
}));
