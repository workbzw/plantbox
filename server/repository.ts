import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SKUS } from "../src/config/catalog.ts";
import { DEMO_TRUCKS } from "../src/config/demo.ts";
import { SITE } from "../src/config/site.ts";
import type {
  InventoryItem,
  Pallet,
  Shipment,
  WarehouseCommand,
  WarehouseEvent,
  WarehouseSnapshot,
} from "../src/domain/warehouse.ts";
export class DomainError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}
const commandTypes = new Set([
  "arrive",
  "dock",
  "start",
  "confirm_pallet",
  "complete",
  "depart",
]);
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
  if (typeof c.type !== "string" || !commandTypes.has(c.type))
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
interface JsonRow {
  data: string;
}
interface ShipmentRow extends JsonRow {
  status: Shipment["status"];
}
interface PalletRow extends JsonRow {
  location: Pallet["location"];
  confirmed: number;
}
/** SQLite is a replaceable persistence adapter; all command rules are enforced in one transaction. */
export class WarehouseRepository {
  private db: DatabaseSync;
  constructor(path: string, seed = false) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, sample_data INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS skus (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shipments (id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pallets (id TEXT PRIMARY KEY, sku_id TEXT NOT NULL REFERENCES skus(id), shipment_id TEXT REFERENCES shipments(id), data TEXT NOT NULL, location TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS pallets_shipment ON pallets(shipment_id);
      CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    `);
    this.db
      .prepare("INSERT OR IGNORE INTO metadata VALUES (1, 1, 0, ?, 0)")
      .run(new Date().toISOString());
    const meta = this.db
      .prepare("SELECT schema_version FROM metadata WHERE id=1")
      .get();
    if (meta?.schema_version !== 1) {
      this.db.close();
      throw new Error("Unsupported database schema version");
    }
    if (seed) this.seedExample();
  }
  private atomic<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  /** Explicit local sample setup. Never resets an existing database. */
  seedExample() {
    this.atomic(() => {
      if (
        Number(this.db.prepare("SELECT count(*) AS n FROM skus").get()!.n) > 0
      )
        return;
      for (const sku of SKUS)
        this.db
          .prepare("INSERT INTO skus VALUES (?, ?)")
          .run(sku.id, JSON.stringify(sku));
      for (const t of DEMO_TRUCKS) {
        const s: Shipment = {
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
        };
        this.db
          .prepare("INSERT INTO shipments VALUES (?, ?, 'expected')")
          .run(s.id, JSON.stringify(s));
        for (let slot = 0; slot < s.total; slot++) {
          const p: Pallet = {
            id: `KLY-${t.dock + 1}-${String(slot + 1).padStart(3, "0")}`,
            skuId: s.skuId,
            quantity: t.units,
            batch: "SAMPLE-001",
            location: t.direction === "inbound" ? "truck" : "storage",
            shipmentId: s.id,
            dockId: s.dockId,
            slot,
            confirmed: false,
          };
          this.insertPallet(p);
        }
      }
      // Additional unallocated stock demonstrates available vs reserved inventory.
      for (const [index, sku] of SKUS.entries()) {
        const p: Pallet = {
          id: `KLY-STOCK-${index + 1}`,
          skuId: sku.id,
          quantity: sku.pallet,
          batch: "SAMPLE-001",
          location: "storage",
          shipmentId: null,
          dockId: SITE.docks[index % SITE.docks.length].id,
          slot: 6 + Math.floor(index / SITE.docks.length),
          confirmed: false,
        };
        this.insertPallet(p);
      }
      this.db
        .prepare(
          "UPDATE metadata SET sample_data=1, revision=revision+1, updated_at=? WHERE id=1",
        )
        .run(new Date().toISOString());
    });
  }
  private insertPallet(p: Pallet) {
    if (!Number.isSafeInteger(p.quantity) || p.quantity <= 0)
      throw new DomainError("托盘数量无效", 400);
    this.db
      .prepare("INSERT INTO pallets VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        p.id,
        p.skuId,
        p.shipmentId,
        JSON.stringify(p),
        p.location,
        Number(p.confirmed),
      );
  }
  private readShipments(): Shipment[] {
    return (
      this.db
        .prepare("SELECT data, status FROM shipments ORDER BY id")
        .all() as unknown as ShipmentRow[]
    ).map((r) => ({ ...(JSON.parse(r.data) as Shipment), status: r.status }));
  }
  private readPallets(): Pallet[] {
    return (
      this.db
        .prepare("SELECT data, location, confirmed FROM pallets ORDER BY id")
        .all() as unknown as PalletRow[]
    ).map((r) => ({
      ...(JSON.parse(r.data) as Pallet),
      location: r.location,
      confirmed: Boolean(r.confirmed),
    }));
  }
  snapshot(): WarehouseSnapshot {
    // A read transaction keeps the revision, manifests and inventory in the same database snapshot.
    this.db.exec("BEGIN");
    try {
      const result = this.readSnapshot();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private readSnapshot(): WarehouseSnapshot {
    const meta = this.db.prepare("SELECT * FROM metadata WHERE id=1").get()!;
    const pallets = this.readPallets();
    const shipments = this.readShipments().map((s) => ({
      ...s,
      completed: pallets.filter((p) => p.shipmentId === s.id && p.confirmed)
        .length,
    }));
    const inventory: InventoryItem[] = (
      this.db
        .prepare("SELECT data FROM skus ORDER BY id")
        .all() as unknown as JsonRow[]
    ).map((r) => {
      const definition = JSON.parse(r.data) as InventoryItem;
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
    const events = (
      this.db
        .prepare("SELECT data FROM events ORDER BY sequence DESC LIMIT 100")
        .all() as unknown as JsonRow[]
    ).map((r) => JSON.parse(r.data) as WarehouseEvent);
    return {
      schemaVersion: 1,
      mode: "live",
      sampleData: Boolean(meta.sample_data),
      revision: Number(meta.revision),
      updatedAt: String(meta.updated_at),
      siteId: SITE.id,
      inventory,
      shipments,
      pallets,
      events,
      occupiedPallets: pallets.filter((p) => p.location === "storage").length,
    };
  }
  execute(input: unknown): WarehouseSnapshot {
    const c = parseCommand(input),
      payload = JSON.stringify(c);
    this.atomic(() => {
      const existing = this.db
        .prepare("SELECT payload FROM commands WHERE id=?")
        .get(c.id);
      if (existing) {
        if (existing.payload !== payload)
          throw new DomainError("操作编号已被其他请求使用");
        return;
      }
      const shipment = this.readShipments().find((s) => s.id === c.shipmentId);
      if (!shipment) throw new DomainError("运单不存在", 404);
      const pallets = this.readPallets();
      const manifest = pallets.filter((p) => p.shipmentId === shipment.id);
      const transitions: Partial<
        Record<
          WarehouseCommand["type"],
          [Shipment["status"], Shipment["status"]]
        >
      > = {
        arrive: ["expected", "arrived"],
        dock: ["arrived", "docked"],
        start: ["docked", "handling"],
        complete: ["handling", "completed"],
        depart: ["completed", "departed"],
      };
      const event: WarehouseEvent = {
        id: c.id,
        type: c.type,
        occurredAt: new Date().toISOString(),
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
        this.db
          .prepare("UPDATE pallets SET location=?, confirmed=1 WHERE id=?")
          .run(expected === "truck" ? "storage" : "truck", p.id);
        event.palletId = p.id;
        event.skuId = p.skuId;
        event.quantity = p.quantity;
      } else {
        const transition = transitions[c.type]!;
        if (shipment.status !== transition[0])
          throw new DomainError("当前运单状态不允许此操作");
        if (
          c.type === "dock" &&
          this.readShipments().some(
            (s) =>
              s.id !== shipment.id &&
              s.dockId === shipment.dockId &&
              ["docked", "handling", "completed"].includes(s.status),
          )
        )
          throw new DomainError("目标月台已被占用");
        if (
          c.type === "complete" &&
          (manifest.length !== shipment.total ||
            manifest.some((p) => !p.confirmed))
        )
          throw new DomainError("仍有托盘未确认，无法完成作业");
        this.db
          .prepare("UPDATE shipments SET status=? WHERE id=?")
          .run(transition[1], shipment.id);
        if (c.type === "depart" && shipment.direction === "outbound")
          this.db
            .prepare(
              "UPDATE pallets SET location='departed' WHERE shipment_id=? AND location='truck'",
            )
            .run(shipment.id);
      }
      this.db
        .prepare("INSERT INTO events(id, data) VALUES (?, ?)")
        .run(c.id, JSON.stringify(event));
      this.db.prepare("INSERT INTO commands VALUES (?, ?)").run(c.id, payload);
      this.db
        .prepare(
          "UPDATE metadata SET revision=revision+1, updated_at=? WHERE id=1",
        )
        .run(event.occurredAt);
    });
    return this.snapshot();
  }
  close() {
    this.db.close();
  }
}
