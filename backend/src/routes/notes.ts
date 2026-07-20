import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb, parseProfileParam } from "../db.js";
import { embedText } from "../rag.js";
import { semanticRank, storeEmbedding } from "../search.js";
import type { NoteRow, NoteInput } from "../types.js";

export const notesRouter = Router();

notesRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const profiles = parseProfileParam(req.query.profile);
  const q = typeof req.query.q === "string" ? req.query.q : "";
  // Семантика ?archived=: 'only' — только архивные, 'all' — все, иначе
  // (по умолчанию) исключаем архивные. Идентично tasks/calendar.
  const archivedCond =
    req.query.archived === "only"
      ? "archived = true"
      : req.query.archived !== "all"
        ? "archived = false"
        : "1=1";

  if (q) {
    // Семантический поиск (если Ollama доступна и есть эмбеддинги).
    try {
      const qvec = await embedText(q);
      const ranked = await semanticRank("note", qvec, 10);
      if (ranked.length > 0) {
        const ids = ranked.map((r) => r.id);
        const params: unknown[] = [ids];
        let sql =
          `SELECT * FROM notes WHERE id = ANY($1::uuid[]) AND ${archivedCond}`;
        if (profiles.length > 0) {
          params.push(profiles);
          sql += " AND profile_ids ?| $2::text[]";
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
      `SELECT * FROM notes WHERE ${archivedCond} AND (title ILIKE $1 OR body_md ILIKE $1)`;
    if (profiles.length > 0) {
      params.push(profiles);
      sql += " AND profile_ids ?| $2::text[]";
    }
    sql += " ORDER BY manual_order ASC, updated_at DESC";
    const { rows } = await pool.query<NoteRow>(sql, params);
    return res.json(rows);
  }

  // Без q — фильтр по профилю.
  const params: unknown[] = [];
  const conds: string[] = [archivedCond];
  if (profiles.length > 0) {
    params.push(profiles);
    conds.push(`profile_ids ?| $${params.length}::text[]`);
  }
  const { rows } = await pool.query<NoteRow>(
    `SELECT * FROM notes WHERE ${conds.join(" AND ")} ORDER BY manual_order ASC, updated_at DESC`,
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
    `INSERT INTO notes (id, title, body_md, profile_ids, tags, linked_meeting_id, linked_project_id, linked_task_id, manual_order)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,(SELECT COALESCE(MAX(manual_order),0)+1 FROM notes)) RETURNING *`,
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
  if (body.manual_order !== undefined) add("manual_order", body.manual_order);
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

notesRouter.put("/order", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const orderedIds = (req.body?.orderedIds ?? []) as string[];
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "orderedIds array required" });
  }
  if (orderedIds.length === 0) return res.json({ ok: true });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query("UPDATE notes SET manual_order = $1 WHERE id = $2", [i + 1, orderedIds[i]]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ ok: true });
});

notesRouter.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const id = req.params.id;
  const { rowCount } = await pool.query("DELETE FROM notes WHERE id = $1", [id]);
  if (!rowCount || rowCount === 0) return res.status(404).json({ error: "not found" });
  await pool
    .query("DELETE FROM embeddings WHERE entity_type = 'note' AND entity_id = $1", [id])
    .catch(() => {
      // эмбеддинг мог отсутствовать
    });
  res.status(204).end();
});
