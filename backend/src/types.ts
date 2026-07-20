// Общие типы строк БД и входных данных для бэкенда Personal OS (P1).

export interface ProfileRow {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
}

export interface NoteRow {
  id: string;
  title: string;
  body_md: string;
  profile_ids: string[];
  tags: string[];
  linked_meeting_id: string | null;
  linked_project_id: string | null;
  linked_task_id: string | null;
  created_at: Date;
  updated_at: Date;
  archived: boolean;
  manual_order: number;
}

export interface TaskRow {
  id: string;
  title: string;
  desc_md: string;
  status: string;
  priority: string;
  weight: number;
  rank: number;
  assignee: string | null;
  due_date: Date | null;
  recurrence: unknown;
  project_id: string | null;
  profile_ids: string[];
  created_at: Date;
  archived: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  desc_md: string;
  profile_ids: string[];
  status: string | null;
  goal: string | null;
  created_at: Date;
}

export interface MeetingRow {
  id: string;
  title: string;
  start: Date;
  end: Date;
  all_day: boolean;
  profile_ids: string[];
  linked_project_id: string | null;
  notes_md: string;
  location: string;
  recurrence: unknown;
  archived: boolean;
}

export interface FileMetaRow {
  id: string;
  filename: string;
  mime: string | null;
  size: number | null;
  owner_type: string | null;
  owner_id: string | null;
  stored_path: string | null;
  uploaded_at: Date;
}

export interface ReminderRow {
  id: string;
  type: string | null;
  fire_at: Date | null;
  message: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  fired: boolean;
  profile_ids: string[];
}

export interface NoteInput {
  title?: string;
  body_md?: string;
  profile_ids?: string[];
  tags?: string[];
  linked_meeting_id?: string | null;
  linked_project_id?: string | null;
  linked_task_id?: string | null;
  archived?: boolean;
  manual_order?: number;
}

export interface TaskInput {
  title?: string;
  desc_md?: string;
  status?: string;
  priority?: string;
  weight?: number;
  rank?: number;
  assignee?: string | null;
  due_date?: string | null;
  recurrence?: unknown;
  project_id?: string | null;
  profile_ids?: string[];
  archived?: boolean;
}

export interface ProjectInput {
  name?: string;
  desc_md?: string;
  profile_ids?: string[];
  status?: string | null;
  goal?: string | null;
}

export interface MeetingInput {
  title?: string;
  start?: string;
  end?: string;
  all_day?: boolean;
  profile_ids?: string[];
  linked_project_id?: string | null;
  notes_md?: string;
  location?: string;
  recurrence?: unknown;
  archived?: boolean;
}

export interface TodayData {
  meetings: MeetingRow[];
  tasks: TaskRow[];
  reminders: ReminderRow[];
}

// ──────────────────────────────────────────
// Agent P2 types
// ──────────────────────────────────────────

export interface SuggestedAction {
  type: "create_note" | "create_task" | "create_meeting" | "reprioritize" | "reschedule";
  label: string;
  params: Record<string, unknown>;
}

export interface AgentMessageRow {
  id: string;
  trigger_type: string;
  title: string;
  body: string;
  suggested_actions_json: SuggestedAction[];
  created_at: Date;
  resolved: boolean;
  response: string | null;
  profile_ids: string[];
  ref_id: string | null;
}

export interface AgentRunRow {
  id: string;
  run_at: Date;
  triggered: string[];
  messages_created: number;
}

// ──────────────────────────────────────────
// P3 (Глубина) canonical shapes
// ──────────────────────────────────────────

export interface TimelineItem {
  id: string;
  type: "meeting" | "task" | "note";
  title: string;
  start: string;
  end?: string;
  profile_ids: string[];
  done?: boolean;
  ref_id?: string;
}

export interface Conflict {
  id: string;
  kind: "time";
  reason: string;
  items: TimelineItem[];
  profiles: string[];
}

export interface Analytics {
  tasks_total: number;
  tasks_by_status: Record<string, number>;
  tasks_by_priority: Record<string, number>;
  tasks_overdue: number;
  tasks_done: number;
  completion_rate: number;
  notes_total: number;
  meetings_total: number;
  files_total: number;
  per_profile?: Record<string, { tasks: number; notes: number; meetings: number }>;
}

export interface ImportResult {
  notes: number;
  tasks: number;
  errors?: string[];
}
