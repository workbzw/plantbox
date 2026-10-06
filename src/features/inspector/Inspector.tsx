import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  Clock3,
  Container,
  Crosshair,
  Forklift,
  MapPin,
  MoreHorizontal,
  Package,
  ShieldCheck,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { useState } from "react";
import { fmt, localeSeparator } from "../../components/format";
import { IconButton, Status } from "../../components/ui";
import { SITE } from "../../config/site";
import {
  handledPallets,
  inventoryAt,
  occupiedPallets,
  phaseAt,
  phaseLabel,
  skus,
  trucks,
} from "../../data/demoSelectors";
import { forkliftPose, handlingLabels, palletId } from "../../forkliftMotion";
import { tr } from "../../i18n";
import { useSimulationStore } from "../../state/simulationStore";
import { useUIStore as useStore } from "../../state/uiStore";
import "../../styles.css";
function DockList() {
  useSimulationStore((s) => s.deliveries);
  const time = useSimulationStore((s) => s.time),
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
  useSimulationStore((s) => s.deliveries);
  const time = useSimulationStore((s) => s.time),
    adjustments = useSimulationStore((s) => s.adjustments);
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
          <span className="eyebrow">WAREHOUSE · {SITE.id}</span>
          <h2>{tr(SITE.name)}</h2>
          <p>
            <MapPin size={12} />
            {tr(SITE.location)}
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
            {((stock / SITE.capacity) * 100).toFixed(1)}
            <small>%</small>
          </strong>
        </div>
        <div className="capacity-bar">
          <i style={{ width: `${(stock / SITE.capacity) * 100}%` }} />
        </div>
        <p>
          <span>
            <b>{fmt(stock)}</b>
            {tr("/ {0} 托盘位", { 0: fmt(SITE.capacity) })}
          </span>
          <span>
            {tr("余量")}
            {fmt(SITE.capacity - stock)}
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
  useSimulationStore((s) => s.deliveries);
  const selected = useStore((s) => s.selected),
    time = useSimulationStore((s) => s.time);
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
          useStore.getState().select({ kind: "site", id: SITE.id })
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

export function Inspector({ onClose }: { onClose: () => void }) {
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
