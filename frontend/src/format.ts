function getSetting(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return (window as unknown as Record<string, string>)[`__setting_${key}`] ?? localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function is24h(): boolean {
  return getSetting("personalos_time_format", "24h") === "24h";
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !is24h(),
  });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function formatDue(due: string | null | undefined): string {
  if (!due) return "—";
  return due.slice(0, 10);
}

export function weekStartOffset(): number {
  const setting = getSetting("personalos_week_start_day", "monday");
  return setting === "monday" ? 1 : 0;
}

export function getWeekStart(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const offset = weekStartOffset();
  const diff = (day - offset + 7) % 7;
  now.setDate(now.getDate() - diff);
  return now;
}
