import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import { migrate, isDbReady, pool } from "./db.js";
import { profilesRouter } from "./routes/profiles.js";
import { notesRouter } from "./routes/notes.js";
import { tasksRouter } from "./routes/tasks.js";
import { projectsRouter } from "./routes/projects.js";
import { calendarRouter } from "./routes/calendar.js";
import { filesRouter } from "./routes/files.js";
import { searchRouter } from "./routes/search.js";
import { settingsRouter } from "./routes/settings.js";
import { digestsRouter } from "./routes/digests.js";
import { getTodayData } from "./routes/digests.js";
import type { ReminderRow } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: isDbReady() });
});

app.use("/api/profiles", profilesRouter);
app.use("/api/notes", notesRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/files", filesRouter);
app.use("/api/search", searchRouter);
app.use("/api/settings", settingsRouter);
app.use("/api", digestsRouter);

// Отдаём собранный фронтенд, если он лежит рядом (single-origin в docker).
const frontendDist = join(__dirname, "../frontend/dist");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(join(frontendDist, "index.html"));
  });
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  getTodayData()
    .then((today) => {
      ws.send(JSON.stringify({ type: "today", payload: today }));
    })
    .catch(() => {
      ws.send(JSON.stringify({ type: "today", payload: null }));
    });
});

// Периодическая проверка напоминаний: WS-пуш при наступлении fire_at.
setInterval(() => {
  if (!isDbReady()) return;
  pool
    .query<ReminderRow>(
      "SELECT * FROM reminders WHERE fired = false AND fire_at <= now()"
    )
    .then(({ rows }) => {
      for (const r of rows) {
        const msg = JSON.stringify({ type: "reminder", payload: r });
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) client.send(msg);
        }
        pool
          .query("UPDATE reminders SET fired = true WHERE id = $1", [r.id])
          .catch(() => {
            // не удалось пометить — следующая итерация повторит
          });
      }
    })
    .catch(() => {
      // ошибка опроса напоминаний — игнорируем до следующего цикла
    });
}, 30000);

const PORT = Number(process.env.PORT ?? 8080);
server.listen(PORT, () => {
  console.log(`[server] Personal OS backend listening on :${PORT}`);
});

void migrate();
