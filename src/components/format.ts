import { currentLocale } from "../routing";
export const localeSeparator = () => (currentLocale() === "zh" ? "、" : ", ");
export const fmt = (n: number) => n.toLocaleString("en-US");
