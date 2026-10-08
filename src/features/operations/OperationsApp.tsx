import {
  Activity,
  Boxes,
  LayoutDashboard,
  RotateCcw,
  Truck,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createInteractiveSource } from "../../data/interactiveSource";
import { displayTime } from "../../data/presentation";
import {
  useWarehouseSnapshot,
  WarehouseProvider,
} from "../../data/WarehouseProvider";
import { tr } from "../../i18n";
import type { Locale } from "../../routing";
import { routeHref } from "../../routing";
import { LivePlaybackProvider } from "../../runtime/LivePlaybackProvider";
import type { Page } from "../../state/uiStore";
import { useUIStore } from "../../state/uiStore";
import "../../styles.css";
import { LanguageSwitch, ProjectMenu } from "../../WebsiteNav";
import { ActivityPage } from "../activity/ActivityPage";
import { InventoryPage } from "../inventory/InventoryPage";
import { ShipmentsPage } from "../shipments/ShipmentsPage";
import "./operations.css";
import { OperationsScene } from "./OperationsScene";
import { PlaybackControls } from "./PlaybackControls";
import { ShipmentActions } from "./ShipmentActions";
const compactQuery = "(max-width: 850px)";
const subscribeCompact = (listener: () => void) => {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
const compactSnapshot = () => window.matchMedia(compactQuery).matches;
function OperationsView({
  locale,
  onReset,
  embedded,
}: {
  locale: Locale;
  onReset: () => void;
  embedded: boolean;
}) {
  const snapshot = useWarehouseSnapshot();
  const page = useUIStore((s) => s.page);
  const [sceneVisited, setSceneVisited] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const [inViewport, setInViewport] = useState(true);
  useEffect(() => {
    if (!embedded || !viewport.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setInViewport(entry.isIntersecting);
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [embedded]);
  const compact = useSyncExternalStore(
    subscribeCompact,
    compactSnapshot,
    () => false,
  );
  const [mobilePane, setMobilePane] = useState<"terminal" | "scene">(
    "terminal",
  );
  const mobileSwitch = useRef<HTMLDivElement>(null);
  const switchPane = (pane: "terminal" | "scene") => {
    setMobilePane(pane);
    if (compact)
      requestAnimationFrame(() =>
        mobileSwitch.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        }),
      );
  };
  const sceneVisible =
    page === "scene" &&
    (!compact || mobilePane === "scene") &&
    (!embedded || inViewport);
  const watchScene = () => {
    useUIStore.getState().setPage("scene");
    switchPane("scene");
  };
  useEffect(() => {
    if (page === "scene" && snapshot) setSceneVisited(true);
  }, [page, snapshot]);
  useEffect(() => {
    useUIStore.getState().setPage("scene");
    useUIStore.getState().resetView();
    setInitialized(true);
  }, []);
  const nav: { page: Page; name: string; icon: typeof Truck }[] = [
    { page: "scene", name: "作业工作台", icon: LayoutDashboard },
    { page: "shipments", name: "运输运单", icon: Truck },
    { page: "inventory", name: "库存管理", icon: Boxes },
    { page: "activity", name: "作业流水", icon: Activity },
  ];
  const Content = embedded ? "div" : "main";
  return (
    <div
      className={`operations-app${embedded ? " operations-embedded" : ""}`}
      ref={viewport}
    >
      {!embedded && (
        <header className="topbar">
          <a className="brand" href={routeHref(locale)}>
            <img src="/favicon.svg" alt="" />
            <strong>plantbox</strong>
          </a>
          <ProjectMenu locale={locale} />
          <div className="header-actions">
            <LanguageSwitch locale={locale} page="operations" />
            <button
              className="text-button operations-reset"
              aria-label={tr("重置演示")}
              title={tr("重置演示")}
              onClick={onReset}
            >
              <RotateCcw size={15} />
              <span>{tr("重置演示")}</span>
            </button>
          </div>
        </header>
      )}
      {!embedded && (
        <div className="operations-bar">
          <div>
            <span className="eyebrow">WAREHOUSE OPERATIONS</span>
            <h1>{tr("作业管理")}</h1>
          </div>
          <span className="connection-state connected" role="status">
            <i />
            {tr("前端交互演示")}
          </span>
        </div>
      )}
      {!embedded && (
        <div className="sample-banner">
          {tr("演示数据仅保留在当前页面，刷新或重置后恢复初始状态。")}
        </div>
      )}
      <>
        <div className="operations-navigation">
          <nav className="operations-tabs" aria-label={tr("主导航")}>
            {nav.map((item) => (
              <button
                key={item.page}
                aria-current={page === item.page ? "page" : undefined}
                onClick={() => useUIStore.getState().setPage(item.page)}
              >
                <item.icon size={17} />
                {tr(item.name)}
              </button>
            ))}
          </nav>
          {embedded && (
            <button
              className="text-button operations-reset"
              onClick={onReset}
              aria-label={tr("重置演示")}
              title={tr("重置演示")}
            >
              <RotateCcw size={15} />
              <span>{tr("重置演示")}</span>
            </button>
          )}
        </div>
        {compact && page === "scene" && (
          <div
            className="operations-mobile-switch"
            ref={mobileSwitch}
            role="group"
            aria-label={tr("工作台视图")}
          >
            <button
              type="button"
              aria-pressed={mobilePane === "terminal"}
              onClick={() => switchPane("terminal")}
            >
              {tr("操作")}
            </button>
            <button
              type="button"
              aria-pressed={mobilePane === "scene"}
              onClick={() => switchPane("scene")}
            >
              {tr("场景")}
            </button>
          </div>
        )}
        <PlaybackControls sceneVisible={sceneVisible} onWatch={watchScene} />
        <Content className="operations-content">
          {initialized && (sceneVisited || page === "scene") && (
            <div
              className="operations-scene-shell"
              aria-hidden={page !== "scene"}
              inert={page !== "scene"}
            >
              <OperationsScene
                locale={locale}
                sceneVisible={sceneVisible}
                compact={compact}
                mobilePane={mobilePane}
                onWatch={watchScene}
              />
            </div>
          )}
          {page === "shipments" && (
            <ShipmentsPage
              controls={(shipment) => <ShipmentActions shipment={shipment} />}
            />
          )}
          {page === "inventory" && <InventoryPage />}
          {page === "activity" && <ActivityPage />}
        </Content>
        <footer className="operations-footer">
          <span>
            {tr("演示操作记录")} · {snapshot.events.length}
          </span>
          <time dateTime={snapshot.updatedAt}>
            {tr("更新于")} {displayTime(snapshot.updatedAt)}
          </time>
        </footer>
      </>
    </div>
  );
}
export default function OperationsApp({
  locale,
  embedded = false,
}: {
  locale: Locale;
  embedded?: boolean;
}) {
  const [session, setSession] = useState(0);
  const source = useMemo(() => createInteractiveSource(), [session]);
  return (
    <WarehouseProvider source={source} key={session}>
      <LivePlaybackProvider>
        <OperationsView
          locale={locale}
          embedded={embedded}
          onReset={() => setSession((value) => value + 1)}
        />
      </LivePlaybackProvider>
    </WarehouseProvider>
  );
}
