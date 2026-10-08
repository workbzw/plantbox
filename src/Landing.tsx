import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Code2,
  Forklift,
  Github,
  Layers3,
  MoveUpRight,
  Package,
  Play,
  Route,
  Truck,
  Warehouse,
} from "lucide-react";
import type { ReactNode } from "react";
import { readmeHref, routeHref } from "./routing";
import type { Locale } from "./routing";
import { LanguageSwitch, ProjectMenu } from "./WebsiteNav";

const copy = {
  zh: {
    nav: "首页体验",
    appIntro:
      "点击手机 App 的「确认入场」，看货车驶入园区。继续操作，完成装卸。",
    appNote: "纯前端交互演示 · 数据仅保留在当前页面 · 可随时重置",
    fullDemo: "完整仓储演示",
    capability: "项目能力",
    demo: "进入仓储演示",
    title: ["让仓储作业，", "看得见。"],
    spec: ["装卸月台", "作业叉车", "完整演示时长"],
    minutes: "分钟",
    built: "由这些开源技术构建",
    eyebrow: "01 / 从全景，到每一件货物",
    heading: "不只看见场景，\n也看见它如何运转。",
    description:
      "在手机 App 确认一次作业，在园区观看连续动画。进入完整演示，还能探索场景、物理搬运与货物流转。",
    features: [
      [
        "可探索的完整园区",
        "从仓内货架到月台、堆场和园区道路。每个模型由代码构建，每个视角都能自由探索。",
        "空间与交互",
      ],
      [
        "有来处，也有去处的货物",
        "叉车从货位取走真实存在的托盘，低位运输、停稳落货。装车后的货物留在车内，随车驶离。",
        "物理搬运",
      ],
      [
        "与作业一起变化的数据",
        "库存、运单和作业流水共享交付状态。交互工作台随确认更新，完整模拟随货物落位更新。",
        "统一作业状态",
      ],
    ],
    flowLabel: "02 / 一次完整的作业",
    flowTitle: "把过程，连成一条线。",
    flowIntro:
      "完整仓储演示中，从入园到离场，车辆运动与货物交付共同构成一次完整的仓储作业。",
    steps: [
      ["入园靠台", "货车沿转向约束行驶，停稳换向，倒车入位。"],
      ["取货搬运", "叉车对准叉孔，举升、退离，再降至运输高度。"],
      ["落位交付", "托盘在接收位置落稳，物理流水确认交付。"],
      ["同步离场", "库存与运单更新；出库货物留在车内，随车离场。"],
    ],
    inbound: "双向流转",
    inboundText:
      "橙色货车负责卸货入库，其余车辆装货出库。每个托盘都有独立编号与连续轨迹。",
    techLabel: "03 / 开放，也可继续构建",
    techTitle: "从一个场景，\n开始你的下一步。",
    techIntro:
      "完整源代码开放。用它研究三维交互、物理搬运与仓储可视化，也可以在此基础上接入自己的数据。",
    techItems: [
      "React + TypeScript 驱动界面",
      "React Three Fiber 编排三维场景",
      "Rapier 负责托盘刚体与接触",
      "程序化模型与本地字体，独立运行",
    ],
    docs: "阅读中文文档",
    scope:
      "单园区演示，包含手机交互工作台与 30 分钟完整物理模拟。数据为演示数据，尚未连接 WMS、ERP 或现场设备。",
    finalTitle: "下一站，园区现场。",
    finalText: "把镜头交给你，从第一件货物开始探索。",
    footer: "开源三维仓储作业演示",
    top: "返回顶部",
    menu: "官网导航",
    language: "中文 / English",
    repo: "源代码",
  },
  en: {
    nav: "Try the app",
    appIntro: "Confirm arrival in the app. Watch the truck enter the yard.",
    appNote: "Browser-only demo · Data stays in this page · Reset anytime",
    fullDemo: "Full warehouse demo",
    capability: "Capabilities",
    demo: "Launch warehouse demo",
    title: ["Warehouse operations,", "made visible."],
    spec: ["Loading docks", "Working forklifts", "Full demo runtime"],
    minutes: "min",
    built: "Built with open-source tools",
    eyebrow: "01 / From the whole site to a single pallet",
    heading: "See the place.\nUnderstand the process.",
    description:
      "Confirm work in the phone app and follow its animation in the yard. Explore the full simulation for physical cargo handling and a closer look at the site.",
    features: [
      [
        "A whole site to explore",
        "From warehouse shelves to docks, container yards and roads. Every model is built in code, and every view is yours to explore.",
        "Space & interaction",
      ],
      [
        "Cargo with a continuous journey",
        "Forklifts pick up existing pallets, carry them low and stop to place them. Loaded cargo stays on board as the truck leaves.",
        "Physical handling",
      ],
      [
        "Data that follows the work",
        "Inventory, shipments and activity share delivery state. The workspace updates on confirmation; the full simulation updates when cargo is placed.",
        "Shared operation state",
      ],
    ],
    flowLabel: "02 / One complete operation",
    flowTitle: "Every movement connects.",
    flowIntro:
      "In the full simulation, vehicle motion and physical deliveries connect every step from arrival to departure.",
    steps: [
      [
        "Arrive & dock",
        "Trucks follow steering constraints, stop to change gear, then reverse into position.",
      ],
      [
        "Pick & carry",
        "Forklifts align, lift and reverse clear before lowering to travel height.",
      ],
      [
        "Place & confirm",
        "Pallets settle on their receiving surface. Physics confirms the delivery.",
      ],
      [
        "Sync & depart",
        "Inventory and shipments update. Outbound cargo stays on board as the truck leaves.",
      ],
    ],
    inbound: "Two-way flow",
    inboundText:
      "The orange truck delivers inbound cargo; the other trucks collect outbound loads. Every pallet has its own ID and continuous path.",
    techLabel: "03 / Open to your next idea",
    techTitle: "One scene.\nA place to build on.",
    techIntro:
      "Explore the complete source. Study 3D interaction, physical handling and warehouse visualization, or connect your own data and take it further.",
    techItems: [
      "React + TypeScript for the interface",
      "React Three Fiber for the 3D scene",
      "Rapier for pallet bodies and contact",
      "Procedural models and local fonts",
    ],
    docs: "Read the English docs",
    scope:
      "A single-site demo with a phone workspace and a 30-minute physical simulation. All data is simulated; no WMS, ERP or field devices are connected.",
    finalTitle: "Your next stop: the warehouse.",
    finalText: "Take the camera. Start with a single pallet.",
    footer: "Open-source 3D warehouse simulation",
    top: "Back to top",
    menu: "Website navigation",
    language: "中文 / English",
    repo: "Source",
  },
};

