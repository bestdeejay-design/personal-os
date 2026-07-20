import { useEffect, useMemo, useState } from "react";
import { getProfiles, importData } from "../api";
import type { ImportResult, Profile } from "../types";
import "./Import.css";

type Source = "text" | "json";
type Target = "notes" | "tasks";

export function Import({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [content, setContent] = useState("");
  const [source, setSource] = useState<Source>("text");
  const [target, setTarget] = useState<Target>("notes");
  const [selected, setSelected] = useState<string[]>(activeProfiles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    let alive = true;
    getProfiles()
      .then((list) => {
        if (alive) setProfiles(list);
      })
      .catch(() => {
        if (alive) setProfiles([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const helperText = useMemo(
    () =>
      source === "text"
        ? "Каждая непустая строка → отдельная заметка"
        : "Массив объектов с полем title (или due_date/status для задач)",
    [source],
  );

  function toggleProfile(id: string): void {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleImport(): Promise<void> {
    if (loading || content.trim().length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await importData({
        source,
        content,
        target,
        profile_ids: selected.length > 0 ? selected : undefined,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить импорт");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="view import-view">
      <div className="section-head">
        <h2>Импорт данных</h2>
      </div>

      <div className="card import-card">
        <div className="import-toggles">
          <div className="field import-field">
            <label>Источник</label>
            <div className="sort-control">
              <button
                type="button"
                className={source === "text" ? "active" : ""}
                onClick={() => setSource("text")}
              >
                Текст
              </button>
              <button
                type="button"
                className={source === "json" ? "active" : ""}
                onClick={() => setSource("json")}
              >
                JSON
              </button>
            </div>
          </div>

          <div className="field import-field">
            <label>Назначение</label>
            <div className="sort-control">
              <button
                type="button"
                className={target === "notes" ? "active" : ""}
                onClick={() => setTarget("notes")}
              >
                Заметки
              </button>
              <button
                type="button"
                className={target === "tasks" ? "active" : ""}
                onClick={() => setTarget("tasks")}
              >
                Задачи
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Профили</label>
          {profiles.length === 0 ? (
            <p className="muted import-profiles-empty">Профили не загружены</p>
          ) : (
            <div className="chips-row">
              {profiles.map((p) => {
                const isActive = selected.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    className={`chip${isActive ? " active" : ""}`}
                    style={{ ["--chip-color" as string]: p.color }}
                    onClick={() => toggleProfile(p.id)}
                  >
                    <span className="swatch" style={{ background: p.color }} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="muted import-profiles-hint">
            Назначение: {selected.length === 0 ? "все профили" : `${selected.length} выбрано`}
          </p>
        </div>

        <div className="field">
          <label htmlFor="import-content">Содержимое</label>
          <textarea
            id="import-content"
            className="import-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              source === "text"
                ? "Вставьте текст, по одной записи на строку…"
                : '[\n  { "title": "Купить молоко" },\n  { "title": "Позвонить", "due_date": "2026-07-22" }\n]'
            }
            rows={12}
          />
          <p className="muted import-helper">{helperText}</p>
        </div>

        <div className="row between import-actions">
          <span />
          <button
            type="button"
            className="btn"
            onClick={() => void handleImport()}
            disabled={loading || content.trim().length === 0}
          >
            {loading ? "Загрузка…" : "Импортировать"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="card import-error" role="alert">
          <strong>Ошибка импорта</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="card import-result">
          <h3>Результат импорта</h3>
          <p className="import-result-counts">
            Создано заметок: <strong>{result.notes}</strong>, задач:{" "}
            <strong>{result.tasks}</strong>
          </p>
          {result.errors && result.errors.length > 0 ? (
            <div className="import-errors">
              <p className="import-errors-title">Предупреждения:</p>
              <ul>
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
