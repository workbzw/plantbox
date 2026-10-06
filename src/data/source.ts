import type {
  WarehouseCommand,
  WarehouseSnapshot,
} from "../domain/warehouse.ts";
export interface SourceState {
  snapshot: WarehouseSnapshot | null;
  connection: "loading" | "connected" | "offline";
  error: string | null;
}
/** Transport lifecycle and mutations belong to an adapter, never to a view or a 3D object. */
export interface WarehouseDataSource {
  getState(): SourceState;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  refresh(): Promise<void>;
  execute?(command: WarehouseCommand): Promise<void>;
  replenish?(skuId: string, quantity: number): void;
}
