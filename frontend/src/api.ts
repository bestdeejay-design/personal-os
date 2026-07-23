import type {
  AgentMessage,
  Analytics,
  Conflict,
  CreateMeetingInput,
  CreateNoteInput,
  CreateProfileInput,
  CreateTaskInput,
  FileMeta,
  ImportResult,
  Meeting,
  Note,
  Profile,
  Project,
  SearchResults,
  Setting,
  Task,
  TaskStatus,
  Template,
  TimelineItem,
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

export function updateProfile(id: string, input: Partial<CreateProfileInput & { hidden: boolean }>): Promise<Profile> {
  return request<Profile>(`/api/profiles/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function deleteProfile(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/profiles/${id}`, {
    method: "DELETE",
  });
}

// ---- Notes ----
export function getNotes(
  profile?: string[],
  q?: string,
  archived?: "false" | "all" | "only",
): Promise<Note[]> {
  const query = buildQuery({ profile: profile ?? [], q, archived });
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

export async function reorderNotes(orderedIds: string[]): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/notes/order", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ orderedIds }),
  });
}

// ---- Tasks ----
export function getTasks(params: {
  status?: TaskStatus;
  project?: string;
  profile?: string[];
  archived?: "false" | "all" | "only";
}): Promise<Task[]> {
  const query = buildQuery({
    status: params.status,
    project: params.project,
    profile: params.profile ?? [],
    archived: params.archived,
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
  patch: { status?: TaskStatus; archived?: boolean; [key: string]: unknown },
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

export function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  return request<Project>(`/api/projects/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export function deleteProject(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" });
}

export function getProjectItems(id: string): Promise<{
  notes: Note[];
  tasks: Task[];
  meetings: Meeting[];
  files: FileMeta[];
}> {
  return request(`/api/projects/${id}/items`);
}

// ---- Calendar ----
export function getCalendar(params: {
  from?: string;
  to?: string;
  profile?: string[];
  archived?: "false" | "all" | "only";
}): Promise<Meeting[]> {
  const query = buildQuery({
    from: params.from,
    to: params.to,
    profile: params.profile ?? [],
    archived: params.archived,
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

export function updateMeeting(id: string, patch: Record<string, unknown>): Promise<Meeting> {
  return request<Meeting>(`/api/calendar/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export function deleteMeeting(id: string): Promise<void> {
  return request<void>(`/api/calendar/${id}`, { method: "DELETE" });
}

// ---- Priorities ----
export function getPriorities(profile?: string[]): Promise<Task[]> {
  const query = buildQuery({ profile: profile ?? [] });
  return request<Task[]>(`/api/priorities${query}`);
}

export function reorderPriorities(orderedIds: string[]): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/priorities/order", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ orderedIds }),
  });
}

// ---- Timeline ----
export function getTimeline(params: {
  from?: string;
  to?: string;
  profile?: string[];
}): Promise<TimelineItem[]> {
  const query = buildQuery({
    from: params.from,
    to: params.to,
    profile: params.profile ?? [],
  });
  return request<TimelineItem[]>(`/api/timeline${query}`);
}

// ---- Conflicts ----
export function getConflicts(profile?: string[]): Promise<Conflict[]> {
  const query = buildQuery({ profile: profile ?? [] });
  return request<Conflict[]>(`/api/conflicts${query}`);
}

// ---- Analytics ----
export function getAnalytics(params: {
  profile?: string[];
  from?: string;
  to?: string;
}): Promise<Analytics> {
  const query = buildQuery({
    profile: params.profile ?? [],
    from: params.from,
    to: params.to,
  });
  return request<Analytics>(`/api/analytics${query}`);
}

// ---- Import ----
export function importData(input: {
  source: "text" | "json";
  content: string;
  target?: "notes" | "tasks";
  profile_ids?: string[];
}): Promise<ImportResult> {
  return request<ImportResult>("/api/import", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
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
export function search(q: string, filters?: Record<string, unknown>): Promise<SearchResults> {
  return request<SearchResults>("/api/search", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ q, filters }),
  });
}

// ---- Files ----
export function getFiles(profile?: string[]): Promise<FileMeta[]> {
  const query = buildQuery({ profile: profile ?? [] });
  return request<FileMeta[]>(`/api/files${query}`);
}

