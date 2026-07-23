import pg from "pg";
import { randomUUID } from "node:crypto";

const { Pool } = pg;

// Главный пул соединений. Лениво подключается — ошибки соединения
// всплывают только при выполнении запроса, поэтому сервер стартует
// даже при недоступной БД (маршруты отвечают 503 через isDbReady()).
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

let dbReady = false;

export function isDbReady(): boolean {
  return dbReady;
}

/** Сериализует значение в JSON-строку для параметризованной вставки в jsonb. */
export function jb(value: unknown): string {
  return JSON.stringify(value ?? []);
}

/**
 * Разбирает параметр profile из query-строки в массив имён профилей.
 * Поддерживает как массив (`?profile=Work&profile=Family`), так и строку
 * через запятую (`?profile=Work,Family`, что шлёт фронтенд).
 */
export function parseProfileParam(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof raw === "string" && raw.length > 0) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/**
 * Идентификатор для «несортированных» записей (пустой profile_ids).
 * Используется в фильтре сайдбара — показывать элементы без профиля.
 */
export const UNSORTED_PROFILE = "__unsorted__";

/**
 * Строит SQL-условие для фильтрации по профилям с поддержкой __unsorted__.
 *
 * Если в массиве profiles есть UNSORTED_PROFILE, условие будет включать
 * `profile_ids = '[]'::jsonb` через OR.
 *
 * @returns { clause, filteredProfiles } — SQL-фрагмент (пустая строка если нет
 *   фильтра) и массив profiles без UNSORTED_PROFILE для передачи в параметры.
 */
export function buildProfileFilter(
  profiles: string[],
  paramIndex: number
): { clause: string; filteredProfiles: string[] } {
  const hasUnsorted = profiles.includes(UNSORTED_PROFILE);
  const filteredProfiles = profiles.filter((p) => p !== UNSORTED_PROFILE);

  const parts: string[] = [];
  if (filteredProfiles.length > 0) {
    parts.push(`profile_ids ?| $${paramIndex}::text[]`);
  }
  if (hasUnsorted) {
    // Пустой profile_ids OR содержит ID, которых нет в таблице profiles
    parts.push(
      `(profile_ids = '[]'::jsonb OR NOT (profile_ids <@ (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM profiles)))`
    );
  }

  return {
    clause: parts.length > 0 ? `(${parts.join(" OR ")})` : "",
    filteredProfiles,
  };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,
  is_default boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body_md text DEFAULT '',
  profile_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb DEFAULT '[]'::jsonb,
  linked_meeting_id uuid NULL,
  linked_project_id uuid NULL,
  linked_task_id uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  archived boolean DEFAULT false,
  manual_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  desc_md text DEFAULT '',
  status text DEFAULT 'backlog',
  priority text DEFAULT 'medium',
  weight int DEFAULT 0,
  rank int NOT NULL DEFAULT 0,
  assignee text,
  due_date timestamptz NULL,
  recurrence jsonb NULL,
  project_id uuid NULL,
  profile_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  archived boolean DEFAULT false
);

