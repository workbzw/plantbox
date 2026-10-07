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
  WarehouseEvent,
  WarehouseSnapshot,
} from "../src/domain/warehouse.ts";
import {
  applyWarehouseCommand,
  DomainError,
  parseCommand,
  projectWarehouseSnapshot,
} from "../src/domain/commands.ts";
export { DomainError, parseCommand } from "../src/domain/commands.ts";
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
    return projectWarehouseSnapshot({
      schemaVersion: 1,
      mode: "live",
      sampleData: Boolean(meta.sample_data),
      revision: Number(meta.revision),
      updatedAt: String(meta.updated_at),
      siteId: SITE.id,
      inventory: (
        this.db
          .prepare("SELECT data FROM skus ORDER BY id")
          .all() as unknown as JsonRow[]
      ).map((r) => JSON.parse(r.data) as InventoryItem),
      shipments: this.readShipments(),
      pallets: this.readPallets(),
      events: (
        this.db
          .prepare("SELECT data FROM events ORDER BY sequence DESC LIMIT 100")
          .all() as unknown as JsonRow[]
      ).map((r) => JSON.parse(r.data) as WarehouseEvent),
      occupiedPallets: 0,
    });
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
      const before = this.readSnapshot();
      const after = applyWarehouseCommand(before, c);
      const event = after.events[0];
      const shipment = after.shipments.find((s) => s.id === c.shipmentId)!;
      this.db
        .prepare("UPDATE shipments SET status=? WHERE id=?")
        .run(shipment.status, shipment.id);
      for (const p of after.pallets) {
        const previous = before.pallets.find((item) => item.id === p.id)!;
        if (
          p.location !== previous.location ||
          p.confirmed !== previous.confirmed
        )
          this.db
            .prepare("UPDATE pallets SET location=?, confirmed=? WHERE id=?")
            .run(p.location, Number(p.confirmed), p.id);
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