export function Landing({ locale, app }: { locale: Locale; app: ReactNode }) {
  const c = copy[locale],
    demo = routeHref(locale, "demo");
  const icons = [Warehouse, Forklift, Layers3],
    flowIcons = [Truck, Forklift, Package, Route];
  return (
    <div className="website website-app-home">
      <header className="site-header">
        <a
          href={routeHref(locale)}
          className="site-brand"
          aria-label="Plantbox"
        >
          <img src="/favicon.svg" alt="" width="34" height="34" />
          <span>
            plantbox<span className="brand-dot">.</span>
          </span>
        </a>
        <nav className="site-nav" aria-label={c.menu}>
          <a
            className="site-nav-overview"
            href={routeHref(locale)}
            aria-current="page"
          >
            {c.nav}
          </a>
          <button
            className="site-nav-features"
            onClick={() =>
              document
                .getElementById("capabilities")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            {c.capability}
          </button>
          <ProjectMenu locale={locale} />
        </nav>
        <div className="site-header-actions">
          <LanguageSwitch locale={locale} page="home" />
          <a className="site-nav-cta" href={demo}>
            {locale === "zh" ? "仓储演示" : "Live demo"}
            <ArrowUpRight size={15} />
          </a>
        </div>
      </header>
      <main id="website-main">
        <section
          className="live-hero"
          aria-label={locale === "zh" ? "首页交互体验" : "Interactive homepage"}
        >
          <div className="live-hero-intro">
            <div>
              <p className="live-hero-kicker">
                BROWSER APP / WAREHOUSE OPERATIONS
              </p>
              <h1>
                {c.title[0]}
                {locale === "en" ? " " : ""}
                <span>{c.title[1]}</span>
              </h1>
              <p className="live-hero-description">{c.appIntro}</p>
            </div>
            <a className="live-hero-link" href={demo}>
              <Play size={14} />
              {c.fullDemo}
              <ArrowUpRight size={15} />
            </a>
          </div>
          <div id="homepage-app" className="homepage-app">
            {app}
          </div>
          <p className="live-hero-note">{c.appNote}</p>
        </section>
        <section
          className="site-width home-project-facts"
          aria-label={locale === "zh" ? "项目概况" : "Project at a glance"}
        >
          <div className="site-facts">
            {c.spec.map((label, i) => (
              <div key={label}>
                <strong>
                  {i === 2 ? "30" : "03"}
                  {i === 2 && <small>{c.minutes}</small>}
                </strong>
                <span>{label}</span>
              </div>
            ))}
            <div className="site-fact-source">
              <Code2 size={22} />
              <span>
                100%
                <small>{locale === "zh" ? "源代码开放" : "Open source"}</small>
              </span>
            </div>
          </div>
        </section>
        <div className="site-stack site-width">
          <span>{c.built}</span>
          <div>
            <b>React</b>
            <b>Three.js</b>
            <b>React Three Fiber</b>
            <b>TypeScript</b>
            <b>Rapier</b>
          </div>
        </div>
        <section id="capabilities" className="site-section site-width">
          <span className="site-eyebrow">{c.eyebrow}</span>
          <div className="section-intro">
            <h2>{c.heading}</h2>
            <p>{c.description}</p>
          </div>
          <div className="feature-grid">
            {c.features.map(([title, description, tag], i) => {
              const Icon = icons[i];
              return (
                <article className="feature-card" key={title}>
                  <div
                    className={`feature-art feature-art-${i}`}
                    aria-hidden="true"
                  >
                    {i === 0 ? (
                      <div className="mini-warehouse">
                        <div />
                        <div />
                        <div />
                        <i />
                        <i />
                        <i />
                      </div>
                    ) : i === 1 ? (
                      <div className="mini-cargo">
                        <span />
                        <span />
                        <span />
                        <Forklift size={94} strokeWidth={1.05} />
                        <Box size={39} strokeWidth={1.3} />
                      </div>
                    ) : (
                      <div className="mini-ledger">
                        <span>
                          <i />
                          <b>PAL-01</b>
                          <Check size={12} />
                        </span>
                        <span>
                          <i />
                          <b>PAL-02</b>
                          <Check size={12} />
                        </span>
                        <span>
                          <i />
                          <b>PAL-03</b>
                          <Check size={12} />
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="feature-copy">
                    <span>
                      <Icon size={14} />
                      {tag}
                    </span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className="workflow-section">
          <div className="site-width">
            <span className="site-eyebrow">{c.flowLabel}</span>
            <div className="section-intro">
              <h2>{c.flowTitle}</h2>
              <p>{c.flowIntro}</p>
            </div>
            <div className="workflow-grid">
              {c.steps.map(([title, description], i) => {
                const Icon = flowIcons[i];
                return (
                  <article key={title}>
                    <div className="workflow-number">
                      <span>0{i + 1}</span>
                      <Icon size={22} />
                      <ArrowRight size={16} />
                    </div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </article>
                );
              })}
            </div>
            <div className="workflow-note">
              <span>
                <i />
                {c.inbound}
              </span>
              <p>{c.inboundText}</p>
            </div>
          </div>
        </section>
        <section className="site-section site-width build-section">
          <div>
            <span className="site-eyebrow">{c.techLabel}</span>
            <h2>{c.techTitle}</h2>
            <p>{c.techIntro}</p>
            <a
              className="site-text-link"
              href={readmeHref(locale)}
              target="_blank"
              rel="noreferrer"
            >
              {c.docs}
              <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="build-card">
            <div>
              <img src="/favicon.svg" alt="" width="32" height="32" />
              <span>
                workbzw / <b>plantbox</b>
              </span>
              <Github size={20} />
            </div>
            <ul>
              {c.techItems.map((item) => (
                <li key={item}>
                  <Check size={16} />
                  {item}
                </li>
              ))}
            </ul>
            <p>{c.scope}</p>
          </div>
        </section>
        <section className="site-width final-cta">
          <div className="final-icon">
            <Box size={33} strokeWidth={1.3} />
          </div>
          <div>
            <h2>{c.finalTitle}</h2>
            <p>{c.finalText}</p>
          </div>
          <a className="site-button" href={demo}>
            {c.demo}
            <MoveUpRight size={18} />
          </a>
        </section>
      </main>
      <footer className="site-footer site-width">
        <div>
          <a href={routeHref(locale)} className="site-brand">
            <img src="/favicon.svg" alt="" width="25" height="25" />
            <span>plantbox.</span>
          </a>
          <p>{c.footer}</p>
        </div>
        <nav>
          <a href={readmeHref(locale)} target="_blank" rel="noreferrer">
            README
            <ArrowUpRight size={12} />
          </a>
          <a
            href="https://github.com/workbzw/plantbox"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <ArrowUpRight size={12} />
          </a>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            {c.top} ↑
          </button>
        </nav>
      </footer>
    </div>
  );
}
