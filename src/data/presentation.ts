import type { InventoryItem, Shipment } from "../domain/warehouse";
import { statusLabels } from "../domain/warehouse";
import { tr } from "../i18n";
import { currentLocale } from "../routing";
export const displayInventory = (item: InventoryItem) => ({
  ...item,
  name: tr(item.name),
  category: tr(item.category),
  unit: tr(item.unit),
});
export const displayShipmentStatus = (s: Shipment) =>
  s.status === "handling"
    ? tr(s.direction === "inbound" ? "卸货中" : "装货中")
    : tr(statusLabels[s.status]);
export const displayTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(
    currentLocale() === "zh" ? "zh-CN" : "en-GB",
    { timeZone: "Asia/Shanghai", hour12: false },
  );
