import { generate, embedText } from "./rag.js";
import { semanticRank, fetchByIds } from "./search.js";
import { getTodayData } from "./routes/digests.js";
import type { NoteRow, MeetingRow, TaskRow, ProjectRow, TodayData, SuggestedAction } from "./types.js";

/* ───────── стиль пользователя ───────── */

/** Достаёт до 3 заметок, семантически близких к context, как пример стиля. */
export async function buildStyleExamples(context: string): Promise<string> {
  try {
    const vec = await embedText(context);
    const ranked = await semanticRank("note", vec, 3);
    if (ranked.length === 0) return "";
    const ids = ranked.map((r) => r.id);
    const notes = await fetchByIds<NoteRow>("notes", ids);
    return notes.map((n) => `${n.title}\n${n.body_md}`).join("\n---\n");
  } catch {
    return "";
  }
}

/* ───────── промпт-билдеры ───────── */

export function buildMeetingFollowUp(
  meeting: { title: string },
  style: string
): string {
  return [
    "Ты — личный ассистент. Напиши 1–3 предложения, побуждающие пользователя",
    `записать ключевые выводы после встречи «${meeting.title}».`,
    "Без приветствий и подписей. Стиль пользователя:\n" + style,
  ].join(" ");
}

export function buildDeadlineReminder(
  task: { title: string; due_date?: Date | null },
  style: string
): string {
  const due = task.due_date
    ? `до ${task.due_date.toLocaleDateString("ru-RU")}`
    : "скоро";
  return [
    "Ты — личный ассистент. Напиши 1–3 предложения, напоминая о задаче",
    `«${task.title}» (срок — ${due}).`,
    "Предложи повысить приоритет или перепланировать.",
    "Без приветствий и подписей. Стиль пользователя:\n" + style,
  ].join(" ");
}

export function buildNoAssigneeReminder(
  task: { title: string },
  style: string
): string {
  return [
    "Ты — личный ассистент. Напиши 1–3 предложения, напоминая,",
    `что у задачи «${task.title}» нет исполнителя.`,
    "Предложи назначить ответственного.",
    "Без приветствий и подписей. Стиль пользователя:\n" + style,
  ].join(" ");
}

export function buildProjectPlanReminder(
  project: { name: string },
  style: string
): string {
  return [
    "Ты — личный ассистент. Напиши 1–3 предложения о проекте",
    `«${project.name}» — напомни запланировать созвон или`,
    "уточнить сроки задач.",
    "Без приветствий и подписей. Стиль пользователя:\n" + style,
  ].join(" ");
}

export function buildDailyDigest(
  today: TodayData,
  style: string
): string {
  const parts: string[] = [
    "Ты — личный ассистент. Составь краткий утренний дайджест на сегодня.",
  ];
  if (today.meetings.length > 0) {
    const titles = today.meetings.map((m) => `  — ${m.title} (${formatTime(m.start)})`);
    parts.push(`Встречи:\n${titles.join("\n")}`);
  }
  if (today.tasks.length > 0) {
    const titles = today.tasks.map((t) => `  — ${t.title}${t.due_date ? " " + formatTime(t.due_date) : ""}`);
    parts.push(`Задачи:\n${titles.join("\n")}`);
  }
  if (today.reminders.length > 0) {
    const titles = today.reminders.map((r) => `  — ${r.message ?? "(без текста)"}`);
    parts.push(`Напоминания:\n${titles.join("\n")}`);
  }
  parts.push(
    "Напиши 2–4 предложения, приветствие не нужно.",
    "Без подписи. Стиль пользователя:\n" + style,
  );
  return parts.join("\n\n");
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/* ───────── диспетчер генерации ───────── */

function getFallback(triggerType: string, title: string): string {
  const fallbacks: Record<string, (t: string) => string> = {
    meeting_ended: (t) => `Как прошла встреча «${t}»? Запиши ключевые выводы.`,
    deadline_soon: (t) => `Дедлайн задачи «${t}» близко. Успеваешь?`,
    task_no_assignee: (t) => `У задачи «${t}» нет исполнителя. Назначь ответственного.`,
    project_plan: (t) => `По проекту «${t}» есть задачи без сроков. Запланируй созвон.`,
    daily_digest: (_t) => "Доброе утро! Вот план на сегодня.",
  };
  const fn = fallbacks[triggerType];
  return fn ? fn(title) : title;
}

function getActions(triggerType: string, id: string): SuggestedAction[] {
  switch (triggerType) {
    case "meeting_ended":
      return [
        { type: "create_note", label: "Записать итог", params: { linked_meeting_id: id } },
      ];
    case "task_no_assignee":
      return [
        { type: "create_task", label: "Назначить ответственного", params: { id } },
      ];
    case "deadline_soon":
      return [
        { type: "reprioritize", label: "Повысить приоритет", params: { id } },
      ];
    case "project_plan":
      return [
        { type: "create_meeting", label: "Поставить созвон", params: { project_id: id } },
      ];
    default:
      return [];
  }
}

/** Собирает промпт по триггеру и сущности. */
function buildPrompt(
  triggerType: string,
  entity: { title: string; due_date?: Date | null; name?: string },
  style: string
): string {
  switch (triggerType) {
    case "meeting_ended":
      return buildMeetingFollowUp(entity as { title: string }, style);
    case "deadline_soon":
      return buildDeadlineReminder(
        entity as { title: string; due_date?: Date | null },
        style
      );
    case "task_no_assignee":
      return buildNoAssigneeReminder(entity as { title: string }, style);
    case "project_plan":
      return buildProjectPlanReminder(entity as { name: string }, style);
    case "daily_digest":
      return style; // для daily_digest стиль уже встроен в buildDailyDigest
    default:
      return `Напиши 1–3 предложения о «${entity.title ?? entity.name ?? ""}». Без приветствий.`;
  }
}

/**
 * Генерирует тело сообщения и действия для заданного триггера.
 * Если AI недоступен — возвращает шаблонный фолбэк.
 */
export async function generateSuggestion(
  triggerType: string,
  entity: { title: string; id: string; due_date?: Date | null; name?: string },
  style: string
): Promise<{ body: string; suggested_actions_json: SuggestedAction[] }> {
  const prompt = buildPrompt(triggerType, entity, style);
  let body = await generate(prompt);
  if (!body) {
    body = getFallback(triggerType, entity.title ?? entity.name ?? "");
  }
  return { body, suggested_actions_json: getActions(triggerType, entity.id) };
}

/**
 * Генерирует текст ежедневного дайджеста.
 * Возвращает шаблонный фолбэк, если AI недоступен.
 */
export async function generateDailyDigestText(): Promise<string> {
  try {
    const today = await getTodayData();
    const style = await buildStyleExamples("мой день планы встречи задачи");
    const prompt = buildDailyDigest(today, style);
    const text = await generate(prompt);
    if (text) return text;

    // шаблонный фолбэк
    const parts: string[] = ["Доброе утро! Вот план на сегодня."];
    if (today.meetings.length > 0) {
      parts.push(
        "Встречи: " +
          today.meetings.map((m) => `${m.title} (${formatTime(m.start)})`).join(", ")
      );
    }
    if (today.tasks.length > 0) {
      parts.push(
        "Задачи: " +
          today.tasks
            .map((t) => `${t.title}${t.due_date ? " " + formatTime(t.due_date) : ""}`)
            .join(", ")
      );
    }
    return parts.join(" ");
  } catch {
    return "Доброе утро! Проверь свой план на сегодня.";
  }
}
