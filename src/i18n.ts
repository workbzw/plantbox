import { currentLocale } from "./routing.ts";
import { english } from "./translations.en.ts";

export function tr(
  source: string,
  values: Record<string, string | number> = {},
) {
  const text = currentLocale() === "en" ? (english[source] ?? source) : source;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    String(values[key] ?? match),
  );
}
