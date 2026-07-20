import { Router } from "express";
import { pool, isDbReady, parseProfileParam } from "../db.js";
import type { MeetingRow, TaskRow, TimelineItem, Conflict } from "../types.js";

export const conflictsRouter = Router();

function overlaps(a: MeetingRow, b: MeetingRow): boolean {
  const aStart = a.start.getTime();
  const aEnd = a.end.getTime();
  const bStart = b.start.getTime();
  const bEnd = b.end.getTime();
  return aStart < bEnd && aEnd > bStart;
}

function toTimelineItem(m: MeetingRow): TimelineItem {
  return {
    id: m.id,
    type: "meeting",
    title: m.title,
    start: m.start.toISOString(),
    end: m.end.toISOString(),
    profile_ids: m.profile_ids,
  };
}

function taskToTimelineItem(t: TaskRow): TimelineItem {
  return {
    id: t.id,
    type: "task",
    title: t.title,
    start: (t.due_date as Date).toISOString(),
    profile_ids: t.profile_ids,
    done: t.status === "done",
  };
}

conflictsRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  try {
  const now = Date.now();
  const fromMs = req.query.from
    ? new Date(req.query.from as string).getTime()
    : now - 60 * 86400000;
  const toMs = req.query.to
    ? new Date(req.query.to as string).getTime()
    : now + 365 * 86400000;
  const profiles = parseProfileParam(req.query.profile);

  const params: unknown[] = [];
  const conds: string[] = ["archived = false"];
  if (profiles.length > 0) {
    params.push(profiles);
    conds.push(`profile_ids ?| $${params.length}::text[]`);
  }
  params.push(new Date(fromMs).toISOString());
  conds.push(`"end" >= $${params.length}::timestamptz`);
  params.push(new Date(toMs).toISOString());
  conds.push(`"start" <= $${params.length}::timestamptz`);
  const { rows: meetingRows } = await pool.query<MeetingRow>(
    `SELECT * FROM meetings WHERE ${conds.join(" AND ")}`,
    params
  );

  // Задачи в окне — для привязки к встречам.
  const taskParams: unknown[] = [];
  const taskConds: string[] = ["archived = false", "due_date IS NOT NULL"];
  if (profiles.length > 0) {
    taskParams.push(profiles);
    taskConds.push(`profile_ids ?| $${taskParams.length}::text[]`);
  }
  taskParams.push(new Date(fromMs).toISOString());
  taskConds.push(`due_date >= $${taskParams.length}::timestamptz`);
  taskParams.push(new Date(toMs).toISOString());
  taskConds.push(`due_date <= $${taskParams.length}::timestamptz`);
  const { rows: taskRows } = await pool.query<TaskRow>(
    `SELECT * FROM tasks WHERE ${taskConds.join(" AND ")}`,
    taskParams
  );

  // Объединяем пересекающиеся встречи в транзитивные кластеры (union-find).
  const parent: number[] = meetingRows.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < meetingRows.length; i++) {
    for (let j = i + 1; j < meetingRows.length; j++) {
      if (overlaps(meetingRows[i], meetingRows[j])) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < meetingRows.length; i++) {
    const r = find(i);
    const list = groups.get(r);
    if (list) list.push(i);
    else groups.set(r, [i]);
  }

  const conflicts: Conflict[] = [];
  let clusterIdx = 0;
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const meetings = idxs.map((i) => meetingRows[i]);
    const items: TimelineItem[] = meetings.map(toTimelineItem);

    // Пересечение profile_ids всех встреч кластера.
    let shared = new Set(meetings[0].profile_ids);
    for (let k = 1; k < meetings.length; k++) {
      shared = new Set(meetings[k].profile_ids.filter((p) => shared.has(p)));
    }

    // Задачи, чей due_date строго внутри любой встречи кластера.
    for (const t of taskRows) {
      if (!t.due_date) continue;
      const due = t.due_date.getTime();
      const inside = meetings.some(
        (m) => due > m.start.getTime() && due < m.end.getTime()
      );
      if (inside) items.push(taskToTimelineItem(t));
    }

    conflicts.push({
      id: `cluster-${clusterIdx}`,
      kind: "time",
      reason: "Встречи пересекаются по времени",
      items,
      profiles: [...shared],
    });
    clusterIdx++;
  }

  res.json(conflicts);
  } catch (err) {
    console.error("[conflicts] failed:", err);
    res.status(500).json({ error: "conflicts query failed" });
  }
});
