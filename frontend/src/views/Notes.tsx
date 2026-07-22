import { useRef, useState, useMemo } from "react";
import type { Note, Profile, Project } from "../types";
import { createNote, deleteNote, getNotes, getProjects, reorderNotes, updateNote } from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { useLocale } from "../locales";
import { ProfileChips } from "../components/ProfileChips";
import { NoteItem } from "../components/NoteItem";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { DictationButton } from "../components/DictationButton";
import { AlertTriangle, FileText } from "lucide-react";

interface NoteFormState {
  id?: string;
  title: string;
  body_md: string;
  profile_ids: string[];
  tags: string;
  linked_project_id: string;
  _invalidCount: number;
}

const EMPTY_FORM: NoteFormState = {
  title: "",
  body_md: "",
  profile_ids: [],
  tags: "",
  linked_project_id: "",
  _invalidCount: 0,
};

export function Notes({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const { t } = useLocale();
  const [q, setQ] = useState("");
  const [form, setForm] = useState<NoteFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const { profiles, nameOf } = useProfiles();
  const validProfileIds = useMemo(() => new Set(profiles.map((p) => p.id)), [profiles]);

  type SortMode = "manual" | "title" | "profile" | "updated";
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const { data, loading, error, reload } = useData<Note[]>(
    () => getNotes(activeProfiles, q || undefined),
    [activeProfiles.join(","), q],
  );

  const projectsState = useData<Project[]>(() => getProjects(), []);
  const projects = projectsState.data ?? [];

  const openCreate = (): void => setForm({ ...EMPTY_FORM });
  const openEdit = (note: Note): void =>
    setForm({
      id: note.id,
      title: note.title,
      body_md: note.body_md,
      profile_ids: note.profile_ids.filter((id) => validProfileIds.has(id)),
      tags: note.tags.join(", "),
      linked_project_id: note.linked_project_id ?? "",
      _invalidCount: note.profile_ids.length - note.profile_ids.filter((id) => validProfileIds.has(id)).length,
    });

  const submit = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const linked_project_id = form.linked_project_id || null;
      if (form.id) {
        await updateNote(form.id, {
          title: form.title,
          body_md: form.body_md,
          profile_ids: form.profile_ids,
          tags,
          linked_project_id,
        });
      } else {
        await createNote({
          title: form.title,
          body_md: form.body_md,
          profile_ids: form.profile_ids,
          tags,
          linked_project_id,
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

  const sortedNotes = useMemo(() => {
    if (sortMode === "manual" || !data) return notes;
    return [...notes].sort((a, b) => {
      switch (sortMode) {
        case "title":
          return a.title.localeCompare(b.title);
        case "profile": {
          const aName = a.profile_ids[0] ? nameOf(a.profile_ids[0]) : "";
          const bName = b.profile_ids[0] ? nameOf(b.profile_ids[0]) : "";
          return aName.localeCompare(bName);
        }
        case "updated":
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        default:
          return 0;
      }
    });
  }, [data, sortMode, nameOf]);

  const ghostRef = useRef<HTMLElement | null>(null);

  const handlePointerDown = (noteId: string, e: React.PointerEvent): void => {
    if (e.button !== 0 || sortMode !== "manual") return;
    if ((e.target as HTMLElement).closest("button, input, textarea, select")) return;

    setDraggingId(noteId);

    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;

    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.position = "fixed";
    ghost.style.left = `${e.clientX - ox}px`;
    ghost.style.top = `${e.clientY - oy}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    ghost.style.opacity = "0.92";
    ghost.style.transform = "rotate(2deg) scale(1.03)";
    ghost.style.maxHeight = "120px";
    ghost.style.overflow = "hidden";
    ghost.style.boxShadow = "0 12px 40px rgba(0,0,0,0.25)";
    ghost.style.cursor = "grabbing";
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    const ptrId = e.pointerId;
    const lastTarget = { current: -1 };

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== ptrId) return;
      const g = ghostRef.current;
      if (g) {
        g.style.left = `${ev.clientX - ox}px`;
        g.style.top = `${ev.clientY - oy}px`;
      }
      const cards = document.querySelectorAll<HTMLElement>(".notes-grid .card");
      let found = -1;
      cards.forEach((card, idx) => {
        const r = card.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          found = idx;
        }
      });
      lastTarget.current = found;
      setDragOverIdx(found >= 0 ? found : null);
    };

    const onUp = (): void => {
      if (ghostRef.current && ghostRef.current.parentNode) {
        ghostRef.current.parentNode.removeChild(ghostRef.current);
      }
      ghostRef.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      const targetIdx = lastTarget.current;
      if (targetIdx < 0) {
        setDraggingId(null);
        setDragOverIdx(null);
        return;
      }

      const visibleIds = sortedNotes.map((n) => n.id);
      const fromIdx = visibleIds.indexOf(noteId);
      if (fromIdx === -1 || fromIdx === targetIdx) {
        setDraggingId(null);
        setDragOverIdx(null);
        return;
      }

      const reordered = [...visibleIds];
      reordered.splice(fromIdx, 1);
      const adjusted = fromIdx < targetIdx ? targetIdx - 1 : targetIdx;
      reordered.splice(adjusted, 0, noteId);

      if (reordered.every((id, i) => id === visibleIds[i])) {
        setDraggingId(null);
        setDragOverIdx(null);
        return;
      }

      setDraggingId(null);
      setDragOverIdx(null);

      reorderNotes(reordered).then(() => reload()).catch(console.error);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: "manual", label: t("notes.sortManual") },
    { value: "title", label: t("notes.sortTitle") },
    { value: "profile", label: t("notes.sortProfile") },
    { value: "updated", label: t("notes.sortUpdated") },
  ];

  return (
    <div>
      <div className="section-head">
        <h2>{t("notes.title")}</h2>
        <div className="row">
          <div className="sort-control" role="group" aria-label="Sort notes by">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={sortMode === opt.value ? "active" : ""}
                onClick={() => setSortMode(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder={t("notes.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 240 }}
          />
          <button type="button" className="btn" onClick={openCreate}>
            + {t("notes.new")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="spinner">{t("common.loading")}</div>
      ) : error ? (
        <EmptyState icon={<AlertTriangle size={32} />} title={t("notes.errorLoad")} hint={error} />
      ) : sortedNotes.length === 0 ? (
        <EmptyState
          icon={<FileText size={32} />}
          title={q ? t("notes.emptySearch") : t("notes.emptyTitle")}
          hint={
            q
              ? t("notes.emptySearchHint")
              : t("notes.emptyHint")
          }
        />
      ) : (
        <div className="notes-grid">
          {sortedNotes.map((n, idx) => (
            <NoteItem
              key={n.id}
              note={n}
              projects={projects}
              onEdit={openEdit}
              onCardPointerDown={(_id, e) => handlePointerDown(n.id, e)}
              isDragging={draggingId === n.id}
              isDragOver={dragOverIdx === idx}
            />
          ))}
        </div>
      )}

      {form ? (
        <NoteModal
          form={form}
          profiles={profiles}
          projects={projects}
          saving={saving}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSave={submit}
          onDelete={form.id ? remove : undefined}
        />
      ) : null}
    </div>
  );
}

function NoteModal({
  form,
  profiles,
  projects,
  saving,
  onChange,
  onCancel,
  onSave,
  onDelete,
}: {
  form: NoteFormState;
  profiles: Profile[];
  projects: Project[];
  saving: boolean;
  onChange: (f: NoteFormState) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: (id: string) => void;
}): JSX.Element {
  const { t } = useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
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
      title={form.id ? t("notes.edit") : t("notes.new")}
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
        <label>{t("notes.fieldTitle")}</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          placeholder={t("notes.placeholderTitle")}
        />
      </div>
      <div className="field">
        <label>{t("notes.fieldBody")}</label>
        <div className="textarea-row">
          <textarea
            rows={8}
            value={form.body_md}
            onChange={(e) => onChange({ ...form, body_md: e.target.value })}
            placeholder={t("notes.placeholderBody")}
          />
          <DictationButton
            onTranscript={(t) =>
              onChange({ ...form, body_md: form.body_md + t })
            }
          />
        </div>
      </div>
      <div className="field">
        <label>{t("notes.fieldTags")}</label>
        <input
          type="text"
          value={form.tags}
          onChange={(e) => onChange({ ...form, tags: e.target.value })}
          placeholder={t("notes.placeholderTags")}
        />
      </div>
      <div className="field">
        <label>{t("notes.fieldProject")}</label>
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
        <label>{t("notes.fieldProfiles")}</label>
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
      {form.id && onDelete ? (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {confirmDelete ? (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13 }}>{t("common.confirm")}?</span>
              <button type="button" className="btn danger" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => { onDelete(form.id!); setConfirmDelete(false); }}>
                {t("common.delete")}
              </button>
              <button type="button" className="btn ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <button type="button" className="btn ghost" style={{ color: "var(--danger)", fontSize: 12 }} onClick={() => setConfirmDelete(true)}>
              {t("common.delete")}
            </button>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