-- tasks: добавление tags (миграция 2026-07-23)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  desc_md text DEFAULT '',
  profile_ids jsonb DEFAULT '[]'::jsonb,
  status text,
  goal text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  "start" timestamptz NOT NULL,
  "end" timestamptz NOT NULL,
  all_day boolean DEFAULT false,
  profile_ids jsonb DEFAULT '[]'::jsonb,
  linked_project_id uuid NULL,
  notes_md text DEFAULT '',
  location text DEFAULT '',
  recurrence jsonb NULL,
  archived boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS file_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  mime text,
  size int,
  owner_type text,
  owner_id uuid NULL,
  stored_path text,
  uploaded_at timestamptz DEFAULT now(),
  profile_ids jsonb DEFAULT '[]'::jsonb,
  extracted_text text DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text,
  fire_at timestamptz,
  message text,
  related_entity_type text NULL,
  related_entity_id uuid NULL,
  fired boolean DEFAULT false,
  profile_ids jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  suggested_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved bool NOT NULL DEFAULT false,
  response text,
  profile_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ref_id uuid NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  triggered text[] DEFAULT '{}',
  messages_created int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS embeddings (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  vec jsonb NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS external_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,           -- 'google' | 'yandex'
  display_name text NOT NULL,
  email text,                        -- user email for this calendar
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  sync_token text,                   -- for incremental sync (Google)
  caldav_url text,                   -- for Yandex CalDAV
  caldav_username text,
  caldav_password text,              -- app password for Yandex
  last_sync_at timestamptz,
  sync_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES external_calendars(id) ON DELETE CASCADE,
  external_id text NOT NULL,         -- event ID from provider
  title text NOT NULL,
  description text DEFAULT '',
  location text DEFAULT '',
  "start" timestamptz NOT NULL,
  "end" timestamptz NOT NULL,
  all_day boolean DEFAULT false,
  status text DEFAULT 'confirmed',   -- confirmed, cancelled, tentative
  html_link text,
  recurrence jsonb,
  linked_project_id uuid NULL,
  linked_task_id uuid NULL,
  linked_note_id uuid NULL,
  linked_meeting_id uuid NULL,       -- link to local meeting
  synced_at timestamptz DEFAULT now(),
  UNIQUE (calendar_id, external_id)
);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'note',
  body text DEFAULT '',
  default_tags jsonb DEFAULT '[]'::jsonb,
  default_profile_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);
`;

const DEFAULT_PROFILES: ReadonlyArray<readonly [string, string, boolean]> = [
  ["Work", "#FF7A00", true],
  ["Home", "#2FBF71", false],
  ["Family", "#3B82F6", false],
  ["Friends", "#A855F7", false],
];

async function seedProfiles(client: pg.PoolClient): Promise<void> {
  const { rows } = await client.query<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM profiles"
  );
  if (rows[0]?.c > 0) return;
  for (const [name, color, isDefault] of DEFAULT_PROFILES) {
    await client.query(
      "INSERT INTO profiles (id, name, color, is_default, hidden) VALUES ($1, $2, $3, $4, $5)",
      [randomUUID(), name, color, isDefault, false]
    );
  }
  console.log("[db] seeded default profiles");
}

async function ensureAgentSettings(client: pg.PoolClient): Promise<void> {
  const entries: Array<[string, unknown]> = [
    ["agent_dnd_start", "22:00"],
    ["agent_dnd_end", "08:00"],
    ["agent_daily_cap", 5],
    ["agent_enabled", true],
  ];
  for (const [key, value] of entries) {
    await client.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING",
      [key, jb(value)]
    );
  }
}

const BUILTIN_TEMPLATES: Array<{
  name: string;
  type: string;
  body: string;
  default_tags: string[];
  default_profile_ids: string[];
}> = [
  {
    name: "Встреча",
    type: "note",
    body: `## Участники

- 

## Обсудили

- 

## Решили

- `,
    default_tags: ["meeting"],
    default_profile_ids: [],
  },
  {
    name: "Задача",
    type: "note",
    body: `## Описание



## Чек-лист

- [ ] `,
    default_tags: ["task"],
    default_profile_ids: [],
  },
  {
    name: "Идея",
    type: "note",
    body: `## Идея



## Почему это важно



## Следующие шаги

- `,
    default_tags: ["idea"],
    default_profile_ids: [],
  },
  {
    name: "Дневник",
    type: "note",
    body: `## Что сделано

- 

## Мысли



## Планы

- `,
    default_tags: ["journal"],
    default_profile_ids: [],
  },
  {
    name: "Баг",
    type: "task",
    body: `## Шаги воспроизведения

1. 
2. 

## Ожидаемое поведение



## Фактическое поведение



## Окружение

- `,
    default_tags: ["bug"],
    default_profile_ids: [],
  },
  {
    name: "Задача на неделю",
    type: "task",
    body: `## Цель



## Критерии готовности

- [ ] `,
    default_tags: ["weekly"],
    default_profile_ids: [],
  },
  {
    name: "Ревью кода",
    type: "task",
    body: `## Что ревьювим

- 

## Замечания

- 

## Результат

