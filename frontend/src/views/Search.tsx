import { useState } from "react";
import type { SearchResults } from "../types";
import { search } from "../api";
import { useProfiles } from "../ProfilesContext";
import { PriorityBadge } from "../components/PriorityBadge";
import { EmptyState } from "../components/EmptyState";

export function Search(): JSX.Element {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colorOf, nameOf } = useProfiles();

  const run = async (): Promise<void> => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await search(q.trim()));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const hasResults =
    results &&
    (results.notes.length > 0 ||
      results.tasks.length > 0 ||
      results.meetings.length > 0 ||
      results.files.length > 0);

  return (
    <div>
      <div className="section-head">
        <h2>Search</h2>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder="Search notes, tasks, meetings, files…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
          style={{ flex: 1, maxWidth: 480 }}
        />
        <button type="button" className="btn" onClick={() => void run()} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {error ? <EmptyState emoji="⚠️" title="Search failed" hint={error} /> : null}

      {!results ? (
        <EmptyState
          emoji="🔍"
          title="Semantic search"
          hint="Type a query to search across all your notes, tasks, meetings and files."
        />
      ) : !hasResults ? (
        <EmptyState
          emoji="🤔"
          title="No results"
          hint={`Nothing matched “${q}”. Try different words.`}
        />
      ) : (
        <div>
          {results.notes.length > 0 ? (
            <div className="search-group">
              <h3>Notes ({results.notes.length})</h3>
              <div className="list">
                {results.notes.map((n) => (
                  <div key={n.id} className="list-item">
                    <div className="title">📝 {n.title || "(untitled)"}</div>
                    <div className="meta">
                      {n.profile_ids.map((id) => (
                        <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                          <span className="swatch" style={{ background: colorOf(id) }} />
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {results.tasks.length > 0 ? (
            <div className="search-group">
              <h3>Tasks ({results.tasks.length})</h3>
              <div className="list">
                {results.tasks.map((t) => (
                  <div key={t.id} className="list-item">
                    <div className="title">✅ {t.title}</div>
                    <div className="meta">
                      <PriorityBadge priority={t.priority} />
                      {t.profile_ids.map((id) => (
                        <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                          <span className="swatch" style={{ background: colorOf(id) }} />
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {results.meetings.length > 0 ? (
            <div className="search-group">
              <h3>Meetings ({results.meetings.length})</h3>
              <div className="list">
                {results.meetings.map((m) => (
                  <div key={m.id} className="list-item">
                    <div className="title">🕑 {m.title}</div>
                    <div className="meta">
                      <span>{new Date(m.start).toLocaleString()}</span>
                      {m.profile_ids.map((id) => (
                        <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                          <span className="swatch" style={{ background: colorOf(id) }} />
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {results.files.length > 0 ? (
            <div className="search-group">
              <h3>Files ({results.files.length})</h3>
              <div className="list">
                {results.files.map((f) => (
                  <div key={f.id} className="list-item">
                    <div className="title">
                      📎 {f.filename}
                      <a
                        href={`/api/files/${f.id}/download`}
                        className="btn ghost"
                        style={{ marginLeft: "auto" }}
                        download={f.filename}
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
