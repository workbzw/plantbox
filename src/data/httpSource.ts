import type {
  WarehouseCommand,
  WarehouseSnapshot,
} from "../domain/warehouse.ts";
import { API_VERSION } from "../domain/warehouse.ts";
import type { SourceState, WarehouseDataSource } from "./source.ts";
/** Polling recovers from missed updates by fetching an authoritative complete snapshot. */
export function createHttpSource(
  options: { baseUrl?: string; token?: string; interval?: number } = {},
): WarehouseDataSource {
  const base = options.baseUrl ?? "/api/v1";
  let state: SourceState = {
    snapshot: null,
    connection: "loading",
    error: null,
  };
  let running = false,
    generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const headers = () => ({
    "Content-Type": "application/json",
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  });
  const publish = (next: SourceState) => {
    state = next;
    listeners.forEach((fn) => fn());
  };
  const accept = (value: unknown) => {
    const s = value as WarehouseSnapshot;
    if (
      !s ||
      s.schemaVersion !== API_VERSION ||
      s.mode !== "live" ||
      !Number.isSafeInteger(s.revision) ||
      !Array.isArray(s.inventory) ||
      !Array.isArray(s.shipments) ||
      !Array.isArray(s.pallets) ||
      !Array.isArray(s.events)
    )
      throw new Error("后台数据格式不兼容");
    // Ignore an older in-flight response arriving after a successful command.
    if (!state.snapshot || s.revision >= state.snapshot.revision)
      publish({ snapshot: s, connection: "connected", error: null });
  };
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(base + path, {
      ...init,
      headers: headers(),
      cache: "no-store",
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        (value as { error?: string })?.error ?? `HTTP ${response.status}`,
      );
    return value;
  }
  function refresh(): Promise<void> {
    if (pending) return pending;
    const current = generation;
    const requestController = new AbortController();
    controller = requestController;
    const timeout = setTimeout(() => requestController.abort(), 8000);
    pending = (async () => {
      try {
        const value = await request("/snapshot", {
          signal: requestController.signal,
        });
        if (current === generation) accept(value);
      } catch (error) {
        if (current === generation)
          publish({
            ...state,
            connection: "offline",
            error: error instanceof Error ? error.message : "后台连接失败",
          });
      } finally {
        clearTimeout(timeout);
        if (current === generation) pending = undefined;
      }
    })();
    return pending;
  }
  async function poll() {
    const current = generation;
    await refresh();
    if (running && current === generation)
      timer = setTimeout(() => void poll(), options.interval ?? 2000);
  }
  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start: () => {
      running = true;
      generation++;
      void poll();
      return () => {
        running = false;
        generation++;
        clearTimeout(timer);
        controller?.abort();
        pending = undefined;
      };
    },
    refresh,
    execute: async (command: WarehouseCommand) => {
      const current = generation;
      const value = await request("/commands", {
        method: "POST",
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(10000),
      });
      if (current === generation) accept(value);
    },
  };
}
