import { pool, jb } from "./db.js";
import { embedText, cosine } from "./rag.js";
import type { NoteRow, TaskRow, MeetingRow } from "./types.js";

export interface RankedId {
  id: string;
  score: number;
}

interface HasId {
  id: string;
}

// Таблицы, по которым разрешён семантический поиск (защита от инъекции имени таблицы).
const ALLOWED_TABLES: Record<string, string> = {
  notes: "notes",
  tasks: "tasks",
  meetings: "meetings",
};

/** Ранжирует сущности типа entityType по косинусному сходству с queryVec. */
export async function semanticRank(
  entityType: string,
  queryVec: number[],
  topK: number
): Promise<RankedId[]> {
  const { rows } = await pool.query<{ entity_id: string; vec: number[] }>(
    "SELECT entity_id, vec FROM embeddings WHERE entity_type = $1",
    [entityType]
  );
  if (rows.length === 0) return [];
  return rows
    .map((r) => ({ id: r.entity_id, score: cosine(queryVec, r.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Достаёт строки по id в порядке ранжирования. */
export async function fetchByIds<T extends HasId>(
  entityType: string,
  ids: string[]
): Promise<T[]> {
  const table = ALLOWED_TABLES[entityType];
  if (!table || ids.length === 0) return [];
  const { rows } = await pool.query<T>(
    `SELECT * FROM ${table} WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const order = new Map(ids.map((id, i) => [id, i] as const));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * Вычисляет эмбеддинг текста через Ollama и сохраняет в таблицу embeddings.
 * Если Ollama недоступна — сущность уже сохранена, эмбеддинг просто пропускаем.
 */
export async function storeEmbedding(
  entityType: string,
  id: string,
  text: string
): Promise<void> {
  try {
    const vec = await embedText(text);
    await pool.query(
      "INSERT INTO embeddings (entity_type, entity_id, vec) VALUES ($1,$2,$3::jsonb) " +
        "ON CONFLICT (entity_type, entity_id) DO UPDATE SET vec = $3::jsonb",
      [entityType, id, jb(vec)]
    );
  } catch {
    // Ollama недоступна — сущность уже сохранена без эмбеддинга
  }
}
