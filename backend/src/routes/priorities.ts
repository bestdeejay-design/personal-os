import { Router } from "express";
import { pool, isDbReady, parseProfileParam, buildProfileFilter } from "../db.js";
import type { TaskRow } from "../types.js";

export const prioritiesRouter = Router();

prioritiesRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const profiles = parseProfileParam(req.query.profile);
  const conds: string[] = [];
  const params: unknown[] = [];
  // Семантика ?archived=: 'only' — только архивные, 'all' — все, иначе
  // (по умолчанию) исключаем архивные. Идентично notes/tasks/calendar.
  if (req.query.archived === "only") conds.push("archived = true");
  else if (req.query.archived !== "all") conds.push("archived = false");
  if (profiles.length > 0) {
    const { clause, filteredProfiles } = buildProfileFilter(profiles, params.length + 1);
    if (clause) {
      if (filteredProfiles.length > 0) params.push(filteredProfiles);
      conds.push(clause);
    }
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query<TaskRow>(
    `SELECT * FROM tasks ${where} ORDER BY rank ASC, weight DESC, created_at DESC`,
    params
  );
  res.json(rows);
});

prioritiesRouter.put("/order", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const orderedIds = (req.body?.orderedIds ?? []) as unknown;
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.length === 0 ||
    !orderedIds.every((v) => typeof v === "string" && v.length > 0)
  ) {
    return res.status(400).json({ error: "orderedIds must be a non-empty array of strings" });
  }
  const ids = orderedIds as string[];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < ids.length; i++) {
      await client.query("UPDATE tasks SET rank = $1 WHERE id = $2", [i + 1, ids[i]]);
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
