import { useState } from "react";
import type { Note } from "../types";
import { useProfiles } from "../ProfilesContext";
import { renderMarkdown } from "../md";

export function NoteItem({
  note,
  onEdit,
  onDelete,
}: {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const { colorOf, nameOf } = useProfiles();
  const [preview, setPreview] = useState(false);

  return (
    <div className="card">
      <div className="row between">
        <h3>{note.title || "(untitled)"}</h3>
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
