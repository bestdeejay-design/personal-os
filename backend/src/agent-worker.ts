import { WebSocketServer, WebSocket } from "ws";
import { pool, jb } from "./db.js";
import { generateSuggestion, buildStyleExamples, generateDailyDigestText } from "./agent-generation.js";
import type { AgentMessageRow, MeetingRow, TaskRow, ProjectRow, SuggestedAction } from "./types.js";

interface AgentSettings {
  agent_enabled: boolean;
  agent_dnd_start: string;
  agent_dnd_end: string;
  agent_daily_cap: number;
}

async function readSettings(): Promise<AgentSettings> {
  const defaults: AgentSettings = {
    agent_enabled: true,
    agent_dnd_start: "22:00",
    agent_dnd_end: "08:00",
    agent_daily_cap: 5,
  };
  try {
    const { rows } = await pool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM settings WHERE key LIKE 'agent_%'"
    );
    for (const r of rows) {
      if (r.key === "agent_enabled") defaults.agent_enabled = Boolean(r.value);
      else if (r.key === "agent_dnd_start") defaults.agent_dnd_start = String(r.value);
      else if (r.key === "agent_dnd_end") defaults.agent_dnd_end = String(r.value);
      else if (r.key === "agent_daily_cap") defaults.agent_daily_cap = Number(r.value);
    }
  } catch {
    // настройки пока не записаны — используем умолчания
  }
  return defaults;
}

function isInDnd(now: Date, start: string, end: string): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin > endMin) {
    return nowMin >= startMin || nowMin < endMin;
  }
  return nowMin >= startMin && nowMin < endMin;
}

async function dailyCapReached(cap: number): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { rows } = await pool.query<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM agent_messages WHERE created_at >= $1 AND resolved = false",
    [today]
  );
  return rows[0]?.c >= cap;
}

async function createMessage(
  wss: WebSocketServer,
  triggerType: string,
  title: string,
  body: string,
  actions: SuggestedAction[],
  profile_ids: string[],
  ref_id: string | null
): Promise<void> {
  // DEDUPE: если есть неразрешённое сообщение с таким же trigger_type + ref_id — пропускаем
  if (ref_id) {
    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM agent_messages WHERE trigger_type = $1 AND ref_id = $2 AND resolved = false LIMIT 1",
      [triggerType, ref_id]
    );
    if (existing.rowCount && existing.rowCount > 0) return;
  }

  const { rows } = await pool.query<AgentMessageRow>(
    `INSERT INTO agent_messages (trigger_type, title, body, suggested_actions_json, profile_ids, ref_id)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6) RETURNING *`,
    [triggerType, title, body, jb(actions), jb(profile_ids), ref_id]
  );

  const message = rows[0];
  const payload = JSON.stringify({ type: "agent_message", payload: message });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

