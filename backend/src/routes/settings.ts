import { Router } from "express";
import { pool, isDbReady, jb } from "../db.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { rows } = await pool.query<{ key: string; value: unknown }>(
    "SELECT key, value FROM settings ORDER BY key ASC"
  );
  res.json(rows);
});

settingsRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { key, value } = (req.body ?? {}) as { key?: string; value?: unknown };
  if (!key) return res.status(400).json({ error: "key required" });
  const { rows } = await pool.query(
    "INSERT INTO settings (key, value) VALUES ($1,$2::jsonb) " +
      "ON CONFLICT (key) DO UPDATE SET value = $2::jsonb RETURNING *",
    [key, jb(value)]
  );
  res.status(201).json(rows[0]);
});
