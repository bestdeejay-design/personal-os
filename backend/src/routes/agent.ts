import { Router } from "express";
import { pool, isDbReady, jb } from "../db.js";
import type { AgentMessageRow } from "../types.js";

export const agentRouter = Router();

/* GET /api/agent/inbox?profile=Work — неразрешённые сообщения агента */
agentRouter.get("/inbox", async (req, res) => {
  if (!isDbReady()) {
    return res.status(503).json({ error: "database unavailable" });
  }
  const profile = typeof req.query.profile === "string" ? req.query.profile : "";
  const params: unknown[] = [];
  const conds: string[] = ["resolved = false"];
  if (profile) {
    params.push(jb([profile]));
    conds.push(`profile_ids @> $${params.length}::jsonb`);
  }
  const { rows } = await pool.query<AgentMessageRow>(
    `SELECT * FROM agent_messages WHERE ${conds.join(" AND ")} ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

/* POST /api/agent/respond — ответить / принять / отклонить сообщение */
agentRouter.post("/respond", async (req, res) => {
  if (!isDbReady()) {
    return res.status(503).json({ error: "database unavailable" });
  }
  const { id, action, text } = (req.body ?? {}) as {
    id?: string;
    action?: string;
    text?: string;
  };
  if (!id || !action || !["accept", "reject", "reply"].includes(action)) {
    return res.status(400).json({ error: "id and action (accept|reject|reply) required" });
  }
  const response = action === "reply" ? (text ?? "") : action;
  const { rowCount } = await pool.query(
    "UPDATE agent_messages SET resolved = true, response = $1 WHERE id = $2 AND resolved = false",
    [response, id]
  );
  if (!rowCount || rowCount === 0) {
    return res.status(404).json({ error: "message not found or already resolved" });
  }
  res.json({ ok: true });
});

/* POST /api/agent/dismiss-all — закрыть все неразрешённые */
agentRouter.post("/dismiss-all", async (_req, res) => {
  if (!isDbReady()) {
    return res.status(503).json({ error: "database unavailable" });
  }
  await pool.query(
    "UPDATE agent_messages SET resolved = true, response = 'dismissed' WHERE resolved = false"
  );
  res.json({ ok: true });
});
