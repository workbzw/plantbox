import { Bell, ChevronRight, Command, Search } from "lucide-react";
import { useState } from "react";
import { localeSeparator } from "../../components/format";
import { IconButton } from "../../components/ui";
import { displayInventory } from "../../data/presentation";
import { useWarehouseSnapshot } from "../../data/WarehouseProvider";
import { tr } from "../../i18n";
import type { Locale } from "../../routing";
import { routeHref } from "../../routing";
import { formatClock } from "../../simulation";
import { useSimulationStore } from "../../state/simulationStore";
import { useUIStore as useStore } from "../../state/uiStore";
import "../../styles.css";
import { LanguageSwitch, ProjectMenu } from "../../WebsiteNav";
export function DemoHeader({
  locale,
  onSearch,
  onSettings,
}: {
  locale: Locale;
  onSearch: () => void;
  onSettings: () => void;
}) {
  const time = useSimulationStore((s) => s.time),
    paused = useSimulationStore((s) => s.paused),
    simulationReady = useSimulationStore((s) => s.simulationReady);
  const snapshot = useWarehouseSnapshot();
  const lowItems = snapshot.inventory
    .filter((s) => s.low)
    .map(displayInventory);
  const [notifications, setNotifications] = useState(false);
  return (
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
        <button className="global-search" onClick={() => onSearch()}>
          <Search size={17} />
          <span>{tr("搜索车辆、货物、运单...")}</span>
          <kbd>
            <Command size={11} /> K
          </kbd>
        </button>
        <button
          className={`simulation-pill ${paused ? "paused" : ""}`}
          onClick={() => useSimulationStore.getState().togglePause()}
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
          onClick={() => onSettings()}
        >
          TC
        </button>
      </div>
    </header>
  );
}
