import {
  ArrowDownLeft,
  ArrowUpRight,
  BatteryFull,
  Check,
  ChevronRight,
  ClipboardList,
  MapPin,
  Play,
  Radio,
  Signal,
  Truck,
  Wifi,
} from "lucide-react";
import { SITE } from "../../config/site";
import {
  useWarehouseSnapshot,
  useWarehouseState,
} from "../../data/WarehouseProvider";
import { displayShipmentStatus } from "../../data/presentation";
import type { Shipment } from "../../domain/warehouse";
import { tr } from "../../i18n";
import { usePlaybackState } from "../../runtime/LivePlaybackProvider";
import { useUIStore } from "../../state/uiStore";
import { ShipmentActions } from "./ShipmentActions";

const instructions: Record<Shipment["status"], string> = {
  expected: "确认车辆已到达园区入口。",
  arrived: "确认车辆已停稳在指定月台。",
  docked: "车辆就位后，开始本次装卸作业。",
  handling: "逐托输入编号，确认实际交付的货物。",
  completed: "装卸已完成，确认车辆离开园区。",
  departed: "本次作业已结束，可切换车辆继续操作。",
};
const nextLabels: Record<Shipment["status"], string> = {
  expected: "入场确认",
  arrived: "靠台确认",
  docked: "开始装卸",
  handling: "逐托交付",
  completed: "出场确认",
  departed: "作业已完成",
};
function Journey({ shipment }: { shipment: Shipment }) {
  const step = {
    expected: 0,
    arrived: 1,
    docked: 2,
    handling: 2,
    completed: 3,
    departed: 4,
  }[shipment.status];
  return (
    <ol className="phone-journey" aria-label={tr("作业步骤")}>
      {["入场", "靠台", "装卸", "出场"].map((label, i) => (
        <li
          key={label}
          className={i < step ? "complete" : i === step ? "current" : ""}
          aria-current={i === step ? "step" : undefined}
        >
          <span>{i < step ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
          <strong>{tr(label)}</strong>
        </li>
      ))}
    </ol>
  );
}
export function PhoneTerminal({
  shipment,
  onSelect,
  sceneVisible,
  onWatch,
}: {
  shipment?: Shipment;
  onSelect: (shipment: Shipment) => void;
  sceneVisible: boolean;
  onWatch: () => void;
}) {
  const snapshot = useWarehouseSnapshot(),
    { connection } = useWarehouseState();
  const view = usePlaybackState();
  const pending = shipment ? (view.pendingByShipment[shipment.id] ?? 0) : 0;
  const playing =
    pending > 0 && sceneVisible && !view.paused && view.active === shipment?.id;
  const feedback = pending
    ? playing
      ? "已确认 · 动画播放中"
      : "已确认 · 等待动画播放"
    : shipment?.status === "expected"
      ? "等待入场确认"
      : "已确认 · 画面已同步";
  return (
    <div className="terminal-dock">
      <div className="terminal-caption">
        <span>
          <Radio size={13} />
          {tr("现场操作终端")}
        </span>
        <span>{SITE.id}</span>
      </div>
      <div className="phone-frame">
        <div className="phone-statusbar" aria-hidden="true">
          <span>plantbox</span>
          <i />
          <span>
            <Signal size={12} />
            <Wifi size={12} />
            <BatteryFull size={17} />
          </span>
        </div>
        <header className="phone-header">
          <img src="/favicon.svg" alt="" />
          <div>
            <strong>{tr("仓储作业")}</strong>
            <small>{tr(SITE.name)}</small>
          </div>
          <span
            className={`terminal-connection ${connection}`}
            title={tr(
              connection === "connected" ? "后台已连接" : "后台连接中断",
            )}
          >
            <i />
            {tr(connection === "connected" ? "已连接" : "未连接")}
          </span>
        </header>
        <div className="phone-scroll">
          <label className="phone-vehicle-picker">
            <span>
              {tr("选择作业车辆")}
              <span>{tr("{0} 笔运单", { 0: snapshot.shipments.length })}</span>
            </span>
            <select
              aria-label={tr("选择作业车辆")}
              value={shipment?.id ?? ""}
              onChange={(e) => {
                const next = snapshot.shipments.find(
                  (s) => s.id === e.target.value,
                );
                if (next) onSelect(next);
              }}
            >
              {!shipment && <option value="">{tr("暂无运单")}</option>}
              {snapshot.shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.vehicleId} · {tr(s.plate)} · {s.dockId}
                </option>
              ))}
            </select>
          </label>
          {shipment ? (
            <>
              <section className="phone-shipment" aria-label={tr("当前运单")}>
                <div className="phone-shipment-top">
                  <span className={`direction-tag ${shipment.direction}`}>
                    {shipment.direction === "inbound" ? (
                      <ArrowDownLeft size={13} />
                    ) : (
                      <ArrowUpRight size={13} />
                    )}{" "}
                    {tr(
                      shipment.direction === "inbound"
                        ? "卸货入库"
                        : "装货出库",
                    )}
                  </span>
                  <span>{displayShipmentStatus(shipment)}</span>
                </div>
                <div className="phone-plate">
                  <div>
                    <small>{shipment.id}</small>
                    <h2>{tr(shipment.plate)}</h2>
                  </div>
                  <span style={{ color: shipment.color }}>
                    <Truck size={28} strokeWidth={1.6} />
                  </span>
                </div>
                <div className="phone-shipment-bottom">
                  <span>{shipment.vehicleId}</span>
                  <strong>
                    <MapPin size={12} />
                    {shipment.dockId} · {tr("月台")}
                  </strong>
                </div>
              </section>
              <Journey shipment={shipment} />
              <div
                className={`phone-playback-feedback ${playing ? "playing" : ""}`}
                role="status"
              >
                <i />
                <span>{tr(feedback)}</span>
                {pending > 0 && <b>{pending}</b>}
              </div>
              <section className="phone-task" aria-label={tr("当前步骤")}>
                <div className="phone-task-heading">
                  <span>{tr("当前步骤")}</span>
                  <strong>{tr(nextLabels[shipment.status])}</strong>
                </div>
                <p>{tr(instructions[shipment.status])}</p>
                <div className="phone-progress-label">
                  <span>{tr("托盘确认进度")}</span>
                  <strong>
                    {shipment.completed}
                    <span> / {shipment.total}</span>
                  </strong>
                </div>
                <progress
                  className="phone-progress"
                  aria-label={tr("托盘确认进度")}
                  max={Math.max(1, shipment.total)}
                  value={shipment.completed}
                />
                <ShipmentActions
                  key={shipment.id}
                  shipment={shipment}
                  terminal
                  onPalletSelect={(id) =>
                    useUIStore.getState().select({ kind: "pallet", id })
                  }
                />
              </section>
            </>
          ) : (
            <div className="phone-empty">
              <ClipboardList size={30} />
              <h3>{tr("暂无运单")}</h3>
              <p>{tr("业务任务就绪后，在这里开始现场操作。")}</p>
            </div>
          )}
        </div>
        <footer className="phone-footer">
          <button type="button" onClick={onWatch}>
            <Play size={15} />
            {tr("查看作业动画")}
            <ChevronRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => useUIStore.getState().setPage("shipments")}
          >
            <ClipboardList size={15} />
            {tr("完整运单")}
          </button>
        </footer>
        <div className="phone-home-indicator" aria-hidden="true">
          <i />
        </div>
      </div>
      <p className="terminal-hint">{tr("在手机端确认，园区内同步演示")}</p>
    </div>
  );
}
