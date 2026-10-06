/** Versioned boundary shared by both data sources and the HTTP service. No React/Three dependencies. */
export const API_VERSION = 1 as const;
export type SourceMode = "demo" | "live";
export type Direction = "inbound" | "outbound";
export type ShipmentStatus =
  | "expected"
  | "arrived"
  | "docked"
  | "handling"
  | "completed"
  | "departed";
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  color: string;
  location: string;
  pallet: number;
  min: number;
  stock: number;
  reserved: number;
  available: number;
  low: boolean;
}
export interface Shipment {
  id: string;
  vehicleId: string;
  plate: string;
  carrier: string;
  driver: string;
  destination: string;
  dockId: string;
  direction: Direction;
  skuId: string;
  color: string;
  status: ShipmentStatus;
  completed: number;
  total: number;
}
export interface Pallet {
  id: string;
  skuId: string;
  quantity: number;
  batch: string;
  location: "storage" | "truck" | "departed";
  shipmentId: string | null;
  dockId: string;
  slot: number;
  confirmed: boolean;
}
export type EventType =
  | "arrive"
  | "dock"
  | "start"
  | "confirm_pallet"
  | "complete"
  | "depart";
export interface WarehouseEvent {
  id: string;
  type: EventType;
  occurredAt: string;
  shipmentId: string;
  vehicleId: string;
  palletId?: string;
  skuId?: string;
  quantity?: number;
  direction: Direction;
}
export interface WarehouseSnapshot {
  schemaVersion: typeof API_VERSION;
  mode: SourceMode;
  sampleData: boolean;
  revision: number;
  updatedAt: string;
  siteId: string;
  inventory: InventoryItem[];
  shipments: Shipment[];
  pallets: Pallet[];
  events: WarehouseEvent[];
  occupiedPallets: number;
}
/** A stable id is retained across network retries. Server validates state and manifest. */
export interface WarehouseCommand {
  id: string;
  type: EventType;
  shipmentId: string;
  palletId?: string;
}
export const statusLabels: Record<ShipmentStatus, string> = {
  expected: "待入场",
  arrived: "已入场",
  docked: "月台就位",
  handling: "作业中",
  completed: "作业完成",
  departed: "已出场",
};
export const eventLabels: Record<EventType, string> = {
  arrive: "车辆入场",
  dock: "月台就位",
  start: "开始作业",
  confirm_pallet: "托盘交付确认",
  complete: "作业完成",
  depart: "车辆出场",
};
