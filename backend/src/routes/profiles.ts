import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb } from "../db.js";
import { storeEmbedding } from "../search.js";
import type { ProfileRow, NoteInput } from "../types.js";

export const profilesRouter = Router();

profilesRouter.get("/", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { rows } = await pool.query<ProfileRow>(
    "SELECT id, name, color, is_default FROM profiles ORDER BY name ASC"
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      is_default: r.is_default,
    }))
  );
});

profilesRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const body = (req.body ?? {}) as { name?: string; color?: string };
  if (!body.name || !body.color) {
    return res.status(400).json({ error: "name and color required" });
  }
  const id = randomUUID();
  const { rows } = await pool.query<ProfileRow>(
    "INSERT INTO profiles (id, name, color, is_default) VALUES ($1,$2,$3,false) RETURNING id, name, color, is_default",
    [id, body.name, body.color]
  );
  res.status(201).json(rows[0]);
});
