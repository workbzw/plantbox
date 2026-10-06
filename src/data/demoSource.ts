import { SKUS } from "../config/catalog.ts";
import { DEMO_TRUCKS } from "../config/demo.ts";
import { SITE } from "../config/site.ts";
import type { ShipmentStatus, WarehouseSnapshot } from "../domain/warehouse.ts";
import {
  inventoryAt,
  latestMovements,
  occupiedPallets,
  phaseAt,
} from "../simulation.ts";
import { useSimulationStore } from "../state/simulationStore.ts";
import type { SourceState, WarehouseDataSource } from "./source.ts";
const epoch = Date.parse("2026-01-01T09:40:00+08:00");
const at = (seconds: number) => new Date(epoch + seconds * 1000).toISOString();
export function demoSnapshot(revision: number): WarehouseSnapshot {
  const { time, adjustments, deliveries } = useSimulationStore.getState();
  const statuses: Record<string, ShipmentStatus> = {
    arriving: "expected",
    docking: "arrived",
    loading: "handling",
    departing: "completed",
    transit: "departed",
  };
  return {
    schemaVersion: 1,
    mode: "demo",
    sampleData: true,
    revision,
    updatedAt: at(time),
    siteId: SITE.id,
    inventory: inventoryAt(time, adjustments, deliveries),
    occupiedPallets: occupiedPallets(time, adjustments, deliveries),
    shipments: DEMO_TRUCKS.map((t) => {
      const info = phaseAt(time + t.offset, t.dock, deliveries);
      return {
        id: t.shipment,
        vehicleId: t.id,
        plate: t.plate,
        carrier: t.carrier,
        driver: t.driver,
        destination: t.destination,
        dockId: SITE.docks[t.dock].id,
        direction: t.direction,
        skuId: SKUS[t.sku].id,
        color: t.color,
        status: statuses[info.phase],
        completed: info.completed,
        total: 6,
      };
    }),
    // Demo cargo transforms stay in the physics engine; business consumers use its confirmed ledger.
    pallets: [],
    events: latestMovements(time, deliveries).map((e) => {
      const truck = DEMO_TRUCKS.find((t) => t.id === e.truck)!;
      return {
        id: e.id,
        type: "confirm_pallet",
        occurredAt: at(e.time),
        shipmentId: truck.shipment,
        vehicleId: e.truck,
        skuId: SKUS[truck.sku].id,
        quantity: e.amount,
        direction: e.inbound ? "inbound" : "outbound",
      };
    }),
  };
}
export function createDemoSource(): WarehouseDataSource {
  let revision = 0;
  let state: SourceState = {
    snapshot: demoSnapshot(revision),
    connection: "connected",
    error: null,
  };
  const listeners = new Set<() => void>();
  const publish = () => {
    state = { ...state, snapshot: demoSnapshot(++revision) };
    listeners.forEach((fn) => fn());
  };
  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start: () => {
      publish();
      return useSimulationStore.subscribe(publish);
    },
    refresh: async () => publish(),
    replenish: (id, quantity) =>
      useSimulationStore.getState().replenish(id, quantity),
  };
}
