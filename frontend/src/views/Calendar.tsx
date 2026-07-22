import { useMemo, useState } from "react";
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
} from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { AlertTriangle, Calendar as CalendarIcon, Clock, CalendarDays, MapPin } from "lucide-react";
import { ProfileChips } from "../components/ProfileChips";
import { Modal } from "../components/Modal";
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

  const events = data ?? [];

  const dayEvents = useMemo(
    () => events.filter((e) => dayKey(e.start) === day),
    [events, day],
  );

  const weekDays = useMemo(() => {
    const days: { key: string; label: string; items: Meeting[] }[] = [];
    const base = getWeekStart();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        key,
        label: d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        items: events.filter((e) => dayKey(e.start) === key),
      });
    }
    return days;
  }, [events]);

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
        dayEvents.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={32} />}
            title={t("calendar.nothing")}
            hint={t("calendar.nothingHint")}
          />
        ) : (
          <EventList
            events={dayEvents}
            onDownload={downloadIcs}
            onEdit={openEdit}
            onDelete={remove}
            onReload={reload}
            colorOf={colorOf}
            nameOf={nameOf}
          />
        )
      ) : (
        weekDays.map((d) => (
          <div key={d.key} className="day-group">
            <h3>{d.label}</h3>
            {d.items.length === 0 ? (
              <span className="muted" style={{ fontSize: 12 }}>
                {t("calendar.free")}
              </span>
            ) : (
              <EventList
                events={d.items}
                onDownload={downloadIcs}
                onEdit={openEdit}
                onDelete={remove}
                onReload={reload}
                colorOf={colorOf}
                nameOf={nameOf}
              />
            )}
          </div>
        ))
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
