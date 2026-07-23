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
  const result: SearchResult = { notes: [], tasks: [], meetings: [], files: [] };
  const like = `%${q}%`;

  // Семантический поиск по заметкам/задачам/встречам/файлам
  try {
    const qvec = await embedText(q);
    const [noteRank, taskRank, meetRank, fileRank] = await Promise.all([
      semanticRank("note", qvec, 10),
      semanticRank("task", qvec, 10),
      semanticRank("meeting", qvec, 10),
      semanticRank("file", qvec, 10),
    ]);
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
  } catch { /* Ollama недоступна — ILIKE-фолбэк */ }

  // ILIKE-фолбэк для файлов (по имени и содержимому)
  if (result.files.length === 0) {
    const { rows: files } = await pool.query<FileMetaRow>(
      "SELECT * FROM file_meta WHERE filename ILIKE $1 OR extracted_text ILIKE $1 LIMIT 10",
      [like]
    );
    result.files = files;
  }

  // ILIKE-фолбэк для остальных сущностей
  if (result.notes.length === 0) {
    const { rows } = await pool.query<NoteRow>(
      "SELECT * FROM notes WHERE title ILIKE $1 OR body_md ILIKE $1 LIMIT 10",
      [like]
    );
    result.notes = rows;
  }
  if (result.tasks.length === 0) {
    const { rows } = await pool.query<TaskRow>(
      "SELECT * FROM tasks WHERE title ILIKE $1 OR desc_md ILIKE $1 OR tags::text ILIKE $1 LIMIT 10",
      [like]
    );
    result.tasks = rows;
  }
  if (result.meetings.length === 0) {
    const { rows } = await pool.query<MeetingRow>(
      "SELECT * FROM meetings WHERE title ILIKE $1 OR notes_md ILIKE $1 LIMIT 10",
      [like]
    );
    result.meetings = rows;
  }

  // Добавляем эксцерпт к файлам (где есть extracted_text)
  result.files = result.files.map<FileMetaRow>((f) => ({
    ...f,
    excerpt: f.extracted_text ? excerpt(f.extracted_text, q) : undefined,
  }));

  res.json(result);
});
