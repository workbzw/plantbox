import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Box,
  Boxes,
  Building2,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Container,
  Crosshair,
  Expand,
  Forklift,
  Layers3,
  LayoutDashboard,
  MousePointer2,
  Package,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Dialog, IconButton, SceneBoundary } from "./components/ui";
import { SITE } from "./config/site";
import { skus, trucks } from "./data/demoSelectors";
import { createDemoSource } from "./data/demoSource";
import { WarehouseProvider } from "./data/WarehouseProvider";
import { ActivityPage } from "./features/activity/ActivityPage";
import { Inspector } from "./features/inspector/Inspector";
import { InventoryPage } from "./features/inventory/InventoryPage";
import {
  CameraTools,
  Kpis,
  MiniMap,
  OperationTimeline,
} from "./features/scene/ScenePanels";
import { DemoHeader } from "./features/shell/DemoHeader";
import { DemoPlayback } from "./features/shell/DemoPlayback";
import { ShipmentsPage } from "./features/shipments/ShipmentsPage";
import { tr } from "./i18n";
import type { Locale } from "./routing";
import { currentLocale } from "./routing";
import { DemoRuntime, resetDemo } from "./runtime/DemoRuntime";
import type { Selection } from "./simulation";
import { useSimulationStore } from "./state/simulationStore";
import type { Page } from "./state/uiStore";
import { useUIStore as useStore } from "./state/uiStore";
import "./styles.css";
const Scene = lazy(() => import("./Scene"));
function DemoApp({ locale }: { locale: Locale }) {
  useEffect(() => {
    useStore.getState().setPage("scene");
  }, []);
  useEffect(() => {
    // Transient notifications were formatted in the previous language.
    useStore.getState().notify(null);
  }, [locale]);
  const page = useStore((s) => s.page),
    notice = useStore((s) => s.notice),
    quality = useStore((s) => s.quality);
  const selection = useStore((s) => s.selected);
  const [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false),
    [mobileDetails, setMobileDetails] = useState(false);
  useEffect(() => {
    if (window.innerWidth <= 850 && selection.kind !== "site")
      setMobileDetails(true);
  }, [selection]);
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
        useSimulationStore.getState().togglePause();
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
      label: tr(SITE.name),
      sub: tr("WH-01 · 仓储站点"),
      icon: Warehouse,
      selection: { kind: "site", id: SITE.id },
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
      selection: { kind: "site" as const, id: SITE.id },
      page: "inventory" as const,
    })),
  ];
  const searchResults = allResults.filter((r) =>
    `${r.label}${r.sub}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <DemoRuntime />
      <DemoHeader
        locale={locale}
        onSearch={() => setSearchOpen(true)}
        onSettings={() => setSettings(true)}
      />
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
                    {SITE.parkName}
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
                <span className="scene-coordinates">{SITE.coordinates}</span>
              </div>
              <MiniMap />
              <div className="bottom-workspace">
                <DemoPlayback />
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
                  resetDemo();
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

export default function App({ locale }: { locale: Locale }) {
  const source = useMemo(() => createDemoSource(), []);
  return (
    <WarehouseProvider source={source}>
      <DemoApp locale={locale} />
    </WarehouseProvider>
  );
}
