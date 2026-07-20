import { Router } from "express";
import { pool, isDbReady, parseProfileParam } from "../db.js";
import type { MeetingRow, TaskRow, NoteRow, TimelineItem } from "../types.js";

export const timelineRouter = Router();

interface RecurrenceSpec {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  until?: string | null;
}

const VALID_FREQ: ReadonlyArray<RecurrenceSpec["freq"]> = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

/** Сдвигает метку времени вперёд на interval шагов заданной частоты. */
function stepMs(ms: number, freq: RecurrenceSpec["freq"], interval: number): number {
  const d = new Date(ms);
  switch (freq) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + interval);
      break;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7 * interval);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + interval);
      break;
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + interval);
      break;
  }
  return d.getTime();
}

/**
 * Генерирует повторяющиеся вхождения базового элемента вперёд от start до
 * границы окна `to` или `until`. Каждое вхождение получает id `${base.id}:${n}`
 * и собственные start/end, сдвинутые на тот же дельта. Максимум 100 штук.
 */
function expandOccurrences(
  base: TimelineItem,
  recurrence: RecurrenceSpec,
  toMs: number
): TimelineItem[] {
  if (!VALID_FREQ.includes(recurrence.freq)) return [];
  const interval = Math.max(1, Math.floor(recurrence.interval ?? 1));
  const untilMs = recurrence.until ? new Date(recurrence.until).getTime() : Infinity;
  const baseStart = new Date(base.start).getTime();
  const baseEnd = base.end !== undefined ? new Date(base.end).getTime() : undefined;
  const out: TimelineItem[] = [];
  let curStart = baseStart;
  let n = 1;
  while (n <= 100) {
    const nextStart = stepMs(curStart, recurrence.freq, interval);
    if (nextStart > toMs) break;
    if (nextStart > untilMs) break;
    const delta = nextStart - baseStart;
    const nextEnd =
      baseEnd !== undefined ? new Date(baseEnd + delta).toISOString() : undefined;
    out.push({
      id: `${base.id}:${n}`,
      type: base.type,
      title: base.title,
      start: new Date(nextStart).toISOString(),
      end: nextEnd,
      profile_ids: base.profile_ids,
      done: base.done,
      ref_id: base.id,
    });
    curStart = nextStart;
    n++;
  }
  return out;
}

/** Попадает ли вхождение в окно [from, to] с учётом типа. */
function inWindow(item: TimelineItem, fromMs: number, toMs: number): boolean {
  const start = new Date(item.start).getTime();
  if (item.type === "meeting") {
    const end = item.end ? new Date(item.end).getTime() : start;
    return start < toMs && end > fromMs;
  }
  return start >= fromMs && start <= toMs;
}

timelineRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const now = Date.now();
  const fromMs = req.query.from ? new Date(req.query.from as string).getTime() : now - 30 * 86400000;
  const toMs = req.query.to ? new Date(req.query.to as string).getTime() : now + 30 * 86400000;
  const profiles = parseProfileParam(req.query.profile);

  const profileCond = (params: unknown[]): string => {
    params.push(profiles);
    return `profile_ids ?| $${params.length}::text[]`;
  };

  try {
  // Встречи: в окне ИЛИ повторяющиеся (могут породить вхождения в окне).
  // Каждый запрос использует СОБСТВЕННЫЙ массив params, иначе неиспользуемые
  // префиксные параметры ($1,$2 от предыдущего запроса) вызывают 42P18.
  const mParams: unknown[] = [];
  const meetingConds = ["archived = false", `"start" < $${mParams.length + 1}::timestamptz`];
  mParams.push(new Date(toMs).toISOString());
  meetingConds.push(`("end" > $${mParams.length + 1}::timestamptz OR recurrence IS NOT NULL)`);
  mParams.push(new Date(fromMs).toISOString());
  if (profiles.length > 0) meetingConds.push(profileCond(mParams));
  const { rows: meetingRows } = await pool.query<MeetingRow>(
    `SELECT * FROM meetings WHERE ${meetingConds.join(" AND ")}`,
    mParams
  );

  // Задачи: due_date в окне ИЛИ повторяющиеся с due_date <= to.
  const tParams: unknown[] = [];
  const taskConds = [
    "archived = false",
    "due_date <= $" + (tParams.length + 1) + "::timestamptz",
  ];
  tParams.push(new Date(toMs).toISOString());
  taskConds.push("(due_date >= $" + (tParams.length + 1) + "::timestamptz OR recurrence IS NOT NULL)");
  tParams.push(new Date(fromMs).toISOString());
  if (profiles.length > 0) taskConds.push(profileCond(tParams));
  const { rows: taskRows } = await pool.query<TaskRow>(
    `SELECT * FROM tasks WHERE ${taskConds.join(" AND ")}`,
    tParams
  );

  // Заметки: updated_at в окне.
  const nParams: unknown[] = [];
  const noteConds = [
    "archived = false",
    "updated_at >= $" + (nParams.length + 1) + "::timestamptz",
    "updated_at <= $" + (nParams.length + 2) + "::timestamptz",
  ];
  nParams.push(new Date(fromMs).toISOString());
  nParams.push(new Date(toMs).toISOString());
  if (profiles.length > 0) noteConds.push(profileCond(nParams));
  const { rows: noteRows } = await pool.query<NoteRow>(
    `SELECT * FROM notes WHERE ${noteConds.join(" AND ")}`,
    nParams
  );

  const candidates: TimelineItem[] = [];

  for (const m of meetingRows) {
    const base: TimelineItem = {
      id: m.id,
      type: "meeting",
      title: m.title,
      start: m.start.toISOString(),
      end: m.end.toISOString(),
      profile_ids: m.profile_ids,
    };
    candidates.push(base);
    if (m.recurrence && typeof m.recurrence === "object") {
      candidates.push(...expandOccurrences(base, m.recurrence as RecurrenceSpec, toMs));
    }
  }

  for (const t of taskRows) {
    if (!t.due_date) continue;
    const base: TimelineItem = {
      id: t.id,
      type: "task",
      title: t.title,
      start: t.due_date.toISOString(),
      profile_ids: t.profile_ids,
      done: t.status === "done",
    };
    candidates.push(base);
    if (t.recurrence && typeof t.recurrence === "object") {
      candidates.push(...expandOccurrences(base, t.recurrence as RecurrenceSpec, toMs));
    }
  }

  for (const n of noteRows) {
    candidates.push({
      id: n.id,
      type: "note",
      title: n.title,
      start: n.updated_at.toISOString(),
      profile_ids: n.profile_ids,
    });
  }

  const items = candidates
    .filter((c) => inWindow(c, fromMs, toMs))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  res.json(items);
  } catch (err) {
    console.error("[timeline] failed:", err);
    res.status(500).json({ error: "timeline query failed" });
  }
});
