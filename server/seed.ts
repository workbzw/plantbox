import { resolve } from "node:path";
import { WarehouseRepository } from "./repository.ts";
const repository = new WarehouseRepository(
  resolve(process.env.PLANTBOX_DB ?? "data/warehouse.sqlite"),
);
repository.seedExample();
console.log("Example warehouse initialized; existing data was preserved.");
repository.close();
