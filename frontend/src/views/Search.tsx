import { useState } from "react";
import type { SearchResults } from "../types";
import { search } from "../api";
import { useProfiles, isUnsorted } from "../ProfilesContext";
import { PriorityBadge } from "../components/PriorityBadge";
import { EmptyState } from "../components/EmptyState";
import { useLocale } from "../locales";
import { Search as SearchIcon, FileText, CheckCircle2, Paperclip, AlertTriangle, Clock, SearchX } from "lucide-react";

export function Search(): JSX.Element {
  const { t } = useLocale();
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
        <h2>{t("search.title")}</h2>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder={t("search.placeholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
          style={{ flex: 1, maxWidth: 480 }}
        />
        <button type="button" className="btn" onClick={() => void run()} disabled={loading}>
          {loading ? t("search.searching") : t("search.search")}
        </button>
      </div>

      {error ? <EmptyState icon={<AlertTriangle size={32} />} title={t("search.failed")} hint={error} /> : null}

      {!results ? (
        <EmptyState
          icon={<SearchIcon size={32} />}
          title={t("search.semanticTitle")}
          hint={t("search.semanticHint")}
        />
      ) : !hasResults ? (
        <EmptyState
          icon={<SearchX size={32} />}
          title={t("search.noResults")}
          hint={t("search.noResultsHint", { q })}
        />
      ) : (
        <div>
          {results.notes.length > 0 ? (
            <div className="search-group">
              <h3>{t("search.notes", { count: String(results.notes.length) })}</h3>
              <div className="list">
                {results.notes.map((n) => (
                  <div key={n.id} className="list-item">
                    <div className="title"><FileText size={16} /> {n.title || "(untitled)"}</div>
                    <div className="meta">
                      {isUnsorted(n.profile_ids) ? (
                        <span className="badge unsorted-badge">Unsorted</span>
                      ) : (
                        n.profile_ids.map((id) => (
                          <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                            <span className="swatch" style={{ background: colorOf(id) }} />
                            {nameOf(id)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {results.tasks.length > 0 ? (
            <div className="search-group">
              <h3>{t("search.tasks", { count: String(results.tasks.length) })}</h3>
              <div className="list">
                {results.tasks.map((t) => (
                  <div key={t.id} className="list-item">
                    <div className="title"><CheckCircle2 size={16} /> {t.title}</div>
                    <div className="meta">
                      <PriorityBadge priority={t.priority} />
                      {isUnsorted(t.profile_ids) ? (
                        <span className="badge unsorted-badge">Unsorted</span>
                      ) : (
                        t.profile_ids.map((id) => (
                          <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                            <span className="swatch" style={{ background: colorOf(id) }} />
                            {nameOf(id)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {results.meetings.length > 0 ? (
            <div className="search-group">
              <h3>{t("search.meetings", { count: String(results.meetings.length) })}</h3>
              <div className="list">
                {results.meetings.map((m) => (
                  <div key={m.id} className="list-item">
                    <div className="title"><Clock size={16} /> {m.title}</div>
                    <div className="meta">
                      <span>{new Date(m.start).toLocaleString()}</span>
                      {isUnsorted(m.profile_ids) ? (
                        <span className="badge unsorted-badge">Unsorted</span>
                      ) : (
                        m.profile_ids.map((id) => (
                          <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
                            <span className="swatch" style={{ background: colorOf(id) }} />
                            {nameOf(id)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {results.files.length > 0 ? (
            <div className="search-group">
              <h3>{t("search.files", { count: String(results.files.length) })}</h3>
              <div className="list">
                {results.files.map((f) => (
                  <div key={f.id} className="list-item">
                    <div className="title">
                      <Paperclip size={16} /> {f.filename}
                      <a
                        href={`/api/files/${f.id}/download`}
                        className="btn ghost"
                        style={{ marginLeft: "auto" }}
                        download={f.filename}
                      >
                        {t("search.download")}
                      </a>
                    </div>
                    {f.excerpt ? (
                      <div className="meta">
                        <span className="muted" style={{ fontSize: 11, fontStyle: "italic" }}>{f.excerpt}</span>
                      </div>
                    ) : null}
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
