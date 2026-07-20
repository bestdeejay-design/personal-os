import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { pool, isDbReady } from "../db.js";
import type { FileMetaRow } from "../types.js";

const DATA_DIR = process.env.DATA_DIR ?? "./data/uploads";
mkdirSync(DATA_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DATA_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
});
const upload = multer({ storage });

export const filesRouter = Router();

filesRouter.post("/", upload.single("file"), async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const f = req.file;
  if (!f) return res.status(400).json({ error: "file required" });
  const owner_type = typeof req.body?.owner_type === "string" ? req.body.owner_type : null;
  const owner_id = typeof req.body?.owner_id === "string" ? req.body.owner_id : null;
  const id = randomUUID();
  const { rows } = await pool.query<FileMetaRow>(
    `INSERT INTO file_meta (id, filename, mime, size, owner_type, owner_id, stored_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, f.originalname, f.mimetype, f.size, owner_type, owner_id, f.path]
  );
  res.status(201).json(rows[0]);
});

filesRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const owner_type = typeof req.query.owner_type === "string" ? req.query.owner_type : "";
  const owner_id = typeof req.query.owner_id === "string" ? req.query.owner_id : "";
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
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query<FileMetaRow>(
    `SELECT * FROM file_meta ${where} ORDER BY uploaded_at DESC`,
    params
  );
  res.json(rows);
});
