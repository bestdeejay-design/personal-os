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

searchRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const q = typeof req.body?.q === "string" ? req.body.q : "";
  if (!q) return res.status(400).json({ error: "q required" });
  const result: SearchResult = { notes: [], tasks: [], meetings: [], files: [] };
  const like = `%${q}%`;

  // Семантический поиск по заметкам/задачам/встречам.
  try {
    const qvec = await embedText(q);
    const noteRank = await semanticRank("note", qvec, 10);
    const taskRank = await semanticRank("task", qvec, 10);
    const meetRank = await semanticRank("meeting", qvec, 10);
    if (noteRank.length > 0) {
      result.notes = await fetchByIds<NoteRow>("notes", noteRank.map((r) => r.id));
    }
    if (taskRank.length > 0) {
      result.tasks = await fetchByIds<TaskRow>("tasks", taskRank.map((r) => r.id));
    }
    if (meetRank.length > 0) {
      result.meetings = await fetchByIds<MeetingRow>("meetings", meetRank.map((r) => r.id));
    }
  } catch {
    // Ollama недоступна — используем ILIKE-фолбэк ниже
  }

  // Файлы: эмбеддингов нет, ищем по имени. ILIKE-фолбэк для
  // остальных сущностей, если семантический поиск ничего не дал.
  const { rows: files } = await pool.query<FileMetaRow>(
    "SELECT * FROM file_meta WHERE filename ILIKE $1 LIMIT 10",
    [like]
  );
  result.files = files;

  if (result.notes.length === 0) {
    const { rows } = await pool.query<NoteRow>(
      "SELECT * FROM notes WHERE title ILIKE $1 OR body_md ILIKE $1 LIMIT 10",
      [like]
    );
    result.notes = rows;
  }
  if (result.tasks.length === 0) {
    const { rows } = await pool.query<TaskRow>(
      "SELECT * FROM tasks WHERE title ILIKE $1 OR desc_md ILIKE $1 LIMIT 10",
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

  res.json(result);
});
