import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb, parseProfileParam } from "../db.js";
import { storeEmbedding } from "../search.js";
import { toIcs } from "../ics.js";
import type { MeetingRow, MeetingInput } from "../types.js";

export const calendarRouter = Router();

calendarRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  try {
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  const profiles = parseProfileParam(req.query.profile);
  const conds: string[] = [];
  const params: unknown[] = [];
  // Семантика ?archived=: 'only' — только архивные, 'all' — все, иначе
  // (по умолчанию) исключаем архивные. Идентично notes/tasks.
  if (req.query.archived === "only") conds.push("archived = true");
  else if (req.query.archived !== "all") conds.push("archived = false");
  if (from) {
    params.push(from);
    conds.push(`"start" >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(to);
    conds.push(`"start" <= $${params.length}::timestamptz`);
  }
  if (profiles.length > 0) {
    params.push(profiles);
    conds.push(`profile_ids ?| $${params.length}::text[]`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query<MeetingRow>(
    `SELECT * FROM meetings ${where} ORDER BY "start" ASC`,
    params
  );
  res.json(rows);
  } catch (err) {
    console.error("[calendar] GET failed:", err);
    res.status(500).json({ error: "calendar query failed" });
  }
});

calendarRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const body = (req.body ?? {}) as Partial<MeetingInput>;
  if (!body.title || !body.start || !body.end) {
    return res.status(400).json({ error: "title, start and end required" });
  }
  const id = randomUUID();
  const { rows } = await pool.query<MeetingRow>(
     `INSERT INTO meetings (id, title, "start", "end", all_day, profile_ids, linked_project_id, notes_md, location, recurrence)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb) RETURNING *`,
    [
      id,
      body.title,
      body.start,
      body.end,
      body.all_day ?? false,
      jb(body.profile_ids),
      body.linked_project_id ?? null,
      body.notes_md ?? "",
      body.location ?? "",
      body.recurrence === undefined || body.recurrence === null ? null : jb(body.recurrence),
    ]
  );
  const meeting = rows[0];
  await storeEmbedding("meeting", id, `${meeting.title}\n${meeting.notes_md ?? ""}`);
  res.status(201).json(meeting);
});

calendarRouter.get("/:id/ics", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { rows } = await pool.query<MeetingRow>(
    "SELECT * FROM meetings WHERE id = $1",
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  const m = rows[0];
  const ics = toIcs({
    uid: m.id,
    start: m.start,
    end: m.end,
    summary: m.title,
    description: m.notes_md,
  });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${m.id}.ics"`);
  res.send(ics);
});

calendarRouter.patch("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const id = req.params.id;
  const body = (req.body ?? {}) as Partial<MeetingInput>;
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown): void => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (body.title !== undefined) add("title", body.title);
  if (body.start !== undefined) add('"start"', body.start);
  if (body.end !== undefined) add('"end"', body.end);
  if (body.all_day !== undefined) add("all_day", body.all_day);
  if (body.linked_project_id !== undefined) add("linked_project_id", body.linked_project_id);
  if (body.notes_md !== undefined) add("notes_md", body.notes_md);
  if (body.location !== undefined) add("location", body.location);
  if (body.profile_ids !== undefined) {
    params.push(jb(body.profile_ids));
    sets.push(`profile_ids = $${params.length}::jsonb`);
  }
  if (body.recurrence !== undefined) {
    params.push(body.recurrence === null ? null : jb(body.recurrence));
    sets.push(`recurrence = $${params.length}::jsonb`);
  }
  if (body.archived !== undefined) add("archived", body.archived);
  if (sets.length === 0) return res.status(400).json({ error: "no fields to update" });
  params.push(id);
  const { rows } = await pool.query<MeetingRow>(
    `UPDATE meetings SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  const meeting = rows[0];
  if (body.title !== undefined || body.notes_md !== undefined) {
    await storeEmbedding("meeting", id, `${meeting.title}\n${meeting.notes_md ?? ""}`);
  }
  res.json(meeting);
});

calendarRouter.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const id = req.params.id;
  const { rowCount } = await pool.query("DELETE FROM meetings WHERE id = $1", [id]);
  if (!rowCount || rowCount === 0) return res.status(404).json({ error: "not found" });
  await pool
    .query("DELETE FROM embeddings WHERE entity_type = 'meeting' AND entity_id = $1", [id])
    .catch(() => {
      // эмбеддинг мог отсутствовать
    });
  res.status(204).end();
});
