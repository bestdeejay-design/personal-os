import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb, parseProfileParam } from "../db.js";
import { storeEmbedding } from "../search.js";
import { toIcs } from "../ics.js";
import type { MeetingRow, MeetingInput } from "../types.js";

export const calendarRouter = Router();

calendarRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  const profiles = parseProfileParam(req.query.profile);
  const conds: string[] = [];
  const params: unknown[] = [];
  if (from) {
    params.push(from);
    conds.push(`"start" >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conds.push(`"start" <= $${params.length}`);
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
