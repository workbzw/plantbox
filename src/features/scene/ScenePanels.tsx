import {
  Check,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Layers3,
  Map,
  MapPin,
  Package,
  RotateCw,
  ShieldCheck,
  Truck,
  Warehouse,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState } from "react";
import { fmt } from "../../components/format";
import { IconButton, StatSpark } from "../../components/ui";
import { occupiedPallets, phaseAt, trucks } from "../../data/demoSelectors";
import { tr } from "../../i18n";
import { useSimulationStore } from "../../state/simulationStore";
import { useUIStore as useStore } from "../../state/uiStore";
import "../../styles.css";
export function Kpis() {
  useSimulationStore((s) => s.deliveries);
  const time = useSimulationStore((s) => s.time),
    adjustments = useSimulationStore((s) => s.adjustments);
  const onSite = trucks().filter(
    (t) =>
      !["arriving", "transit"].includes(phaseAt(time + t.offset, t.dock).phase),
  ).length;
  const occupied = trucks().filter((t) =>
    ["docking", "loading"].includes(phaseAt(time + t.offset, t.dock).phase),
  ).length;
  const stock = occupiedPallets(time, adjustments);
  return (
    <div className="kpi-row">
      <button
        className="kpi-card"
        onClick={() => useStore.getState().setPage("inventory")}
      >
        <span className="kpi-caption">
          <Package size={15} />
          {tr("实物库存")}
          <ChevronRight size={13} />
        </span>
        <div className="kpi-number">
          {fmt(stock)}
          <span>{tr("托盘")}</span>
        </div>
        <div className="kpi-bottom">
          <span className="positive">
            ↑ {((stock / 1250 - 1) * 100).toFixed(1)}%
          </span>
          <span>{tr("较昨日")}</span>
          <StatSpark />
        </div>
      </button>
      <button
        className="kpi-card"
        onClick={() => useStore.getState().setCamera("dock")}
      >
        <span className="kpi-caption">
          <Warehouse size={15} />
          {tr("作业月台")}
          <ChevronRight size={13} />
        </span>
        <div className="kpi-number">
          {String(occupied).padStart(2, "0")}
          <span>/ 03</span>
        </div>
        <div className="kpi-bottom">
          <span className="mini-bars">
            {[0, 1, 2].map((i) => (
              <i key={i} className={i < occupied ? "filled" : ""} />
            ))}
          </span>
          <span>
            {occupied}
            {tr("个正在作业")}
          </span>
        </div>
      </button>
      <button
        className="kpi-card"
        onClick={() => useStore.getState().setPage("shipments")}
      >
        <span className="kpi-caption">
          <Truck size={15} />
          {tr("场内车辆")}
          <ChevronRight size={13} />
        </span>
        <div className="kpi-number">
          {String(onSite).padStart(2, "0")}
          <span>{tr("辆")}</span>
        </div>
        <div className="kpi-bottom">
          <span className="small-dot blue" />
          <span>
            {tr("今日已出库")}
            {23 + Math.floor(time / 240) * 3}
            {tr("辆")}
          </span>
        </div>
      </button>
      <div className="kpi-card">
        <span className="kpi-caption">
          <ShieldCheck size={15} />
          {tr("准时交付率")}
        </span>
        <div className="kpi-number">
          98.6<span>%</span>
        </div>
        <div className="kpi-bottom">
          <span className="positive">↑ 2.1%</span>
          <span>{tr("近 30 天")}</span>
          <StatSpark />
        </div>
      </div>
    </div>
  );
}

