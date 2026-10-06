import { tr } from "./i18n";
import { currentLocale, routeHref } from "./routing";
import type { Locale } from "./routing";
import { ProjectMenu, LanguageSwitch } from "./WebsiteNav";
import "./styles.css";
import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Box,
  Boxes,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Container,
  Crosshair,
  Expand,
  Forklift,
  Layers3,
  LayoutDashboard,
  Map,
  MapPin,
  MoreHorizontal,
  MousePointer2,
  Package,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Warehouse,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useStore } from "./store";
import type { Page } from "./store";
import {
  formatClock,
  handledPallets as deriveHandledPallets,
  inventoryAt as deriveInventoryAt,
  latestMovements as deriveLatestMovements,
  occupiedPallets as deriveOccupiedPallets,
  phaseAt as derivePhaseAt,
  phaseLabel as derivePhaseLabel,
  SKUS as sourceSkus,
  TRUCKS as sourceTrucks,
} from "./simulation";
import type { Selection } from "./simulation";
import { forkliftPose, handlingLabels, palletId } from "./forkliftMotion";
const localizedSku = <
  T extends { name: string; category: string; unit: string },
>(
  s: T,
): T => ({
  ...s,
  name: tr(s.name),
  category: tr(s.category),
  unit: tr(s.unit),
});
const skus = () => sourceSkus.map(localizedSku);
const trucks = () =>
  sourceTrucks.map((truck) => ({
    ...truck,
    plate: tr(truck.plate),
    carrier: tr(truck.carrier),
    driver: tr(truck.driver),
    destination: tr(truck.destination),
  }));
const phaseLabel = (...args: Parameters<typeof derivePhaseLabel>) =>
  tr(derivePhaseLabel(...args));
const ledger = () => useStore.getState().deliveries;
const phaseAt = (time: number, dock = 0) => derivePhaseAt(time, dock, ledger());
const handledPallets = (time: number, dock = 0) =>
  deriveHandledPallets(time, dock, ledger());
const inventoryAt = (time: number, adjustments: Record<string, number> = {}) =>
  deriveInventoryAt(time, adjustments, ledger()).map(localizedSku);
const occupiedPallets = (
  time: number,
  adjustments: Record<string, number> = {},
) => deriveOccupiedPallets(time, adjustments, ledger());
const latestMovements = (time: number) =>
  deriveLatestMovements(time, ledger()).map((event) => ({
    ...event,
    sku: tr(event.sku),
  }));
const Scene = lazy(() => import("./Scene"));

function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.7} />
    </button>
  );
}
function Status({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "blue" | "orange" | "gray";
}) {
  return (
    <span className={`status status-${tone}`}>
      <i />
      {children}
    </span>
  );
}
function StatSpark({ down = false }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 90 30"
      aria-hidden="true"
      className={`spark ${down ? "muted" : ""}`}
    >
      <path
        d="M1 25 12 18 22 20 32 12 42 14 51 9 62 12 74 5 88 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M1 25 12 18 22 20 32 12 42 14 51 9 62 12 74 5 88 6 V30 H1Z"
        fill="currentColor"
        opacity=".08"
      />
    </svg>
  );
}
const localeSeparator = () => (currentLocale() === "zh" ? "、" : ", ");
const fmt = (n: number) => n.toLocaleString("en-US");

class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-loading">
        <Box size={38} />
        <strong>{tr("3D 场景暂时无法启动")}</strong>
        <p>{tr("请确认浏览器已启用硬件加速，然后重试。")}</p>
        <button className="primary-button" onClick={() => location.reload()}>
          {tr("重新加载")}
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