- [ ] Одобрено
- [ ] Требует изменений`,
    default_tags: ["review"],
    default_profile_ids: [],
  },
];

async function seedTemplates(client: pg.PoolClient): Promise<void> {
  const { rows } = await client.query<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM templates"
  );
  if (rows[0]?.c > 0) return;
  for (const tmpl of BUILTIN_TEMPLATES) {
    await client.query(
      `INSERT INTO templates (id, name, type, body, default_tags, default_profile_ids)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [randomUUID(), tmpl.name, tmpl.type, tmpl.body, jb(tmpl.default_tags), jb(tmpl.default_profile_ids)]
    );
  }
  console.log("[db] seeded built-in templates");
}

/**
 * Накатывает схему и сид-профили. При недоступности БД делает несколько
 * попыток с паузой, но НЕ падает — сервер стартует и отдаёт 503 на
 * маршрутах БД, пока БД не поднимется.
 */
export async function migrate(): Promise<void> {
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let client: pg.PoolClient | null = null;
    try {
      client = await pool.connect();
      // gen_random_uuid() встроен в PG13+, но на старых его даёт pgcrypto.
      try {
        await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
      } catch {
        // расширение недоступно (нет прав) — для PG13+ функция и так в ядре
      }
      await client.query(SCHEMA_SQL);
      // Колонка ручной сортировки заметок (добавлена постфактум — совместимо
      // со старыми таблицами).
      await client.query(
        `ALTER TABLE notes ADD COLUMN IF NOT EXISTS manual_order int NOT NULL DEFAULT 0;`
      );
      // Колонка приоритетного ранга задач (добавлена постфактум).
      await client.query(
        `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rank int NOT NULL DEFAULT 0;`
      );
      // Колонка архивации встреч (добавлена постфактум).
      await client.query(
        `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;`
      );
      // Колонка скрытия профиля (добавлена постфактум).
      await client.query(
        `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hidden boolean DEFAULT false;`
      );
      // Колонки для файлов (добавлены постфактум).
      await client.query(
        `ALTER TABLE file_meta ADD COLUMN IF NOT EXISTS profile_ids jsonb DEFAULT '[]'::jsonb;`
      );
      await client.query(
        `ALTER TABLE file_meta ADD COLUMN IF NOT EXISTS extracted_text text DEFAULT '';`
      );
      // Однократный бэкапфил: старым заметкам даём порядок по created_at,
      // чтобы ручная сортировка имела смысл. Пропускаем, если уже есть
      // пользовательская сортировка (manual_order > 0 где-либо).
      const { rows: moRows } = await client.query<{ c: number; mx: number }>(
        "SELECT COUNT(*)::int AS c, COALESCE(MAX(manual_order), 0) AS mx FROM notes"
      );
      if (moRows[0]?.c > 0 && moRows[0].mx === 0) {
        await client.query(`
          WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
            FROM notes
          )
          UPDATE notes SET manual_order = ordered.rn
          FROM ordered WHERE notes.id = ordered.id;
        `);
      }
      // Однократный бэкапфил: старым задачам даём ранг по весу (по убыванию),
      // чтобы приоритезация имела смысл. Пропускаем, если уже есть пользовательский
      // ранг (max(rank) > 0 где-либо).
      const { rows: rankRows } = await client.query<{ c: number; mx: number }>(
        "SELECT COUNT(*)::int AS c, COALESCE(MAX(rank), 0) AS mx FROM tasks"
      );
      if (rankRows[0]?.c > 0 && rankRows[0].mx === 0) {
        await client.query(`
          WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY weight DESC, created_at ASC) AS rn
            FROM tasks
          )
          UPDATE tasks SET rank = ordered.rn
          FROM ordered WHERE tasks.id = ordered.id;
        `);
      }
      // Колонка профилей для внешних событий (добавлена постфактум).
      await client.query(
        `ALTER TABLE external_events ADD COLUMN IF NOT EXISTS profile_ids jsonb DEFAULT '[]'::jsonb;`
      );
      await seedProfiles(client);
      await ensureAgentSettings(client);
      await seedTemplates(client);
      dbReady = true;
      console.log("[db] migrations applied, database ready");
      return;
    } catch (err) {
      console.error(
        `[db] migrate attempt ${attempt}/${maxRetries} failed: ${(err as Error).message}`
      );
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } finally {
      client?.release();
    }
  }
  console.error("[db] could not connect after retries; starting without database");
}
