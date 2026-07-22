import { useEffect, useRef, useState } from "react";
import { getProfiles, importData } from "../api";
import { useToast } from "../components/Toast";
import { useLocale } from "../locales";
import type { ImportResult, Profile } from "../types";
import { Upload } from "lucide-react";
import "./Import.css";

type Source = "text" | "json";
type Target = "notes" | "tasks";

const JSON_START = /^\s*[\[{]/;

export function Import({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const { t } = useLocale();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [content, setContent] = useState("");
  const [source, setSource] = useState<Source>("text");
  const [target, setTarget] = useState<Target>("notes");
  const [selected, setSelected] = useState<string[]>(activeProfiles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [wholeNote, setWholeNote] = useState(false);

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

  function handleContentChange(value: string): void {
    setContent(value);
    if (JSON_START.test(value) && source === "text") {
      setSource("json");
    }
  }

  function handleFilePick(): void {
    fileRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      if (wholeNote) {
        const title = file.name.replace(/\.[^.]+$/, "");
        const payload = JSON.stringify([{ title, body_md: text }]);
        setContent(payload);
        setSource("json");
      } else {
        setContent(text);
        if (JSON_START.test(text) && source === "text") {
          setSource("json");
        }
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

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
      const total = res.notes + res.tasks;
      if (total > 0) {
        toast.push(t("importView.imported", { n: String(res.notes), t: String(res.tasks) }));
      } else if (res.errors && res.errors.length > 0) {
        toast.push(t("importView.importedNoRecords"), res.errors[0]);
      } else {
        toast.push(t("importView.resultTitle"), t("importView.importedEmpty"));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("importView.errorGeneric");
      setError(msg);
      toast.push(t("importView.errorTitle"), msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="view import-view">
      <div className="section-head">
        <h2>{t("importView.title")}</h2>
      </div>

      <div className="card import-card">
        <div className="import-toggles">
          <div className="field import-field">
            <label>{t("importView.source")}</label>
            <div className="sort-control">
              <button
                type="button"
                className={source === "text" ? "active" : ""}
                onClick={() => setSource("text")}
              >
                {t("importView.sourceText")}
              </button>
              <button
                type="button"
                className={source === "json" ? "active" : ""}
                onClick={() => setSource("json")}
              >
                {t("importView.sourceJson")}
              </button>
            </div>
          </div>

          <div className="field import-field">
            <label>{t("importView.target")}</label>
            <div className="sort-control">
              <button
                type="button"
                className={target === "notes" ? "active" : ""}
                onClick={() => setTarget("notes")}
              >
                {t("importView.targetNotes")}
              </button>
              <button
                type="button"
                className={target === "tasks" ? "active" : ""}
                onClick={() => setTarget("tasks")}
              >
                {t("importView.targetTasks")}
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <label>{t("importView.profiles")}</label>
          {profiles.length === 0 ? (
            <p className="muted import-profiles-empty">{t("importView.profilesNotLoaded")}</p>
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
            {t("importView.profiles")}:{" "}
            {selected.length === 0 ? t("importView.profileHintNone") : t("importView.profileHintSelected", { n: String(selected.length) })}
          </p>
        </div>

        <div className="field">
          <label htmlFor="import-content">{t("importView.content")}</label>

          <div className="row import-file-row">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.csv,.json,.html"
              style={{ display: "none" }}
              onChange={handleFileSelected}
            />
            <button type="button" className="btn ghost" onClick={handleFilePick}>
              <Upload size={14} /> {t("importView.uploadFile")}
            </button>

            {source === "text" ? (
              <label className="import-whole-toggle">
                <input
                  type="checkbox"
                  checked={wholeNote}
                  onChange={() => setWholeNote((v) => !v)}
                />
                {" "}{t("importView.wholeNote")}
              </label>
            ) : null}
          </div>

          <textarea
            id="import-content"
            className="import-textarea"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder={
              source === "text"
                ? t("importView.placeholderText")
                : t("importView.placeholderJson")
            }
            rows={12}
          />
          <p className="muted import-helper">
            {source === "text"
              ? wholeNote
                ? t("importView.helperWholeNote")
                : t("importView.helperText")
              : t("importView.helperJson")}
          </p>
        </div>

        <div className="row between import-actions">
          <span />
          <button
            type="button"
            className="btn"
            onClick={() => void handleImport()}
            disabled={loading || content.trim().length === 0}
          >
            {loading ? t("importView.importing") : t("importView.import")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="card import-error" role="alert">
          <strong>{t("importView.errorTitle")}</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="card import-result">
          <h3>{t("importView.resultTitle")}</h3>
          <p className="import-result-counts">
            {t("importView.resultCounts", { n: String(result.notes), t: String(result.tasks) })}
          </p>
          {result.errors && result.errors.length > 0 ? (
            <div className="import-errors">
              <p className="import-errors-title">{t("importView.resultWarnings")}</p>
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
