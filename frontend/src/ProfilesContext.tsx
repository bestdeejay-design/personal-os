import { createContext, useContext } from "react";
import type { Profile } from "./types";
import { DEFAULT_PROFILE_COLORS } from "./theme";

/** Special virtual profile ID for items with no profile assigned. */
export const UNSORTED_ID = "__unsorted__";

/** Check if a profile_ids array should be treated as "unsorted". */
export function isUnsorted(ids: string[]): boolean {
  return ids.length === 0 || ids.every((id) => id === "");
}

export interface ProfilesContextValue {
  profiles: Profile[];
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}

const UNK = "Unknown";

export const ProfilesContext = createContext<ProfilesContextValue>({
  profiles: [],
  colorOf: () => "#888888",
  nameOf: () => UNK,
});

export function useProfiles(): ProfilesContextValue {
  return useContext(ProfilesContext);
}

export function buildProfilesValue(profiles: Profile[]): ProfilesContextValue {
  const byId = new Map<string, Profile>();
  for (const p of profiles) byId.set(p.id, p);
  return {
    profiles,
    colorOf: (id: string): string => {
      if (!id || id === UNSORTED_ID) return "#888888";
      return byId.get(id)?.color ?? "#888888";
    },
    nameOf: (id: string): string => {
      if (!id || id === UNSORTED_ID) return "Unsorted";
      return byId.get(id)?.name ?? "Unsorted";
    },
  };
}

/** Resolve a profile color by name from the fallback palette (used for seeds). */
export function fallbackColorForName(name: string): string {
  return DEFAULT_PROFILE_COLORS[name] ?? "#888888";
}
