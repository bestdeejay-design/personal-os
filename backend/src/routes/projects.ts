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
