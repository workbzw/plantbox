import { Eye, Radio } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { SceneBoundary } from "../../components/ui";
import { SITE } from "../../config/site";
import { useWarehouseSnapshot } from "../../data/WarehouseProvider";
import type { Shipment } from "../../domain/warehouse";
import { tr } from "../../i18n";
import type { Locale } from "../../routing";
import { usePlaybackState } from "../../runtime/LivePlaybackProvider";
import { useUIStore } from "../../state/uiStore";
import { CameraTools } from "../scene/ScenePanels";
import { PhoneTerminal } from "./PhoneTerminal";
const Scene = lazy(() => import("../../Scene"));
export function OperationsScene({
  locale,
  sceneVisible,
  compact,
  mobilePane,
  onWatch,
}: {
  locale: Locale;
  sceneVisible: boolean;
  compact: boolean;
  mobilePane: "terminal" | "scene";
  onWatch: () => void;
}) {
  const snapshot = useWarehouseSnapshot();
  const selected = useUIStore((s) => s.selected),
    view = usePlaybackState();
  const [rememberedId, setRememberedId] = useState<string>();
  const selectedPallet = snapshot.pallets.find(
    (p) => selected.kind === "pallet" && p.id === selected.id,
  );
  const chosen = snapshot.shipments.find(
    (s) =>
      (selected.kind === "truck" && s.vehicleId === selected.id) ||
      s.id === selectedPallet?.shipmentId ||
      (selected.kind === "forklift" &&
        s.dockId === SITE.docks[Number(selected.id.slice(-1)) - 1]?.id),
  );
  const shipment =
    chosen ??
    snapshot.shipments.find((s) => s.id === rememberedId) ??
    snapshot.shipments[0];
  useEffect(() => {
    if (chosen) {
      setRememberedId(chosen.id);
      setFocusDock(SITE.docks.findIndex((d) => d.id === chosen.dockId));
    }
  }, [chosen?.id]);
  const activeShipment = snapshot.shipments.find((s) => s.id === view.active);
  const [focusDock, setFocusDock] = useState<number>(-1);
  const [sceneVisited, setSceneVisited] = useState(false);
  useEffect(() => {
    if (sceneVisible) setSceneVisited(true);
  }, [sceneVisible]);
  // Reframe once per queued action, not on every animation frame. Manual orbit
  // interaction remains available between action boundaries.
  const activeDockId = activeShipment?.dockId;
  useEffect(() => {
    if (!activeDockId) return;
    setFocusDock(SITE.docks.findIndex((d) => d.id === activeDockId));
    useUIStore
      .getState()
      .setCamera(
        ["车辆驶入", "车辆驶离"].includes(view.label) ? "overview" : "dock",
      );
  }, [view.active, view.label, activeDockId]);
  function selectShipment(next: Shipment) {
    setRememberedId(next.id);
    useUIStore.getState().select({ kind: "truck", id: next.vehicleId });
    setFocusDock(SITE.docks.findIndex((d) => d.id === next.dockId));
    useUIStore
      .getState()
      .setCamera(
        ["expected", "arrived", "departed"].includes(next.status)
          ? "overview"
          : "dock",
      );
  }
  const hideScene = compact && mobilePane !== "scene";
  const hideTerminal = compact && mobilePane !== "terminal";
  return (
    <div className="operations-scene-layout">
      <section
        className="scene-stage operations-stage"
        aria-label={tr("园区动画")}
        aria-hidden={hideScene}
        inert={hideScene}
        data-panel-hidden={hideScene}
      >
        {(sceneVisited || sceneVisible) && (
          <SceneBoundary>
            <Suspense
              fallback={
                <div className="scene-loading">{tr("正在准备园区场景")}</div>
              }
            >
              <Scene
                locale={locale}
                mode="interactive"
                active={sceneVisible}
                focusDock={focusDock}
              />
            </Suspense>
          </SceneBoundary>
        )}
        <div className="view-heading">
          <div>
            <span className="eyebrow">{SITE.parkName}</span>
            <h1>{tr("园区总览")}</h1>
          </div>
        </div>
        <CameraTools />
        <div className="scene-operation-caption">
          <span
            className={
              view.pending
                ? "scene-operation-icon active"
                : "scene-operation-icon"
            }
          >
            <Radio size={17} />
          </span>
          <div>
            <strong>{activeShipment?.vehicleId ?? tr("等待现场操作")}</strong>
            <span>
              {tr(
                activeShipment
                  ? view.paused
                    ? "动画已暂停"
                    : view.label
                  : "选择右侧车辆，开始作业流程",
              )}
            </span>
          </div>
          {activeShipment && <b>{activeShipment.dockId}</b>}
        </div>
        <div className="business-position-note">
          <Eye size={12} />
          {tr("作业流程动画演示")}
        </div>
      </section>
      <aside
        className="operations-terminal"
        aria-label={tr("现场操作终端")}
        aria-hidden={hideTerminal}
        inert={hideTerminal}
        data-panel-hidden={hideTerminal}
      >
        <PhoneTerminal
          shipment={shipment}
          onSelect={selectShipment}
          sceneVisible={sceneVisible}
          onWatch={() => {
            onWatch();
            if (shipment) selectShipment(shipment);
          }}
        />
      </aside>
    </div>
  );
}