export async function uploadFile(
  file: File,
  ownerType?: string,
  ownerId?: string,
  profileIds?: string[],
): Promise<FileMeta> {
  const form = new FormData();
  form.append("file", file);
  if (ownerType) form.append("owner_type", ownerType);
  if (ownerId) form.append("owner_id", ownerId);
  if (profileIds && profileIds.length > 0) form.append("profile_ids", profileIds.join(","));
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

export function updateFileMeta(id: string, data: Partial<{ filename: string; profile_ids: string[]; owner_type: string; owner_id: string }>): Promise<FileMeta> {
  return request<FileMeta>(`/api/files/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export function deleteFileMeta(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/files/${id}`, {
    method: "DELETE",
  });
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

// ---- Agent Inbox ----
export function getAgentInbox(profile?: string[]): Promise<AgentMessage[]> {
  const query = buildQuery({ profile: profile ?? [] });
  return request<AgentMessage[]>(`/api/agent/inbox${query}`);
}

export function respondToAgent(
  id: string,
  action: "accept" | "reject" | "reply",
  text?: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/agent/respond", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ id, action, text }),
  });
}

export function dismissAllAgentMessages(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/agent/dismiss-all", {
    method: "POST",
    headers: JSON_HEADERS,
  });
}

// ---- TTS ----
export function triggerSpeak(text: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/notify/speak", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ text }),
  });
}

// ---- Templates ----
export function getTemplates(): Promise<Template[]> {
  return request<Template[]>("/api/templates");
}

export function createTemplate(input: {
  name: string;
  type?: string;
  body?: string;
  default_tags?: string[];
  default_profile_ids?: string[];
}): Promise<Template> {
  return request<Template>("/api/templates", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function deleteTemplate(id: string): Promise<void> {
  return request<void>(`/api/templates/${id}`, { method: "DELETE" });
}

// ---- Export ----
export function exportAll(): string {
  // Direct download via browser navigation — triggers backend ZIP stream
  return `/api/export`;
}

// ---- External Calendars ----
export interface ExternalCalendar {
  id: string;
  provider: string;
  display_name: string;
  email: string | null;
  last_sync_at: string | null;
  sync_enabled: boolean;
  created_at: string;
}

export interface ExternalEvent {
  id: string;
  calendar_id: string;
  external_id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  all_day: boolean;
  status: string;
  html_link: string | null;
  linked_project_id: string | null;
  linked_task_id: string | null;
  linked_note_id: string | null;
  linked_meeting_id: string | null;
  profile_ids: string[];
  synced_at: string;
}

export function getCalendars(): Promise<ExternalCalendar[]> {
  return request<ExternalCalendar[]>("/api/calendars");
}

export function createCalendar(input: {
  display_name: string;
  url: string;
}): Promise<ExternalCalendar> {
  return request<ExternalCalendar>("/api/calendars", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      display_name: input.display_name,
      caldav_url: input.url,
    }),
  });
}

export function updateCalendar(id: string, patch: Partial<ExternalCalendar>): Promise<ExternalCalendar> {
  return request<ExternalCalendar>(`/api/calendars/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export function deleteCalendar(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/calendars/${id}`, {
    method: "DELETE",
  });
}

export function syncCalendar(id: string): Promise<{ ok: boolean; synced: number }> {
  return request<{ ok: boolean; synced: number }>(`/api/calendars/sync/${id}`, {
    method: "POST",
  });
}

export function getCalendarEvents(
  calendarId: string,
  params?: { start?: string; end?: string },
): Promise<ExternalEvent[]> {
  const query = buildQuery({ start: params?.start, end: params?.end });
  return request<ExternalEvent[]>(`/api/calendars/${calendarId}/events${query}`);
}

export function linkCalendarEvent(
  eventId: string,
  link: {
    linked_project_id?: string | null;
    linked_task_id?: string | null;
    linked_note_id?: string | null;
    linked_meeting_id?: string | null;
    profile_ids?: string[];
  },
): Promise<ExternalEvent> {
  return request<ExternalEvent>(`/api/calendars/events/${eventId}/link`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(link),
  });
}