export function CameraTools() {
  const roofOpen = useStore((s) => s.roofOpen),
    labels = useStore((s) => s.labels);
  const [views, setViews] = useState(false);
  return (
    <div className="camera-area">
      <div className="view-buttons">
        <button className="view-picker" onClick={() => setViews(!views)}>
          <Map size={15} />
          {
            {
              overview: tr("园区视角"),
              dock: tr("月台视角"),
              storage: tr("堆场视角"),
              top: tr("俯视视角"),
              interior: tr("仓内视角"),
            }[useStore((s) => s.camera.view)]
          }
          <ChevronDown size={13} />
        </button>
        {views && (
          <div className="view-menu">
            {(
              [
                ["overview", tr("园区全景")],
                ["dock", tr("装卸月台")],
                ["storage", tr("集装箱堆场")],
                ["top", tr("垂直俯视")],
                ["interior", tr("仓库内部")],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                onClick={() => {
                  useStore.getState().setCamera(id);
                  setViews(false);
                }}
              >
                <MapPin size={14} />
                {name}
              </button>
            ))}
          </div>
        )}
        <button
          className={`roof-button ${roofOpen ? "active" : ""}`}
          onClick={() => useStore.getState().toggleRoof()}
        >
          <Layers3 size={15} />
          {roofOpen ? tr("合上屋顶") : tr("查看仓内")}
        </button>
      </div>
      <div className="camera-tools">
        <IconButton
          icon={ZoomIn}
          label={tr("放大场景")}
          onClick={() => useStore.getState().zoomCamera(1)}
        />
        <IconButton
          icon={ZoomOut}
          label={tr("缩小场景")}
          onClick={() => useStore.getState().zoomCamera(-1)}
        />
        <span />
        <IconButton
          icon={RotateCw}
          label={tr("旋转 90 度")}
          onClick={() => useStore.getState().rotateCamera()}
        />
        <IconButton
          icon={Crosshair}
          label={tr("重置为园区全景")}
          onClick={() => useStore.getState().setCamera("overview")}
        />
        <span />
        <IconButton
          icon={MapPin}
          label={labels ? tr("隐藏场景标签") : tr("显示场景标签")}
          active={labels}
          onClick={() => useStore.getState().toggleLabels()}
        />
      </div>
    </div>
  );
}

export function MiniMap() {
  return (
    <button
      className="minimap"
      onClick={() => useStore.getState().setCamera("top")}
      aria-label={tr("切换到园区俯视图")}
      title={tr("查看园区俯视图")}
    >
      <span>
        <Crosshair size={11} />
        {tr("园区导览")}
      </span>
      <svg viewBox="0 0 156 92" aria-hidden="true">
        <rect x="3" y="4" width="148" height="80" rx="4" fill="#e2e9e7" />
        <path d="M4 70H151M26 4V85" stroke="#b9c7ce" strokeWidth="8" />
        <path
          d="M4 70H150"
          stroke="white"
          strokeWidth="1"
          strokeDasharray="5 4"
        />
        <rect x="37" y="12" width="68" height="34" rx="2" fill="#6c8bc2" />
        <rect x="108" y="16" width="14" height="25" rx="1" fill="#8daba9" />
        <path
          d="M46 49v13M70 49v13M93 49v13"
          stroke="#c6a76c"
          strokeWidth="5"
        />
        <path
          d="M18 59 78 28 130 56Z"
          fill="#4d75e3"
          opacity=".11"
          stroke="#4472df"
          strokeWidth="1"
        />
        <circle
          cx="79"
          cy="45"
          r="4"
          fill="#2a59d9"
          stroke="white"
          strokeWidth="2"
        />
      </svg>
      <i>N ↑</i>
    </button>
  );
}

export function OperationTimeline() {
  useSimulationStore((s) => s.deliveries);
  const selected = useStore((s) => s.selected),
    time = useSimulationStore((s) => s.time);
  const truck =
    trucks().find((t) => selected.kind === "truck" && selected.id === t.id) ??
    trucks()[0];
  const info = phaseAt(time + truck.offset, truck.dock);
  const phaseIndex = {
    arriving: 0,
    docking: 1,
    loading: 2,
    departing: 3,
    transit: 4,
  }[info.phase];
  const steps = [
    tr("车辆入园"),
    tr("月台就位"),
    truck.direction === "inbound" ? tr("货物卸载") : tr("货物装载"),
    tr("离场确认"),
    tr("运输配送"),
  ];
  return (
    <div className="operation-bar">
      <div className="operation-title">
        <span className="operation-icon">
          <Truck size={22} />
        </span>
        <div>
          <strong>
            {tr("正在追踪")}
            <span>{truck.id}</span>
          </strong>
          <small>
            {truck.shipment} <span>·</span> {truck.destination}
          </small>
        </div>
        <button
          aria-label={tr("查看当前运单")}
          onClick={() => {
            useStore.getState().select({ kind: "truck", id: truck.id });
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="timeline">
        {steps.map((step, i) => (
          <div
            key={step}
            className={`timeline-step ${i < phaseIndex ? "complete" : ""} ${i === phaseIndex ? "current" : ""}`}
          >
            <div className="timeline-dot">
              {i < phaseIndex ? (
                <Check size={11} />
              ) : i === phaseIndex ? (
                <span />
              ) : null}
            </div>
            <strong>{step}</strong>
            <small>
              {i < phaseIndex
                ? tr("已完成")
                : i === phaseIndex
                  ? info.phase === "loading"
                    ? tr("{0} / 6 托盘", { 0: info.completed })
                    : tr("进行中")
                  : tr("待开始")}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
