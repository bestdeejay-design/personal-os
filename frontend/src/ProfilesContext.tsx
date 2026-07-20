import { createContext, useContext } from "react";
import type { Profile } from "./types";
import { DEFAULT_PROFILE_COLORS } from "./theme";

export interface ProfilesContextValue {
  profiles: Profile[];
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}

export const ProfilesContext = createContext<ProfilesContextValue>({
  profiles: [],
  colorOf: () => "#888888",
  nameOf: () => "Unknown",
});

export function useProfiles(): ProfilesContextValue {
  return useContext(ProfilesContext);
}

export function buildProfilesValue(profiles: Profile[]): ProfilesContextValue {
  const byId = new Map<string, Profile>();
  for (const p of profiles) byId.set(p.id, p);
  return {
    profiles,
    colorOf: (id: string): string => byId.get(id)?.color ?? "#888888",
    nameOf: (id: string): string => byId.get(id)?.name ?? "Unknown",
  };
}

/** Resolve a profile color by name from the fallback palette (used for seeds). */
export function fallbackColorForName(name: string): string {
  return DEFAULT_PROFILE_COLORS[name] ?? "#888888";
}
