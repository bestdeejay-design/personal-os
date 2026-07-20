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
  archived boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  desc_md text DEFAULT '',
  status text DEFAULT 'backlog',
  priority text DEFAULT 'medium',
  weight int DEFAULT 0,
  assignee text,
  due_date timestamptz NULL,
  recurrence jsonb NULL,
  project_id uuid NULL,
  profile_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  archived boolean DEFAULT false
);

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
  start timestamptz NOT NULL,
  end timestamptz NOT NULL,
  all_day boolean DEFAULT false,
  profile_ids jsonb DEFAULT '[]'::jsonb,
  linked_project_id uuid NULL,
  notes_md text DEFAULT '',
  location text DEFAULT '',
  recurrence jsonb NULL
);

CREATE TABLE IF NOT EXISTS file_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  mime text,
  size int,
  owner_type text,
  owner_id uuid NULL,
  stored_path text,
  uploaded_at timestamptz DEFAULT now()
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

CREATE TABLE IF NOT EXISTS embeddings (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  vec jsonb NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
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
      "INSERT INTO profiles (id, name, color, is_default) VALUES ($1, $2, $3, $4)",
      [randomUUID(), name, color, isDefault]
    );
  }
  console.log("[db] seeded default profiles");
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
      await seedProfiles(client);
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
