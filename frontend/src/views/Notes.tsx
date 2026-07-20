import { useState } from "react";
import type { Note, Profile } from "../types";
import { createNote, deleteNote, getNotes, updateNote } from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { ProfileChips } from "../components/ProfileChips";
import { NoteItem } from "../components/NoteItem";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { DictationButton } from "../components/DictationButton";

interface NoteFormState {
  id?: string;
  title: string;
  body_md: string;
  profile_ids: string[];
  tags: string;
}

const EMPTY_FORM: NoteFormState = {
  title: "",
  body_md: "",
  profile_ids: [],
  tags: "",
};

export function Notes({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const [q, setQ] = useState("");
  const [form, setForm] = useState<NoteFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const { profiles } = useProfiles();

  const { data, loading, error, reload } = useData<Note[]>(
    () => getNotes(activeProfiles, q || undefined),
    [activeProfiles.join(","), q],
  );

  const openCreate = (): void => setForm({ ...EMPTY_FORM });
  const openEdit = (note: Note): void =>
    setForm({
      id: note.id,
      title: note.title,
      body_md: note.body_md,
      profile_ids: note.profile_ids,
      tags: note.tags.join(", "),
    });

  const submit = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (form.id) {
        await updateNote(form.id, {
          title: form.title,
          body_md: form.body_md,
          profile_ids: form.profile_ids,
          tags,
        });
      } else {
        await createNote({
          title: form.title,
          body_md: form.body_md,
          profile_ids: form.profile_ids,
          tags,
        });
      }
      setForm(null);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    await deleteNote(id);
    reload();
  };

  const notes = data ?? [];

  return (
    <div>
      <div className="section-head">
        <h2>Notes</h2>
        <div className="row">
          <input
            type="search"
            placeholder="Search notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 240 }}
          />
          <button type="button" className="btn" onClick={openCreate}>
            + New note
          </button>
        </div>
      </div>

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : error ? (
        <EmptyState emoji="⚠️" title="Could not load notes" hint={error} />
      ) : notes.length === 0 ? (
        <EmptyState
          emoji="📝"
          title={q ? "No notes match your search" : "No notes yet"}
          hint={
            q
              ? "Try a different keyword, or clear the search."
              : "Create your first note to capture an idea, a meeting summary, or a task."
          }
        />
      ) : (
        <div className="list">
          {notes.map((n) => (
            <NoteItem key={n.id} note={n} onEdit={openEdit} onDelete={remove} />
          ))}
        </div>
      )}

      {form ? (
        <NoteModal
          form={form}
          profiles={profiles}
          saving={saving}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSave={submit}
        />
      ) : null}
    </div>
  );
}

function NoteModal({
  form,
  profiles,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  form: NoteFormState;
  profiles: Profile[];
  saving: boolean;
  onChange: (f: NoteFormState) => void;
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
      title={form.id ? "Edit note" : "New note"}
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
          placeholder="Note title"
        />
      </div>
      <div className="field">
        <label>Body (Markdown)</label>
        <div className="textarea-row">
          <textarea
            rows={8}
            value={form.body_md}
            onChange={(e) => onChange({ ...form, body_md: e.target.value })}
            placeholder="Write in **markdown**…"
          />
          <DictationButton
            onTranscript={(t) =>
              onChange({ ...form, body_md: form.body_md + t })
            }
          />
        </div>
      </div>
      <div className="field">
        <label>Tags (comma separated)</label>
        <input
          type="text"
          value={form.tags}
          onChange={(e) => onChange({ ...form, tags: e.target.value })}
          placeholder="idea, meeting"
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
