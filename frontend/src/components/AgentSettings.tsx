import { useCallback, useEffect, useRef, useState } from "react";
import { Sun, Moon, Download, Upload, Plus, Edit3, Trash2, Check, X } from "lucide-react";
import {
  getSettings, saveSetting, getProfiles, createProfile, updateProfile, deleteProfile,
} from "../api";
import { Modal } from "./Modal";
import { CalendarSettings } from "./CalendarSettings";
import { useLocale, type LocalePack } from "../locales";
import type { Profile } from "../types";
import type { Theme } from "../theme";

interface AgentSettingsState {
  agent_dnd_start: string;
  agent_dnd_end: string;
  agent_daily_cap: number;
  agent_enabled: boolean;
  tts_enabled: boolean;
  app_start_view: string;
  time_format: string;
  week_start_day: string;
  kanban_col_backlog: string;
  kanban_col_in_progress: string;
  kanban_col_done: string;
  app_window_size: string;
  app_name: string;
}

const DEFAULTS: AgentSettingsState = {
  agent_dnd_start: "22:00",
  agent_dnd_end: "08:00",
  agent_daily_cap: 5,
  agent_enabled: true,
  tts_enabled: false,
  app_start_view: "notes",
  time_format: "24h",
  week_start_day: "monday",
  kanban_col_backlog: "",
  kanban_col_in_progress: "",
  kanban_col_done: "",
  app_window_size: "",
  app_name: "",
};

