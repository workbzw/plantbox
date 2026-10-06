import { Pause, Play } from "lucide-react";
import { tr } from "../../i18n";
import {
  useLivePlayback,
  usePlaybackState,
} from "../../runtime/LivePlaybackProvider";
import { useUIStore } from "../../state/uiStore";
export function PlaybackControls({
  sceneVisible,
  onWatch,
}: {
  sceneVisible: boolean;
  onWatch: () => void;
}) {
  const playback = useLivePlayback(),
    view = usePlaybackState();
  const page = useUIStore((s) => s.page);
  return (
    <div className="live-playback-controls" aria-label={tr("作业动画")}>
      <div className="playback-summary" role="status">
        <span className={`small-dot ${view.pending ? "blue" : "green"}`} />
        <span>
          {tr(
            !sceneVisible && view.pending
              ? page === "scene"
                ? "动画已保留，切到场景继续"
                : "动画已保留，返回园区继续"
              : view.paused
                ? "动画已暂停"
                : view.label,
          )}
        </span>
        {view.pending > 0 && (
          <b>{tr("剩余 {0} 个动作", { 0: view.pending })}</b>
        )}
      </div>
      <div className="playback-actions">
        {!sceneVisible && view.pending > 0 && (
          <button className="text-button" onClick={onWatch}>
            {tr("观看动画")}
          </button>
        )}
        <button
          className="icon-button"
          aria-label={tr(view.paused ? "继续动画" : "暂停动画")}
          onClick={() => playback.setPaused(!view.paused)}
        >
          {view.paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <select
          aria-label={tr("动画速度")}
          value={view.speed}
          onChange={(e) => playback.setSpeed(Number(e.target.value))}
        >
          {[1, 2, 4].map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
