import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../locales";
import { formatTime, formatDateTime, getWeekStart } from "../format";
import type { Meeting, Profile, Project, Recurrence } from "../types";
import {
  createMeeting,
  createNote,
  deleteMeeting,
  downloadMeetingIcs,
  getCalendar,
  getProjects,
  updateMeeting,
  getCalendars,
  getCalendarEvents,
  linkCalendarEvent,
  type ExternalEvent,
} from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { AlertTriangle, Calendar as CalendarIcon, Clock, CalendarDays, MapPin, Settings } from "lucide-react";
import { ProfileChips } from "../components/ProfileChips";
import { Modal } from "../components/Modal";
import { CalendarSettings } from "../components/CalendarSettings";
import { EmptyState } from "../components/EmptyState";
import { isUnsorted } from "../ProfilesContext";
import { useToast } from "../components/Toast";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

type RecurrenceRule = Exclude<Recurrence, null>;

function RecurrenceControl({
  value,
  onChange,
}: {
  value: RecurrenceRule;
  onChange: (r: RecurrenceRule) => void;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="row">
      <div className="field" style={{ flex: 1 }}>
        <label>{t("calendar.recurrenceInterval")}</label>
        <input
          type="number"
          min={1}
          value={value.interval ?? 1}
          onChange={(e) => onChange({ ...value, interval: Number(e.target.value) || 1 })}
        />
      </div>
      <div className="field" style={{ flex: 1 }}>
        <label>{t("calendar.recurrenceUntil")}</label>
        <input
          type="date"
          value={value.until ? value.until.slice(0, 10) : ""}
          onChange={(e) => onChange({ ...value, until: e.target.value || null })}
        />
      </div>
    </div>
  );
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

interface EventFormState {
  id?: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  profile_ids: string[];
  linked_project_id: string;
  notes_md: string;
  location: string;
  recurrence: Recurrence;
  _invalidCount: number;
}

const EMPTY_FORM: EventFormState = {
  title: "",
  start: "",
  end: "",
  all_day: false,
  profile_ids: [],
  linked_project_id: "",
  notes_md: "",
  location: "",
  recurrence: null,
  _invalidCount: 0,
};

export function Calendar({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const { t } = useLocale();
  const [mode, setMode] = useState<"day" | "week">("day");
  const [day, setDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState<EventFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [linkingEvent, setLinkingEvent] = useState<ExternalEvent | null>(null);
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);
  const [calRefreshKey, setCalRefreshKey] = useState(0);
  const { profiles, colorOf, nameOf } = useProfiles();
  const validProfileIds = useMemo(() => new Set(profiles.map((p) => p.id)), [profiles]);

  const from = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const to = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data, loading, error, reload } = useData<Meeting[]>(
    () => getCalendar({ from, to, profile: activeProfiles }),
    [activeProfiles.join(",")],
  );
  const projectsState = useData<Project[]>(() => getProjects(), []);

  useEffect(() => {
    void getCalendars().then((cals) => {
      const loadEvents = async (): Promise<void> => {
        const all: ExternalEvent[] = [];
        for (const cal of cals) {
          const evts = await getCalendarEvents(cal.id, { start: from, end: to });
          all.push(...evts);
        }
        setExternalEvents(all);
      };
      void loadEvents();
    }).catch(() => {});
  }, [from, to, calRefreshKey]);

  const events = data ?? [];

  const dayEvents = useMemo(
    () => events.filter((e) => dayKey(e.start) === day),
    [events, day],
  );

  const dayExternalEvents = useMemo(
    () => externalEvents.filter((e) => dayKey(e.start) === day),
    [externalEvents, day],
  );

  const weekExternalEvents = useMemo(() => {
    const days: { key: string; items: ExternalEvent[] }[] = [];
    const base = getWeekStart();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        key,
        items: externalEvents.filter((e) => dayKey(e.start) === key),
      });
    }
    return days;
  }, [externalEvents]);

  const downloadIcs = async (id: string, title: string): Promise<void> => {
    const blob = await downloadMeetingIcs(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "event"}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const openCreate = (): void => {
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    setForm({
      ...EMPTY_FORM,
      start: toLocalInput(now.toISOString()),
      end: toLocalInput(later.toISOString()),
    });
  };

  const openEdit = (e: Meeting): void => {
    setForm({
      id: e.id,
      title: e.title,
      start: toLocalInput(e.start),
      end: toLocalInput(e.end),
      all_day: e.all_day,
      profile_ids: e.profile_ids.filter((id) => validProfileIds.has(id)),
      linked_project_id: e.linked_project_id ?? "",
      notes_md: e.notes_md ?? "",
      location: e.location ?? "",
      recurrence: e.recurrence ?? null,
      _invalidCount: e.profile_ids.length - e.profile_ids.filter((id) => validProfileIds.has(id)).length,
    });
  };

  const submit = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
        all_day: form.all_day,
        profile_ids: form.profile_ids,
        linked_project_id: form.linked_project_id || null,
        notes_md: form.notes_md,
        location: form.location || null,
        recurrence: form.recurrence,
      };
      if (form.id) {
        await updateMeeting(form.id, payload);
      } else {
        await createMeeting(payload);
      }
      setForm(null);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    await deleteMeeting(id);
    reload();
  };

  const handleUpdateEvent = async (id: string, start: string, end: string): Promise<void> => {
    await updateMeeting(id, { start, end });
    reload();
  };

  const handleLinkEvent = async (
    eventId: string,
    link: { linked_project_id?: string | null; linked_task_id?: string | null; linked_note_id?: string | null; linked_meeting_id?: string | null; profile_ids?: string[] },
  ): Promise<void> => {
    await linkCalendarEvent(eventId, link);
    setLinkingEvent(null);
    const updated = externalEvents.map((e) =>
      e.id === eventId ? { ...e, ...link } : e,
    );
    setExternalEvents(updated);
  };

  return (
    <div>
      <div className="section-head">
        <h2>{t("calendar.title")}</h2>
        <div className="row">
          <div className="chips-row">
            <button
              type="button"
              className={"chip" + (mode === "day" ? " active" : "")}
              style={{ ["--chip-color" as string]: "var(--accent)" }}
              onClick={() => setMode("day")}
            >
              {t("calendar.day")}
            </button>
            <button
              type="button"
              className={"chip" + (mode === "week" ? " active" : "")}
              style={{ ["--chip-color" as string]: "var(--accent)" }}
              onClick={() => setMode("week")}
            >
              {t("calendar.week")}
            </button>
          </div>
          <button type="button" className="btn" onClick={openCreate}>
            + {t("calendar.new")}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setCalendarSettingsOpen(true)}
            title={t("settings.calendars")}
            aria-label={t("settings.calendars")}
            style={{ marginLeft: 4 }}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {mode === "day" ? (
        <div className="field" style={{ maxWidth: 240 }}>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
      ) : null}

      {loading ? (
        <div className="spinner">{t("common.loading")}</div>
      ) : error ? (
        <EmptyState icon={<AlertTriangle size={32} />} title={t("calendar.errorLoad")} hint={error} />
      ) : mode === "day" ? (
        dayEvents.length === 0 && dayExternalEvents.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={32} />}
            title={t("calendar.nothing")}
            hint={t("calendar.nothingHint")}
          />
        ) : (
          <>
            {dayEvents.length > 0 ? (
              <EventList
                events={dayEvents}
                onDownload={downloadIcs}
                onEdit={openEdit}
                onDelete={remove}
                onReload={reload}
                colorOf={colorOf}
                nameOf={nameOf}
              />
            ) : null}
            {dayExternalEvents.length > 0 ? (
              <ExternalEventList
                events={dayExternalEvents}
                onLink={setLinkingEvent}
              />
            ) : null}
          </>
        )
      ) : (
        <>
          <WeekGrid
            events={events}
            onEdit={openEdit}
            onUpdate={handleUpdateEvent}
            colorOf={colorOf}
          />
          <div className="list" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {t("calendar.title")} — external
            </div>
            {weekExternalEvents.some((d) => d.items.length > 0) ? (
              weekExternalEvents.map((d) =>
                d.items.map((e) => (
                  <div key={e.id} className="list-item" style={{ borderLeft: "3px solid var(--accent)", opacity: e.linked_project_id || e.linked_task_id || e.linked_note_id ? 0.7 : 1 }}>
                    <div className="title" style={{ fontSize: 12 }}>
                      <CalendarDays size={14} /> {e.title}
                    </div>
                    <div className="meta" style={{ fontSize: 11 }}>
                      <span>{formatDateTime(e.start)} → {formatTime(e.end)}</span>
                    </div>
                    <div className="row" style={{ marginTop: 4, gap: 6 }}>
                      <button type="button" className="btn ghost" onClick={() => setLinkingEvent(e)}>
                        {e.linked_project_id || e.linked_task_id || e.linked_note_id ? t("calendar.edit") : t("calendar.fieldProject")}
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>{t("calendar.free")}</span>
            )}
          </div>
        </>
      )}

      {form ? (
        <EventModal
          form={form}
          profiles={profiles}
          projects={projectsState.data ?? []}
          saving={saving}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSave={submit}
        />
      ) : null}

      {linkingEvent ? (
        <LinkEventModal
          event={linkingEvent}
          profiles={profiles}
          projects={projectsState.data ?? []}
          onLink={handleLinkEvent}
          onClose={() => setLinkingEvent(null)}
        />
      ) : null}

      <CalendarSettings
        open={calendarSettingsOpen}
        onClose={() => setCalendarSettingsOpen(false)}
        onCalendarsChange={() => setCalRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

function EventList({
  events,
  onDownload,
  onEdit,
  onDelete,
  onReload,
  colorOf,
  nameOf,
}: {
  events: Meeting[];
  onDownload: (id: string, title: string) => void;
  onEdit?: (e: Meeting) => void;
  onDelete?: (id: string) => void;
  onReload?: () => void;
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}): JSX.Element {
  const { t } = useLocale();
  const toast = useToast();
  return (
    <div className="list">
      {events.map((e) => (
        <div key={e.id} className="list-item">
          <div className="title">
            {e.all_day ? <CalendarDays size={16} /> : <Clock size={16} />}{' '}
            {e.title}
          </div>
          <div className="meta">
            <span>
              {formatDateTime(e.start)} → {formatTime(e.end)}
            </span>
            {e.location ? <span><MapPin size={14} /> {e.location}</span> : null}
            {isUnsorted(e.profile_ids) ? (
              <span className="badge unsorted-badge">{t("common.unsorted")}</span>
            ) : (
              e.profile_ids.map((id) => (
                <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                  <span className="swatch" style={{ background: colorOf(id) }} />
                  {nameOf(id)}
                </span>
              ))
            )}
          </div>
          {e.notes_md ? (
            <div className="md-preview" style={{ marginTop: 6, fontSize: 12, padding: 8 }}>
              {e.notes_md.slice(0, 200)}{e.notes_md.length > 200 ? "…" : ""}
            </div>
          ) : null}
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            {new Date(e.end) < new Date() ? (
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  await createNote({
                    title: `Summary: ${e.title}`,
                    body_md: "",
                    profile_ids: e.profile_ids,
                    tags: [],
                    linked_meeting_id: e.id,
                    linked_project_id: e.linked_project_id,
                  });
                  toast.push(t("calendar.summaryCreated"), "");
                  onReload?.();
                }}
              >
                {t("calendar.recordSummary")}
              </button>
            ) : null}
            <button type="button" className="btn ghost" onClick={() => void onDownload(e.id, e.title)}>
              {t("calendar.ics")}
            </button>
            <button type="button" className="btn ghost" onClick={() => onEdit?.(e)}>
              {t("common.edit")}
            </button>
            <button type="button" className="btn ghost danger" onClick={() => onDelete?.(e.id)}>
              {t("common.delete")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventModal({
  form,
  profiles,
  projects,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  form: EventFormState;
  profiles: Profile[];
  projects: Project[];
  saving: boolean;
  onChange: (f: EventFormState) => void;
  onCancel: () => void;
  onSave: () => void;
}): JSX.Element {
  const { t } = useLocale();
  const toggleProfile = (id: string): void => {
    const has = form.profile_ids.includes(id);
    onChange({
      ...form,
      profile_ids: has
        ? form.profile_ids.filter((p) => p !== id)
        : [...form.profile_ids, id],
    });
  };

  return (
    <Modal
      title={form.id ? t("calendar.edit") : t("calendar.new")}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn" onClick={onSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="field">
        <label>{t("calendar.fieldTitle")}</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
        />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>{t("calendar.fieldStart")}</label>
          <input
            type="datetime-local"
            value={form.start}
            onChange={(e) => onChange({ ...form, start: e.target.value })}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t("calendar.fieldEnd")}</label>
          <input
            type="datetime-local"
            value={form.end}
            onChange={(e) => onChange({ ...form, end: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            style={{ width: "auto", marginRight: 6 }}
            checked={form.all_day}
            onChange={(e) => onChange({ ...form, all_day: e.target.checked })}
          />
          {t("calendar.fieldAllDay")}
        </label>
      </div>
      <div className="field">
        <label>{t("calendar.fieldLocation")}</label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => onChange({ ...form, location: e.target.value })}
        />
      </div>
      <div className="field">
        <label>{t("calendar.fieldRecurrence")}</label>
        <select
          value={form.recurrence ? form.recurrence.freq : "none"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "none") {
              onChange({ ...form, recurrence: null });
              return;
            }
            const freq = v as "daily" | "weekly" | "monthly" | "yearly";
            const prev = form.recurrence ?? { freq, interval: 1, until: null };
            onChange({ ...form, recurrence: { ...prev, freq } });
          }}
        >
          <option value="none">{t("calendar.recurrenceNone")}</option>
          <option value="daily">{t("calendar.recurrenceDaily")}</option>
          <option value="weekly">{t("calendar.recurrenceWeekly")}</option>
          <option value="monthly">{t("calendar.recurrenceMonthly")}</option>
          <option value="yearly">{t("calendar.recurrenceYearly")}</option>
        </select>
      </div>
      {form.recurrence ? (
        <RecurrenceControl
          value={form.recurrence}
          onChange={(r) => onChange({ ...form, recurrence: r })}
        />
      ) : null}
      <div className="field">
        <label>{t("calendar.fieldProject")}</label>
        <select
          value={form.linked_project_id}
          onChange={(e) => onChange({ ...form, linked_project_id: e.target.value })}
        >
          <option value="">{t("common.none")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{t("calendar.fieldNotes")}</label>
        <textarea
          rows={3}
          value={form.notes_md}
          onChange={(e) => onChange({ ...form, notes_md: e.target.value })}
        />
      </div>
      <div className="field">
        <label>{t("calendar.fieldProfiles")}</label>
        <ProfileChips
          profiles={profiles}
          selected={form.profile_ids}
          onToggle={toggleProfile}
        />
        {form._invalidCount > 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>
            {t("notes.profileInvalid", { count: String(form._invalidCount) })}
          </span>
        ) : form.profile_ids.length === 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>{t("notes.profileNone")}</span>
        ) : null}
      </div>
    </Modal>
  );
}

function WeekGrid({
  events,
  onEdit,
  onUpdate,
  colorOf,
}: {
  events: Meeting[];
  onEdit: (e: Meeting) => void;
  onUpdate: (id: string, start: string, end: string) => Promise<void>;
  colorOf: (id: string) => string;
}): JSX.Element {
  const HOUR_HEIGHT = 48;
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const base = getWeekStart();
  const dayDates = DAYS.map((_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const getYFromTime = (iso: string): number => {
    const d = new Date(iso);
    return (d.getHours() + d.getMinutes() / 60) * HOUR_HEIGHT;
  };

  const getHeight = (start: string, end: string): number => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return Math.max(((e - s) / (1000 * 60 * 60)) * HOUR_HEIGHT, 20);
  };

  const eventToTime = (y: number): { hour: number; minute: number } => {
    const totalMin = (y / HOUR_HEIGHT) * 60;
    const hour = Math.floor(totalMin / 60);
    const rawMin = Math.round(totalMin % 60 / 15) * 15; // snap to 15
    const minute = rawMin >= 60 ? 0 : rawMin;
    return { hour: Math.min(Math.max(hour, 0), 23), minute };
  };

  const [dragging, setDragging] = useState<{
    id: string;
    dayIndex: number;
    startY: number;
    origStart: string;
    origEnd: string;
    mode: "move" | "resize";
  } | null>(null);
  const [dragY, setDragY] = useState(0);

  const handlePointerDown = (
    e: React.PointerEvent,
    evt: Meeting,
    dayIndex: number,
    mode: "move" | "resize",
  ): void => {
    e.preventDefault();
    e.stopPropagation();
    const cell = (e.currentTarget as HTMLElement).closest(".wg-cell") as HTMLElement;
    if (!cell) return;
    const cellRect = cell.getBoundingClientRect();
    setDragging({
      id: evt.id,
      dayIndex,
      startY: e.clientY - cellRect.top,
      origStart: evt.start,
      origEnd: evt.end,
      mode,
    });
    setDragY(e.clientY - cellRect.top);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: PointerEvent): void => {
      const cell = document.querySelector(`.wg-cell[data-day="${dragging.dayIndex}"]`) as HTMLElement;
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      setDragY(Math.max(0, Math.min(y, 24 * HOUR_HEIGHT)));
    };
    const onUp = async (): Promise<void> => {
      if (!dragging) return;
      const cell = document.querySelector(`.wg-cell[data-day="${dragging.dayIndex}"]`) as HTMLElement;
      if (!cell) return;
      const evt = events.find((e) => e.id === dragging.id);
      if (!evt) { setDragging(null); return; }

      const origStart = new Date(dragging.origStart);
      const origEnd = new Date(dragging.origEnd);
      const duration = origEnd.getTime() - origStart.getTime();

      if (dragging.mode === "move") {
        const { hour, minute } = eventToTime(dragY);
        const cellDay = dayDates[dragging.dayIndex];
        if (!cellDay) { setDragging(null); return; }
        const newStart = new Date(cellDay);
        newStart.setHours(hour, minute, 0, 0);
        const newEnd = new Date(newStart.getTime() + duration);
        await onUpdate(dragging.id, newStart.toISOString(), newEnd.toISOString());
      } else {
        const { hour, minute } = eventToTime(dragY);
        const cellDay = dayDates[dragging.dayIndex];
        if (!cellDay) { setDragging(null); return; }
        const newEnd = new Date(cellDay);
        newEnd.setHours(hour, minute, 0, 0);
        if (newEnd.getTime() > origStart.getTime()) {
          await onUpdate(dragging.id, dragging.origStart, newEnd.toISOString());
        }
      }
      setDragging(null);
    };
    const onCancel = (): void => setDragging(null);

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
    };
  }, [dragging, events, dayDates, dragY, onUpdate]);

  return (
    <div className="week-grid">
      {/* corner */}
      <div className="wg-header" />
      {dayDates.map((d, i) => (
        <div key={i} className={"wg-header" + (d.toISOString().slice(0, 10) === todayStr ? " today" : "")}>
          {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
        </div>
      ))}

      {/* time rows */}
      {HOURS.map((hour) => (
        <div key={hour} style={{ display: "contents" }}>
          <div className="wg-time">{String(hour).padStart(2, "0")}:00</div>
          {dayDates.map((d, dayIdx) => {
            const dayStr = d.toISOString().slice(0, 10);
            const cellEvents = events.filter((evt) => dayKey(evt.start) === dayStr);
            const isToday = dayStr === todayStr;
            return (
              <div
                key={dayIdx}
                className={"wg-cell" + (isToday ? " today-cell" : "")}
                data-day={dayIdx}
              >
                {cellEvents.map((evt) => {
                  const top = getYFromTime(evt.start);
                  const height = getHeight(evt.start, evt.end);
                  const isDragging = dragging?.id === evt.id;
                  return (
                    <div
                      key={evt.id}
                      className={"wg-event-block" + (isDragging ? " dragging" : "")}
                      style={{
                        top,
                        height,
                        background: evt.profile_ids.length > 0
                          ? colorOf(evt.profile_ids[0]!)
                          : "var(--accent)",
                      }}
                      onPointerDown={(e) => handlePointerDown(e, evt, dayIdx, "move")}
                      onClick={(e) => { e.stopPropagation(); onEdit(evt); }}
                    >
                      <div className="wg-eb-title">{evt.title}</div>
                      <div className="wg-eb-time">
                        {formatTime(evt.start)} – {formatTime(evt.end)}
                      </div>
                      <div
                        className="wg-resize-handle"
                        onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, evt, dayIdx, "resize"); }}
                      />
                    </div>
                  );
                })}
                {dragging && dragging.dayIndex === dayIdx ? (
                  <div className="wg-drop-indicator" style={{ top: dragY }} />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ExternalEventList({
  events,
  onLink,
}: {
  events: ExternalEvent[];
  onLink: (e: ExternalEvent) => void;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="list" style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {t("calendar.title")} — external
      </div>
      {events.map((e) => (
        <div key={e.id} className="list-item" style={{ borderLeft: "3px solid var(--accent)", opacity: e.linked_project_id || e.linked_task_id || e.linked_note_id ? 0.7 : 1 }}>
          <div className="title">
            {e.all_day ? <CalendarDays size={16} /> : <Clock size={16} />}{' '}
            {e.title}
          </div>
          <div className="meta">
            <span>
              {formatDateTime(e.start)} → {formatTime(e.end)}
            </span>
            {e.location ? <span><MapPin size={14} /> {e.location}</span> : null}
          </div>
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <button type="button" className="btn ghost" onClick={() => onLink(e)}>
              {e.linked_project_id || e.linked_task_id || e.linked_note_id ? t("calendar.edit") : t("calendar.fieldProject")}
            </button>
            {e.html_link ? (
              <a href={e.html_link} target="_blank" rel="noopener noreferrer" className="btn ghost" style={{ fontSize: 12 }}>
                Open
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkEventModal({
  event,
  profiles,
  projects,
  onLink,
  onClose,
}: {
  event: ExternalEvent;
  profiles: Profile[];
  projects: Project[];
  onLink: (eventId: string, link: { linked_project_id?: string | null; linked_task_id?: string | null; linked_note_id?: string | null; linked_meeting_id?: string | null; profile_ids?: string[] }) => void;
  onClose: () => void;
}): JSX.Element {
  const { t } = useLocale();
  const toast = useToast();
  const [tab, setTab] = useState<"link" | "note">("link");
  const [projectId, setProjectId] = useState<string>(event.linked_project_id ?? "");
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [noteTitle, setNoteTitle] = useState(event.title);
  const [noteBody, setNoteBody] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleProfile = (id: string): void => {
    setProfileIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const handleLink = (): void => {
    void linkCalendarEvent(event.id, {
      linked_project_id: projectId || null,
      profile_ids: profileIds.length > 0 ? profileIds : undefined,
    }).then(() => {
      onLink(event.id, { linked_project_id: projectId || null, profile_ids: profileIds.length > 0 ? profileIds : undefined });
      onClose();
    });
  };

  const handleCreateNote = async (): Promise<void> => {
    setSaving(true);
    try {
      const note = await createNote({
        title: noteTitle,
        body_md: noteBody,
        profile_ids: profileIds.length > 0 ? profileIds : event.profile_ids ?? [],
        tags: noteTags ? noteTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        linked_project_id: projectId || null,
        linked_meeting_id: event.id,
      });
      await linkCalendarEvent(event.id, { linked_note_id: note.id });
      toast.push(t("calendar.summaryCreated"), "");
      onLink(event.id, { linked_note_id: note.id });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={event.title} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" className={"chip" + (tab === "link" ? " active" : "")} onClick={() => setTab("link")}>
          {t("calendar.link")}
        </button>
        <button type="button" className={"chip" + (tab === "note" ? " active" : "")} onClick={() => setTab("note")}>
          {t("calendar.recordSummary")}
        </button>
      </div>

      {tab === "link" ? (
        <div>
          <div className="field">
            <label>{t("calendar.fieldTitle")}</label>
            <input type="text" value={event.title} disabled />
          </div>
          <div className="field">
            <label>{t("calendar.fieldProject")}</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t("common.none")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("calendar.fieldProfiles")}</label>
            <ProfileChips profiles={profiles} selected={profileIds} onToggle={toggleProfile} />
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="button" className="btn" onClick={handleLink}>{t("common.save")}</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="field">
            <label>{t("notes.fieldTitle")}</label>
            <input type="text" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("notes.fieldBody")}</label>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={6}
              style={{ width: "100%", resize: "vertical" }}
              placeholder={t("notes.placeholderBody")}
            />
          </div>
          <div className="field">
            <label>{t("notes.fieldTags")}</label>
            <input
              type="text"
              value={noteTags}
              onChange={(e) => setNoteTags(e.target.value)}
              placeholder={t("notes.placeholderTags")}
            />
          </div>
          <div className="field">
            <label>{t("calendar.fieldProject")}</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t("common.none")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("calendar.fieldProfiles")}</label>
            <ProfileChips profiles={profiles} selected={profileIds} onToggle={toggleProfile} />
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="button" className="btn" disabled={saving} onClick={() => void handleCreateNote()}>
              {saving ? t("common.saving") : t("calendar.recordSummary")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
