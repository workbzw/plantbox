import { SKUS } from "../config/catalog.ts";
import { DEMO_TRUCKS } from "../config/demo.ts";
import { SITE } from "../config/site.ts";
import {
  applyWarehouseCommand,
  DomainError,
  parseCommand,
  projectWarehouseSnapshot,
} from "../domain/commands.ts";
import type {
  Pallet,
  Shipment,
  WarehouseCommand,
  WarehouseSnapshot,
} from "../domain/warehouse.ts";
import type { SourceState, WarehouseDataSource } from "./source.ts";

function initialSnapshot(): WarehouseSnapshot {
  const shipments: Shipment[] = DEMO_TRUCKS.map((t) => ({
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
    status: "expected",
    completed: 0,
    total: 6,
  }));
  const pallets: Pallet[] = DEMO_TRUCKS.flatMap((t, index) =>
    Array.from({ length: 6 }, (_, slot) => ({
      id: `KLY-${t.dock + 1}-${String(slot + 1).padStart(3, "0")}`,
      skuId: shipments[index].skuId,
      quantity: t.units,
      batch: "SAMPLE-001",
      location: t.direction === "inbound" ? "truck" : "storage",
      shipmentId: t.shipment,
      dockId: SITE.docks[t.dock].id,
      slot,
      confirmed: false,
    })),
  );
  pallets.push(
    ...SKUS.map(
      (sku, index): Pallet => ({
        id: `KLY-STOCK-${index + 1}`,
        skuId: sku.id,
        quantity: sku.pallet,
        batch: "SAMPLE-001",
        location: "storage",
        shipmentId: null,
        dockId: SITE.docks[index % SITE.docks.length].id,
        slot: 6 + Math.floor(index / SITE.docks.length),
        confirmed: false,
      }),
    ),
  );
  return projectWarehouseSnapshot({
    schemaVersion: 1,
    mode: "interactive",
    sampleData: true,
    revision: 1,
    updatedAt: new Date().toISOString(),
    siteId: SITE.id,
    inventory: SKUS.map((s) => ({
      ...s,
      reserved: 0,
      available: 0,
      low: false,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    shipments,
    pallets: pallets.sort((a, b) => a.id.localeCompare(b.id)),
    events: [],
    occupiedPallets: 0,
  });
}

/** A page-scoped interactive demo. No HTTP, polling, storage or background clock. */
export function createInteractiveSource(): WarehouseDataSource {
  let state: SourceState = {
    snapshot: initialSnapshot(),
    connection: "connected",
    error: null,
  };
  const listeners = new Set<() => void>();
  const commands = new Map<string, string>();
  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start: () => () => {},
    refresh: async () => {},
    execute: async (input: WarehouseCommand) => {
      const command = parseCommand(input);
      const payload = JSON.stringify(command);
      const previous = commands.get(command.id);
      if (previous !== undefined) {
        if (previous !== payload)
          throw new DomainError("操作编号已被其他请求使用");
        return;
      }
      const snapshot = applyWarehouseCommand(state.snapshot!, command);
      commands.set(command.id, payload);
      state = { snapshot, connection: "connected", error: null };
      listeners.forEach((fn) => fn());
    },
  };
}