async function evaluateTriggers(
  wss: WebSocketServer,
  settings: AgentSettings
): Promise<void> {
  const now = new Date();

  // ── daily digest ──
  if (now.getHours() >= 6) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const already = await pool.query<{ id: string }>(
      "SELECT id FROM agent_runs WHERE run_at >= $1 AND $2 = ANY(triggered) LIMIT 1",
      [todayStart, "daily_digest"]
    );
    if (already.rowCount === 0 || already.rowCount === undefined) {
      try {
        const text = await generateDailyDigestText();
        await createMessage(wss, "daily_digest", "Утренний дайджест", text, [], [], null);
        await pool.query(
          "INSERT INTO agent_runs (triggered, messages_created) VALUES ($1, 1)",
          [["daily_digest"]]
        );
      } catch (err) {
        console.error("[agent] daily digest failed:", (err as Error).message);
      }
    }
  }

  // ── a) meeting_ended ──
  try {
    const { rows: meetings } = await pool.query<MeetingRow>(
      `SELECT * FROM meetings
       WHERE "end" < now()
         AND id NOT IN (SELECT linked_meeting_id FROM notes WHERE linked_meeting_id IS NOT NULL)
         AND title <> ''
         AND linked_project_id IS NOT NULL`
    );
    if (meetings.length > 0) {
      const style = await buildStyleExamples("встреча обсуждение итоги");
      for (const m of meetings) {
        const sug = await generateSuggestion(
          "meeting_ended",
          { title: m.title, id: m.id },
          style
        );
        await createMessage(
          wss,
          "meeting_ended",
          "Как прошла встреча?",
          sug.body,
          sug.suggested_actions_json,
          m.profile_ids,
          m.id
        );
      }
    }
  } catch (err) {
    console.error("[agent] meeting_ended trigger failed:", (err as Error).message);
  }

  // ── b) task_no_assignee ──
  try {
    const { rows: tasks } = await pool.query<TaskRow>(
      "SELECT * FROM tasks WHERE assignee IS NULL AND project_id IS NOT NULL AND status <> 'done' AND archived = false"
    );
    if (tasks.length > 0) {
      const style = await buildStyleExamples("задачи назначение исполнитель");
      for (const t of tasks) {
        const sug = await generateSuggestion(
          "task_no_assignee",
          { title: t.title, id: t.id },
          style
        );
        await createMessage(
          wss,
          "task_no_assignee",
          "Уточни статус",
          sug.body,
          sug.suggested_actions_json,
          t.profile_ids,
          t.id
        );
      }
    }
  } catch (err) {
    console.error("[agent] task_no_assignee trigger failed:", (err as Error).message);
  }

  // ── c) deadline_soon ──
  try {
    const { rows: tasks } = await pool.query<TaskRow>(
      `SELECT * FROM tasks
       WHERE due_date BETWEEN now() AND now() + interval '2 days'
         AND status <> 'done'
         AND archived = false`
    );
    if (tasks.length > 0) {
      const style = await buildStyleExamples("дедлайн срок срочно задача");
      for (const t of tasks) {
        const sug = await generateSuggestion(
          "deadline_soon",
          { title: t.title, id: t.id, due_date: t.due_date },
          style
        );
        await createMessage(
          wss,
          "deadline_soon",
          "Дедлайн близко",
          sug.body,
          sug.suggested_actions_json,
          t.profile_ids,
          t.id
        );
      }
    }
  } catch (err) {
    console.error("[agent] deadline_soon trigger failed:", (err as Error).message);
  }

  // ── d) project_plan ──
  try {
    const { rows: projects } = await pool.query<ProjectRow>(
      `SELECT p.* FROM projects p
       JOIN tasks t ON t.project_id = p.id
       WHERE t.due_date IS NULL AND t.status <> 'done'
       GROUP BY p.id`
    );
    if (projects.length > 0) {
      const style = await buildStyleExamples("проект планирование созвон");
      for (const p of projects) {
        const sug = await generateSuggestion(
          "project_plan",
          { name: p.name, id: p.id, title: p.name },
          style
        );
        await createMessage(
          wss,
          "project_plan",
          "План проекта",
          sug.body,
          sug.suggested_actions_json,
          p.profile_ids,
          p.id
        );
      }
    }
  } catch (err) {
    console.error("[agent] project_plan trigger failed:", (err as Error).message);
  }
}

/**
 * Запускает агент-воркер: циклически проверяет триггеры и создаёт сообщения.
 * Первый запуск — немедленно, затем с интервалом intervalMs.
 */
export function startAgentWorker(
  wss: WebSocketServer,
  intervalMs = 60000
): void {
  const tick = async (): Promise<void> => {
    try {
      const settings = await readSettings();
      if (!settings.agent_enabled) return;
      if (isInDnd(new Date(), settings.agent_dnd_start, settings.agent_dnd_end)) return;
      if (await dailyCapReached(settings.agent_daily_cap)) return;

      await evaluateTriggers(wss, settings);
    } catch (err) {
      console.error("[agent] worker tick error:", (err as Error).message);
    }
  };

  // первый запуск без задержки
  tick().catch((err) =>
    console.error("[agent] initial tick failed:", (err as Error).message)
  );

  setInterval(tick, intervalMs);
}
