import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb } from "../db.js";
import { storeEmbedding } from "../search.js";
import type { ProfileRow, NoteInput } from "../types.js";

export const profilesRouter = Router();

profilesRouter.get("/", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { rows } = await pool.query<ProfileRow>(
    "SELECT id, name, color, is_default, hidden FROM profiles ORDER BY name ASC"
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      is_default: r.is_default,
      hidden: r.hidden,
    }))
  );
});

profilesRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const body = (req.body ?? {}) as { name?: string; color?: string; hidden?: boolean };
  if (!body.name || !body.color) {
    return res.status(400).json({ error: "name and color required" });
  }
  const id = randomUUID();
  const { rows } = await pool.query<ProfileRow>(
    "INSERT INTO profiles (id, name, color, hidden) VALUES ($1,$2,$3,$4) RETURNING id, name, color, is_default, hidden",
    [id, body.name, body.color, body.hidden ?? false]
  );
  res.status(201).json(rows[0]);
});

profilesRouter.patch("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const body = (req.body ?? {}) as { name?: string; color?: string; hidden?: boolean };
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (body.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(body.name); }
  if (body.color !== undefined) { sets.push(`color = $${idx++}`); vals.push(body.color); }
  if (body.hidden !== undefined) { sets.push(`hidden = $${idx++}`); vals.push(body.hidden); }

  if (sets.length === 0) return res.status(400).json({ error: "no fields to update" });
  vals.push(id);
  const { rows } = await pool.query<ProfileRow>(
    `UPDATE profiles SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id, name, color, is_default, hidden`,
    vals
  );
  if (rows.length === 0) return res.status(404).json({ error: "profile not found" });
  res.json(rows[0]);
});

profilesRouter.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const { rowCount } = await pool.query("DELETE FROM profiles WHERE id = $1", [id]);
  if (!rowCount || rowCount === 0) return res.status(404).json({ error: "profile not found" });
  res.json({ ok: true });
});
