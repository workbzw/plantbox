import { ChevronRight, Crosshair, Package, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { Status } from "../../components/ui";
import { SITE } from "../../config/site";
import { useWarehouseSnapshot } from "../../data/WarehouseProvider";
import { displayShipmentStatus } from "../../data/presentation";
import type { Shipment } from "../../domain/warehouse";
import { tr } from "../../i18n";
import { useUIStore } from "../../state/uiStore";
export function ShipmentsPage({
  controls,
}: {
  controls?: (shipment: Shipment) => ReactNode;
}) {
  const snapshot = useWarehouseSnapshot();
  return (
    <div className="data-page">
      <div className="data-title">
        <div>
          <span className="eyebrow">SHIPMENT TRACKING</span>
          <h1>{tr("运输与运单")}</h1>
          <p>{tr("从入园到配送，掌握每辆车的作业进度")}</p>
        </div>
        <Status tone="blue">
          {tr("{0} 笔运单", { 0: snapshot.shipments.length })}
        </Status>
      </div>
      <div className="shipment-grid">
        {snapshot.shipments.map((t) => {
          const sku = snapshot.inventory.find((s) => s.id === t.skuId);
          return (
            <article className="shipment-card" key={t.id} data-shipment={t.id}>
              <div className="shipment-card-top">
                <span className="shipment-symbol" style={{ color: t.color }}>
                  <Truck size={35} />
                </span>
                <Status tone={t.status === "handling" ? "green" : "blue"}>
                  {displayShipmentStatus(t)}
                </Status>
              </div>
              <span className="eyebrow">
                {t.id} · {t.dockId}
              </span>
              <h2>{t.vehicleId}</h2>
              <p>
                {tr(t.carrier)} · {tr(t.plate)}
              </p>
              <div className="shipment-route">
                <span className="route-origin">
                  <i />
                  <div>
                    <small>{tr("始发站")}</small>
                    <strong>
                      {tr(
                        t.direction === "inbound" ? t.destination : SITE.name,
                      )}
                    </strong>
                  </div>
                </span>
                <span>
                  <i />
                  <div>
                    <small>{tr("目的地")}</small>
                    <strong>
                      {tr(
                        t.direction === "inbound" ? SITE.name : t.destination,
                      )}
                    </strong>
                  </div>
                </span>
              </div>
              <div className="shipment-cargo">
                <Package size={16} />
                <span>{tr(sku?.name ?? t.skuId)}</span>
                <strong>{tr("{0} 托盘", { 0: t.total })}</strong>
              </div>
              <div className="load-progress">
                <div>
                  <span>{tr("装卸进度")}</span>
                  <strong>
                    {t.completed} / {t.total}
                  </strong>
                </div>
                <div className="capacity-bar">
                  <i
                    style={{
                      width: `${t.total ? (t.completed / t.total) * 100 : 0}%`,
                      background: t.color,
                    }}
                  />
                </div>
              </div>
              {controls?.(t)}
              <button
                className="secondary-button full"
                onClick={() => {
                  useUIStore
                    .getState()
                    .select({ kind: "truck", id: t.vehicleId });
                  useUIStore.getState().setPage("scene");
                  useUIStore.getState().setCamera("dock");
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
      {!snapshot.shipments.length && (
        <div className="empty-state">
          <Truck />
          <strong>{tr("暂无运单")}</strong>
        </div>
      )}
    </div>
  );
}
