import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb, parseProfileParam, buildProfileFilter } from "../db.js";
import { storeEmbedding } from "../search.js";
import type { TaskRow, TaskInput } from "../types.js";

export const tasksRouter = Router();

tasksRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const project = typeof req.query.project === "string" ? req.query.project : "";
  const profiles = parseProfileParam(req.query.profile);
  const conds: string[] = [];
  const params: unknown[] = [];
  // Семантика ?archived=: 'only' — только архивные, 'all' — все, иначе (по
  // умолчанию) исключаем архивные.
  if (req.query.archived === "only") conds.push("archived = true");
  else if (req.query.archived !== "all") conds.push("archived = false");
  if (status) {
    params.push(status);
    conds.push(`status = $${params.length}`);
  }
  if (project) {
    params.push(project);
    conds.push(`project_id = $${params.length}`);
  }
  if (profiles.length > 0) {
    const { clause, filteredProfiles } = buildProfileFilter(profiles, params.length + 1);
    if (clause) {
      if (filteredProfiles.length > 0) params.push(filteredProfiles);
      conds.push(clause);
    }
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
    `INSERT INTO tasks (id, title, desc_md, status, priority, weight, rank, assignee, due_date, recurrence, project_id, profile_ids, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb) RETURNING *`,
    [
      id,
      body.title,
      body.desc_md ?? "",
      body.status ?? "backlog",
      body.priority ?? "medium",
      body.weight ?? 0,
      body.rank ?? 0,
      body.assignee ?? null,
      body.due_date || null,
      body.recurrence === undefined || body.recurrence === null ? null : jb(body.recurrence),
      body.project_id ?? null,
      jb(body.profile_ids),
      jb(body.tags ?? []),
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
  if (body.rank !== undefined) add("rank", body.rank);
  if (body.assignee !== undefined) add("assignee", body.assignee);
  if (body.archived !== undefined) add("archived", body.archived);
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
  if (body.tags !== undefined) {
    params.push(jb(body.tags));
    sets.push(`tags = $${params.length}::jsonb`);
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

  // A3: recurring task auto-creation — если статус стал "done" и есть recurrence
  const newStatus = body.status !== undefined ? body.status : task.status;
  const recur = body.recurrence !== undefined ? body.recurrence : task.recurrence;
  if (newStatus === "done" && recur && typeof recur === "object" && !Array.isArray(recur)) {
    const r = recur as { freq: string; interval?: number; until?: string | null };
    const oldDue = body.due_date !== undefined ? body.due_date : task.due_date;
    const baseDate = oldDue ? new Date(oldDue) : new Date();
    const interval = r.interval ?? 1;
    let nextDue: Date;
    switch (r.freq) {
      case "daily":
        nextDue = new Date(baseDate.getTime() + interval * 86_400_000);
        break;
      case "weekly":
        nextDue = new Date(baseDate.getTime() + interval * 7 * 86_400_000);
        break;
      case "monthly": {
        nextDue = new Date(baseDate);
        nextDue.setMonth(nextDue.getMonth() + interval);
        break;
      }
      case "yearly": {
        nextDue = new Date(baseDate);
        nextDue.setFullYear(nextDue.getFullYear() + interval);
        break;
      }
      default:
        nextDue = null as unknown as Date;
    }
    if (nextDue && (!r.until || nextDue.toISOString() < r.until)) {
      const newId = randomUUID();
      const { rows: newRows } = await pool.query<TaskRow>(
        `INSERT INTO tasks (id, title, desc_md, status, priority, weight, rank, assignee, due_date, recurrence, project_id, profile_ids, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb) RETURNING *`,
        [
          newId,
          task.title,
          task.desc_md ?? "",
          "backlog",
          task.priority,
          task.weight,
          task.rank,
          task.assignee,
          nextDue.toISOString().slice(0, 10),
          jb(recur),
          task.project_id,
          jb(task.profile_ids),
          jb(task.tags ?? []),
        ]
      );
      const newTask = newRows[0];
      await storeEmbedding("task", newId, `${newTask.title}\n${newTask.desc_md ?? ""}`);
    }
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
