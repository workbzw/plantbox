import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { WarehouseDataSource } from "./source";
const Context = createContext<WarehouseDataSource | null>(null);
export function WarehouseProvider({
  source,
  children,
}: {
  source: WarehouseDataSource;
  children: ReactNode;
}) {
  useEffect(() => source.start(), [source]);
  return <Context.Provider value={source}>{children}</Context.Provider>;
}
export function useWarehouseSource() {
  const source = useContext(Context);
  if (!source) throw new Error("WarehouseProvider is required");
  return source;
}
export function useWarehouseState() {
  const source = useWarehouseSource();
  return useSyncExternalStore(
    source.subscribe,
    source.getState,
    source.getState,
  );
}
export function useWarehouseSnapshot() {
  const { snapshot } = useWarehouseState();
  if (!snapshot)
    throw new Error(
      "A warehouse snapshot must be loaded before rendering data views",
    );
  return snapshot;
}
