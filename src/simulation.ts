import {
  CYCLE,
  DEPART_END,
  LOAD_END,
  LOAD_START,
  STOCK_LAYERS,
} from "./logistics.ts";
import type { DeliveryRecord } from "./logistics.ts";
import { completedJobs, deliveryTime } from "./forkliftMotion.ts";
export { CYCLE } from "./logistics.ts";
export const DEMO_END = 1800;
export type Phase =
  | "arriving"
  | "docking"
  | "loading"
  | "departing"
  | "transit";
export type Selection = {
  kind: "site" | "truck" | "forklift" | "container" | "pallet";
  id: string;
};
export const TRUCKS = [
  {
    id: "TRK-2051",
    plate: "沪 B·7K218",
    carrier: "昆仑元物流",
    driver: "张师傅",
    destination: "昆仑元苏州配送中心",
    shipment: "SHP-78442",
    dock: 0,
    offset: 0,
    color: "#2855ce",
    direction: "outbound" as const,
    sku: 0,
    units: 24,
  },
  {
    id: "TRK-2287",
    plate: "沪 D·6J092",
    carrier: "昆仑元供应链",
    driver: "李师傅",
    destination: "昆仑元杭州配送中心",
    shipment: "SHP-78447",
    dock: 1,
    offset: 72,
    color: "#e58440",
    direction: "inbound" as const,
    sku: 1,
    units: 12,
  },
  {
    id: "TRK-2136",
    plate: "苏 E·3N165",
    carrier: "昆仑元冷链",
    driver: "陈师傅",
    destination: "昆仑元南京配送中心",
    shipment: "SHP-78451",
    dock: 2,
    offset: 161,
    color: "#489792",
    direction: "outbound" as const,
    sku: 2,
    units: 18,
  },
];
export const SKUS = [
  {
    id: "PKG-001",
    name: "标准包装纸箱",
    category: "包装耗材",
    stock: 1920,
    min: 500,
    color: "#bd8d55",
    location: "A-01",
    unit: "件",
    pallet: 24,
  },
  {
    id: "STO-020",
    name: "蓝色周转箱",
    category: "周转容器",
    stock: 348,
    min: 100,
    color: "#4b73d5",
    location: "A-02",
    unit: "个",
    pallet: 12,
  },
  {
    id: "PKG-048",
    name: "工业包装胶带",
    category: "包装耗材",
    stock: 2680,
    min: 600,
    color: "#d5b47a",
    location: "B-01",
    unit: "卷",
    pallet: 18,
  },
  {
    id: "PPE-010",
    name: "作业安全帽",
    category: "劳保用品",
    stock: 128,
    min: 150,
    color: "#e8b345",
    location: "B-02",
    unit: "顶",
    pallet: 16,
  },
  {
    id: "STO-012",
    name: "木质标准托盘",
    category: "周转容器",
    stock: 216,
    min: 80,
    color: "#ac8358",
    location: "C-01",
    unit: "个",
    pallet: 10,
  },
  {
    id: "PPE-036",
    name: "防护手套",
    category: "劳保用品",
    stock: 864,
    min: 200,
    color: "#799791",
    location: "C-02",
    unit: "双",
    pallet: 24,
  },
];
export function phaseAt(
  time: number,
  dock = 0,
  deliveries?: DeliveryRecord[],
): {
  phase: Phase;
  t: number;
  progress: number;
  completed: number;
} {
  const t = ((time % CYCLE) + CYCLE) % CYCLE;
  if (t < 30) return { phase: "arriving", t, progress: t / 30, completed: 0 };
  if (t < 50)
    return { phase: "docking", t, progress: (t - 30) / 20, completed: 0 };
  if (t < LOAD_END)
    return {
      phase: "loading",
      t,
      progress: (t - LOAD_START) / (LOAD_END - LOAD_START),
      completed: deliveries
        ? deliveries.filter(
            (e) => e.dock === dock && e.cycle === Math.floor(time / CYCLE),
          ).length
        : completedJobs(time, dock),
    };
  const completed = deliveries
    ? deliveries.filter(
        (e) => e.dock === dock && e.cycle === Math.floor(time / CYCLE),
      ).length
    : 6;
  if (t < DEPART_END)
    return { phase: "departing", t, progress: (t - LOAD_END) / 55, completed };
  return { phase: "transit", t, progress: (t - DEPART_END) / 15, completed };
}
// The live application supplies the physics-confirmed delivery ledger. The
// schedule fallback is used to reconstruct an initial/reset snapshot.
export function handledPallets(
  time: number,
  dock = 0,
  deliveries?: DeliveryRecord[],
): number {
  if (deliveries) return deliveries.filter((e) => e.dock === dock).length;
  const cycles = Math.floor(time / CYCLE);
  return Math.min(STOCK_LAYERS * 6, cycles * 6 + completedJobs(time, dock));
}
export function inventoryAt(
  time: number,
  adjustments: Record<string, number> = {},
  deliveries?: DeliveryRecord[],
) {
  return SKUS.map((sku, index) => {
    const truck = TRUCKS.find((t) => t.sku === index);
    const moved = truck
      ? handledPallets(time + truck.offset, truck.dock, deliveries) *
        truck.units *
        (truck.direction === "inbound" ? 1 : -1)
      : 0;
    const stock = Math.max(0, sku.stock + moved + (adjustments[sku.id] ?? 0));
    const reserved =
      truck?.direction === "outbound"
        ? Math.min(
            stock,
            (6 -
              phaseAt(time + truck.offset, truck.dock, deliveries).completed) *
              truck.units,
          )
        : 0;
    return {
      ...sku,
      stock,
      reserved,
      available: stock - reserved,
      low: stock - reserved < sku.min,
    };
  });
}
export function occupiedPallets(
  time: number,
  adjustments: Record<string, number> = {},
  deliveries?: DeliveryRecord[],
) {
  const movements = TRUCKS.reduce(
    (sum, truck) =>
      sum +
      handledPallets(time + truck.offset, truck.dock, deliveries) *
        (truck.direction === "inbound" ? 1 : -1),
    0,
  );
  const replenished = SKUS.reduce(
    (sum, sku) => sum + Math.ceil((adjustments[sku.id] ?? 0) / sku.pallet),
    0,
  );
  return 1412 + movements + replenished;
}
export function phaseLabel(phase: Phase, inbound = false) {
  return {
    arriving: "即将到达",
    docking: "倒车靠台",
    loading: inbound ? "卸货中" : "装货中",
    departing: "驶离月台",
    transit: "运输中",
  }[phase];
}
export function formatClock(seconds: number) {
  const total = 9 * 3600 + 40 * 60 + Math.floor(seconds);
  return [
    Math.floor(total / 3600) % 24,
    Math.floor(total / 60) % 60,
    total % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
export function latestMovements(time: number, deliveries?: DeliveryRecord[]) {
  const events: {
    id: string;
    time: number;
    truck: string;
    sku: string;
    amount: number;
    inbound: boolean;
  }[] = [];
  TRUCKS.forEach((truck) => {
    const current = Math.floor((time + truck.offset) / CYCLE);
    for (let c = Math.max(0, current - 1); c <= current; c++) {
      for (let i = 1; i <= 6; i++) {
        const event = deliveries?.find(
          (e) => e.dock === truck.dock && e.cycle === c && e.slot === i - 1,
        );
        const at = deliveries
          ? (event?.time ?? Infinity)
          : deliveryTime(c, truck.dock, i - 1) - truck.offset;
        if (at >= 0 && at <= time)
          events.push({
            id: `${truck.id}-${c}-${i}`,
            time: at,
            truck: truck.id,
            sku: SKUS[truck.sku].name,
            amount: truck.units,
            inbound: truck.direction === "inbound",
          });
      }
    }
  });
  return events.sort((a, b) => b.time - a.time).slice(0, 12);
}
