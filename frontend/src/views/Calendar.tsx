import { useMemo, useState } from "react";
import type { Meeting, Profile, Project } from "../types";
import {
  createMeeting,
  downloadMeetingIcs,
  getCalendar,
  getProjects,
} from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { ProfileChips } from "../components/ProfileChips";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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
};

export function Calendar({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [day, setDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState<EventFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const { profiles, colorOf, nameOf } = useProfiles();

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
    const base = new Date();
    base.setHours(0, 0, 0, 0);
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

  const submit = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    try {
      await createMeeting({
        title: form.title,
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
        all_day: form.all_day,
        profile_ids: form.profile_ids,
        linked_project_id: form.linked_project_id || null,
        notes_md: form.notes_md,
        location: form.location || null,
      });
      setForm(null);
      reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="section-head">
        <h2>Calendar</h2>
        <div className="row">
          <div className="chips-row">
            <button
              type="button"
              className={"chip" + (mode === "day" ? " active" : "")}
              style={{ ["--chip-color" as string]: "var(--accent)" }}
              onClick={() => setMode("day")}
            >
              Day
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
          <button type="button" className="btn" onClick={openCreate}>
            + New event
          </button>
        </div>
      </div>

      {mode === "day" ? (
        <div className="field" style={{ maxWidth: 240 }}>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
      ) : null}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : error ? (
        <EmptyState emoji="⚠️" title="Could not load calendar" hint={error} />
      ) : mode === "day" ? (
        dayEvents.length === 0 ? (
          <EmptyState
            emoji="📅"
            title="Nothing scheduled"
            hint="No events for this day. Create an event to get started."
          />
        ) : (
          <EventList
            events={dayEvents}
            onDownload={downloadIcs}
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
                — free —
              </span>
            ) : (
              <EventList
                events={d.items}
                onDownload={downloadIcs}
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
  colorOf,
  nameOf,
}: {
  events: Meeting[];
  onDownload: (id: string, title: string) => void;
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}): JSX.Element {
  return (
    <div className="list">
      {events.map((e) => (
        <div key={e.id} className="list-item">
          <div className="title">
            {e.all_day ? "🌐 " : "🕑 "}
            {e.title}
            <button
              type="button"
              className="btn ghost"
              style={{ marginLeft: "auto" }}
              onClick={() => void onDownload(e.id, e.title)}
            >
              .ics
            </button>
          </div>
          <div className="meta">
            <span>
              {new Date(e.start).toLocaleString()} → {new Date(e.end).toLocaleTimeString()}
            </span>
            {e.location ? <span>📍 {e.location}</span> : null}
            {e.profile_ids.map((id) => (
              <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                <span className="swatch" style={{ background: colorOf(id) }} />
                {nameOf(id)}
              </span>
            ))}
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
      title="New event"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Title</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
        />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Start</label>
          <input
            type="datetime-local"
            value={form.start}
            onChange={(e) => onChange({ ...form, start: e.target.value })}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>End</label>
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
          All day
        </label>
      </div>
      <div className="field">
        <label>Location</label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => onChange({ ...form, location: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Linked project</label>
        <select
          value={form.linked_project_id}
          onChange={(e) => onChange({ ...form, linked_project_id: e.target.value })}
        >
          <option value="">— none —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Notes (Markdown)</label>
        <textarea
          rows={3}
          value={form.notes_md}
          onChange={(e) => onChange({ ...form, notes_md: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Profiles</label>
        <ProfileChips
          profiles={profiles}
          selected={form.profile_ids}
          onToggle={toggleProfile}
        />
      </div>
    </Modal>
  );
}
