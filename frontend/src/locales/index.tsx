import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import en from "./en.json";
import ru from "./ru.json";
import ja from "./ja.json";
import ko from "./ko.json";
import zh from "./zh.json";

/* types */

export interface LocaleEntry {
  code: string;
  name: string;
  nativeName: string;
}

export type LocaleData = Record<string, string | Record<string, unknown> | LocaleEntry>;

export interface LocalePack {
  locale: LocaleEntry;
  [section: string]: LocaleData | LocaleEntry | string | undefined;
}

interface LocaleContextValue {
  t: (key: string, vars?: Record<string, string> | string) => string;
  current: LocaleEntry;
  currentPack: LocalePack;
  available: LocaleEntry[];
  setLocale: (code: string) => void;
  addLocale: (pack: LocalePack) => void;
  removeLocale: (code: string) => void;
}

/* storage helpers */

const STORAGE_KEY_CUSTOM = "personalos_locales_custom";
const STORAGE_KEY_SELECTED = "personalos_locale";

function loadCustomLocales(): LocalePack[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM) || "[]");
  } catch {
    return [];
  }
}

function saveCustomLocales(list: LocalePack[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(list));
  } catch {
    /* quota exceeded — swallow */
  }
}

/* built-in */

const BUILT_IN: LocalePack[] = [
  en as LocalePack,
  ru as LocalePack,
  ja as LocalePack,
  ko as LocalePack,
  zh as LocalePack,
];

/* context */

const LocaleCtx = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }): JSX.Element {
  const [customs, setCustoms] = useState<LocalePack[]>(() => loadCustomLocales());
  const [currentCode, setCurrentCode] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_SELECTED) || "en";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SELECTED, currentCode);
  }, [currentCode]);

  useEffect(() => {
    saveCustomLocales(customs);
  }, [customs]);

  const allPacks: LocalePack[] = [...customs, ...BUILT_IN];

  const activePack: LocalePack = (allPacks.find((p) => p.locale.code === currentCode) ||
    allPacks.find((p) => p.locale.code === "en") ||
    allPacks[0])!;

  const available: LocaleEntry[] = allPacks.map((p) => p.locale);

  const t = useCallback(
    (key: string, vars?: Record<string, string> | string): string => {
      const parts = key.split(".");
      let obj: unknown = activePack;
      for (const part of parts) {
        if (obj && typeof obj === "object" && part in obj) {
          obj = (obj as Record<string, unknown>)[part];
        } else {
          return typeof vars === "string" ? vars : key;
        }
      }
      if (typeof obj === "string") {
        let s = obj;
        if (vars && typeof vars === "object") {
          for (const [k, v] of Object.entries(vars)) {
            s = s.replace(`{${k}}`, v);
          }
        }
        return s;
      }
      return typeof vars === "string" ? vars : key;
    },
    [activePack],
  );

  const setLocale = useCallback((code: string) => {
    setCurrentCode(code);
  }, []);

  const addLocale = useCallback((pack: LocalePack) => {
    setCustoms((prev) => {
      const filtered = prev.filter((p) => p.locale.code !== pack.locale.code);
      return [...filtered, pack];
    });
  }, []);

  const removeLocale = useCallback((code: string) => {
    setCustoms((prev) => prev.filter((p) => p.locale.code !== code));
  }, []);

  return (
    <LocaleCtx.Provider
      value={{
        t,
        current: activePack.locale,
        currentPack: activePack,
        available,
        setLocale,
        addLocale,
        removeLocale,
      }}
    >
      {children}
    </LocaleCtx.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleCtx);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
