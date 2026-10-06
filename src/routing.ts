export type Locale = "zh" | "en";
export type WebsitePage = "home" | "demo" | "operations";

// Hash URLs also work when dist is served without a server-side route fallback.
export function parseRoute(hash: string): {
  locale: Locale;
  page: WebsitePage;
} {
  const [language, page] = hash.replace(/^#\/?/, "").split("/");
  return {
    locale: language === "en" ? "en" : "zh",
    page:
      page === "operations" ? "operations" : page === "demo" ? "demo" : "home",
  };
}

export function routeHref(locale: Locale, page: WebsitePage = "home") {
  return `#/${locale}${page === "home" ? "" : `/${page}`}`;
}

export function currentLocale(): Locale {
  return typeof window === "undefined"
    ? "zh"
    : parseRoute(window.location.hash).locale;
}

export function readmeHref(locale: Locale) {
  return `https://github.com/workbzw/plantbox/blob/main/README${locale === "en" ? ".en" : ""}.md`;
}
