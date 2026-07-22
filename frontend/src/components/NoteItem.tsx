import { useState } from "react";
import { Eye, X } from "lucide-react";
import type { Note, Project } from "../types";
import { useProfiles, isUnsorted } from "../ProfilesContext";
import { renderMarkdown } from "../md";
import { useLocale } from "../locales";

export function NoteItem({
  note,
  projects,
  onEdit,
  onDelete,
  onCardPointerDown,
  isDragging,
  isDragOver,
}: {
  note: Note;
  projects: Project[];
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
  onCardPointerDown?: (id: string, e: React.PointerEvent) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
}): JSX.Element {
  const [showPreview, setShowPreview] = useState(false);
  const { t } = useLocale();
  const { colorOf, nameOf } = useProfiles();

  const cardClass =
    "card" +
    (isDragging ? " dragging" : "") +
    (isDragOver ? " drag-over" : "");

  const project = note.linked_project_id ? projects.find((p) => p.id === note.linked_project_id) : null;

  return (
    <div
      className={cardClass}
      onPointerDown={(e) => onCardPointerDown?.(note.id, e)}
      style={{ position: "relative" }}
    >
      <div className="row between">
        <div className="row">
          <span className="drag-handle">⠿</span>
          <h3>{note.title || t("notes.untitled")}</h3>
        </div>
        <div className="row">
          {note.body_md ? (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowPreview(true)}
              title={t("common.preview")}
              aria-label={t("common.preview")}
              style={{ width: 30, height: 30 }}
            >
              <Eye size={15} />
            </button>
          ) : null}
          <button type="button" className="btn secondary" onClick={() => onEdit(note)}>
            {t("common.edit")}
          </button>
          <button type="button" className="btn danger" onClick={() => onDelete(note.id)}>
            {t("common.delete")}
          </button>
        </div>
      </div>

      {note.body_md ? (
        <div
          className="md-preview"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body_md) }}
        />
      ) : (
        <div className="md-preview muted" style={{ fontStyle: "italic", fontSize: 13 }}>
          {t("notes.emptyBody")}
        </div>
      )}

      <div className="meta" style={{ position: "relative" }}>
        {note.tags.map((tag) => (
          <span key={tag} className="tag">
            #{tag}
          </span>
        ))}
        {project ? (
          <span className="badge" style={{ background: "transparent", color: "var(--accent)" }}>
            <span className="swatch" style={{ background: "var(--accent)" }} />
            {project.name}
          </span>
        ) : null}

        {isUnsorted(note.profile_ids) ? (
          <span className="badge unsorted-badge">{t("common.unsorted")}</span>
        ) : (
          note.profile_ids.map((id) => (
            <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
              <span className="swatch" style={{ background: colorOf(id) }} />
              {nameOf(id)}
            </span>
          ))
        )}
      </div>

      {/* Preview bubble */}
      {showPreview && note.body_md ? (
        <div className="preview-bubble" onClick={() => setShowPreview(false)}>
          <div className="preview-bubble-paper" onClick={(e) => e.stopPropagation()}>
            <div className="preview-bubble-header">
              <strong>{note.title || t("notes.untitled")}</strong>
              <button
                type="button"
                className="preview-bubble-close"
                onClick={() => setShowPreview(false)}
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </div>
            <div
              className="preview-bubble-body md-preview"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body_md) }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
