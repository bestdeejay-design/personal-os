import { useState, useEffect, useRef, useMemo } from "react";
import type { SearchResults } from "../types";
import { search } from "../api";
import { useProfiles, isUnsorted } from "../ProfilesContext";
import { PriorityBadge } from "../components/PriorityBadge";
import { EmptyState } from "../components/EmptyState";
import { useLocale } from "../locales";
import { Search as SearchIcon, AlertTriangle, SearchX, X } from "lucide-react";

interface SearchFilter {
  key: string;
  value: string;
  label: string;
}

const RECENT_KEY = "personalos_search_recent";
const MAX_RECENT = 5;

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch { return []; }
}

function saveRecent(q: string): void {
  const recent = loadRecent().filter((r) => r !== q);
  recent.unshift(q);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

/** Подсвечивает вхождения запроса в тексте */
function highlight(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return <>{parts.map((p, i) => p.toLowerCase() === query.toLowerCase()
    ? <mark key={i} style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: 2, padding: "0 2px" }}>{p}</mark>
    : p
  )}</>;
}

/** Парсит фильтры из строки запроса */
function parseFilters(q: string): { clean: string; filters: SearchFilter[] } {
  const filters: SearchFilter[] = [];
  const raw = q;
  const re = /(\btype|tag|project|profile):(\S+)/gi;
  let clean = raw.replace(re, (_m, key, val) => {
    const k = key.toLowerCase();
    if (k === "type" && ["note", "task", "meeting", "file"].includes(val.toLowerCase())) {
      filters.push({ key: "type", value: val.toLowerCase(), label: `${key}:${val}` });
    } else if (k === "tag") {
      filters.push({ key: "tag", value: val, label: `${key}:${val}` });
    } else if (k === "project") {
      filters.push({ key: "project", value: val, label: `${key}:${val}` });
    } else if (k === "profile") {
      filters.push({ key: "profile", value: val, label: `${key}:${val}` });
    }
    return "";
  });
  clean = clean.replace(/\s+/g, " ").trim();
  return { clean, filters };
}

export function Search(): JSX.Element {
  const { t } = useLocale();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [activeFilters, setActiveFilters] = useState<SearchFilter[]>([]);
  const { colorOf, nameOf } = useProfiles();
  const inputRef = useRef<HTMLInputElement>(null);
  const recentQueries = useMemo(() => loadRecent(), [showRecent]);

  const { clean: cleanQ, filters: parsedFilters } = useMemo(() => parseFilters(q), [q]);
  const displayFilters = activeFilters.length > 0 ? activeFilters : parsedFilters;

  useEffect(() => {
    if (parsedFilters.length > 0 && activeFilters.length === 0) {
      // auto-apply filters parsed from query
    }
  }, [parsedFilters, activeFilters.length]);

  const run = async (query?: string): Promise<void> => {
    const searchQ = ((query ?? cleanQ) || q).trim();
    if (!searchQ) return;
    setLoading(true);
    setError(null);
    setShowRecent(false);
    try {
      const filters: Record<string, unknown> = {};
      if (displayFilters.length) {
        const types = displayFilters.filter((f) => f.key === "type").map((f) => f.value);
        if (types.length) filters.types = types;
        const tags = displayFilters.filter((f) => f.key === "tag").map((f) => f.value);
        if (tags.length) filters.tags = tags;
        const project = displayFilters.find((f) => f.key === "project")?.value;
        if (project) filters.project = project;
        const profiles = displayFilters.filter((f) => f.key === "profile").map((f) => f.value);
        if (profiles.length) filters.profiles = profiles;
      }
      setResults(await search(searchQ, Object.keys(filters).length ? filters : undefined));
      saveRecent(searchQ);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const removeFilter = (idx: number): void => {
    const f = displayFilters[idx];
    if (!f) return;
    setActiveFilters(activeFilters.filter((_, i) => i !== idx));
    // Remove from query string too
    const re = new RegExp(`\\b${f.key}:${f.value}\\s*`, "gi");
    setQ((prev) => prev.replace(re, "").trim());
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

      <div style={{ position: "relative", marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <input
            ref={inputRef}
            type="search"
            placeholder={t("search.placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
              if (e.key === "Escape") setShowRecent(false);
            }}
            onFocus={() => setShowRecent(true)}
            onBlur={() => setTimeout(() => setShowRecent(false), 200)}
            style={{ flex: 1, maxWidth: 480 }}
          />
          <button type="button" className="btn" onClick={() => void run()} disabled={loading}>
            {loading ? t("search.searching") : t("search.search")}
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {showRecent && !loading && !results && recentQueries.length > 0 ? (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              zIndex: 100,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              minWidth: 320,
              marginTop: 4,
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              padding: 8,
            }}
          >
            <div className="muted" style={{ fontSize: 11, padding: "4px 8px", marginBottom: 4 }}>
              {t("search.recent")}
            </div>
            {recentQueries.map((rq, i) => (
              <button
                key={i}
                type="button"
                className="list-item"
                style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "none", background: "transparent", padding: "6px 8px", borderRadius: 4 }}
                onMouseDown={(e) => { e.preventDefault(); setQ(rq); void run(rq); }}
              >
                <SearchIcon size={14} style={{ marginRight: 8, opacity: 0.5 }} />
                {rq}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Filter chips */}
      {displayFilters.length > 0 ? (
        <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {displayFilters.map((f, i) => (
            <span key={i} className="badge" style={{ background: "var(--accent)", color: "var(--bg)", display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", fontSize: 12 }}>
              {f.label}
              <X
                size={12}
                style={{ cursor: "pointer", opacity: 0.7 }}
                onMouseDown={() => removeFilter(i)}
              />
            </span>
          ))}
          {displayFilters.length > 0 ? (
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => { setActiveFilters([]); setQ(cleanQ); }}
            >
              {t("search.clearFilters")}
            </button>
          ) : null}
        </div>
      ) : null}

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
                    <div className="title">{highlight(n.title || "(untitled)", cleanQ || q)}</div>
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
                    <div className="title">{highlight(t.title, cleanQ || q)}</div>
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
                    <div className="title">{highlight(m.title, cleanQ || q)}</div>
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
                      {highlight(f.filename, cleanQ || q)}
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
