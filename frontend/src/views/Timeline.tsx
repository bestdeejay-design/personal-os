import { useMemo, useState } from "react";
import type { Conflict, TimelineItem } from "../types";
import { getConflicts, getTimeline } from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import "./Timeline.css";

type RangeKey = "week" | "month" | "quarter";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "quarter", label: "Квартал" },
];

const TYPE_ICON: Record<TimelineItem["type"], string> = {
  note: "📝",
  task: "✅",
  meeting: "📅",
};

const dayFmt = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  day: "numeric",
  month: "long",
});

const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

function rangeBounds(range: RangeKey): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 7);
  const to = new Date(now);
  if (range === "week") to.setDate(now.getDate() + 7);
  else if (range === "quarter") to.setDate(now.getDate() + 90);
  else to.setDate(now.getDate() + 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  return dayFmt.format(new Date(iso));
}

function timeLabel(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function Timeline({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const [range, setRange] = useState<RangeKey>("month");
  const { colorOf, nameOf } = useProfiles();

  const { from, to } = rangeBounds(range);

  const timelineState = useData<TimelineItem[]>(
    () => getTimeline({ from, to, profile: activeProfiles }),
    [activeProfiles.join(","), range],
  );
  const conflictsState = useData<Conflict[]>(
    () => getConflicts(activeProfiles),
    [activeProfiles.join(","), range],
  );

  const conflictIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflictsState.data ?? []) {
      for (const it of c.items) set.add(it.id);
    }
    return set;
  }, [conflictsState.data]);

  const days = useMemo(() => {
    const items = timelineState.data ?? [];
    const map = new Map<string, TimelineItem[]>();
    for (const it of items) {
      const key = dayKey(it.start);
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    const sorted = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [, arr] of sorted) {
      arr.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    }
    return sorted;
  }, [timelineState.data]);

  const conflicts = conflictsState.data ?? [];
  const items = timelineState.data ?? [];
  const loading = timelineState.loading || conflictsState.loading;
  const error = timelineState.error ?? conflictsState.error;

  return (
    <div className="tl-view">
      <div className="section-head">
        <h2>Timeline</h2>
        <div className="tl-range" role="group" aria-label="Диапазон">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={"tl-range-btn" + (range === r.key ? " active" : "")}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {conflicts.length > 0 ? (
        <div className="tl-banner" role="alert">
          ⚠ Найдено конфликтов: {conflicts.length}
        </div>
      ) : null}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : error ? (
        <div className="empty">
          <span className="emoji">⚠️</span>
          <p>Не удалось загрузить ленту</p>
          <p className="muted">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <span className="emoji">🗓️</span>
          <p>Нет событий в этом диапазоне</p>
        </div>
      ) : (
        <div className="tl-days">
          {days.map(([key, dayItems]) => (
            <section key={key} className="tl-day">
              <h3 className="tl-day-head">{dayLabel(dayItems[0]?.start ?? "")}</h3>
              <div className="tl-items">
                {dayItems.map((item) => {
                  const conflicted = conflictIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={"tl-item" + (conflicted ? " conflict" : "")}
                    >
                      <span className="tl-icon" aria-hidden="true">
                        {TYPE_ICON[item.type]}
                      </span>
                      <div className="tl-body">
                        <div className="tl-title-row">
                          <span className="tl-title">{item.title}</span>
                          {item.type === "task" && item.done ? (
                            <span className="tl-done" title="Выполнено">
                              ✓
                            </span>
                          ) : null}
                          {conflicted ? (
                            <span className="tl-conflict-badge">⚠ конфликт</span>
                          ) : null}
                        </div>
                        <div className="tl-meta">
                          <span className="tl-time">{timeLabel(item.start)}</span>
                          <span className="tl-chips">
                            {item.profile_ids.map((pid) => (
                              <span key={pid} className="tl-chip">
                                <span
                                  className="tl-chip-swatch"
                                  style={{ background: colorOf(pid) }}
                                />
                                {nameOf(pid)}
                              </span>
                            ))}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
