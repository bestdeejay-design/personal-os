import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb } from "../db.js";
import type { TemplateRow, TemplateInput } from "../types.js";

export const templatesRouter = Router();

templatesRouter.get("/", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { rows } = await pool.query<TemplateRow>(
    "SELECT * FROM templates ORDER BY created_at ASC"
  );
  res.json(rows);
});

templatesRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const body = (req.body ?? {}) as Partial<TemplateInput>;
  if (!body.name) return res.status(400).json({ error: "name required" });
  const id = randomUUID();
  const { rows } = await pool.query<TemplateRow>(
    `INSERT INTO templates (id, name, type, body, default_tags, default_profile_ids)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING *`,
    [
      id,
      body.name,
      body.type ?? "note",
      body.body ?? "",
      jb(body.default_tags ?? []),
      jb(body.default_profile_ids ?? []),
    ]
  );
  res.status(201).json(rows[0]);
});

templatesRouter.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const id = req.params.id;
  const { rowCount } = await pool.query("DELETE FROM templates WHERE id = $1", [id]);
  if (!rowCount || rowCount === 0) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});
