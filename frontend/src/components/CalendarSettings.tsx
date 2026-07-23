import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Link, Globe, Check, X } from "lucide-react";
import {
  getCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  syncCalendar,
  getSettings,
  saveSetting,
  type ExternalCalendar,
} from "../api";
import { Modal } from "./Modal";
import { useLocale } from "../locales";

export function CalendarSettings({
  open,
  onClose,
  onCalendarsChange,
}: {
  open: boolean;
  onClose: () => void;
  onCalendarsChange?: () => void;
}): JSX.Element | null {
  const { t } = useLocale();
  const [tab, setTab] = useState<"list" | "add">("list");
  const [calendars, setCalendars] = useState<ExternalCalendar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncingCalendar, setSyncingCalendar] = useState<string | null>(null);
  const [togglingCalendar, setTogglingCalendar] = useState<string | null>(null);
  const [syncInterval, setSyncInterval] = useState("manual");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add calendar form state
  const [provider, setProvider] = useState<"google" | "yandex" | "custom" | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const loadCalendars = useCallback(async () => {
    try {
      setCalendars(await getCalendars());
    } catch {
      setError(t("settings.calendarErrorLoad"));
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab("list");
    setConfirmDeleteId(null);
    setProvider(null);
    setNewName("");
    setNewUrl("");
    setAdding(false);
    setSyncingCalendar(null);
    setTogglingCalendar(null);
    void loadCalendars();
    void getSettings()
      .then((settings) => {
        const si = settings.find((s) => s.key === "calendar_sync_interval");
        if (si) setSyncInterval(si.value);
      })
      .catch(() => {});
  }, [open, loadCalendars]);

  const handleSync = async (id: string): Promise<void> => {
    setSyncingCalendar(id);
    setError(null);
    try {
      await syncCalendar(id);
      await loadCalendars();
      onCalendarsChange?.();
    } catch {
      setError(t("settings.calendarErrorSync"));
    } finally {
      setSyncingCalendar(null);
    }
  };

  const handleToggleSync = async (cal: ExternalCalendar): Promise<void> => {
    setTogglingCalendar(cal.id);
    setError(null);
    try {
      await updateCalendar(cal.id, { sync_enabled: !cal.sync_enabled } as Partial<ExternalCalendar>);
      await loadCalendars();
    } catch {
      setError(t("settings.calendarErrorSync"));
    } finally {
      setTogglingCalendar(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setError(null);
    try {
      await deleteCalendar(id);
      setConfirmDeleteId(null);
      await loadCalendars();
      onCalendarsChange?.();
    } catch {
      setError(t("settings.calendarErrorDelete"));
    }
  };

  const handleConnect = async (): Promise<void> => {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await createCalendar({
        display_name: newName.trim(),
        url: newUrl.trim(),
      });
      setNewName("");
      setNewUrl("");
      setProvider(null);
      setTab("list");
      await loadCalendars();
      onCalendarsChange?.();
    } catch {
      setError(t("settings.calendarErrorConnect"));
    } finally {
      setAdding(false);
    }
  };

  const handleSyncInterval = async (value: string): Promise<void> => {
    setSyncInterval(value);
    await saveSetting("calendar_sync_interval", value).catch(() => {});
  };

  const selectProvider = (p: "google" | "yandex" | "custom"): void => {
    setProvider(p);
    setNewUrl("");
  };

  const resetAddForm = (): void => {
    setProvider(null);
    setNewName("");
    setNewUrl("");
  };

  const providerBadge = (cal: ExternalCalendar): string => {
    if (cal.provider === "google") return "Google";
    if (cal.provider === "yandex") return "Yandex";
    return "ICS";
  };

  const getHelperText = (): string => {
    if (provider === "google") return t("settings.calendarGoogleHint");
    if (provider === "yandex") return t("settings.calendarYandexHint");
    return t("settings.calendarCustomHint");
  };

  if (!open) return null;

  return (
    <Modal title={t("settings.calendars")} onClose={onClose}>
      {/* Tab navigation */}
      <div className="chips-row" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={"chip" + (tab === "list" ? " active" : "")}
          style={{ ["--chip-color" as string]: "var(--accent)" }}
          onClick={() => { setTab("list"); resetAddForm(); }}
        >
          {t("settings.calendarTabConnected")}
        </button>
        <button
          type="button"
          className={"chip" + (tab === "add" ? " active" : "")}
          style={{ ["--chip-color" as string]: "var(--accent)" }}
          onClick={() => setTab("add")}
        >
          {t("settings.calendarTabAdd")}
        </button>
      </div>

      {error ? (
        <span className="muted" style={{ fontSize: 12, color: "var(--danger)", display: "block", marginBottom: 12 }}>
          {error}
        </span>
      ) : null}

      {tab === "list" ? (
        /* ---- Tab 1: Connected Calendars ---- */
        <div>
          {calendars.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <span className="muted" style={{ fontSize: 13 }}>{t("settings.calendarEmpty")}</span>
            </div>
          ) : (
            calendars.map((cal) => (
              <div
                key={cal.id}
                className="row"
                style={{
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 6,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--card-bg)",
                }}
              >
                <Link size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                    {cal.display_name}
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: cal.provider === "google" ? "var(--accent)" : cal.provider === "yandex" ? "var(--danger)" : "var(--text-muted)",
                        color: "#fff",
                        fontWeight: 600,
                        lineHeight: "18px",
                      }}
                    >
                      {providerBadge(cal)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {t("settings.calendarLastSync")}:{" "}
                    {cal.last_sync_at
                      ? new Date(cal.last_sync_at).toLocaleString()
                      : t("settings.calendarNever")}
                  </div>
                </div>

                {/* Sync toggle */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  title={t("settings.calendarToggleEnabled")}
                >
                  <input
                    type="checkbox"
                    checked={cal.sync_enabled}
                    disabled={togglingCalendar === cal.id}
                    onChange={() => void handleToggleSync(cal)}
                    style={{ width: "auto", margin: 0 }}
                  />
                </label>

                {/* Sync button */}
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void handleSync(cal.id)}
                  disabled={syncingCalendar === cal.id || !cal.sync_enabled}
                  title={t("settings.calendarSyncManual")}
                  style={{ width: 28, height: 28, opacity: cal.sync_enabled ? 1 : 0.4 }}
                >
                  <RefreshCw size={14} className={syncingCalendar === cal.id ? "spin" : ""} />
                </button>

                {/* Delete button with confirmation */}
                {confirmDeleteId === cal.id ? (
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void handleDelete(cal.id)}
                      title={t("common.confirm")}
                      style={{ width: 24, height: 24, color: "var(--danger)" }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setConfirmDeleteId(null)}
                      title={t("common.cancel")}
                      style={{ width: 24, height: 24 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setConfirmDeleteId(cal.id)}
                    title={t("settings.calendarDelete")}
                    style={{ width: 28, height: 28, color: "var(--danger)" }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}

          {/* Add Calendar button */}
          <button
            type="button"
            className="btn"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => setTab("add")}
          >
            <Plus size={16} style={{ marginRight: 6 }} />
            {t("settings.calendarConnect")}
          </button>

          {/* Sync interval settings */}
          {calendars.length > 0 ? (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border, rgba(255,255,255,0.08))" }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                {t("settings.calendarSyncSettings")}
              </label>
              <select
                value={syncInterval}
                onChange={(e) => void handleSyncInterval(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="manual">{t("settings.calendarSyncIntervalNone")}</option>
                <option value="hourly">{t("settings.calendarSyncIntervalHourly")}</option>
                <option value="daily">{t("settings.calendarSyncIntervalDaily")}</option>
                <option value="weekly">{t("settings.calendarSyncIntervalWeekly")}</option>
              </select>
            </div>
          ) : null}
        </div>
      ) : (
        /* ---- Tab 2: Add Calendar ---- */
        <div>
          {!provider ? (
            /* Step 1: Choose provider */
            <div>
              <div
                className="card"
                style={{ padding: 12, marginBottom: 8, cursor: "pointer" }}
                onClick={() => selectProvider("google")}
              >
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <Globe size={20} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.calendarGoogle")}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {t("settings.calendarProviderDesc")}
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="card"
                style={{ padding: 12, marginBottom: 8, cursor: "pointer" }}
                onClick={() => selectProvider("yandex")}
              >
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <Globe size={20} style={{ color: "var(--danger)", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.calendarYandex")}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {t("settings.calendarProviderDesc")}
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="card"
                style={{ padding: 12, marginBottom: 8, cursor: "pointer" }}
                onClick={() => selectProvider("custom")}
              >
                <div className="row" style={{ gap: 10, alignItems: "center" }}>
                  <Link size={20} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.calendarCustom")}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {t("settings.calendarCustomHint")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Step 2: Input fields */
            <div className="card" style={{ padding: 12 }}>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>{t("settings.calendarNameField")}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("settings.calendarNameField")}
                  autoFocus
                />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>{t("settings.calendarUrlField")}</label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <span className="muted" style={{ fontSize: 11, lineHeight: 1.4, display: "block", marginBottom: 12 }}>
                {getHelperText()}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => resetAddForm()}
                >
                  {t("settings.calendarBack")}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleConnect()}
                  disabled={!newName.trim() || !newUrl.trim() || adding}
                >
                  {adding ? t("common.saving") : t("settings.calendarConnect")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
