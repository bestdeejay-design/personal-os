import { Router } from "express";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ZipArchive } from "archiver";
import { pool, isDbReady } from "../db.js";
import { toIcs } from "../ics.js";
import type { NoteRow, TaskRow, MeetingRow, ProjectRow } from "../types.js";

export const exportRouter = Router();

exportRouter.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });

  const archive = new ZipArchive({ zlib: { level: 9 } });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="personal-os-export-${new Date().toISOString().slice(0, 10)}.zip"`);
  archive.pipe(res);

  // Notes → .md files
  const { rows: notes } = await pool.query<NoteRow>("SELECT * FROM notes ORDER BY title");
  for (const note of notes) {
    const title = note.title || "untitled";
    const safe = title.replace(/[^a-zA-Zа-яА-Я0-9 _-]/g, "_").slice(0, 60);
    const tags = Array.isArray(note.tags) ? note.tags.join(", ") : "";
    const header = `# ${title}\n\n> Tags: ${tags}\n\n`;
    archive.append(header + note.body_md, { name: `notes/${safe}.md` });
  }

  // Tasks → tasks.json
  const { rows: tasks } = await pool.query<TaskRow>("SELECT * FROM tasks ORDER BY created_at");
  archive.append(JSON.stringify(tasks, null, 2), { name: "tasks.json" });

  // Projects → projects.json
  const { rows: projects } = await pool.query<ProjectRow>("SELECT * FROM projects ORDER BY name");
  archive.append(JSON.stringify(projects, null, 2), { name: "projects.json" });

  // Calendar → calendar.ics
  try {
    const { rows: allMeetings } = await pool.query<MeetingRow>(
      "SELECT * FROM meetings ORDER BY start"
    );
    const icsParts = allMeetings.map((m) =>
      toIcs({
        uid: m.id,
        start: m.start,
        end: m.end,
        summary: m.title,
        description: m.notes_md || undefined,
      })
    );
    archive.append(icsParts.join("\r\n"), { name: "calendar.ics" });
  } catch {
    archive.append("", { name: "calendar.ics" });
  }

  // Files → copies
  const uploadDir = process.env.UPLOAD_DIR || resolve(join(import.meta.dirname, "../../uploads"));
  if (existsSync(uploadDir)) {
    try {
      const files = await readdir(uploadDir, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile()) {
          const filePath = join(uploadDir, file.name);
          archive.file(filePath, { name: `files/${file.name}` });
        }
      }
    } catch {
      // uploads directory might be inaccessible
    }
  }

  archive.finalize();
});
