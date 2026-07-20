import { useState, type ChangeEvent } from "react";
import type { FileMeta } from "../types";
import { getFiles, uploadFile } from "../api";
import { useData } from "../useData";
import { EmptyState } from "../components/EmptyState";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Files(): JSX.Element {
  const [uploading, setUploading] = useState(false);
  const { data, loading, error, reload } = useData<FileMeta[]>(() => getFiles(), []);

  const onUpload = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file);
      reload();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const files = data ?? [];

  return (
    <div>
      <div className="section-head">
        <h2>Files</h2>
        <label className="btn" style={{ display: "inline-block" }}>
          {uploading ? "Uploading…" : "⬆ Upload file"}
          <input
            type="file"
            onChange={(e) => void onUpload(e)}
            style={{ display: "none" }}
            disabled={uploading}
          />
        </label>
      </div>

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : error ? (
        <EmptyState emoji="⚠️" title="Could not load files" hint={error} />
      ) : files.length === 0 ? (
        <EmptyState
          emoji="📎"
          title="No files yet"
          hint="Upload a file (photo, PDF, spec) and it will be available from the web."
        />
      ) : (
        <div className="list">
          {files.map((f) => (
            <div key={f.id} className="list-item">
              <div className="title">
                {f.filename}
                <a
                  href={`/api/files/${f.id}/download`}
                  className="btn ghost"
                  style={{ marginLeft: "auto" }}
                  download={f.filename}
                >
                  Download
                </a>
              </div>
              <div className="meta">
                <span>{formatSize(f.size)}</span>
                <span>{f.mime}</span>
                <span>📅 {new Date(f.uploaded_at).toLocaleDateString()}</span>
                {f.owner_type ? <span>owner: {f.owner_type}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
