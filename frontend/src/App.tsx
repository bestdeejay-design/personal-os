import { useCallback, useEffect, useState } from "react";
import type { Profile, AgentMessage } from "./types";
import { createProfile, getProfiles, getSettings } from "./api";
import {
  DEFAULT_PROFILE_COLORS,
  loadInitialSettings,
  setAccent,
  setTheme,
  type Theme,
} from "./theme";
import { buildProfilesValue, ProfilesContext, UNSORTED_ID } from "./ProfilesContext";
import { ToastProvider, useToast } from "./components/Toast";
import { LocaleProvider, useLocale } from "./locales";
import {
  Archive as ArchiveIcon,
  BarChart3,
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  Folder,
  Inbox,
  Kanban as KanbanIcon,
  Paperclip,
  Search as SearchIcon,
  Settings,
  Upload,
} from "lucide-react";
import { AgentSettings } from "./components/AgentSettings";
import { ProfileChips } from "./components/ProfileChips";
import { Notes } from "./views/Notes";
import { Kanban as KanbanView } from "./views/Kanban";
import { Calendar as CalendarView } from "./views/Calendar";
import { Files } from "./views/Files";
import { Digests } from "./views/Digests";
import { Search } from "./views/Search";
import { AgentInbox } from "./views/AgentInbox";
import { Priorities } from "./views/Priorities";
import { Timeline } from "./views/Timeline";
import { Analytics } from "./views/Analytics";
import { Archive as ArchiveView } from "./views/Archive";
import { Import } from "./views/Import";
import { Projects as ProjectsView } from "./views/Projects";
import { useWebSocket } from "./useWebSocket";
import { useSpeechSynthesis } from "./useSpeechSynthesis";

type ViewKey =
  | "notes"
  | "kanban"
  | "calendar"
  | "files"
  | "projects"
  | "digests"
  | "search"
  | "inbox"
  | "priorities"
  | "timeline"
  | "analytics"
  | "archive"
  | "import";

interface NavItem {
  key: ViewKey;
  Icon: typeof FileText;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "core",
    items: [
      { key: "notes", Icon: FileText },
      { key: "kanban", Icon: KanbanIcon },
      { key: "calendar", Icon: CalendarIcon },
      { key: "projects", Icon: Folder },
      { key: "files", Icon: Paperclip },
    ],
  },
  {
    labelKey: "planning",
    items: [
      { key: "priorities", Icon: Flag },
      { key: "timeline", Icon: Clock },
    ],
  },
  {
    labelKey: "intelligence",
    items: [
      { key: "inbox", Icon: Inbox },
      { key: "digests", Icon: CalendarDays },
      { key: "search", Icon: SearchIcon },
    ],
  },
  {
    labelKey: "system",
    items: [
      { key: "analytics", Icon: BarChart3 },
      { key: "archive", Icon: ArchiveIcon },
      { key: "import", Icon: Upload },
    ],
  },
];

