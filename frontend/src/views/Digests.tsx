import { useState, type ReactNode } from "react";
import type { Meeting, Task } from "../types";
import { getToday, getWeek } from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { PriorityBadge } from "../components/PriorityBadge";
import { EmptyState } from "../components/EmptyState";

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Digests({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const [mode, setMode] = useState<"today" | "week">("today");
  const { colorOf, nameOf } = useProfiles();

  const today = useData(() => getToday(), []);
  const week = useData(() => getWeek(activeProfiles), [activeProfiles.join(",")]);

  return (
    <div>
      <div className="section-head">
        <h2>Digests</h2>
        <div className="chips-row">
          <button
            type="button"
            className={"chip" + (mode === "today" ? " active" : "")}
            style={{ ["--chip-color" as string]: "var(--accent)" }}
            onClick={() => setMode("today")}
          >
            Today
          </button>
          <button
            type="button"
            className={"chip" + (mode === "week" ? " active" : "")}
            style={{ ["--chip-color" as string]: "var(--accent)" }}
            onClick={() => setMode("week")}
          >
            Week
          </button>
        </div>
      </div>

      {mode === "today" ? (
        <TodayView
          loading={today.loading}
          error={today.error}
          meetings={today.data?.meetings ?? []}
          tasks={today.data?.tasks ?? []}
          reminders={today.data?.reminders ?? []}
          colorOf={colorOf}
          nameOf={nameOf}
        />
      ) : (
        <WeekView
          loading={week.loading}
          error={week.error}
          days={week.data?.days ?? []}
          colorOf={colorOf}
          nameOf={nameOf}
        />
      )}
    </div>
  );
}

function TodayView({
  loading,
  error,
  meetings,
  tasks,
  reminders,
  colorOf,
  nameOf,
}: {
  loading: boolean;
  error: string | null;
  meetings: Meeting[];
  tasks: Task[];
  reminders: { id: string; message: string; profile_ids: string[] }[];
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}): JSX.Element {
  if (loading) return <div className="spinner">Loading…</div>;
  if (error) return <EmptyState emoji="⚠️" title="Could not load digest" hint={error} />;
  if (meetings.length === 0 && tasks.length === 0 && reminders.length === 0) {
    return (
      <EmptyState
        emoji="🌤️"
        title="All clear today"
        hint="No meetings, due tasks, or reminders. Enjoy the calm."
      />
    );
  }
  return (
    <div>
      {reminders.length > 0 ? (
        <Section title="Reminders">
          {reminders.map((r) => (
            <div key={r.id} className="list-item">
              <div className="title">🔔 {r.message}</div>
              <div className="meta">
                {r.profile_ids.map((id) => (
                  <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                    <span className="swatch" style={{ background: colorOf(id) }} />
                    {nameOf(id)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Section>
      ) : null}

      <Section title={`Meetings (${meetings.length})`}>
        {meetings.length === 0 ? (
          <span className="muted">No meetings today.</span>
        ) : (
          meetings.map((m) => (
            <div key={m.id} className="list-item">
              <div className="title">🕑 {m.title}</div>
              <div className="meta">
                <span>{fmt(m.start)}</span>
                {m.location ? <span>📍 {m.location}</span> : null}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={`Tasks due (${tasks.length})`}>
        {tasks.length === 0 ? (
          <span className="muted">No tasks due today.</span>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="list-item">
              <div className="title">✅ {t.title}</div>
              <div className="meta">
                <PriorityBadge priority={t.priority} />
                {t.due_date ? <span>📅 {fmt(t.due_date)}</span> : null}
              </div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function WeekView({
  loading,
  error,
  days,
  colorOf,
  nameOf,
}: {
  loading: boolean;
  error: string | null;
  days: { date: string; meetings: Meeting[]; tasks: Task[] }[];
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}): JSX.Element {
  if (loading) return <div className="spinner">Loading…</div>;
  if (error) return <EmptyState emoji="⚠️" title="Could not load week" hint={error} />;
  return (
    <div>
      {days.map((d) => (
        <div key={d.date} className="day-group">
          <h3>
            {new Date(d.date).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </h3>
          {d.meetings.length === 0 && d.tasks.length === 0 ? (
            <span className="muted" style={{ fontSize: 12 }}>
              — free —
            </span>
          ) : (
            <div className="list">
              {d.meetings.map((m) => (
                <div key={m.id} className="list-item">
                  <div className="title">🕑 {m.title}</div>
                  <div className="meta">
                    <span>{fmt(m.start)}</span>
                    {m.profile_ids.map((id) => (
                      <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                        <span className="swatch" style={{ background: colorOf(id) }} />
                        {nameOf(id)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {d.tasks.map((t) => (
                <div key={t.id} className="list-item">
                  <div className="title">✅ {t.title}</div>
                  <div className="meta">
                    <PriorityBadge priority={t.priority} />
                    {t.profile_ids.map((id) => (
                      <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                        <span className="swatch" style={{ background: colorOf(id) }} />
                        {nameOf(id)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="search-group">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
