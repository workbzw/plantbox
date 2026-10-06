import {
  Activity,
  Boxes,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  Truck,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Dialog } from "../../components/ui";
import { createHttpSource } from "../../data/httpSource";
import { displayTime } from "../../data/presentation";
import {
  useWarehouseSource,
  useWarehouseState,
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
  configure,
}: {
  locale: Locale;
  configure: () => void;
}) {
  const { snapshot, connection, error } = useWarehouseState(),
    source = useWarehouseSource();
  const page = useUIStore((s) => s.page);
  const [sceneVisited, setSceneVisited] = useState(false);
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
  const sceneVisible = page === "scene" && (!compact || mobilePane === "scene");
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
  }, []);
  const nav: { page: Page; name: string; icon: typeof Truck }[] = [
    { page: "scene", name: "作业工作台", icon: LayoutDashboard },
    { page: "shipments", name: "运输运单", icon: Truck },
    { page: "inventory", name: "库存管理", icon: Boxes },
    { page: "activity", name: "作业流水", icon: Activity },
  ];
  return (
    <div className="operations-app">
      <header className="topbar">
        <a className="brand" href={routeHref(locale)}>
          <img src="/favicon.svg" alt="" />
          <strong>plantbox</strong>
        </a>
        <ProjectMenu locale={locale} />
        <div className="header-actions">
          <LanguageSwitch locale={locale} page="operations" />
          <button
            className="icon-button"
            aria-label={tr("连接设置")}
            onClick={configure}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <div className="operations-bar">
        <div>
          <span className="eyebrow">WAREHOUSE OPERATIONS</span>
          <h1>{tr("作业管理")}</h1>
        </div>
        <span className={`connection-state ${connection}`} role="status">
          <i />
          {tr(
            connection === "connected"
              ? "后台已连接"
              : connection === "offline"
                ? "后台连接中断"
                : "正在连接后台",
          )}
        </span>
      </div>
      {snapshot?.sampleData && (
        <div className="sample-banner">
          {tr("当前为示例业务数据，操作会保存到本地后台数据库。")}
        </div>
      )}
      {connection === "offline" && (
        <div className="connection-error" role="alert">
          <span>
            {tr(error ?? "后台连接失败")}
            {snapshot && ` · ${tr("显示上次确认的数据，操作暂不可用")}`}
          </span>
          <button className="text-button" onClick={() => void source.refresh()}>
            <RefreshCw size={14} />
            {tr("重新连接")}
          </button>
        </div>
      )}
      {!snapshot ? (
        <div className="operations-empty">
          <Truck size={42} />
          <h2>
            {tr(
              connection === "loading"
                ? "正在读取仓储数据"
                : "暂未连接到业务后台",
            )}
          </h2>
          <p>{tr("连接成功后显示库存、车辆与作业记录。")}</p>
          <button className="secondary-button" onClick={configure}>
            {tr("连接设置")}
          </button>
          <a href={routeHref(locale, "demo")}>{tr("查看仓储演示")}</a>
        </div>
      ) : (
        <>
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
          <main>
            {(sceneVisited || page === "scene") && (
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
          </main>
          <footer className="operations-footer">
            <span>
              {tr("后台确认记录")} · {snapshot.revision}
            </span>
            <time dateTime={snapshot.updatedAt}>
              {tr("更新于")} {displayTime(snapshot.updatedAt)}
            </time>
          </footer>
        </>
      )}
    </div>
  );
}
export default function OperationsApp({ locale }: { locale: Locale }) {
  const [token, setToken] = useState(""),
    [draft, setDraft] = useState(""),
    [settings, setSettings] = useState(false);
  const source = useMemo(() => createHttpSource({ token }), [token]);
  return (
    <WarehouseProvider source={source}>
      <LivePlaybackProvider>
        <OperationsView locale={locale} configure={() => setSettings(true)} />
      </LivePlaybackProvider>
      {settings && (
        <Dialog title={tr("连接设置")} onClose={() => setSettings(false)}>
          <form
            className="connection-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft === token) void source.refresh();
              else setToken(draft);
              setSettings(false);
            }}
          >
            <label htmlFor="backend-token">{tr("后台访问凭据")}</label>
            <input
              id="backend-token"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p>{tr("凭据仅保留在当前页面，刷新后需要重新填写。")}</p>
            <button className="primary-button" type="submit">
              {tr("连接后台")}
            </button>
          </form>
        </Dialog>
      )}
    </WarehouseProvider>
  );
}
