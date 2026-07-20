import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, isDbReady, jb } from "../db.js";
import { storeEmbedding } from "../search.js";
import type { ImportResult } from "../types.js";

export const importRouter = Router();

interface ImportBody {
  source?: string;
  content?: string;
  target?: "notes" | "tasks";
  profile_ids?: string[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

importRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  try {
  const body = (req.body ?? {}) as ImportBody;
  if (body.source !== "text" && body.source !== "json") {
    return res.status(400).json({ error: "source must be 'text' or 'json'" });
  }
  if (typeof body.content !== "string") {
    return res.status(400).json({ error: "content (string) required" });
  }
  const profileIds = Array.isArray(body.profile_ids)
    ? body.profile_ids.filter((p): p is string => typeof p === "string")
    : [];

  const result: ImportResult = { notes: 0, tasks: 0, errors: [] };
  const pushError = (msg: string): void => {
    result.errors = result.errors ?? [];
    result.errors.push(msg);
  };

  if (body.source === "text") {
    const lines = body.content.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      try {
        const id = randomUUID();
        await pool.query(
          `INSERT INTO notes (id, title, body_md, profile_ids, tags, linked_meeting_id, linked_project_id, linked_task_id, manual_order)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,(SELECT COALESCE(MAX(manual_order),0)+1 FROM notes))`,
          [id, line, "", jb(profileIds), jb([]), null, null, null]
        );
        await storeEmbedding("note", id, `${line}\n`);
        result.notes++;
      } catch (err) {
        pushError(`note "${line}": ${(err as Error).message}`);
      }
    }
    return res.json(result);
  }

  // source === 'json'
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.content);
  } catch (err) {
    return res.status(400).json({ error: `invalid JSON: ${(err as Error).message}` });
  }
  const elements = Array.isArray(parsed) ? parsed : [parsed];
  for (const el of elements) {
    const rec = asRecord(el);
    if (!rec) {
      pushError(`skipped non-object element`);
      continue;
    }
    const title = str(rec.title);
    if (!title) {
      pushError(`skipped element without title`);
      continue;
    }
    // Задача, если явно target='tasks', type='task', либо есть due_date/status.
    const looksTask =
      body.target === "tasks" ||
      str(rec.type) === "task" ||
      rec.due_date !== undefined ||
      rec.status !== undefined;
    try {
      if (looksTask) {
        const id = randomUUID();
        await pool.query(
          `INSERT INTO tasks (id, title, desc_md, status, priority, weight, assignee, due_date, recurrence, project_id, profile_ids)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)`,
          [
            id,
            title,
            str(rec.desc_md) ?? "",
            str(rec.status) ?? "backlog",
            str(rec.priority) ?? "medium",
            typeof rec.weight === "number" ? rec.weight : 0,
            str(rec.assignee) ?? null,
            str(rec.due_date) ?? null,
            null,
            str(rec.project_id) ?? null,
            jb(profileIds),
          ]
        );
        await storeEmbedding("task", id, `${title}\n${str(rec.desc_md) ?? ""}`);
        result.tasks++;
      } else {
        const id = randomUUID();
        await pool.query(
          `INSERT INTO notes (id, title, body_md, profile_ids, tags, linked_meeting_id, linked_project_id, linked_task_id, manual_order)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,(SELECT COALESCE(MAX(manual_order),0)+1 FROM notes))`,
          [id, title, str(rec.body_md) ?? "", jb(profileIds), jb([]), null, null, null]
        );
        await storeEmbedding("note", id, `${title}\n${str(rec.body_md) ?? ""}`);
        result.notes++;
      }
    } catch (err) {
      pushError(`"${title}": ${(err as Error).message}`);
    }
  }

  res.json(result);
  } catch (err) {
    console.error("[import] failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "import failed" });
  }
});
