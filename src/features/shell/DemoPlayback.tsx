import { Pause, Play } from "lucide-react";
import { latestMovements } from "../../data/demoSelectors";
import { tr } from "../../i18n";
import { formatClock } from "../../simulation";
import { useSimulationStore } from "../../state/simulationStore";
import "../../styles.css";
export function DemoPlayback() {
  const time = useSimulationStore((s) => s.time),
    paused = useSimulationStore((s) => s.paused),
    speed = useSimulationStore((s) => s.speed);
  useSimulationStore((s) => s.deliveries);
  const latest = latestMovements(time)[0];
  return (
    <div className="simulation-controls">
      <div className="event-ticker">
        <span className="event-dot" />
        <span>
          {latest
            ? tr("{0} {1} · {2} {3} 件", {
                0: latest.truck,
                1: latest.inbound ? tr("完成入库") : tr("完成装车"),
                2: latest.sku,
                3: latest.amount,
              })
            : tr("所有设备已就绪，等待作业任务")}
        </span>
        <time>{latest ? formatClock(latest.time) : formatClock(time)}</time>
      </div>
      <div className="playback">
        <button
          onClick={() => useSimulationStore.getState().togglePause()}
          aria-label={paused ? tr("继续模拟") : tr("暂停模拟")}
        >
          {paused ? (
            <Play size={13} fill="currentColor" />
          ) : (
            <Pause size={13} fill="currentColor" />
          )}
        </button>
        <span>{tr("模拟")}</span>
        {[1, 5, 10].map((v) => (
          <button
            key={v}
            aria-label={tr("{0} 倍速", { 0: v })}
            className={speed === v ? "active" : ""}
            onClick={() => useSimulationStore.getState().setSpeed(v)}
          >
            {v}×
          </button>
        ))}
      </div>
    </div>
  );
}