function Kpis() {
  const time = useStore((s) => s.time),
    adjustments = useStore((s) => s.adjustments);
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

function CameraTools() {
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

function MiniMap() {
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

function OperationTimeline() {
  const selected = useStore((s) => s.selected),
    time = useStore((s) => s.time);
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

function DockList() {
  const time = useStore((s) => s.time),
    selected = useStore((s) => s.selected);
  return (
    <div className="dock-list">
      {trucks().map((t, i) => {
        const info = phaseAt(time + t.offset, t.dock),
          active = ["docking", "loading"].includes(info.phase);
        return (
          <button
            key={t.id}
            className={`dock-row ${selected.kind === "truck" && selected.id === t.id ? "selected" : ""}`}
            onClick={() => {
              useStore.getState().select({ kind: "truck", id: t.id });
              useStore.getState().setCamera("dock");
            }}
          >
            <span className={`dock-number ${active ? "busy" : ""}`}>
              0{i + 1}
            </span>
            <span className="dock-info">
              <strong>
                {t.id}
                <span>
                  {t.direction === "inbound" ? tr("入库") : tr("出库")}
                </span>
              </strong>
              <small>
                {active
                  ? tr("{0} · {1}/6 托盘", {
                      0: phaseLabel(info.phase, t.direction === "inbound"),
                      1: info.completed,
                    })
                  : phaseLabel(info.phase)}
              </small>
              <span className="thin-progress">
                <i
                  style={{
                    width: `${info.phase === "loading" ? info.progress * 100 : 0}%`,
                  }}
                />
              </span>
            </span>
            <ChevronRight size={15} />
          </button>
        );
      })}
    </div>
  );
}

function SiteDetails() {
  const time = useStore((s) => s.time),
    adjustments = useStore((s) => s.adjustments);
  const inventory = inventoryAt(time, adjustments),
    low = inventory.filter((s) => s.low);
  const stock = occupiedPallets(time, adjustments);
  return (
    <>
      <div className="site-identity">
        <span className="site-avatar">
          <Warehouse size={26} strokeWidth={1.5} />
        </span>
        <div>
          <span className="eyebrow">WAREHOUSE · WH-01</span>
          <h2>{tr("昆仑元仓储中心")}</h2>
          <p>
            <MapPin size={12} />
            {tr("上海 · 昆仑元物流园")}
          </p>
        </div>
      </div>
      <div className="site-state">
        <Status>{tr("运行正常")}</Status>
        <span>
          <Clock3 size={12} />
          07:00 – 22:00
        </span>
      </div>
      <div className="capacity">
        <div>
          <span>{tr("库容使用率")}</span>
          <strong>
            {((stock / 1800) * 100).toFixed(1)}
            <small>%</small>
          </strong>
        </div>
        <div className="capacity-bar">
          <i style={{ width: `${(stock / 1800) * 100}%` }} />
        </div>
        <p>
          <span>
            <b>{fmt(stock)}</b>
            {tr("/ 1,800 托盘位")}
          </span>
          <span>
            {tr("余量")}
            {fmt(1800 - stock)}
          </span>
        </p>
      </div>
      <div className="section-heading">
        <h3>
          {tr("装卸月台")}
          <span>03</span>
        </h3>
        <button onClick={() => useStore.getState().setCamera("dock")}>
          {tr("聚焦月台")}
          <Crosshair size={13} />
        </button>
      </div>
      <DockList />
      <div className="section-heading equipment-heading">
        <h3>{tr("作业设备")}</h3>
        <span className="muted">{tr("在线 3 / 3")}</span>
      </div>
      <div className="forklift-list">
        {trucks().map((t, i) => (
          <button
            key={t.id}
            onClick={() => {
              useStore
                .getState()
                .select({ kind: "forklift", id: `FL-0${i + 1}` });
              useStore.getState().setCamera("dock");
            }}
          >
            <span className="equipment-icon">
              <Forklift size={18} />
            </span>
            <div>
              <strong>FL-0{i + 1}</strong>
              <small>
                {tr(
                  handlingLabels[forkliftPose(time + t.offset, t.dock).stage],
                )}
              </small>
            </div>
            <span className="battery">
              <span>
                <i style={{ width: `${86 - i * 13}%` }} />
              </span>
              {86 - i * 13}%
            </span>
          </button>
        ))}
      </div>
      {low.length > 0 && (
        <button
          className="stock-alert"
          onClick={() => useStore.getState().setPage("inventory")}
        >
          <span className="alert-symbol">!</span>
          <div>
            <strong>
              {low.length}
              {tr("项库存需要关注")}
            </strong>
            <small>
              {low.map((s) => s.name).join(localeSeparator())}
              {tr("低于补货点")}
            </small>
          </div>
          <ChevronRight size={15} />
        </button>
      )}
    </>
  );
}

function ObjectDetails() {
  const selected = useStore((s) => s.selected),
    time = useStore((s) => s.time);
  const [plan, setPlan] = useState(false);
  const [count, setCount] = useState(12);
  const palletDock =
    selected.kind === "pallet" ? Number(selected.id.split("-")[1]) - 1 : -1;
  const truck =
    trucks()[palletDock] ??
    trucks().find((t) => t.id === selected.id) ??
    trucks()[Math.max(0, Number(selected.id.slice(-1)) - 1) % 3];
  const info = phaseAt(time + truck.offset, truck.dock);
  const forklift = forkliftPose(time + truck.offset, truck.dock);
  const kindNames = {
    site: tr("仓储站点"),
    truck: tr("运输车辆"),
    forklift: tr("作业叉车"),
    container: tr("集装箱"),
    pallet: tr("货物托盘"),
  };
  const Icon =
    selected.kind === "truck"
      ? Truck
      : selected.kind === "forklift"
        ? Forklift
        : selected.kind === "pallet"
          ? Package
          : Container;
  return (
    <>
      <button
        className="back-link"
        onClick={() =>
          useStore.getState().select({ kind: "site", id: "WH-01" })
        }
      >
        <ArrowLeft size={14} />
        {tr("返回站点概览")}
      </button>
      <div className="object-hero">
        <span className={`object-illustration ${selected.kind}`}>
          <Icon size={70} strokeWidth={1.05} />
        </span>
        <span className="object-kind">{kindNames[selected.kind]}</span>
        <h2>{selected.id}</h2>
        <Status tone={selected.kind === "container" ? "blue" : "green"}>
          {selected.kind === "container"
            ? tr("堆场就绪")
            : selected.kind === "forklift"
              ? tr(handlingLabels[forklift.stage])
              : selected.kind === "pallet"
                ? tr("独立货物托盘")
                : phaseLabel(info.phase, truck.direction === "inbound")}
        </Status>
      </div>
      {selected.kind === "truck" ? (
        <>
          <div className="detail-facts">
            <div>
              <span>{tr("承运商")}</span>
              <strong>{truck.carrier}</strong>
            </div>
            <div>
              <span>{tr("车牌号码")}</span>
              <strong>{truck.plate}</strong>
            </div>
            <div>
              <span>{tr("驾驶员")}</span>
              <strong>{truck.driver}</strong>
            </div>
            <div>
              <span>{tr("装卸月台")}</span>
              <strong>A0{truck.dock + 1}</strong>
            </div>
            <div>
              <span>{tr("关联运单")}</span>
              <strong className="blue-text">{truck.shipment}</strong>
            </div>
            <div>
              <span>{tr("目的地")}</span>
              <strong>{truck.destination}</strong>
            </div>
          </div>
          <div className="load-progress">
            <div>
              <strong>
                {truck.direction === "inbound" ? tr("卸货") : tr("装载")}
                {tr("进度")}
              </strong>
              <span>
                {info.completed}
                {tr("/ 6 托盘")}
              </span>
            </div>
            <div className="load-segments">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} className={i < info.completed ? "filled" : ""} />
              ))}
            </div>
            <small>
              {skus()[truck.sku].name}
              {tr("· 每托盘")}
              {truck.units} {skus()[truck.sku].unit}
            </small>
          </div>
          <button
            className="primary-button full"
            onClick={() => useStore.getState().setCamera("dock")}
          >
            <Crosshair size={16} />
            {tr("聚焦作业区域")}
          </button>
          <button
            className="secondary-button full"
            onClick={() => useStore.getState().setPage("shipments")}
          >
            {tr("查看全部运单")}
            <ChevronRight size={15} />
          </button>
        </>
      ) : selected.kind === "forklift" ? (
        <>
          <div className="detail-facts">
            <div>
              <span>{tr("当前任务")}</span>
              <strong>{tr(handlingLabels[forklift.stage])}</strong>
            </div>
            <div>
              <span>{tr("当前货物")}</span>
              <strong>
                {info.phase === "loading"
                  ? palletId(truck.dock, forklift.cycle, forklift.job)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>{tr("搬运方式")}</span>
              <strong>{tr("后轮转向 · 低位运输")}</strong>
            </div>
            <div>
              <span>{tr("服务车辆")}</span>
              <strong>{truck.id}</strong>
            </div>
            <div>
              <span>{tr("关联月台")}</span>
              <strong>A0{truck.dock + 1}</strong>
            </div>
            <div>
              <span>{tr("电池电量")}</span>
              <strong>{86 - truck.dock * 13}%</strong>
            </div>
            <div>
              <span>{tr("额定载重")}</span>
              <strong>2,500 kg</strong>
            </div>
            <div>
              <span>{tr("当日搬运")}</span>
              <strong>
                {18 + handledPallets(time + truck.offset, truck.dock)}
                {tr("托盘")}
              </strong>
            </div>
          </div>
          <button
            className="primary-button full"
            onClick={() => useStore.getState().setCamera("dock")}
          >
            <Crosshair size={16} />
            {tr("聚焦作业区域")}
          </button>
        </>
      ) : selected.kind === "pallet" ? (
        <>
          <div className="detail-facts">
            <div>
              <span>{tr("货品")}</span>
              <strong>{skus()[truck.sku].name}</strong>
            </div>
            <div>
              <span>{tr("运输叉车")}</span>
              <strong>FL-0{truck.dock + 1}</strong>
            </div>
            <div>
              <span>{tr("关联车辆")}</span>
              <strong>{truck.id}</strong>
            </div>
            <div>
              <span>{tr("托盘规格")}</span>
              <strong>800 × 1200 mm</strong>
            </div>
            <div>
              <span>{tr("处理方式")}</span>
              <strong>
                {truck.direction === "inbound"
                  ? tr("卸车后保留在收货位")
                  : tr("装车后保留，随车离场")}
              </strong>
            </div>
            <div>
              <span>{tr("载荷支承")}</span>
              <strong>{tr("地面 / 货叉 / 货位接触")}</strong>
            </div>
          </div>
          <button
            className="primary-button full"
            onClick={() =>
              useStore
                .getState()
                .select({ kind: "forklift", id: `FL-0${truck.dock + 1}` })
            }
          >
            {tr("查看搬运叉车")}
          </button>
        </>
      ) : (
        <>
          <div className="detail-facts">
            <div>
              <span>{tr("规格")}</span>
              <strong>{tr("20 英尺标准箱")}</strong>
            </div>
            <div>
              <span>{tr("内部尺寸")}</span>
              <strong>5.90 × 2.35 × 2.39 m</strong>
            </div>
            <div>
              <span>{tr("可用容积")}</span>
              <strong>33.1 m³</strong>
            </div>
            <div>
              <span>{tr("存放区域")}</span>
              <strong>
                {tr("C 区 · 0")}
                {selected.id.slice(-1)}
                {tr("号位")}
              </strong>
            </div>
          </div>
          <button
            className="primary-button full"
            onClick={() => {
              setPlan(!plan);
              useStore.getState().setCamera("storage");
            }}
          >
            <Boxes size={16} />
            {plan ? tr("收起装载估算") : tr("估算装载容量")}
          </button>
          {plan && (
            <div className="packing-plan">
              <strong>{tr("标准纸箱装载估算")}</strong>
              <label>
                {tr("托盘数量")}
                <input
                  aria-label={tr("估算托盘数量")}
                  type="number"
                  min="1"
                  max="20"
                  value={count}
                  onChange={(e) =>
                    setCount(
                      Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                    )
                  }
                />
              </label>
              <div>
                <span>{tr("预计体积")}</span>
                <b>{(count * 1.44).toFixed(2)} m³</b>
              </div>
              <div>
                <span>{tr("容积使用率")}</span>
                <b>{(((count * 1.44) / 33.1) * 100).toFixed(1)}%</b>
              </div>
              <div className="capacity-bar">
                <i style={{ width: `${((count * 1.44) / 33.1) * 100}%` }} />
              </div>
              <p>
                {tr(
                  "按 1.2 × 1.0 × 1.2 m 标准货物估算，仅用于容量预览；实际排布需考虑尺寸与承重。",
                )}
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Inspector({ onClose }: { onClose: () => void }) {
  const selected = useStore((s) => s.selected);
  return (
    <aside className="inspector">
      <div className="inspector-top">
        <span>
          <span className="small-dot blue" />
          {tr("站点控制中心")}
        </span>
        <button
          className="inspector-close"
          aria-label={tr("关闭站点详情")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <IconButton
          icon={MoreHorizontal}
          label={tr("打开站点设置")}
          onClick={() =>
            useStore
              .getState()
              .notify(
                tr(
                  "园区模拟运行中 · 3 个月台 · 3 台叉车 · 数据每次搬运后同步更新",
                ),
              )
          }
        />
      </div>
      <div className="inspector-scroll">
        {selected.kind === "site" ? (
          <SiteDetails />
        ) : (
          <ObjectDetails key={`${selected.kind}-${selected.id}`} />
        )}
      </div>
      <div className="inspector-footer">
        <span>
          <ShieldCheck size={13} />
          {tr("设备与库存状态已同步")}
        </span>
        <span>{tr("本地模拟")}</span>
      </div>
    </aside>
  );
}

function InventoryPage() {
  const time = useStore((s) => s.time),
    adjustments = useStore((s) => s.adjustments);
  const [query, setQuery] = useState(""),
    [onlyLow, setOnlyLow] = useState(false);
  const rows = inventoryAt(time, adjustments),
    filtered = rows.filter(
      (s) =>
        (!onlyLow || s.low) &&
        `${s.id}${s.name}${s.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  return (
    <div className="data-page">
      <div className="data-title">
        <div>
          <span className="eyebrow">INVENTORY MANAGEMENT</span>
          <h1>{tr("库存管理")}</h1>
          <p>
            {tr("昆仑元仓储中心")}
            <span> / </span>
            {tr("每一次流转，都清晰可见")}
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => useStore.getState().setPage("scene")}
        >
          <Map size={16} />
          {tr("返回园区")}
        </button>
      </div>
      <div className="data-stats">
        <div>
          <span>{tr("商品种类")}</span>
          <strong>
            {rows.length}
            <small>SKU</small>
          </strong>
        </div>
        <div>
          <span>{tr("实物库存")}</span>
          <strong>
            {fmt(rows.reduce((a, r) => a + r.stock, 0))}
            <small>{tr("件 / 个 / 卷")}</small>
          </strong>
        </div>
        <div>
          <span>{tr("已预留")}</span>
          <strong>
            {fmt(rows.reduce((a, r) => a + r.reserved, 0))}
            <small>{tr("待出库")}</small>
          </strong>
        </div>
        <div>
          <span>{tr("库存预警")}</span>
          <strong className="orange-text">
            {rows.filter((s) => s.low).length}
            <small>{tr("项待关注")}</small>
          </strong>
        </div>
      </div>
      <div className="table-panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={17} />
            <input
              aria-label={tr("搜索库存")}
              placeholder={tr("搜索商品名称、SKU 或分类")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className={`filter-button ${onlyLow ? "active" : ""}`}
            onClick={() => setOnlyLow(!onlyLow)}
          >
            <SlidersHorizontal size={15} />
            {onlyLow ? tr("仅显示库存预警") : tr("全部库存")}
            <ChevronDown size={13} />
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tr("商品 / SKU")}</th>
                <th>{tr("存放库位")}</th>
                <th>{tr("实物库存")}</th>
                <th>{tr("已预留")}</th>
                <th>{tr("可用库存")}</th>
                <th>{tr("库存状态")}</th>
                <th>{tr("操作")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="product-cell">
                      <span style={{ color: r.color }}>
                        <Package size={24} />
                      </span>
                      <div>
                        <strong>{r.name}</strong>
                        <small>
                          {r.id} · {r.category}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="location-tag">{r.location}</span>
                  </td>
                  <td className="number">{fmt(r.stock)}</td>
                  <td className="number muted">{fmt(r.reserved)}</td>
                  <td className="number">
                    <strong>{fmt(r.available)}</strong>
                  </td>
                  <td>
                    <Status tone={r.low ? "orange" : "green"}>
                      {r.low ? tr("库存偏低") : tr("库存充足")}
                    </Status>
                  </td>
                  <td>
                    {r.low ? (
                      <button
                        className="text-button"
                        onClick={() =>
                          useStore.getState().replenish(r.id, r.pallet * 6)
                        }
                      >
                        {tr("模拟补货")}
                        <Plus size={13} />
                      </button>
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => {
                          useStore.getState().setPage("scene");
                          useStore.getState().setCamera("interior");
                        }}
                      >
                        {tr("查看库区")}
                        <Crosshair size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty-state">
              <Search size={28} />
              <strong>{tr("没有找到匹配的商品")}</strong>
              <span>{tr("试试其他名称，或切换为全部库存。")}</span>
            </div>
          )}
        </div>
        <div className="table-footer">
          <span>
            {tr("共")}
            {filtered.length}
            {tr("项商品")}
          </span>
          <span>
            <span className="small-dot blue" />
            {tr("更新于")}
            {formatClock(time)}
          </span>
        </div>
      </div>
      <div className="data-note">
        <CircleHelp size={15} />
        {tr(
          "可用库存 = 实物库存 − 已预留。数据来自园区作业模拟，补货仅影响本次演示。",
        )}
      </div>
    </div>
  );
}

function ShipmentsPage() {
  const time = useStore((s) => s.time);
  return (
    <div className="data-page">
      <div className="data-title">
        <div>
          <span className="eyebrow">SHIPMENT TRACKING</span>
          <h1>{tr("运输与运单")}</h1>
          <p>{tr("从入园到配送，掌握每辆车的作业进度")}</p>
        </div>
        <Status tone="blue">{tr("3 笔运单跟踪中")}</Status>
      </div>
      <div className="shipment-grid">
        {trucks().map((t) => {
          const info = phaseAt(time + t.offset, t.dock);
          return (
            <article className="shipment-card" key={t.id}>
              <div className="shipment-card-top">
                <span className="shipment-symbol" style={{ color: t.color }}>
                  <Truck size={35} />
                </span>
                <Status tone={info.phase === "loading" ? "green" : "blue"}>
                  {phaseLabel(info.phase, t.direction === "inbound")}
                </Status>
              </div>
              <span className="eyebrow">{t.shipment}</span>
              <h2>{t.id}</h2>
              <p>
                {t.carrier} · {t.plate}
              </p>
              <div className="shipment-route">
                <span className="route-origin">
                  <i />
                  <div>
                    <small>{tr("始发站")}</small>
                    <strong>
                      {t.direction === "inbound"
                        ? t.destination
                        : tr("昆仑元仓储中心")}
                    </strong>
                  </div>
                </span>
                <span>
                  <i />
                  <div>
                    <small>{tr("目的地")}</small>
                    <strong>
                      {t.direction === "inbound"
                        ? tr("昆仑元仓储中心")
                        : t.destination}
                    </strong>
                  </div>
                </span>
              </div>
              <div className="shipment-cargo">
                <Package size={16} />
                <span>{skus()[t.sku].name}</span>
                <strong>{tr("6 托盘")}</strong>
              </div>
              <div className="load-progress">
                <div>
                  <span>{tr("装卸进度")}</span>
                  <strong>{info.completed} / 6</strong>
                </div>
                <div className="capacity-bar">
                  <i
                    style={{
                      width: `${(info.completed / 6) * 100}%`,
                      background: t.color,
                    }}
                  />
                </div>
              </div>
              <button
                className="secondary-button full"
                onClick={() => {
                  useStore.getState().select({ kind: "truck", id: t.id });
                  useStore.getState().setPage("scene");
                  useStore.getState().setCamera("dock");
                }}
              >
                <Crosshair size={15} />
                {tr("在场景中查看")}
                <ChevronRight size={15} />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ActivityPage() {
  const time = useStore((s) => s.time),
    events = latestMovements(time);
  return (
    <div className="data-page">
      <div className="data-title">
        <div>
          <span className="eyebrow">OPERATIONS LOG</span>
          <h1>{tr("作业流水")}</h1>
          <p>{tr("装卸事件与库存变化保持同步")}</p>
        </div>
        <Status>{tr("模拟事件流")}</Status>
      </div>
      <div className="table-panel activity-panel">
        <div className="activity-table-head">
          <strong>{tr("最近作业记录")}</strong>
          <span>
            {tr("最近")}
            {events.length}
            {tr("条")}
          </span>
        </div>
        {events.map((event) => (
          <div className="activity-row" key={event.id}>
            <span className={`event-icon ${event.inbound ? "inbound" : ""}`}>
              {event.inbound ? (
                <ArrowDownLeft size={18} />
              ) : (
                <ArrowUpRight size={18} />
              )}
            </span>
            <div>
              <strong>
                {event.sku}
                <span>{event.inbound ? tr("入库完成") : tr("装车完成")}</span>
              </strong>
              <p>
                {event.truck}
                {tr("· 一托盘作业完成，库存已同步")}
              </p>
            </div>
            <b className={event.inbound ? "positive" : "blue-text"}>
              {event.inbound ? "+" : "−"}
              {event.amount}
            </b>
            <time>{formatClock(event.time)}</time>
          </div>
        ))}
        {events.length === 0 && (
          <div className="empty-state">
            <Clock3 />
            <strong>{tr("等待第一笔搬运完成")}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function Dialog({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const nodes = () =>
      ref.current?.querySelectorAll<HTMLElement>(
        'button,input,select,[tabindex="0"]',
      );
    (ref.current?.querySelector<HTMLElement>("input") ?? nodes()?.[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const list = nodes();
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton icon={X} label={tr("关闭弹窗")} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App({ locale }: { locale: Locale }) {
  useEffect(() => {
    useStore.getState().setPage("scene");
  }, []);
  useEffect(() => {
    // Transient notifications were formatted in the previous language.
    useStore.getState().notify(null);
  }, [locale]);
  useStore((s) => s.deliveries); // Render ledger changes even while the simulation is paused.
  const page = useStore((s) => s.page),
    simulationReady = useStore((s) => s.simulationReady),
    paused = useStore((s) => s.paused),
    speed = useStore((s) => s.speed),
    time = useStore((s) => s.time),
    notice = useStore((s) => s.notice),
    quality = useStore((s) => s.quality);
  const adjustments = useStore((s) => s.adjustments);
  const selection = useStore((s) => s.selected);
  const lowItems = inventoryAt(time, adjustments).filter((s) => s.low);
  const [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false),
    [notifications, setNotifications] = useState(false),
    [mobileDetails, setMobileDetails] = useState(false);
  useEffect(() => {
    if (window.innerWidth <= 850 && selection.kind !== "site")
      setMobileDetails(true);
  }, [selection]);
  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      useStore.getState().tick(Math.min((now - last) / 1000, 0.5));
      last = now;
    }, 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useStore.getState().notify(null), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
      if (
        e.code === "Space" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest(
            "input, textarea, select, button, a, [contenteditable=true]",
          )
        )
      ) {
        e.preventDefault();
        useStore.getState().togglePause();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const nav: { page: Page; name: string; icon: LucideIcon }[] = [
    { page: "scene", name: tr("园区总览"), icon: LayoutDashboard },
    { page: "inventory", name: tr("库存管理"), icon: Boxes },
    { page: "shipments", name: tr("运输运单"), icon: Truck },
    { page: "activity", name: tr("作业流水"), icon: Activity },
  ];
  const allResults: {
    label: string;
    sub: string;
    icon: LucideIcon;
    selection: Selection;
    page: Page;
  }[] = [
    {
      label: tr("昆仑元仓储中心"),
      sub: tr("WH-01 · 仓储站点"),
      icon: Warehouse,
      selection: { kind: "site", id: "WH-01" },
      page: "scene",
    },
    ...trucks().map((t) => ({
      label: t.id,
      sub: `${t.shipment} · ${t.carrier}`,
      icon: Truck,
      selection: { kind: "truck" as const, id: t.id },
      page: "scene" as const,
    })),
    ...[1, 2, 3].map((i) => ({
      label: `FL-0${i}`,
      sub: tr("作业叉车 · A0{0} 月台", { 0: i }),
      icon: Forklift,
      selection: { kind: "forklift" as const, id: `FL-0${i}` },
      page: "scene" as const,
    })),
    ...[1, 2, 3].map((i) => ({
      label: `CNT-00${i}`,
      sub: tr("标准集装箱 · C 区"),
      icon: Container,
      selection: { kind: "container" as const, id: `CNT-00${i}` },
      page: "scene" as const,
    })),
    ...skus().map((s) => ({
      label: s.name,
      sub: `${s.id} · ${s.location}`,
      icon: Package,
      selection: { kind: "site" as const, id: "WH-01" },
      page: "inventory" as const,
    })),
  ];
  const searchResults = allResults.filter((r) =>
    `${r.label}${r.sub}`.toLowerCase().includes(search.toLowerCase()),
  );
  const events = latestMovements(time),
    latest = events[0];
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          aria-label={tr("Plantbox 首页")}
          href={routeHref(locale)}
        >
          <img src="/favicon.svg" alt="" />
          <div>
            <strong>
              plantbox<span>®</span>
            </strong>
            <small>{tr("仓 储 作 业 平 台")}</small>
          </div>
        </a>
        <ProjectMenu
          locale={locale}
          demo
          onDemoClick={() => useStore.getState().setPage("scene")}
        />
        <div className="header-actions">
          <LanguageSwitch locale={locale} page="demo" />
          <button className="global-search" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
            <span>{tr("搜索车辆、货物、运单...")}</span>
            <kbd>
              <Command size={11} /> K
            </kbd>
          </button>
          <button
            className={`simulation-pill ${paused ? "paused" : ""}`}
            onClick={() => useStore.getState().togglePause()}
            title={tr("点击暂停或继续模拟")}
          >
            <span className="live-pulse" />
            {paused
              ? tr("已暂停")
              : simulationReady
                ? tr("模拟运行")
                : tr("准备作业")}
            <span>{formatClock(time).slice(0, 5)}</span>
          </button>
          <span className="header-divider" />
          <div className="notification-wrap">
            <IconButton
              icon={Bell}
              label={tr("查看通知")}
              active={notifications}
              onClick={() => setNotifications(!notifications)}
            />
            {lowItems.length > 0 && <i className="notification-count" />}
            {notifications && (
              <div className="notification-menu">
                <strong>
                  {tr("通知中心")}
                  <span>
                    {lowItems.length}
                    {tr("条待关注")}
                  </span>
                </strong>
                {lowItems.length ? (
                  <button
                    onClick={() => {
                      useStore.getState().setPage("inventory");
                      setNotifications(false);
                    }}
                  >
                    <span className="alert-symbol">!</span>
                    <div>
                      <b>
                        {lowItems.map((s) => s.name).join(localeSeparator())}
                        {tr("库存偏低")}
                      </b>
                      <small>{tr("查看可用库存并安排补货")}</small>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ) : (
                  <p className="notification-empty">{tr("当前没有库存预警")}</p>
                )}
                <small>{tr("数据来自当前模拟场景")}</small>
              </div>
            )}
          </div>
          <button
            className="profile"
            title={tr("查看演示设置")}
            onClick={() => setSettings(true)}
          >
            TC
          </button>
        </div>
      </header>
      <div className="workspace">
        <nav className="sidebar" aria-label={tr("主导航")}>
          <div className="nav-main">
            {nav.map(({ page: p, name, icon: Icon }) => (
              <button
                key={p}
                className={page === p ? "selected" : ""}
                title={name}
                aria-label={name}
                aria-current={page === p ? "page" : undefined}
                onClick={() => useStore.getState().setPage(p)}
              >
                <Icon size={21} strokeWidth={1.65} />
                <span>
                  {currentLocale() === "zh"
                    ? name.slice(0, 2)
                    : {
                        scene: "Site",
                        inventory: "Stock",
                        shipments: "Trucks",
                        activity: "Log",
                      }[p]}
                </span>
              </button>
            ))}
          </div>
          <div className="nav-bottom">
            <IconButton
              icon={CircleHelp}
              label={tr("操作帮助")}
              onClick={() => setHelp(true)}
            />
            <IconButton
              icon={Settings2}
              label={tr("演示设置")}
              onClick={() => setSettings(true)}
            />
            <div className="nav-avatar">P</div>
          </div>
        </nav>
        <main
          className={`main-workspace ${page !== "scene" ? "data-mode" : ""}`}
        >
          <div
            className={`scene-workspace ${page !== "scene" ? "hidden-scene" : ""}`}
          >
            <section className="scene-stage">
              <SceneBoundary>
                <Suspense
                  fallback={
                    <div className="scene-loading">
                      <Box size={36} />
                      <strong>{tr("正在准备园区场景")}</strong>
                    </div>
                  }
                >
                  <Scene locale={locale} />
                </Suspense>
              </SceneBoundary>
              <div className="view-heading">
                <div>
                  <div className="scene-eyebrow">
                    <span className="small-dot blue" />
                    KUNLUN YUAN LOGISTICS PARK
                  </div>
                  <h1>
                    {tr("园区总览")}
                    <span>01</span>
                  </h1>
                </div>
                <div className="scene-status">
                  <span className="small-dot green" />
                  {tr("所有系统运行正常")}
                  <IconButton
                    icon={Expand}
                    label={tr("全屏显示")}
                    onClick={() => {
                      if (!document.fullscreenElement)
                        document.documentElement
                          .requestFullscreen?.()
                          .catch(() =>
                            useStore
                              .getState()
                              .notify(
                                tr(
                                  "当前浏览器不支持全屏，可使用浏览器的全屏模式",
                                ),
                              ),
                          );
                      else document.exitFullscreen?.();
                    }}
                  />
                </div>
              </div>
              <Kpis />
              <CameraTools />
              <div className="scene-footer-info">
                <span>
                  <MousePointer2 size={13} />
                  {tr("拖动旋转")}
                  <span>·</span>
                  {tr("滚轮缩放")}
                  <span>·</span>
                  {tr("点击查看详情")}
                </span>
                <span className="scene-coordinates">31°08′ N · 121°22′ E</span>
              </div>
              <MiniMap />
              <div className="bottom-workspace">
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
                    <time>
                      {latest ? formatClock(latest.time) : formatClock(time)}
                    </time>
                  </div>
                  <div className="playback">
                    <button
                      onClick={() => useStore.getState().togglePause()}
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
                        onClick={() => useStore.getState().setSpeed(v)}
                      >
                        {v}×
                      </button>
                    ))}
                  </div>
                </div>
                <OperationTimeline />
              </div>
              <button
                className="mobile-details-toggle"
                onClick={() => setMobileDetails(!mobileDetails)}
              >
                <Building2 size={17} />
                {mobileDetails ? tr("收起站点信息") : tr("站点信息")}
                <ChevronRight size={14} />
              </button>
            </section>
            <div
              className={`inspector-wrapper ${mobileDetails ? "mobile-open" : ""}`}
            >
              <Inspector onClose={() => setMobileDetails(false)} />
            </div>
          </div>
          {page === "inventory" && <InventoryPage />}
          {page === "shipments" && <ShipmentsPage />}
          {page === "activity" && <ActivityPage />}
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {notice}
          <button
            aria-label={tr("关闭提示")}
            onClick={() => useStore.getState().notify(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {searchOpen && (
        <Dialog title={tr("搜索工作空间")} onClose={() => setSearchOpen(false)}>
          <div className="modal-search">
            <Search size={20} />
            <input
              autoFocus
              placeholder={tr("输入车辆、运单、商品或设备编号")}
              aria-label={tr("搜索工作空间")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>ESC</kbd>
          </div>
          <div className="search-results">
            {searchResults.map((r) => (
              <button
                key={r.label}
                onClick={() => {
                  useStore.getState().select(r.selection);
                  useStore.getState().setPage(r.page);
                  if (
                    r.selection.kind === "truck" ||
                    r.selection.kind === "forklift"
                  )
                    useStore.getState().setCamera("dock");
                  if (r.selection.kind === "container")
                    useStore.getState().setCamera("storage");
                  setSearchOpen(false);
                  setSearch("");
                }}
              >
                <span>
                  <r.icon size={20} />
                </span>
                <div>
                  <strong>{r.label}</strong>
                  <small>{r.sub}</small>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
            {searchResults.length === 0 && (
              <div className="empty-state">
                <Search />
                <strong>{tr("没有找到匹配的结果")}</strong>
              </div>
            )}
          </div>
        </Dialog>
      )}
      {settings && (
        <Dialog title={tr("演示设置")} onClose={() => setSettings(false)}>
          <div className="settings-body">
            <div className="setting-row">
              <div>
                <strong>{tr("画面质量")}</strong>
                <p>{tr("精细光影适合桌面设备，流畅模式减少渲染负担。")}</p>
              </div>
              <select
                aria-label={tr("画面质量")}
                value={quality}
                onChange={(e) =>
                  useStore
                    .getState()
                    .setQuality(e.target.value as "high" | "balanced")
                }
              >
                <option value="high">{tr("精细光影")}</option>
                <option value="balanced">{tr("流畅优先")}</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <strong>{tr("重置模拟")}</strong>
                <p>{tr("恢复初始时间、库存和作业进度。")}</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => {
                  useStore.getState().reset();
                  setSettings(false);
                }}
              >
                <RotateCcw size={14} />
                {tr("重置")}
              </button>
            </div>
            <div className="settings-note">
              <ShieldCheck size={20} />
              <p>
                {tr(
                  "当前为 30 分钟交互式作业模拟，可重置后重复运行。未连接 WMS、ERP 或现场设备，库存补货与运行状态仅在当前页面生效。",
                )}
              </p>
            </div>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog title={tr("探索你的仓储园区")} onClose={() => setHelp(false)}>
          <div className="help-body">
            <div>
              <MousePointer2 />
              <span>
                <strong>{tr("自由探索")}</strong>
                <p>
                  {tr(
                    "鼠标左键拖动旋转，右键拖动平移，滚轮缩放；触屏支持单指旋转、双指缩放。",
                  )}
                </p>
              </span>
            </div>
            <div>
              <Crosshair />
              <span>
                <strong>{tr("查看作业详情")}</strong>
                <p>
                  {tr("点击车辆、叉车或货柜查看详情，也可以通过月台列表定位。")}
                </p>
              </span>
            </div>
            <div>
              <Layers3 />
              <span>
                <strong>{tr("走进仓库")}</strong>
                <p>
                  {tr("点击“查看仓内”打开屋顶，或切换仓内视角查看货架和货物。")}
                </p>
              </span>
            </div>
            <div>
              <Zap />
              <span>
                <strong>{tr("控制模拟节奏")}</strong>
                <p>
                  {tr(
                    "空格键暂停或继续，通过 1× / 5× / 10× 调整速度。每完成一次搬运，库存和运单自动更新。",
                  )}
                </p>
              </span>
            </div>
            <div>
              <Search />
              <span>
                <strong>{tr("快速查找")}</strong>
                <p>
                  {tr(
                    "使用 ⌘K / Ctrl+K 搜索车辆、运单、叉车、集装箱和库存商品。",
                  )}
                </p>
              </span>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
