import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb } from "../db.js";
import { embedText } from "../rag.js";
import { semanticRank, storeEmbedding } from "../search.js";
import type { NoteRow, NoteInput } from "../types.js";

export const notesRouter = Router();

notesRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const profile = typeof req.query.profile === "string" ? req.query.profile : "";
  const q = typeof req.query.q === "string" ? req.query.q : "";

  if (q) {
    // Семантический поиск (если Ollama доступна и есть эмбеддинги).
    try {
      const qvec = await embedText(q);
      const ranked = await semanticRank("note", qvec, 10);
      if (ranked.length > 0) {
        const ids = ranked.map((r) => r.id);
        const params: unknown[] = [ids];
        let sql =
          "SELECT * FROM notes WHERE id = ANY($1::uuid[]) AND archived = false";
        if (profile) {
          params.push(jb([profile]));
          sql += " AND profile_ids @> $2::jsonb";
        }
        const { rows } = await pool.query<NoteRow>(sql, params);
        const order = new Map(ids.map((id, i) => [id, i] as const));
        const sorted = rows.sort(
          (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
        );
        return res.json(sorted);
      }
    } catch {
      // Ollama недоступна — переходим к ILIKE-фолбэку
    }
    // ILIKE-фолбэк.
    const params: unknown[] = [`%${q}%`];
    let sql =
      "SELECT * FROM notes WHERE archived = false AND (title ILIKE $1 OR body_md ILIKE $1)";
    if (profile) {
      params.push(jb([profile]));
      sql += " AND profile_ids @> $2::jsonb";
    }
    sql += " ORDER BY updated_at DESC";
    const { rows } = await pool.query<NoteRow>(sql, params);
    return res.json(rows);
  }

  // Без q — фильтр по профилю.
  const params: unknown[] = [];
  const conds: string[] = ["archived = false"];
  if (profile) {
    params.push(jb([profile]));
    conds.push(`profile_ids @> $${params.length}::jsonb`);
  }
  const { rows } = await pool.query<NoteRow>(
    `SELECT * FROM notes WHERE ${conds.join(" AND ")} ORDER BY updated_at DESC`,
    params
  );
  res.json(rows);
});

notesRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const body = (req.body ?? {}) as Partial<NoteInput>;
  if (!body.title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const { rows } = await pool.query<NoteRow>(
    `INSERT INTO notes (id, title, body_md, profile_ids, tags, linked_meeting_id, linked_project_id, linked_task_id)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) RETURNING *`,
    [
      id,
      body.title,
      body.body_md ?? "",
      jb(body.profile_ids),
      jb(body.tags),
      body.linked_meeting_id ?? null,
      body.linked_project_id ?? null,
      body.linked_task_id ?? null,
    ]
  );
  const note = rows[0];
  await storeEmbedding("note", id, `${note.title}\n${note.body_md ?? ""}`);
  res.status(201).json(note);
});

notesRouter.patch("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const id = req.params.id;
  const body = (req.body ?? {}) as Partial<NoteInput>;
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown): void => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (body.title !== undefined) add("title", body.title);
  if (body.body_md !== undefined) add("body_md", body.body_md);
  if (body.profile_ids !== undefined) {
    params.push(jb(body.profile_ids));
    sets.push(`profile_ids = $${params.length}::jsonb`);
  }
  if (body.tags !== undefined) {
    params.push(jb(body.tags));
    sets.push(`tags = $${params.length}::jsonb`);
  }
  if (body.linked_meeting_id !== undefined) add("linked_meeting_id", body.linked_meeting_id);
  if (body.linked_project_id !== undefined) add("linked_project_id", body.linked_project_id);
  if (body.linked_task_id !== undefined) add("linked_task_id", body.linked_task_id);
  if (body.archived !== undefined) add("archived", body.archived);
  if (sets.length === 0) return res.status(400).json({ error: "no fields to update" });
  sets.push("updated_at = now()");
  params.push(id);
  const { rows } = await pool.query<NoteRow>(
    `UPDATE notes SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  const note = rows[0];
  if (body.title !== undefined || body.body_md !== undefined) {
    await storeEmbedding("note", id, `${note.title}\n${note.body_md ?? ""}`);
  }
  res.json(note);
});
