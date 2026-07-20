import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb, parseProfileParam } from "../db.js";
import { storeEmbedding } from "../search.js";
import type { TaskRow, TaskInput } from "../types.js";

export const tasksRouter = Router();

tasksRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const project = typeof req.query.project === "string" ? req.query.project : "";
  const profiles = parseProfileParam(req.query.profile);
  const conds: string[] = ["archived = false"];
  const params: unknown[] = [];
  if (status) {
    params.push(status);
    conds.push(`status = $${params.length}`);
  }
  if (project) {
    params.push(project);
    conds.push(`project_id = $${params.length}`);
  }
  if (profiles.length > 0) {
    params.push(profiles);
    conds.push(`profile_ids ?| $${params.length}::text[]`);
  }
  const { rows } = await pool.query<TaskRow>(
    `SELECT * FROM tasks WHERE ${conds.join(" AND ")} ORDER BY weight DESC, created_at DESC`,
    params
  );
  res.json(rows);
});

tasksRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const body = (req.body ?? {}) as Partial<TaskInput>;
  if (!body.title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const { rows } = await pool.query<TaskRow>(
    `INSERT INTO tasks (id, title, desc_md, status, priority, weight, assignee, due_date, recurrence, project_id, profile_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb) RETURNING *`,
    [
      id,
      body.title,
      body.desc_md ?? "",
      body.status ?? "backlog",
      body.priority ?? "medium",
      body.weight ?? 0,
      body.assignee ?? null,
      body.due_date || null,
      body.recurrence === undefined || body.recurrence === null ? null : jb(body.recurrence),
      body.project_id ?? null,
      jb(body.profile_ids),
    ]
  );
  const task = rows[0];
  await storeEmbedding("task", id, `${task.title}\n${task.desc_md ?? ""}`);
  res.status(201).json(task);
});

tasksRouter.patch("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const id = req.params.id;
  const body = (req.body ?? {}) as Partial<TaskInput>;
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown): void => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (body.title !== undefined) add("title", body.title);
  if (body.desc_md !== undefined) add("desc_md", body.desc_md);
  if (body.status !== undefined) add("status", body.status);
  if (body.priority !== undefined) add("priority", body.priority);
  if (body.weight !== undefined) add("weight", body.weight);
  if (body.assignee !== undefined) add("assignee", body.assignee);
  if (body.due_date !== undefined) add("due_date", body.due_date || null);
  if (body.recurrence !== undefined) {
    params.push(body.recurrence === null ? null : jb(body.recurrence));
    sets.push(`recurrence = $${params.length}::jsonb`);
  }
  if (body.project_id !== undefined) add("project_id", body.project_id);
  if (body.profile_ids !== undefined) {
    params.push(jb(body.profile_ids));
    sets.push(`profile_ids = $${params.length}::jsonb`);
  }
  if (sets.length === 0) return res.status(400).json({ error: "no fields to update" });
  params.push(id);
  const { rows } = await pool.query<TaskRow>(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  const task = rows[0];
  if (body.title !== undefined || body.desc_md !== undefined) {
    await storeEmbedding("task", id, `${task.title}\n${task.desc_md ?? ""}`);
  }
  res.json(task);
});

tasksRouter.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const id = req.params.id;
  const { rowCount } = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
  if (!rowCount || rowCount === 0) return res.status(404).json({ error: "not found" });
  await pool
    .query("DELETE FROM embeddings WHERE entity_type = 'task' AND entity_id = $1", [id])
    .catch(() => {
      // эмбеддинг мог отсутствовать
    });
  res.status(204).end();
});
