import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Github,
  Globe2,
  Home,
  Warehouse,
  BookOpen,
} from "lucide-react";
import { readmeHref, routeHref } from "./routing";
import type { Locale, WebsitePage } from "./routing";

export function LanguageSwitch({
  locale,
  page,
}: {
  locale: Locale;
  page: WebsitePage;
}) {
  const next = locale === "zh" ? "en" : "zh";
  return (
    <a
      className="language-switch"
      href={routeHref(next, page)}
      lang={next === "zh" ? "zh-CN" : "en"}
      hrefLang={next === "zh" ? "zh-CN" : "en"}
      aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
    >
      <Globe2 size={16} />
      <span>{locale === "zh" ? "EN" : "中文"}</span>
    </a>
  );
}

export function ProjectMenu({
  locale,
  demo = false,
  onDemoClick,
}: {
  locale: Locale;
  demo?: boolean;
  onDemoClick?: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      ) {
        if (ref.current) ref.current.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details className="project-menu" ref={ref}>
      <summary>
        {locale === "zh"
          ? demo
            ? "仓储演示"
            : "探索项目"
          : demo
            ? "Warehouse demo"
            : "Explore"}
        <ChevronDown size={14} />
      </summary>
      <nav
        aria-label={locale === "zh" ? "项目菜单" : "Project menu"}
        onClick={() => {
          if (ref.current) ref.current.open = false;
        }}
      >
        <a href={routeHref(locale)}>
          <Home size={17} />
          {locale === "zh" ? "项目介绍" : "Project overview"}
        </a>
        <a
          href={routeHref(locale, "demo")}
          aria-current={demo ? "page" : undefined}
          onClick={onDemoClick}
        >
          <Warehouse size={17} />
          {locale === "zh" ? "完整仓储演示" : "Full warehouse demo"}
        </a>
        <a href={readmeHref(locale)} target="_blank" rel="noreferrer">
          <BookOpen size={17} />
          {locale === "zh" ? "项目文档" : "Documentation"}
          <ArrowUpRight size={13} />
        </a>
        <a
          href="https://github.com/workbzw/plantbox"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={17} />
          GitHub
          <ArrowUpRight size={13} />
        </a>
      </nav>
    </details>
  );
}
