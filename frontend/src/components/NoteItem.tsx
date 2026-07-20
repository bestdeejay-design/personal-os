import { useState } from "react";
import type { Note } from "../types";
import { useProfiles } from "../ProfilesContext";
import { renderMarkdown } from "../md";

export function NoteItem({
  note,
  onEdit,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDragLeave,
  isDragging,
  isDragOver,
}: {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
}): JSX.Element {
  const { colorOf, nameOf } = useProfiles();
  const [preview, setPreview] = useState(false);

  const cardClass =
    "card" +
    (isDragging ? " dragging" : "") +
    (isDragOver ? " drag-over" : "");

  return (
    <div
      className={cardClass}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
    >
      <div className="row between">
        <div className="row">
          {draggable ? <span className="drag-handle">⠿</span> : null}
          <h3>{note.title || "(untitled)"}</h3>
        </div>
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? "Raw" : "Preview"}
          </button>
          <button type="button" className="btn secondary" onClick={() => onEdit(note)}>
            Edit
          </button>
          <button type="button" className="btn danger" onClick={() => onDelete(note.id)}>
            Delete
          </button>
        </div>
      </div>

      {preview ? (
        <div
          className="md-preview"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body_md) }}
        />
      ) : (
        <pre className="md-preview" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
          {note.body_md}
        </pre>
      )}

      <div className="meta">
        {note.tags.map((t) => (
          <span key={t} className="tag">
            #{t}
          </span>
        ))}
        {note.profile_ids.map((id) => (
          <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
            <span className="swatch" style={{ background: colorOf(id) }} />
            {nameOf(id)}
          </span>
        ))}
      </div>
    </div>
  );
}
