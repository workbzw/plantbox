import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useWarehouseSource } from "../data/WarehouseProvider";
import { LivePlayback } from "./livePlayback";
const Context = createContext<LivePlayback | null>(null);
export function LivePlaybackProvider({ children }: { children: ReactNode }) {
  const source = useWarehouseSource();
  const playback = useMemo(() => new LivePlayback(), [source]);
  useEffect(() => {
    const sync = () => {
      const s = source.getState().snapshot;
      if (s) playback.ingest(s);
    };
    sync();
    return source.subscribe(sync);
  }, [source, playback]);
  return <Context.Provider value={playback}>{children}</Context.Provider>;
}
export function useLivePlayback() {
  const playback = useContext(Context);
  if (!playback) throw new Error("LivePlaybackProvider is required");
  return playback;
}
export function usePlaybackState() {
  const playback = useLivePlayback();
  return useSyncExternalStore(
    playback.subscribe,
    playback.getState,
    playback.getState,
  );
}
