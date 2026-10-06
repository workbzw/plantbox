import { ArrowDownLeft, ArrowUpRight, Clock3, Truck } from "lucide-react";
import { Status } from "../../components/ui";
import { useWarehouseSnapshot } from "../../data/WarehouseProvider";
import { displayTime } from "../../data/presentation";
import { eventLabels } from "../../domain/warehouse";
import { tr } from "../../i18n";
export function ActivityPage() {
  const snapshot = useWarehouseSnapshot(),
    events = snapshot.events;
  return (
    <div className="data-page">
      <div className="data-title">
        <div>
          <span className="eyebrow">OPERATIONS LOG</span>
          <h1>{tr("作业流水")}</h1>
          <p>{tr("装卸事件与库存变化保持同步")}</p>
        </div>
        <Status>
          {tr(snapshot.mode === "demo" ? "模拟事件流" : "后台确认记录")}
        </Status>
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
        {events.map((event) => {
          const inbound = event.direction === "inbound",
            moved = event.type === "confirm_pallet";
          const sku = snapshot.inventory.find((s) => s.id === event.skuId);
          return (
            <div className="activity-row" key={event.id}>
              <span className={`event-icon ${inbound ? "inbound" : ""}`}>
                {!moved ? (
                  <Truck size={18} />
                ) : inbound ? (
                  <ArrowDownLeft size={18} />
                ) : (
                  <ArrowUpRight size={18} />
                )}
              </span>
              <div>
                <strong>
                  {sku ? tr(sku.name) : event.vehicleId}
                  <span>
                    {tr(
                      moved
                        ? inbound
                          ? "入库完成"
                          : "装车完成"
                        : eventLabels[event.type],
                    )}
                  </span>
                </strong>
                <p>
                  {event.vehicleId} · {event.palletId ?? event.shipmentId}
                </p>
              </div>
              <b className={inbound ? "positive" : "blue-text"}>
                {moved ? `${inbound ? "+" : "−"}${event.quantity}` : "—"}
              </b>
              <time dateTime={event.occurredAt} title={event.occurredAt}>
                {displayTime(event.occurredAt)}
              </time>
            </div>
          );
        })}
        {!events.length && (
          <div className="empty-state">
            <Clock3 />
            <strong>{tr("等待第一笔作业记录")}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
