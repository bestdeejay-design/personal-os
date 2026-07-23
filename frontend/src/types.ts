export type Priority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "backlog" | "in_progress" | "done";

export interface Profile {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
  hidden: boolean;
}

export type Recurrence =
  | {
      freq: "daily" | "weekly" | "monthly" | "yearly";
      interval?: number;
      until?: string | null;
    }
  | null;

export interface TimelineItem {
  id: string;
  type: "meeting" | "task" | "note";
  title: string;
  start: string; // ISO
  end?: string; // ISO, meetings only
  profile_ids: string[];
  done?: boolean; // tasks
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
  completion_rate: number; // 0..1
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

export interface Note {
  id: string;
  title: string;
  body_md: string;
  profile_ids: string[];
  tags: string[];
  manual_order?: number;
  created_at: string;
  updated_at: string;
  linked_meeting_id?: string | null;
  linked_project_id?: string | null;
  linked_task_id?: string | null;
  archived: boolean;
}

export interface Task {
  id: string;
  title: string;
  desc_md: string;
  status: TaskStatus;
  priority: Priority;
  weight: number;
  assignee: string;
  due_date?: string | null;
  recurrence?: Recurrence;
  project_id?: string | null;
  profile_ids: string[];
  tags: string[];
  created_at: string;
  archived: boolean;
  rank?: number;
}

export interface Project {
  id: string;
  name: string;
  desc_md: string;
  profile_ids: string[];
  status: string;
  goal?: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  profile_ids: string[];
  linked_project_id?: string | null;
  notes_md: string;
  location?: string | null;
  recurrence?: Recurrence;
  archived: boolean;
}

export interface FileMeta {
  id: string;
  filename: string;
  mime: string;
  size: number;
  owner_type?: string | null;
  owner_id?: string | null;
  stored_path: string;
  uploaded_at: string;
  profile_ids: string[];
  extracted_text?: string;
  excerpt?: string;
}

export interface Reminder {
  id: string;
  type: string;
  fire_at: string;
  message: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  fired_bool: boolean;
  profile_ids: string[];
}

export interface Setting {
  key: string;
  value: string;
}

export interface TodayDigest {
  meetings: Meeting[];
  tasks: Task[];
  reminders: Reminder[];
}

export interface WeekDay {
  date: string;
  meetings: Meeting[];
  tasks: Task[];
}

export interface WeekDigest {
  days: WeekDay[];
}

export interface SearchResults {
  notes: Note[];
  tasks: Task[];
  meetings: Meeting[];
  files: FileMeta[];
}

export interface CreateNoteInput {
  title: string;
  body_md: string;
  profile_ids: string[];
  tags: string[];
  linked_project_id?: string | null;
  linked_meeting_id?: string | null;
  linked_task_id?: string | null;
}

export interface CreateTaskInput {
  title: string;
  desc_md: string;
  priority: Priority;
  weight: number;
  assignee: string;
  due_date?: string | null;
  project_id?: string | null;
  profile_ids: string[];
  tags?: string[];
  recurrence?: Recurrence;
}

export interface CreateMeetingInput {
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  profile_ids: string[];
  linked_project_id?: string | null;
  notes_md: string;
  location?: string | null;
  recurrence?: Recurrence;
}

export interface CreateProfileInput {
  name: string;
  color: string;
}

export interface SuggestedAction {
  type: "create_note" | "create_task" | "create_meeting" | "reprioritize" | "reschedule";
  label: string;
  params: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  trigger_type: string;
  title: string;
  body: string;
  suggested_actions_json: SuggestedAction[];
  created_at: string;
  resolved: boolean;
  response: string | null;
  profile_ids: string[];
}
