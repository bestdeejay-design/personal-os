import { useState, useEffect, type ReactNode } from "react";
import type { Meeting, Task, AgentMessage } from "../types";
import { getAgentInbox, getToday, getWeek, respondToAgent } from "../api";
import { useData } from "../useData";
import { useProfiles, isUnsorted } from "../ProfilesContext";
import { PriorityBadge } from "../components/PriorityBadge";
import { EmptyState } from "../components/EmptyState";
import { useLocale } from "../locales";
import { Sun, Bell, CheckCircle2, Calendar, AlertTriangle, Clock, MapPin } from "lucide-react";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function MorningBrief(): JSX.Element | null {
  const { t } = useLocale();
  const [brief, setBrief] = useState<AgentMessage | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    void getAgentInbox()
      .then((msgs) => {
        if (cancelled) return;
        const found = msgs.find(
          (m) => m.trigger_type === "daily_digest" && isToday(m.created_at) && !m.resolved,
        );
        setBrief(found ?? null);
      })
      .catch(() => {
        if (!cancelled) setBrief(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = async (id: string): Promise<void> => {
    try {
      await respondToAgent(id, "accept");
      setBrief(null);
      } catch {
        /* empty */
      }
  };

  if (brief === "loading") return null;
  if (!brief) return null;

  return (
    <div className="daily-brief">
      <div className="daily-brief-header">
        <span className="daily-brief-icon">🌅</span>
        <span className="daily-brief-title">{t("digests.morningBrief")}</span>
      </div>
      <p className="daily-brief-body">{brief.body}</p>
      <button type="button" className="btn ghost" onClick={() => dismiss(brief.id)}>
        {t("digests.dismiss")}
      </button>
    </div>
  );
}

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
  const { t } = useLocale();
  const { colorOf, nameOf } = useProfiles();

  const today = useData(() => getToday(), []);
  const week = useData(() => getWeek(activeProfiles), [activeProfiles.join(",")]);

  return (
    <div>
      <MorningBrief />

      <div className="section-head">
        <h2>{t("digests.title")}</h2>
        <div className="chips-row">
          <button
            type="button"
            className={"chip" + (mode === "today" ? " active" : "")}
            style={{ ["--chip-color" as string]: "var(--accent)" }}
            onClick={() => setMode("today")}
          >
            {t("digests.today")}
          </button>
          <button
            type="button"
            className={"chip" + (mode === "week" ? " active" : "")}
            style={{ ["--chip-color" as string]: "var(--accent)" }}
            onClick={() => setMode("week")}
          >
            {t("digests.week")}
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
  const { t } = useLocale();
  if (loading) return <div className="spinner">{t("common.loading")}</div>;
  if (error) return <EmptyState icon={<AlertTriangle size={32} />} title={t("digests.errorLoad")} hint={error} />;
  if (meetings.length === 0 && tasks.length === 0 && reminders.length === 0) {
    return (
      <EmptyState
        icon={<Sun size={32} />}
        title={t("digests.emptyTitle")}
        hint={t("digests.emptyHint")}
      />
    );
  }
  return (
    <div>
      {reminders.length > 0 ? (
        <Section title={t("digests.reminders")}>
          {reminders.map((r) => (
            <div key={r.id} className="list-item">
              <div className="title"><Bell size={16} /> {r.message}</div>
              <div className="meta">
                {isUnsorted(r.profile_ids) ? (
                  <span className="badge unsorted-badge">Unsorted</span>
                ) : (
                  r.profile_ids.map((id) => (
                    <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                      <span className="swatch" style={{ background: colorOf(id) }} />
                      {nameOf(id)}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </Section>
      ) : null}

      <Section title={t("digests.meetings", { count: String(meetings.length) })}>
        {meetings.length === 0 ? (
          <span className="muted">{t("digests.noMeetings")}</span>
        ) : (
          meetings.map((m) => (
            <div key={m.id} className="list-item">
              <div className="title"><Clock size={16} /> {m.title}</div>
              <div className="meta">
                <span>{fmt(m.start)}</span>
                {m.location ? <span><MapPin size={14} /> {m.location}</span> : null}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t("digests.tasksDue", { count: String(tasks.length) })}>
        {tasks.length === 0 ? (
          <span className="muted">{t("digests.noTasks")}</span>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="list-item">
              <div className="title"><CheckCircle2 size={16} /> {t.title}</div>
              <div className="meta">
                <PriorityBadge priority={t.priority} />
                {t.due_date ? <span><Calendar size={14} /> {fmt(t.due_date)}</span> : null}
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
  const { t } = useLocale();
  if (loading) return <div className="spinner">{t("common.loading")}</div>;
  if (error) return <EmptyState icon={<AlertTriangle size={32} />} title={t("digests.errorLoadWeek")} hint={error} />;
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
              {t("digests.free")}
            </span>
          ) : (
            <div className="list">
              {d.meetings.map((m) => (
                <div key={m.id} className="list-item">
                  <div className="title"><Clock size={16} /> {m.title}</div>
                  <div className="meta">
                    <span>{fmt(m.start)}</span>
                    {isUnsorted(m.profile_ids) ? (
                      <span className="badge unsorted-badge">Unsorted</span>
                    ) : (
                      m.profile_ids.map((id) => (
                        <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                          <span className="swatch" style={{ background: colorOf(id) }} />
                          {nameOf(id)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
              {d.tasks.map((t) => (
                <div key={t.id} className="list-item">
                  <div className="title"><CheckCircle2 size={16} /> {t.title}</div>
                  <div className="meta">
                    <PriorityBadge priority={t.priority} />
                    {isUnsorted(t.profile_ids) ? (
                      <span className="badge unsorted-badge">Unsorted</span>
                    ) : (
                      t.profile_ids.map((id) => (
                        <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                          <span className="swatch" style={{ background: colorOf(id) }} />
                          {nameOf(id)}
                        </span>
                      ))
                    )}
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
