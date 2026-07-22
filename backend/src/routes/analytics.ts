import { Router } from "express";
import { pool, isDbReady, parseProfileParam, buildProfileFilter } from "../db.js";
import type { TaskRow, NoteRow, MeetingRow, Analytics } from "../types.js";

export const analyticsRouter = Router();

interface ProfileCount {
  tasks: number;
  notes: number;
  meetings: number;
}

analyticsRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const profiles = parseProfileParam(req.query.profile);
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";

  const profileCond = (params: unknown[]): string => {
    if (profiles.length === 0) return "";
    const { clause, filteredProfiles } = buildProfileFilter(profiles, params.length + 1);
    if (!clause) return "";
    if (filteredProfiles.length > 0) params.push(filteredProfiles);
    return `AND ${clause}`;
  };

  // Задачи (для агрегатов и per_profile).
  const taskParams: unknown[] = [];
  const { rows: taskRows } = await pool.query<TaskRow>(
    `SELECT status, priority, due_date, profile_ids FROM tasks WHERE archived = false ${profileCond(taskParams)}`,
    taskParams
  );

  const tasks_total = taskRows.length;
  const tasks_by_status: Record<string, number> = {};
  const tasks_by_priority: Record<string, number> = {};
  let tasks_overdue = 0;
  let tasks_done = 0;
  const now = Date.now();
  for (const t of taskRows) {
    tasks_by_status[t.status] = (tasks_by_status[t.status] ?? 0) + 1;
    tasks_by_priority[t.priority] = (tasks_by_priority[t.priority] ?? 0) + 1;
    if (t.status === "done") tasks_done++;
    else if (t.due_date && t.due_date.getTime() < now) tasks_overdue++;
  }
  const completion_rate = tasks_total > 0 ? tasks_done / tasks_total : 0;

  // Заметки.
  const noteParams: unknown[] = [];
  const { rows: noteCount } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM notes WHERE archived = false ${profileCond(noteParams)}`,
    noteParams
  );
  const notes_total = noteCount[0]?.c ?? 0;

  // Встречи (в диапазоне, если задан).
  const meetParams: unknown[] = [];
  let meetRange = "";
  if (from) {
    meetParams.push(from);
    meetRange += ` AND "start" >= $${meetParams.length}`;
  }
  if (to) {
    meetParams.push(to);
    meetRange += ` AND "start" <= $${meetParams.length}`;
  }
  const { rows: meetCount } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM meetings WHERE archived = false ${profileCond(meetParams)} ${meetRange}`,
    meetParams
  );
  const meetings_total = meetCount[0]?.c ?? 0;

  // Файлы.
  const { rows: fileCount } = await pool.query<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM file_meta"
  );
  const files_total = fileCount[0]?.c ?? 0;

  // per_profile: распределение по профилям из profile_ids задач/заметок/встреч.
  const per_profile: Record<string, ProfileCount> = {};
  const bump = (name: string, kind: keyof ProfileCount): void => {
    const entry = (per_profile[name] ??= { tasks: 0, notes: 0, meetings: 0 });
    entry[kind]++;
  };
  for (const t of taskRows) for (const p of t.profile_ids) bump(p, "tasks");
  const noteParams2: unknown[] = [];
  const { rows: noteRows } = await pool.query<NoteRow>(
    `SELECT profile_ids FROM notes WHERE archived = false ${profileCond(noteParams2)}`,
    noteParams2
  );
  for (const n of noteRows) for (const p of n.profile_ids) bump(p, "notes");
  const meetParams2: unknown[] = [];
  const { rows: meetRows } = await pool.query<MeetingRow>(
    `SELECT profile_ids FROM meetings WHERE archived = false ${profileCond(meetParams2)} ${meetRange}`,
    meetParams2
  );
  for (const m of meetRows) for (const p of m.profile_ids) bump(p, "meetings");

  const analytics: Analytics = {
    tasks_total,
    tasks_by_status,
    tasks_by_priority,
    tasks_overdue,
    tasks_done,
    completion_rate,
    notes_total,
    meetings_total,
    files_total,
    per_profile,
  };
  res.json(analytics);
});
