import type { Locale } from "@/i18n";

// 时间与数据格式化工具

export function relativeTime(ts: number | null, locale: Locale = "zh-CN"): string {
  if (!ts) return "—";
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  const fmt = (val: number, unit: string) =>
    locale === "en-US"
      ? diff >= 0 ? `in ${val}${unit}` : `${val}${unit} ago`
      : diff >= 0 ? `剩余 ${val}${unit}` : `${val}${unit}前`;

  if (abs < MIN) return locale === "en-US" ? (diff >= 0 ? "soon" : "just now") : (diff >= 0 ? "即将" : "刚刚");
  if (abs < HOUR) return fmt(Math.floor(abs / MIN), "m");
  if (abs < DAY) return fmt(Math.floor(abs / HOUR), "h");
  return fmt(Math.floor(abs / DAY), "d");
}

export function countdown(ts: number | null, locale: Locale = "zh-CN"): { text: string; urgent: boolean; overdue: boolean } {
  if (!ts) return { text: locale === "en-US" ? "No deadline" : "无截止", urgent: false, overdue: false };
  const diff = ts - Date.now();
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (diff < 0) {
    const abs = Math.abs(diff);
    const overdue = (value: number, unit: string) => locale === "en-US" ? `Overdue ${value}${unit}` : `逾期 ${value}${unit}`;
    if (abs < HOUR) return { text: overdue(Math.floor(abs / MIN), "m"), urgent: true, overdue: true };
    if (abs < DAY) return { text: overdue(Math.floor(abs / HOUR), "h"), urgent: true, overdue: true };
    return { text: overdue(Math.floor(abs / DAY), "d"), urgent: true, overdue: true };
  }
  if (diff < HOUR) return { text: `T-${Math.floor(diff / MIN)}m`, urgent: true, overdue: false };
  if (diff < DAY) return { text: `T-${Math.floor(diff / HOUR)}h`, urgent: false, overdue: false };
  return { text: `T-${Math.floor(diff / DAY)}d`, urgent: false, overdue: false };
}

export function clockTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function shortTime(ts: number): string {
  const d = new Date(ts);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mo}-${da} ${hh}:${mm}`;
}

export const PRIORITY_LABEL: Record<string, string> = {
  critical: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

export const PRIORITY_COLOR: Record<string, string> = {
  critical: "rgb(var(--coral))",
  high: "rgb(var(--amber-500))",
  medium: "rgb(var(--phosphor-400))",
  low: "rgb(var(--jade))",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "进行中",
  paused: "已暂停",
  done: "已完成",
  archived: "已归档",
};

export function priorityLabel(priority: string, locale: Locale = "zh-CN") {
  if (locale === "zh-CN") return PRIORITY_LABEL[priority] ?? priority;
  return ({ critical: "Critical", high: "High", medium: "Medium", low: "Low" } as Record<string, string>)[priority] ?? priority;
}

export function statusLabel(status: string, locale: Locale = "zh-CN") {
  if (locale === "zh-CN") return STATUS_LABEL[status] ?? status;
  return ({ active: "Active", paused: "Paused", done: "Completed", archived: "Archived" } as Record<string, string>)[status] ?? status;
}
