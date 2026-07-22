import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb } from "../db.js";
import type { ProjectRow, ProjectInput } from "../types.js";

export const projectsRouter = Router();

projectsRouter.get("/", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { rows } = await pool.query<ProjectRow>(
    "SELECT * FROM projects ORDER BY created_at DESC"
  );
  res.json(rows);
});

projectsRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const body = (req.body ?? {}) as Partial<ProjectInput>;
  if (!body.name) return res.status(400).json({ error: "name required" });
  const id = randomUUID();
  const { rows } = await pool.query<ProjectRow>(
    `INSERT INTO projects (id, name, desc_md, profile_ids, status, goal)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
    [id, body.name, body.desc_md ?? "", jb(body.profile_ids), body.status ?? null, body.goal ?? null]
  );
  res.status(201).json(rows[0]);
});

projectsRouter.patch("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const body = (req.body ?? {}) as Partial<ProjectInput>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (body.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(body.name); }
  if (body.desc_md !== undefined) { sets.push(`desc_md = $${idx++}`); vals.push(body.desc_md); }
  if (body.profile_ids !== undefined) { sets.push(`profile_ids = $${idx++}::jsonb`); vals.push(jb(body.profile_ids)); }
  if (body.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(body.status); }
  if (body.goal !== undefined) { sets.push(`goal = $${idx++}`); vals.push(body.goal); }

  if (sets.length === 0) return res.status(400).json({ error: "no fields to update" });

  vals.push(id);
  const { rows } = await pool.query<ProjectRow>(
    `UPDATE projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    vals
  );
  if (rows.length === 0) return res.status(404).json({ error: "project not found" });
  res.json(rows[0]);
});

projectsRouter.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  await pool.query("UPDATE notes SET linked_project_id = NULL WHERE linked_project_id = $1", [id]);
  await pool.query("UPDATE tasks SET project_id = NULL WHERE project_id = $1", [id]);
  await pool.query("UPDATE meetings SET linked_project_id = NULL WHERE linked_project_id = $1", [id]);
  await pool.query("UPDATE file_meta SET owner_type = NULL, owner_id = NULL WHERE owner_type = 'project' AND owner_id = $1", [id]);
  const { rowCount } = await pool.query("DELETE FROM projects WHERE id = $1", [id]);
  if (!rowCount || rowCount === 0) return res.status(404).json({ error: "project not found" });
  res.json({ ok: true });
});

projectsRouter.get("/:id/items", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;

  const [notes, tasks, meetings, files] = await Promise.all([
    pool.query("SELECT * FROM notes WHERE linked_project_id = $1 ORDER BY updated_at DESC", [id]),
    pool.query("SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC", [id]),
    pool.query("SELECT * FROM meetings WHERE linked_project_id = $1 ORDER BY start DESC", [id]),
    pool.query("SELECT * FROM file_meta WHERE owner_type = 'project' AND owner_id = $1 ORDER BY uploaded_at DESC", [id]),
  ]);

  res.json({
    notes: notes.rows,
    tasks: tasks.rows,
    meetings: meetings.rows,
    files: files.rows,
  });
});
