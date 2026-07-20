import type {
  CreateMeetingInput,
  CreateNoteInput,
  CreateProfileInput,
  CreateTaskInput,
  FileMeta,
  Meeting,
  Note,
  Profile,
  Project,
  SearchResults,
  Setting,
  Task,
  TaskStatus,
  TodayDigest,
  WeekDigest,
} from "./types";

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // response had no JSON error body; keep default message
    }
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function buildQuery(params: Record<string, string | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) parts.push(`${key}=${encodeURIComponent(value.join(","))}`);
    } else {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

// ---- Profiles ----
export function getProfiles(): Promise<Profile[]> {
  return request<Profile[]>("/api/profiles");
}

export function createProfile(input: CreateProfileInput): Promise<Profile> {
  return request<Profile>("/api/profiles", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

// ---- Notes ----
export function getNotes(profile?: string[], q?: string): Promise<Note[]> {
  const query = buildQuery({ profile: profile ?? [], q });
  return request<Note[]>(`/api/notes${query}`);
}

export function createNote(input: CreateNoteInput): Promise<Note> {
  return request<Note>("/api/notes", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function updateNote(id: string, patch: Partial<CreateNoteInput>): Promise<Note> {
  return request<Note>(`/api/notes/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export function deleteNote(id: string): Promise<void> {
  return request<void>(`/api/notes/${id}`, { method: "DELETE" });
}

// ---- Tasks ----
export function getTasks(params: {
  status?: TaskStatus;
  project?: string;
  profile?: string[];
}): Promise<Task[]> {
  const query = buildQuery({
    status: params.status,
    project: params.project,
    profile: params.profile ?? [],
  });
  return request<Task[]>(`/api/tasks${query}`);
}

export function createTask(input: CreateTaskInput): Promise<Task> {
  return request<Task>("/api/tasks", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function updateTask(
  id: string,
  patch: { status?: TaskStatus; [key: string]: unknown },
): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export function deleteTask(id: string): Promise<void> {
  return request<void>(`/api/tasks/${id}`, { method: "DELETE" });
}

// ---- Projects ----
export function getProjects(): Promise<Project[]> {
  return request<Project[]>("/api/projects");
}

export function createProject(input: {
  name: string;
  desc_md: string;
  profile_ids: string[];
  status: string;
  goal?: string | null;
}): Promise<Project> {
  return request<Project>("/api/projects", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

// ---- Calendar ----
export function getCalendar(params: {
  from?: string;
  to?: string;
  profile?: string[];
}): Promise<Meeting[]> {
  const query = buildQuery({
    from: params.from,
    to: params.to,
    profile: params.profile ?? [],
  });
  return request<Meeting[]>(`/api/calendar${query}`);
}

export function createMeeting(input: CreateMeetingInput): Promise<Meeting> {
  return request<Meeting>("/api/calendar", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export async function downloadMeetingIcs(id: string): Promise<Blob> {
  const res = await fetch(`/api/calendar/${id}/ics`);
  if (!res.ok) {
    throw new Error(`Failed to download .ics (${res.status})`);
  }
  return res.blob();
}

// ---- Digests ----
export function getToday(): Promise<TodayDigest> {
  return request<TodayDigest>("/api/today");
}

export function getWeek(profile?: string[]): Promise<WeekDigest> {
  const query = buildQuery({ profile: profile ?? [] });
  return request<WeekDigest>(`/api/week${query}`);
}

// ---- Search ----
export function search(q: string): Promise<SearchResults> {
  return request<SearchResults>("/api/search", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ q }),
  });
}

// ---- Files ----
export function getFiles(): Promise<FileMeta[]> {
  return request<FileMeta[]>("/api/files");
}

export async function uploadFile(
  file: File,
  ownerType?: string,
  ownerId?: string,
): Promise<FileMeta> {
  const form = new FormData();
  form.append("file", file);
  if (ownerType) form.append("owner_type", ownerType);
  if (ownerId) form.append("owner_id", ownerId);
  const res = await fetch("/api/files", { method: "POST", body: form });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // no JSON error body
    }
    throw new Error(message);
  }
  return (await res.json()) as FileMeta;
}

// ---- Settings ----
export function getSettings(): Promise<Setting[]> {
  return request<Setting[]>("/api/settings");
}

export function saveSetting(key: string, value: string): Promise<Setting> {
  return request<Setting>("/api/settings", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ key, value }),
  });
}
