import { useEffect, useState } from "react";
import type { Profile } from "./types";
import { createProfile, getProfiles } from "./api";
import {
  DEFAULT_PROFILE_COLORS,
  loadInitialSettings,
  setAccent,
  setTheme,
  type Theme,
} from "./theme";
import { buildProfilesValue, ProfilesContext } from "./ProfilesContext";
import { ToastProvider, useToast } from "./components/Toast";
import { ProfileChips } from "./components/ProfileChips";
import { Notes } from "./views/Notes";
import { Kanban } from "./views/Kanban";
import { Calendar } from "./views/Calendar";
import { Files } from "./views/Files";
import { Digests } from "./views/Digests";
import { Search } from "./views/Search";
import { useWebSocket } from "./useWebSocket";

type ViewKey = "notes" | "kanban" | "calendar" | "files" | "digests" | "search";

const TABS: { key: ViewKey; label: string }[] = [
  { key: "notes", label: "Notes" },
  { key: "kanban", label: "Kanban" },
  { key: "calendar", label: "Calendar" },
  { key: "files", label: "Files" },
  { key: "digests", label: "Digests" },
  { key: "search", label: "Search" },
];

function AppInner(): JSX.Element {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accent, setAccentState] = useState<string>("#FF7A00");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfiles, setActiveProfiles] = useState<string[]>([]);
  const [view, setView] = useState<ViewKey>("notes");
  const toast = useToast();

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
  }, []);

  useWebSocket((data: unknown) => {
    if (data && typeof data === "object") {
      const obj = data as { title?: unknown; body?: unknown; text?: unknown; message?: unknown };
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
  });

  const toggleTheme = (): void => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    void setTheme(next);
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

  const ctx = buildProfilesValue(profiles);

  return (
    <ProfilesContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <span className="app-name">
            Personal<span className="dot"> OS</span>
          </span>
          <ProfileChips
            profiles={profiles}
            selected={activeProfiles}
            onToggle={toggleProfile}
          />
          <span className="topbar-spacer" />
          <input
            type="color"
            value={accent}
            onChange={(e) => onAccent(e.target.value)}
            title="Accent color"
            aria-label="Accent color"
            style={{
              width: 34,
              height: 34,
              padding: 2,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--panel-2)",
            }}
          />
          <button type="button" className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? "☀" : "🌙"}
          </button>
        </header>

        <nav className="nav">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={view === tab.key ? "active" : ""}
              onClick={() => setView(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="content">
          {view === "notes" ? <Notes activeProfiles={activeProfiles} /> : null}
          {view === "kanban" ? <Kanban activeProfiles={activeProfiles} /> : null}
          {view === "calendar" ? <Calendar activeProfiles={activeProfiles} /> : null}
          {view === "files" ? <Files /> : null}
          {view === "digests" ? <Digests activeProfiles={activeProfiles} /> : null}
          {view === "search" ? <Search /> : null}
        </main>
      </div>
    </ProfilesContext.Provider>
  );
}

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