function AppInner(): JSX.Element {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accent, setAccentState] = useState<string>("#FF7A00");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfiles, setActiveProfiles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("personalos_active_profiles");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [view, setView] = useState<ViewKey>(() => {
    try { return (localStorage.getItem("personalos_start_view") as ViewKey) || "notes"; }
    catch { return "notes"; }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [agentUnread, setAgentUnread] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const toast = useToast();
  const { speak } = useSpeechSynthesis();

  useEffect(() => {
    localStorage.setItem("personalos_active_profiles", JSON.stringify(activeProfiles));
  }, [activeProfiles]);

  useEffect(() => {
    void getSettings()
      .then((list) => {
        const map: Record<string, string> = {};
        for (const s of list) map[s.key] = s.value;
        if (map.tts_enabled === "true") setTtsEnabled(true);
        if (map.app_start_view && !localStorage.getItem("personalos_start_view")) {
          setView(map.app_start_view as ViewKey);
        }
        // Tauri window size (best-effort, web ignores)
        const ws = map.app_window_size;
        if (ws) {
          import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
            const w = getCurrentWindow();
            if (ws === "maximized") { void w.maximize(); }
            else if (ws === "fullscreen") { void w.setFullscreen(true); }
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void loadInitialSettings().then((s) => {
      setThemeState(s.theme);
      setAccentState(s.accent);
    });
    void getProfiles()
      .then(async (list) => {
        if (list.length === 0) {
          const seeded = await Promise.all(
            Object.entries(DEFAULT_PROFILE_COLORS).map(([name, color]) =>
              createProfile({ name, color }),
            ),
          );
          setProfiles(seeded);
        } else {
          setProfiles(list);
        }
      })
      .catch(() => {
        // backend unavailable; start with empty profile list
      });
  }, [profileReloadKey]);

  const handleWsMessage = useCallback(
    (data: unknown): void => {
      if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;

        if (obj.type === "agent_inbox_count") {
          const count = typeof obj.payload === "number" ? obj.payload : 0;
          setAgentUnread(count);
          return;
        }

        if (obj.type === "agent_message") {
          const payload = obj.payload as AgentMessage | undefined;
          if (payload) {
            setAgentUnread((c) => c + 1);
            toast.push(payload.title, payload.body);
            if (ttsEnabled && payload.body) {
              speak(payload.body);
            }
          }
          return;
        }

        const title =
          typeof obj.title === "string"
            ? obj.title
            : typeof obj.text === "string"
              ? obj.text
              : typeof obj.message === "string"
                ? obj.message
                : "Notification";
        const body = typeof obj.body === "string" ? obj.body : undefined;
        toast.push(title, body);
      } else if (typeof data === "string") {
        toast.push(data);
      }
    },
    [toast, ttsEnabled, speak],
  );

  useWebSocket(handleWsMessage);

  const toggleTheme = (): void => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    void setTheme(next);
  };

  const toggleSidebar = (): void => {
    setSidebarCollapsed((p) => !p);
  };

  const onAccent = (value: string): void => {
    setAccentState(value);
    void setAccent(value);
  };

  const toggleProfile = (id: string): void => {
    setActiveProfiles((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const onInboxUnread = useCallback((n: number): void => {
    setAgentUnread(n);
  }, []);

  const onViewChange = (key: ViewKey): void => {
    setView(key);
    if (key === "inbox") {
      setAgentUnread(0);
    }
  };

  const ctx = buildProfilesValue(profiles);
  const { t } = useLocale();

  return (
    <ProfilesContext.Provider value={ctx}>
      <div className="app">
        <aside className={"sidebar" + (sidebarCollapsed ? " collapsed" : "")}>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              {sidebarCollapsed ? (
                "∞"
              ) : (
                <>{t("app.name")}<span className="dot"> {t("sidebar.logoShort")}</span></>
              )}
            </div>
            {!sidebarCollapsed && (
              <div className="sidebar-top-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowSettings(true)}
                  title={t("sidebar.agentSettings")}
                  aria-label={t("sidebar.agentSettings")}
                >
                  <Settings size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn collapse-btn"
                  onClick={toggleSidebar}
                  title={t("sidebar.collapse")}
                  aria-label={t("sidebar.collapse")}
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Profiles — dots in collapsed, chips in expanded */}
          <div className={"sidebar-profiles" + (sidebarCollapsed ? "" : "")}>
            {sidebarCollapsed ? (
              <div className="profile-dots">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={"profile-dot" + (activeProfiles.includes(p.id) ? " active" : "")}
                    style={{ "--dot-color": p.color } as React.CSSProperties}
                    onClick={() => toggleProfile(p.id)}
                    title={p.name}
                    aria-label={p.name}
                  />
                ))}
                <button
                  type="button"
                  className={"profile-dot unsorted-dot" + (activeProfiles.includes(UNSORTED_ID) ? " active" : "")}
                  onClick={() => toggleProfile(UNSORTED_ID)}
                  title="Unsorted"
                  aria-label="Unsorted"
                >
                  ?
                </button>
              </div>
            ) : (
              <>
                <span className="nav-group-label">{t("profiles.title")}</span>
                <ProfileChips
                  profiles={profiles}
                  selected={activeProfiles}
                  onToggle={toggleProfile}
                />
                <button
                  type="button"
                  className={"chip unsorted-chip" + (activeProfiles.includes(UNSORTED_ID) ? " active" : "")}
                  style={{ ["--chip-color" as string]: "#888" }}
                  onClick={() => toggleProfile(UNSORTED_ID)}
                  aria-pressed={activeProfiles.includes(UNSORTED_ID)}
                >
                  <span className="swatch" style={{ background: "#888" }} />
                  Unsorted
                </button>
              </>
            )}
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.labelKey} className="nav-group">
              {!sidebarCollapsed && (
                <span className="nav-group-label">{t("nav.group." + group.labelKey)}</span>
              )}
              {group.items.map(({ key, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={"nav-item" + (view === key ? " active" : "")}
                  onClick={() => onViewChange(key)}
                  title={sidebarCollapsed ? t("nav.item." + key) : undefined}
                >
                  <Icon size={16} />
                  {!sidebarCollapsed && <span>{t("nav.item." + key)}</span>}
                  {key === "inbox" && agentUnread > 0 ? (
                    <span className="inbox-badge">{agentUnread > 99 ? "99+" : agentUnread}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}

          <div className="sidebar-spacer" />

          {!sidebarCollapsed && (
            <div className="sidebar-bottom">
            <div className="sidebar-bottom-row">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => onAccent(e.target.value)}
                  title={t("sidebar.accentColor")}
                  aria-label={t("sidebar.accentColor")}
                  className="accent-picker"
                />
                <span className="sidebar-version">v0.0.12</span>
              </div>
            </div>
          )}
        </aside>

        {sidebarCollapsed && (
          <button
            type="button"
            className="sidebar-expand-tab"
            onClick={toggleSidebar}
            title={t("sidebar.expand")}
            aria-label={t("sidebar.expand")}
          >
            <ChevronRight size={16} />
          </button>
        )}

        <main className="content">
          {view === "notes" ? <Notes activeProfiles={activeProfiles} /> : null}
          {view === "kanban" ? <KanbanView activeProfiles={activeProfiles} /> : null}
          {view === "calendar" ? <CalendarView activeProfiles={activeProfiles} /> : null}
          {view === "files" ? <Files activeProfiles={activeProfiles} /> : null}
          {view === "projects" ? <ProjectsView activeProfiles={activeProfiles} /> : null}
          {view === "digests" ? <Digests activeProfiles={activeProfiles} /> : null}
          {view === "inbox" ? (
            <AgentInbox activeProfiles={activeProfiles} onUnreadChange={onInboxUnread} />
          ) : null}
          {view === "search" ? <Search /> : null}
          {view === "priorities" ? <Priorities activeProfiles={activeProfiles} /> : null}
          {view === "timeline" ? <Timeline activeProfiles={activeProfiles} /> : null}
          {view === "analytics" ? <Analytics activeProfiles={activeProfiles} /> : null}
          {view === "archive" ? <ArchiveView activeProfiles={activeProfiles} /> : null}
          {view === "import" ? <Import activeProfiles={activeProfiles} /> : null}
        </main>

        <AgentSettings
          open={showSettings}
          onClose={() => setShowSettings(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onProfilesChange={() => setProfileReloadKey((k) => k + 1)}
        />
      </div>
    </ProfilesContext.Provider>
  );
}

export default function App(): JSX.Element {
  return (
    <LocaleProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </LocaleProvider>
  );
}
