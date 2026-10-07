import type {
  Shipment,
  WarehouseCommand,
  WarehouseEvent,
  WarehouseSnapshot,
} from "./warehouse.ts";

export class DomainError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

const transitions: Partial<
  Record<WarehouseCommand["type"], [Shipment["status"], Shipment["status"]]>
> = {
  arrive: ["expected", "arrived"],
  dock: ["arrived", "docked"],
  start: ["docked", "handling"],
  complete: ["handling", "completed"],
  depart: ["completed", "departed"],
};

export function parseCommand(value: unknown): WarehouseCommand {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError("请求格式无效", 400);
  const c = value as Record<string, unknown>;
  if (
    Object.keys(c).some(
      (k) => !["id", "type", "shipmentId", "palletId"].includes(k),
    )
  )
    throw new DomainError("请求包含未知字段", 400);
  for (const key of ["id", "shipmentId"])
    if (typeof c[key] !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(c[key]))
      throw new DomainError("操作编号或运单编号无效", 400);
  if (
    typeof c.type !== "string" ||
    !(c.type === "confirm_pallet" || Object.hasOwn(transitions, c.type))
  )
    throw new DomainError("不支持的操作", 400);
  if (c.type === "confirm_pallet") {
    if (
      typeof c.palletId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(c.palletId)
    )
      throw new DomainError("请扫描有效的托盘编号", 400);
  } else if (c.palletId !== undefined)
    throw new DomainError("此操作不接受托盘编号", 400);
  return {
    id: c.id as string,
    type: c.type as WarehouseCommand["type"],
    shipmentId: c.shipmentId as string,
    ...(c.palletId ? { palletId: c.palletId as string } : {}),
  };
}

/** Inventory is derived from pallet positions, never incremented by an animation. */
export function projectWarehouseSnapshot(
  snapshot: WarehouseSnapshot,
): WarehouseSnapshot {
  const { pallets } = snapshot;
  const shipments = snapshot.shipments.map((s) => ({
    ...s,
    completed: pallets.filter((p) => p.shipmentId === s.id && p.confirmed)
      .length,
  }));
  const inventory = snapshot.inventory.map((definition) => {
    const stored = pallets.filter(
      (p) => p.skuId === definition.id && p.location === "storage",
    );
    const stock = stored.reduce((n, p) => n + p.quantity, 0);
    const reserved = stored
      .filter((p) =>
        shipments.some(
          (s) =>
            s.id === p.shipmentId &&
            s.direction === "outbound" &&
            s.status !== "departed",
        ),
      )
      .reduce((n, p) => n + p.quantity, 0);
    const available = stock - reserved;
    return {
      ...definition,
      stock,
      reserved,
      available,
      low: available < definition.min,
    };
  });
  return {
    ...snapshot,
    shipments,
    inventory,
    occupiedPallets: pallets.filter((p) => p.location === "storage").length,
  };
}

/** Shared pure rules: a failed command cannot partially change stock or the manifest. */
export function applyWarehouseCommand(
  snapshot: WarehouseSnapshot,
  c: WarehouseCommand,
  occurredAt = new Date().toISOString(),
): WarehouseSnapshot {
  const shipment = snapshot.shipments.find((s) => s.id === c.shipmentId);
  if (!shipment) throw new DomainError("运单不存在", 404);
  let pallets = snapshot.pallets;
  let status = shipment.status;
  const event: WarehouseEvent = {
    id: c.id,
    type: c.type,
    occurredAt,
    shipmentId: shipment.id,
    vehicleId: shipment.vehicleId,
    direction: shipment.direction,
  };
  if (c.type === "confirm_pallet") {
    if (shipment.status !== "handling")
      throw new DomainError("请先开始装卸作业");
    const p = pallets.find((p) => p.id === c.palletId);
    if (!p) throw new DomainError("托盘不存在", 404);
    if (p.shipmentId !== shipment.id || p.skuId !== shipment.skuId)
      throw new DomainError("托盘与当前运单不匹配");
    if (p.confirmed) throw new DomainError("此托盘已确认，请勿重复扫码");
    const expected = shipment.direction === "inbound" ? "truck" : "storage";
    if (p.location !== expected)
      throw new DomainError("托盘当前位置不允许此操作");
    pallets = pallets.map((item) =>
      item.id === p.id
        ? {
            ...item,
            location: expected === "truck" ? "storage" : "truck",
            confirmed: true,
          }
        : item,
    );
    event.palletId = p.id;
    event.skuId = p.skuId;
    event.quantity = p.quantity;
  } else {
    const transition = transitions[c.type];
    if (!transition || status !== transition[0])
      throw new DomainError("当前运单状态不允许此操作");
    if (
      c.type === "dock" &&
      snapshot.shipments.some(
        (s) =>
          s.id !== shipment.id &&
          s.dockId === shipment.dockId &&
          ["docked", "handling", "completed"].includes(s.status),
      )
    )
      throw new DomainError("目标月台已被占用");
    const manifest = pallets.filter((p) => p.shipmentId === shipment.id);
    if (
      c.type === "complete" &&
      (manifest.length !== shipment.total || manifest.some((p) => !p.confirmed))
    )
      throw new DomainError("仍有托盘未确认，无法完成作业");
    status = transition[1];
    if (c.type === "depart" && shipment.direction === "outbound")
      pallets = pallets.map((p) =>
        p.shipmentId === shipment.id && p.location === "truck"
          ? { ...p, location: "departed" }
          : p,
      );
  }
  return projectWarehouseSnapshot({
    ...snapshot,
    revision: snapshot.revision + 1,
    updatedAt: occurredAt,
    shipments: snapshot.shipments.map((s) =>
      s.id === shipment.id ? { ...s, status } : s,
    ),
    pallets,
    events: [event, ...snapshot.events].slice(0, 100),
  });
}
