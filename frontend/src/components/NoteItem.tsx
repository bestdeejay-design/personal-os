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
  onCardPointerDown,
  isDragging,
  isDragOver,
}: {
  note: Note;
  projects: Project[];
  onEdit: (note: Note) => void;
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
      {/* Header: drag handle + title only */}
      <div className="row">
        <span className="drag-handle">⠿</span>
        <h3 style={{ flex: 1, minWidth: 0 }}>{note.title || t("notes.untitled")}</h3>
        {note.body_md ? (
          <button
            type="button"
            className="icon-btn"
            onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
            title={t("common.preview")}
            aria-label={t("common.preview")}
            style={{ width: 28, height: 28, flexShrink: 0 }}
          >
            <Eye size={14} />
          </button>
        ) : null}
      </div>

      {/* Body */}
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

      {/* Meta + Edit row */}
      <div className="row between" style={{ alignItems: "flex-end", gap: 8 }}>
        <div className="meta" style={{ flex: 1, minWidth: 0 }}>
          {note.tags.map((tag) => (
            <span key={tag} className="tag">#{tag}</span>
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
        <button type="button" className="btn secondary" style={{ flexShrink: 0, fontSize: 12, padding: "4px 12px" }} onClick={() => onEdit(note)}>
          {t("common.edit")}
        </button>
      </div>

      {/* Preview — only ✕ closes, full text scrollable */}
      {showPreview && note.body_md ? (
        <div className="preview-bubble" style={{ cursor: "default" }}>
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
              style={{ overflowY: "auto", maxHeight: "60vh" }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body_md) }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