export function AgentSettings({
  open,
  onClose,
  theme,
  onToggleTheme,
  onProfilesChange,
}: {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onProfilesChange?: () => void;
}): JSX.Element | null {
  const [settings, setSettings] = useState<AgentSettingsState>(DEFAULTS);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, current, currentPack, available, setLocale, addLocale, removeLocale } = useLocale();

  // --- Profile management ---
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#FF7A00");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      setProfiles(await getProfiles());
    } catch {
      setProfileError(t("settings.profileErrorLoad"));
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSavedKey(null);
    setProfileError(null);
    void loadProfiles();
    void getSettings()
      .then((list) => {
        const map: Record<string, string> = {};
        for (const s of list) map[s.key] = s.value;
        setSettings({
          agent_dnd_start: map.agent_dnd_start ?? DEFAULTS.agent_dnd_start,
          agent_dnd_end: map.agent_dnd_end ?? DEFAULTS.agent_dnd_end,
          agent_daily_cap: map.agent_daily_cap
            ? Number(map.agent_daily_cap)
            : DEFAULTS.agent_daily_cap,
          agent_enabled: map.agent_enabled ? map.agent_enabled === "true" : DEFAULTS.agent_enabled,
          tts_enabled: map.tts_enabled ? map.tts_enabled === "true" : DEFAULTS.tts_enabled,
          app_start_view: map.app_start_view ?? DEFAULTS.app_start_view,
          time_format: map.time_format ?? DEFAULTS.time_format,
          week_start_day: map.week_start_day ?? DEFAULTS.week_start_day,
          kanban_col_backlog: map.kanban_col_backlog ?? DEFAULTS.kanban_col_backlog,
          kanban_col_in_progress: map.kanban_col_in_progress ?? DEFAULTS.kanban_col_in_progress,
          kanban_col_done: map.kanban_col_done ?? DEFAULTS.kanban_col_done,
          app_window_size: map.app_window_size ?? DEFAULTS.app_window_size,
          app_name: map.app_name ?? DEFAULTS.app_name,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, loadProfiles]);

  const update = useCallback(
    (key: keyof AgentSettingsState, value: string | number | boolean): void => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      const strVal = String(value);
      void saveSetting(key, strVal)
        .then(() => setSavedKey(key))
        .catch(() => {});
    },
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem("personalos_kanban_col_backlog", settings.kanban_col_backlog);
      localStorage.setItem("personalos_kanban_col_in_progress", settings.kanban_col_in_progress);
      localStorage.setItem("personalos_kanban_col_done", settings.kanban_col_done);
      localStorage.setItem("personalos_time_format", settings.time_format);
      localStorage.setItem("personalos_week_start_day", settings.week_start_day);
    } catch {}
  }, [settings.kanban_col_backlog, settings.kanban_col_in_progress, settings.kanban_col_done, settings.time_format, settings.week_start_day]);

  const handleDownload = useCallback(() => {
    const data = JSON.stringify(currentPack, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `locale-${currentPack.locale.code}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentPack]);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const pack = JSON.parse(reader.result as string) as LocalePack;
          if (!pack.locale?.code || !pack.locale?.name) {
            alert("Invalid locale file: missing locale.code or locale.name");
            return;
          }
          addLocale(pack);
          setLocale(pack.locale.code);
        } catch {
          alert("Invalid locale file: not valid JSON");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [addLocale, setLocale],
  );

  const startEdit = (p: Profile): void => {
    setEditingProfile(p.id);
    setEditName(p.name);
    setEditColor(p.color);
  };

  const cancelEdit = (): void => {
    setEditingProfile(null);
    setConfirmDelete(null);
  };

  const saveEdit = async (id: string): Promise<void> => {
    if (!editName.trim()) return;
    try {
      await updateProfile(id, { name: editName.trim(), color: editColor });
      setEditingProfile(null);
      await loadProfiles();
      onProfilesChange?.();
    } catch {
      setProfileError(t("settings.profileErrorUpdate"));
    }
  };

  const startCreate = (): void => {
    setCreatingProfile(true);
    setNewName("");
    setNewColor("#FF7A00");
  };

  const submitCreate = async (): Promise<void> => {
    if (!newName.trim()) return;
    try {
      await createProfile({ name: newName.trim(), color: newColor });
      setCreatingProfile(false);
      await loadProfiles();
      onProfilesChange?.();
    } catch {
      setProfileError(t("settings.profileErrorCreate"));
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deleteProfile(id);
      setConfirmDelete(null);
      await loadProfiles();
      onProfilesChange?.();
    } catch {
      setProfileError(t("settings.profileErrorDelete"));
    }
  };

  if (!open) return null;

  return (
    <>
    <Modal title={t("settings.title")} onClose={onClose}>
      {loading ? (
        <div className="spinner">{t("common.loading")}</div>
      ) : (
        <div>
          {/* --- Agent settings --- */}
          <div className="field">
            <label>{t("settings.dndStart")}</label>
            <input
              type="time"
              value={settings.agent_dnd_start}
              onChange={(e) => update("agent_dnd_start", e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("settings.dndEnd")}</label>
            <input
              type="time"
              value={settings.agent_dnd_end}
              onChange={(e) => update("agent_dnd_end", e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("settings.dailyCap")}</label>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.agent_daily_cap}
              onChange={(e) => update("agent_daily_cap", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={settings.agent_enabled}
                onChange={(e) => update("agent_enabled", e.target.checked)}
                style={{ marginRight: 8 }}
              />
              {t("settings.agentEnabled")}
            </label>
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={settings.tts_enabled}
                onChange={(e) => update("tts_enabled", e.target.checked)}
                style={{ marginRight: 8 }}
              />
              {t("settings.ttsEnabled")}
            </label>
          </div>
          <div className="field">
            <label>{t("settings.theme")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={"icon-btn" + (theme === "dark" ? " active" : "")}
                onClick={theme !== "dark" ? onToggleTheme : undefined}
                title={t("settings.darkMode")}
                aria-label={t("settings.darkMode")}
                style={theme === "dark" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
              >
                <Moon size={18} />
              </button>
              <button
                type="button"
                className={"icon-btn" + (theme === "light" ? " active" : "")}
                onClick={theme !== "light" ? onToggleTheme : undefined}
                title={t("settings.lightMode")}
                aria-label={t("settings.lightMode")}
                style={theme === "light" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
              >
                <Sun size={18} />
              </button>
            </div>
          </div>

          {/* --- Display settings --- */}
          <div className="field" style={{ marginTop: 20 }}>
            <label>{t("settings.startView")}</label>
            <select
              value={settings.app_start_view}
              onChange={(e) => {
                update("app_start_view", e.target.value);
                try { localStorage.setItem("personalos_start_view", e.target.value); } catch {}
              }}
            >
              <option value="notes">{t("nav.item.notes")}</option>
              <option value="kanban">{t("nav.item.kanban")}</option>
              <option value="calendar">{t("nav.item.calendar")}</option>
              <option value="projects">{t("nav.item.projects")}</option>
              <option value="files">{t("nav.item.files")}</option>
            </select>
          </div>
          <div className="field">
            <label>{t("settings.timeFormat")}</label>
            <div className="sort-control">
              <button type="button" className={settings.time_format === "24h" ? "active" : ""} onClick={() => update("time_format", "24h")}>24h</button>
              <button type="button" className={settings.time_format === "12h" ? "active" : ""} onClick={() => update("time_format", "12h")}>12h</button>
            </div>
          </div>
          <div className="field">
            <label>{t("settings.weekStartDay")}</label>
            <select value={settings.week_start_day} onChange={(e) => update("week_start_day", e.target.value)}>
              <option value="monday">{t("settings.monday")}</option>
              <option value="sunday">{t("settings.sunday")}</option>
            </select>
          </div>
          <div className="field">
            <label>{t("settings.windowSize")}</label>
            <select value={settings.app_window_size || ""} onChange={(e) => update("app_window_size", e.target.value)}>
              <option value="">{t("settings.windowSizeDefault")}</option>
              <option value="maximized">{t("settings.windowSizeMaximized")}</option>
              <option value="fullscreen">{t("settings.windowSizeFullscreen")}</option>
            </select>
          </div>
          <div className="field">
            <label>{t("settings.kanbanColumns")}</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, width: 80 }}>Backlog:</span>
                <input type="text" value={settings.kanban_col_backlog} onChange={(e) => update("kanban_col_backlog", e.target.value)} placeholder={t("kanban.columnBacklog")} style={{ flex: 1 }} />
              </div>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, width: 80 }}>In Progress:</span>
                <input type="text" value={settings.kanban_col_in_progress} onChange={(e) => update("kanban_col_in_progress", e.target.value)} placeholder={t("kanban.columnInProgress")} style={{ flex: 1 }} />
              </div>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, width: 80 }}>Done:</span>
                <input type="text" value={settings.kanban_col_done} onChange={(e) => update("kanban_col_done", e.target.value)} placeholder={t("kanban.columnDone")} style={{ flex: 1 }} />
              </div>
            </div>
          </div>

          {/* --- Profile management --- */}
          <div className="field" style={{ marginTop: 20 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <label style={{ fontWeight: 600 }}>{t("settings.profiles")}</label>
              <button type="button" className="icon-btn" onClick={startCreate} title={t("settings.profileAdd")} aria-label={t("settings.profileAdd")}>
                <Plus size={16} />
              </button>
            </div>

            {profileError ? (
              <span className="muted" style={{ fontSize: 12, color: "var(--danger)" }}>{profileError}</span>
            ) : null}

            {/* New profile form */}
            {creatingProfile ? (
              <div className="card" style={{ padding: 10, marginBottom: 8 }}>
                <div className="row" style={{ gap: 6 }}>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t("settings.profileNamePlaceholder")}
                    style={{ flex: 1, minWidth: 0 }}
                    autoFocus
                  />
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="accent-picker"
                    style={{ width: 32, height: 32, padding: 0 }}
                  />
                  <button type="button" className="icon-btn" onClick={() => void submitCreate()} disabled={!newName.trim()}>
                    <Check size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setCreatingProfile(false)}>
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : null}

            {/* Profile list */}
            {profiles.map((p) => (
              <div key={p.id} className="row" style={{ gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span className="swatch" style={{ background: p.color, width: 12, height: 12, borderRadius: "50%", flexShrink: 0 }} />
                {editingProfile === p.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ flex: 1, minWidth: 0 }}
                      autoFocus
                    />
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="accent-picker"
                      style={{ width: 28, height: 28, padding: 0 }}
                    />
                    <button type="button" className="icon-btn" onClick={() => void saveEdit(p.id)} disabled={!editName.trim()}>
                      <Check size={14} />
                    </button>
                    <button type="button" className="icon-btn" onClick={cancelEdit}>
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
                    <span className="muted" style={{ fontSize: 10 }}>{p.is_default ? t("settings.profileDefaultBadge") : ""}</span>
                    <button type="button" className="icon-btn" onClick={() => startEdit(p)} title={t("common.edit")} style={{ width: 24, height: 24 }}>
                      <Edit3 size={12} />
                    </button>
                    {p.is_default ? null : (
                      <button type="button" className="icon-btn" onClick={() => setConfirmDelete(p.id)} title={t("common.delete")} style={{ width: 24, height: 24, color: "var(--danger)" }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Delete confirmation */}
            {confirmDelete ? (
              <div className="card" style={{ padding: 10, marginTop: 6, borderLeft: "3px solid var(--danger)" }}>
                <p style={{ margin: "0 0 6px", fontSize: 12 }}>
                  {t("settings.profileDeleteConfirm")}
                </p>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn danger" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => void handleDelete(confirmDelete)}>{t("common.delete")}</button>
                  <button type="button" className="btn secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</button>
                </div>
              </div>
            ) : null}
          </div>

          {/* --- External Calendars --- */}
          <div className="field" style={{ marginTop: 20 }}>
            <label style={{ fontWeight: 600 }}>{t("settings.calendars")}</label>
            <button
              type="button"
              className="btn"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => setCalendarSettingsOpen(true)}
            >
              <Plus size={16} style={{ marginRight: 6 }} />
              {t("settings.calendarConnect")}
            </button>
          </div>

          {/* --- Locale --- */}
          <div className="field" style={{ marginTop: 20 }}>
            <label>{t("settings.language")}</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={current.code}
                onChange={(e) => setLocale(e.target.value)}
                style={{ flex: 1, minWidth: 140 }}
              >
                {available
                  .filter((loc, i, arr) => arr.findIndex((l) => l.code === loc.code) === i)
                  .map((loc) => (
                    <option key={loc.code} value={loc.code}>
                      {loc.nativeName} ({loc.name}){loc.code === "en" ? "" : " ✕"}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="icon-btn"
                onClick={handleDownload}
                title={t("settings.downloadLocale")}
                aria-label={t("settings.downloadLocale")}
              >
                <Download size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => fileInputRef.current?.click()}
                title={t("settings.uploadLocale")}
                aria-label={t("settings.uploadLocale")}
              >
                <Upload size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleUpload}
                style={{ display: "none" }}
              />
              {current.code !== "en" ? (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    removeLocale(current.code);
                    setLocale("en");
                  }}
                  title="Remove this locale"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
            {available.filter((l) => l.code !== "en").length > 0 ? (
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 11, marginTop: 6 }}
                onClick={() => {
                  available.filter((l) => l.code !== "en").forEach((l) => removeLocale(l.code));
                  setLocale("en");
                }}
              >
                Reset all custom locales
              </button>
            ) : null}
          </div>
          {savedKey ? (
            <span className="muted" style={{ fontSize: 12 }}>
              {t("settings.saved")}
            </span>
          ) : null}
        </div>
      )}
    </Modal>

      <CalendarSettings
        open={calendarSettingsOpen}
        onClose={() => setCalendarSettingsOpen(false)}
      />
    </>
  );
}
