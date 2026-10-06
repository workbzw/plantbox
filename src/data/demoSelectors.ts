import { tr } from "../i18n";
import {
  handledPallets as deriveHandledPallets,
  inventoryAt as deriveInventoryAt,
  latestMovements as deriveLatestMovements,
  occupiedPallets as deriveOccupiedPallets,
  phaseAt as derivePhaseAt,
  phaseLabel as derivePhaseLabel,
  SKUS as sourceSkus,
  TRUCKS as sourceTrucks,
} from "../simulation";
import { useSimulationStore } from "../state/simulationStore";
const localizedSku = <
  T extends { name: string; category: string; unit: string },
>(
  s: T,
): T => ({
  ...s,
  name: tr(s.name),
  category: tr(s.category),
  unit: tr(s.unit),
});
export const skus = () => sourceSkus.map(localizedSku);
export const trucks = () =>
  sourceTrucks.map((truck) => ({
    ...truck,
    plate: tr(truck.plate),
    carrier: tr(truck.carrier),
    driver: tr(truck.driver),
    destination: tr(truck.destination),
  }));
export const phaseLabel = (...args: Parameters<typeof derivePhaseLabel>) =>
  tr(derivePhaseLabel(...args));
const ledger = () => useSimulationStore.getState().deliveries;
export const phaseAt = (time: number, dock = 0) =>
  derivePhaseAt(time, dock, ledger());
export const handledPallets = (time: number, dock = 0) =>
  deriveHandledPallets(time, dock, ledger());
export const inventoryAt = (
  time: number,
  adjustments: Record<string, number> = {},
) => deriveInventoryAt(time, adjustments, ledger()).map(localizedSku);
export const occupiedPallets = (
  time: number,
  adjustments: Record<string, number> = {},
) => deriveOccupiedPallets(time, adjustments, ledger());
export const latestMovements = (time: number) =>
  deriveLatestMovements(time, ledger()).map((event) => ({
    ...event,
    sku: tr(event.sku),
  }));
