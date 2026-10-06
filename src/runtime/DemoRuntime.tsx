import { useEffect } from "react";
import { tr } from "../i18n";
import { DEMO_END } from "../simulation";
import { useSimulationStore } from "../state/simulationStore";
import { useUIStore } from "../state/uiStore";
/** Lifecycle belongs to the demo route, independent of which dashboard is visible. */
export function DemoRuntime() {
  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const before = useSimulationStore.getState().time;
      useSimulationStore.getState().tick(Math.min((now - last) / 1000, 0.5));
      last = now;
      if (before < DEMO_END && useSimulationStore.getState().time === DEMO_END)
        useUIStore
          .getState()
          .notify(tr("30 分钟作业场景已演示完成，可在设置中重置后再次运行。"));
    }, 100);
    return () => clearInterval(timer);
  }, []);
  return null;
}
export function resetDemo() {
  useSimulationStore.getState().reset();
  useUIStore.getState().resetView();
  useUIStore.getState().notify(tr("模拟已恢复初始状态"));
}
