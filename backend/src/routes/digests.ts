import { Router } from "express";
import { pool, isDbReady, parseProfileParam, buildProfileFilter } from "../db.js";
import type { MeetingRow, TaskRow, ReminderRow, TodayData } from "../types.js";

export const digestsRouter = Router();

function dayRange(offsetDays: number): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

/** Данные для дайджеста «Сегодня»: встречи, задачи (today/overdue), напоминания. */
export async function getTodayData(): Promise<TodayData> {
  const { start, end } = dayRange(0);
  const { rows: meetings } = await pool.query<MeetingRow>(
    "SELECT * FROM meetings WHERE \"start\" >= $1 AND \"start\" < $2 ORDER BY \"start\" ASC",
    [start, end]
  );
  const { rows: tasks } = await pool.query<TaskRow>(
    "SELECT * FROM tasks WHERE (due_date >= $1 AND due_date < $2) OR (due_date < $1 AND status <> 'done') ORDER BY due_date ASC",
    [start, end]
  );
  const { rows: reminders } = await pool.query<ReminderRow>(
    "SELECT * FROM reminders WHERE fired = false AND fire_at >= $1 AND fire_at < $2 ORDER BY fire_at ASC",
    [start, end]
  );
  return { meetings, tasks, reminders };
}

digestsRouter.get("/today", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const data = await getTodayData();
  res.json(data);
});

digestsRouter.get("/week", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const profiles = parseProfileParam(req.query.profile);
  const days: Array<{ date: string; meetings: MeetingRow[]; tasks: TaskRow[] }> = [];
  for (let i = 0; i < 7; i++) {
    const { start, end } = dayRange(i);
    const mParams: unknown[] = [start, end];
    let mCond = "\"start\" >= $1 AND \"start\" < $2";
    if (profiles.length > 0) {
      const { clause, filteredProfiles } = buildProfileFilter(profiles, mParams.length + 1);
      if (clause) {
        if (filteredProfiles.length > 0) mParams.push(filteredProfiles);
        mCond += ` AND ${clause}`;
      }
    }
    const { rows: meetings } = await pool.query<MeetingRow>(
      `SELECT * FROM meetings WHERE ${mCond} ORDER BY \"start\" ASC`,
      mParams
    );
    const tParams: unknown[] = [start, end];
    let tCond = "due_date >= $1 AND due_date < $2";
    if (profiles.length > 0) {
      const { clause, filteredProfiles } = buildProfileFilter(profiles, tParams.length + 1);
      if (clause) {
        if (filteredProfiles.length > 0) tParams.push(filteredProfiles);
        tCond += ` AND ${clause}`;
      }
    }
    const { rows: tasks } = await pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE ${tCond} ORDER BY due_date ASC`,
      tParams
    );
    days.push({ date: start.toISOString().slice(0, 10), meetings, tasks });
  }
  res.json({ days });
});
