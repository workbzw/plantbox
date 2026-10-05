import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { parseRoute, routeHref } from "./routing";
import { Landing } from "./Landing";
import "./website.css";

const WarehouseApp = lazy(() => import("./App"));
const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const snapshot = () => window.location.hash;

class DemoBoundary extends Component<
  { children: ReactNode; english: boolean },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="website-loading" role="alert">
        <img src="/favicon.svg" alt="" />
        <h1>
          {this.props.english ? "Unable to load the demo" : "演示加载失败"}
        </h1>
        <p>
          {this.props.english
            ? "Check your connection and reload to try again."
            : "请检查网络连接，重新加载后再试。"}
        </p>
        <button className="site-button" onClick={() => location.reload()}>
          {this.props.english ? "Reload" : "重新加载"}
        </button>
        <a href={routeHref(this.props.english ? "en" : "zh")}>
          {this.props.english ? "Back to home" : "返回首页"}
        </a>
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function Website() {
  const { locale, page } = parseRoute(
    useSyncExternalStore(subscribe, snapshot),
  );
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title =
      locale === "zh"
        ? `Plantbox · ${page === "demo" ? "仓储作业演示" : "让仓储作业，看得见"}`
        : `Plantbox · ${page === "demo" ? "Warehouse demo" : "Warehouse operations, made visible"}`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        locale === "zh"
          ? "Plantbox 是基于 React Three Fiber 的开源三维仓储演示。探索园区、跟随真实货物流转，查看库存与运输作业。"
          : "An open-source 3D warehouse simulation built with React Three Fiber. Explore a logistics site, follow physical cargo, and inspect inventory and shipments.",
      );
  }, [locale, page]);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.style.cursor = "";
  }, [page]);
  return page === "home" ? (
    <Landing locale={locale} />
  ) : (
    <DemoBoundary english={locale === "en"}>
      <Suspense
        fallback={
          <div className="website-loading" role="status">
            <img src="/favicon.svg" alt="" />
            <strong>
              {locale === "zh"
                ? "正在准备仓储演示"
                : "Preparing the warehouse demo"}
            </strong>
            <a href={routeHref(locale)}>
              {locale === "zh" ? "返回首页" : "Back to home"}
            </a>
          </div>
        }
      >
        <WarehouseApp locale={locale} />
      </Suspense>
    </DemoBoundary>
  );
}
