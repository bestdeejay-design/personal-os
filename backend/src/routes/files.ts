import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { pool, isDbReady, jb, parseProfileParam, buildProfileFilter } from "../db.js";
import { storeEmbedding } from "../search.js";
import type { FileMetaRow } from "../types.js";

const DATA_DIR = process.env.DATA_DIR ?? "./data/uploads";
mkdirSync(DATA_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DATA_DIR),
  filename: (_req, file, cb) => {
    // Исправляем Mojibake: Latin-1 → UTF-8
    const name = Buffer.from(file.originalname, "latin1").toString("utf8");
    cb(null, `${randomUUID()}-${name}`);
  },
});
const upload = multer({ storage });

/* Извлечение текста из загруженного файла для индексации */
function extractText(filePath: string, mime: string): string {
  try {
    const textMimes = [
      "text/plain", "text/markdown", "text/csv", "text/html",
      "application/json", "application/xml",
    ];
    if (textMimes.includes(mime)) {
      return readFileSync(filePath, "utf-8").slice(0, 50_000);
    }
    // .md, .txt, .csv по расширению если mime не определился
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
    if (["md", "txt", "csv", "json", "xml", "html", "htm"].some((e) => ext.endsWith(e))) {
      return readFileSync(filePath, "utf-8").slice(0, 50_000);
    }
  } catch { /* не удалось прочитать — пропускаем */ }
  return "";
}

export const filesRouter = Router();

filesRouter.post("/", upload.single("file"), async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const f = req.file;
  if (!f) return res.status(400).json({ error: "file required" });
  const owner_type = typeof req.body?.owner_type === "string" ? req.body.owner_type : null;
  const owner_id = typeof req.body?.owner_id === "string" ? req.body.owner_id : null;
  const rawProfiles = typeof req.body?.profile_ids === "string" ? req.body.profile_ids : "";
  const profile_ids: string[] = rawProfiles ? rawProfiles.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  const id = randomUUID();
  const cleanName = Buffer.from(f.originalname, "latin1").toString("utf8");
  const extracted = extractText(f.path, f.mimetype);
  const { rows } = await pool.query<FileMetaRow>(
    `INSERT INTO file_meta (id, filename, mime, size, owner_type, owner_id, stored_path, profile_ids, extracted_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,
    [id, cleanName, f.mimetype, f.size, owner_type, owner_id, f.path, jb(profile_ids), extracted]
  );
  // Индексируем для семантического поиска
  if (extracted) {
    await storeEmbedding("file", id, extracted).catch(() => {});
  } else {
    await storeEmbedding("file", id, cleanName).catch(() => {});
  }
  res.status(201).json(rows[0]);
});

filesRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const owner_type = typeof req.query.owner_type === "string" ? req.query.owner_type : "";
  const owner_id = typeof req.query.owner_id === "string" ? req.query.owner_id : "";
  const profiles = parseProfileParam(req.query.profile);
  const conds: string[] = [];
  const params: unknown[] = [];
  if (owner_type) {
    params.push(owner_type);
    conds.push(`owner_type = $${params.length}`);
  }
  if (owner_id) {
    params.push(owner_id);
    conds.push(`owner_id = $${params.length}`);
  }
  if (profiles.length > 0) {
    const { clause, filteredProfiles } = buildProfileFilter(profiles, params.length + 1);
    if (clause) {
      if (filteredProfiles.length > 0) params.push(filteredProfiles);
      conds.push(clause);
    }
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query<FileMetaRow>(
    `SELECT * FROM file_meta ${where} ORDER BY uploaded_at DESC`,
    params
  );
  res.json(rows);
});

filesRouter.get("/:id/download", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const { rows } = await pool.query<FileMetaRow>(
    "SELECT * FROM file_meta WHERE id = $1", [id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "file not found" });
  const f = rows[0];
  if (!f.stored_path || !existsSync(f.stored_path)) {
    return res.status(404).json({ error: "file not found on disk" });
  }
  res.download(f.stored_path, f.filename);
});

filesRouter.patch("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const body = (req.body ?? {}) as {
    filename?: string;
    profile_ids?: string[];
    owner_type?: string;
    owner_id?: string;
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (body.filename !== undefined) { sets.push(`filename = $${idx++}`); vals.push(body.filename); }
  if (body.profile_ids !== undefined) { sets.push(`profile_ids = $${idx++}::jsonb`); vals.push(jb(body.profile_ids)); }
  if (body.owner_type !== undefined) { sets.push(`owner_type = $${idx++}`); vals.push(body.owner_type); }
  if (body.owner_id !== undefined) { sets.push(`owner_id = $${idx++}`); vals.push(body.owner_id); }

  if (sets.length === 0) return res.status(400).json({ error: "no fields to update" });
  vals.push(id);
  const { rows } = await pool.query<FileMetaRow>(
    `UPDATE file_meta SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    vals
  );
  if (rows.length === 0) return res.status(404).json({ error: "file not found" });
  res.json(rows[0]);
});

filesRouter.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const { rows } = await pool.query<FileMetaRow>("SELECT * FROM file_meta WHERE id = $1", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "file not found" });
  const f = rows[0];
  // Удаляем файл с диска
  if (f.stored_path && existsSync(f.stored_path)) {
    try { unlinkSync(f.stored_path); } catch { /* файл уже мог быть удалён */ }
  }
  // Удаляем из БД и эмбеддингов
  await Promise.all([
    pool.query("DELETE FROM file_meta WHERE id = $1", [id]),
    pool.query("DELETE FROM embeddings WHERE entity_type = 'file' AND entity_id = $1", [id]),
  ]);
  res.json({ ok: true });
});
