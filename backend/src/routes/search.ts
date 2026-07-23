import { Router } from "express";
import { pool, isDbReady } from "../db.js";
import { embedText } from "../rag.js";
import { semanticRank, fetchByIds } from "../search.js";
import type { NoteRow, TaskRow, MeetingRow, FileMetaRow } from "../types.js";

export const searchRouter = Router();

interface SearchResult {
  notes: NoteRow[];
  tasks: TaskRow[];
  meetings: MeetingRow[];
  files: FileMetaRow[];
}

/* Вернуть фрагмент текста вокруг первого вхождения запроса */
function excerpt(text: string, query: string, context: number = 60): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, context * 2);
  const start = Math.max(0, idx - context);
  const end = Math.min(text.length, idx + query.length + context);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

searchRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const q = typeof req.body?.q === "string" ? req.body.q : "";
  if (!q) return res.status(400).json({ error: "q required" });
  const filters = (req.body?.filters ?? {}) as {
    types?: string[];
    tags?: string[];
    project?: string;
    profiles?: string[];
  };
  const result: SearchResult = { notes: [], tasks: [], meetings: [], files: [] };
  const like = `%${q}%`;
  const types = filters.types?.length ? new Set(filters.types) : null;
  const tagCond = filters.tags?.length
    ? filters.tags.map((t) => `tags::text ILIKE '%${t.replace(/'/g, "''")}%'`).join(" OR ")
    : null;

  // Семантический поиск
  try {
    const qvec = await embedText(q);
    const searches: Array<Promise<unknown>> = [];
    if (!types || types.has("note")) searches.push(semanticRank("note", qvec, 10));
    else searches.push(Promise.resolve([]));
    if (!types || types.has("task")) searches.push(semanticRank("task", qvec, 10));
    else searches.push(Promise.resolve([]));
    if (!types || types.has("meeting")) searches.push(semanticRank("meeting", qvec, 10));
    else searches.push(Promise.resolve([]));
    if (!types || types.has("file")) searches.push(semanticRank("file", qvec, 10));
    else searches.push(Promise.resolve([]));
    const [noteRank, taskRank, meetRank, fileRank] = await Promise.all(searches) as [
      Array<{ id: string; score: number }>, Array<{ id: string; score: number }>,
      Array<{ id: string; score: number }>, Array<{ id: string; score: number }>
    ];
    const [notes, tasks, meetings, files] = await Promise.all([
      noteRank.length > 0 ? fetchByIds<NoteRow>("notes", noteRank.map((r) => r.id)) : [],
      taskRank.length > 0 ? fetchByIds<TaskRow>("tasks", taskRank.map((r) => r.id)) : [],
      meetRank.length > 0 ? fetchByIds<MeetingRow>("meetings", meetRank.map((r) => r.id)) : [],
      fileRank.length > 0 ? fetchByIds<FileMetaRow>("file_meta", fileRank.map((r) => r.id)) : [],
    ]);
    result.notes = notes;
    result.tasks = tasks;
    result.meetings = meetings;
    result.files = files;
  } catch { /* Ollama offline — ILIKE fallback */ }

  // ILIKE fallback — применяем фильтры
  const baseFilter = (table: string, cols: string[], extra?: string): string => {
    const conds = [`(${cols.map((c) => `${c} ILIKE $1`).join(" OR ")})`];
    if (tagCond && ["notes", "tasks"].includes(table)) conds.push(`(${tagCond})`);
    if (filters.project) conds.push(`project_id = '${filters.project.replace(/'/g, "''")}'`);
    if (filters.profiles?.length) {
      const arr = `'["${filters.profiles.join('","')}"]'`;
      conds.push(`(profile_ids @> ${arr}::jsonb OR profile_ids = '[]'::jsonb)`);
    }
    return conds.join(" AND ");
  };

  if ((!types || types.has("file")) && result.files.length === 0) {
    const { rows } = await pool.query<FileMetaRow>(
      `SELECT * FROM file_meta WHERE ${baseFilter("file_meta", ["filename", "extracted_text"])} LIMIT 10`,
      [like]
    );
    result.files = rows;
  }
  if ((!types || types.has("note")) && result.notes.length === 0) {
    const { rows } = await pool.query<NoteRow>(
      `SELECT * FROM notes WHERE ${baseFilter("notes", ["title", "body_md"])} LIMIT 10`,
      [like]
    );
    result.notes = rows;
  }
  if ((!types || types.has("task")) && result.tasks.length === 0) {
    const { rows } = await pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE ${baseFilter("tasks", ["title", "desc_md"], "tags")} LIMIT 10`,
      [like]
    );
    result.tasks = rows;
  }
  if ((!types || types.has("meeting")) && result.meetings.length === 0) {
    const { rows } = await pool.query<MeetingRow>(
      `SELECT * FROM meetings WHERE ${baseFilter("meetings", ["title", "notes_md"])} LIMIT 10`,
      [like]
    );
    result.meetings = rows;
  }

  // Эксцерпты для файлов
  result.files = result.files.map<FileMetaRow>((f) => ({
    ...f,
    excerpt: f.extracted_text ? excerpt(f.extracted_text, q) : undefined,
  }));

  res.json(result);
});
