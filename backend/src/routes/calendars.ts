import { Router } from "express";
import { pool, isDbReady } from "../db.js";
import type {
  ExternalCalendarRow,
  ExternalEventRow,
} from "../types.js";

// ──────────────────────────────────────────
// ICS parsing (shared for ICS URL + export)
// ──────────────────────────────────────────

function parseIcsDate(d: string): string {
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00`;
  const y = d.slice(0, 4), m = d.slice(4, 6), day = d.slice(6, 8);
  const h = d.slice(9, 11), min = d.slice(11, 13), s = d.slice(13, 15);
  const tz = d.includes("Z") ? "Z" : "";
  return `${y}-${m}-${day}T${h}:${min}:${s}${tz}`;
}

function expandRrule(
  dtStart: string,
  rrule: string,
  durationMs: number,
  windowStart: Date,
  windowEnd: Date,
): Date[] {
  const params: Record<string, string> = {};
  for (const part of rrule.split(";")) {
    const [k, v] = part.split("=");
    params[k] = v;
  }
  const freq = params.FREQ;
  const count = params.COUNT ? parseInt(params.COUNT, 10) : Infinity;
  const until = params.UNTIL ? new Date(parseIcsDate(params.UNTIL)) : windowEnd;
  const byDay = params.BYDAY?.split(",") ?? [];
  const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  const dates: Date[] = [];
  const baseDate = new Date(parseIcsDate(dtStart));
  let occurrenceCount = 0;

  if (freq === "WEEKLY" && byDay.length > 0) {
    const weekStart = new Date(baseDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    let weekCursor = new Date(weekStart);

    while (weekCursor <= until && occurrenceCount < count) {
      for (const day of byDay) {
        const targetDay = dayMap[day];
        if (targetDay === undefined) continue;
        const d = new Date(weekCursor);
        d.setDate(d.getDate() + targetDay);
        d.setHours(baseDate.getHours(), baseDate.getMinutes(), baseDate.getSeconds());
        if (d >= baseDate && d <= until && d >= windowStart && d <= windowEnd && occurrenceCount < count) {
          dates.push(new Date(d));
        }
        if (d >= baseDate) occurrenceCount++;
      }
      weekCursor.setDate(weekCursor.getDate() + 7);
    }
  } else {
    let current = new Date(baseDate);
    let iterations = 0;
    while (iterations < 2000 && current <= until && occurrenceCount < count) {
      if (current >= windowStart && current <= windowEnd) {
        dates.push(new Date(current));
      }
      occurrenceCount++;
      iterations++;
      if (freq === "DAILY") {
        current.setDate(current.getDate() + 1);
      } else if (freq === "MONTHLY") {
        current.setMonth(current.getMonth() + 1);
      } else if (freq === "YEARLY") {
        current.setFullYear(current.getFullYear() + 1);
      } else {
        break;
      }
    }
  }
  return dates;
}

interface ParsedEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
}

function parseIcsEvents(ics: string, windowStart?: Date, windowEnd?: Date): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const ws = windowStart ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const we = windowEnd ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const blocks = ics.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const uid = block.match(/UID:(.+)/)?.[1]?.trim() ?? `gen-${Date.now()}-${i}`;
    const summary = block.match(/SUMMARY:(.+)/)?.[1]?.trim();
    if (!summary) continue;
    const description = block.match(/DESCRIPTION:(.+)/)?.[1]?.trim() ?? "";
    const location = block.match(/LOCATION:(.+)/)?.[1]?.trim() ?? "";
    const dtStart = block.match(/DTSTART(?:;[^:]+)?:(.+)/)?.[1]?.trim() ?? "";
    const dtEnd = block.match(/DTEND(?:;[^:]+)?:(.+)/)?.[1]?.trim() ?? "";
    const rrule = block.match(/RRULE:(.+)/)?.[1]?.trim();
    if (!dtStart) continue;
    const allDay = dtStart.length === 8;

    if (rrule && dtStart) {
      const startDate = new Date(allDay ? `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}T00:00:00` : parseIcsDate(dtStart));
      const endDate = dtEnd ? new Date(allDay ? `${dtEnd.slice(0, 4)}-${dtEnd.slice(4, 6)}-${dtEnd.slice(6, 8)}T23:59:59` : parseIcsDate(dtEnd)) : new Date(startDate.getTime() + 3600000);
      const durationMs = endDate.getTime() - startDate.getTime();
      const dates = expandRrule(dtStart, rrule, durationMs, ws, we);
      for (const d of dates) {
        const endMs = d.getTime() + durationMs;
        events.push({
          uid: `${uid}-${d.toISOString()}`,
          summary, description, location, allDay,
          start: d.toISOString(),
          end: new Date(endMs).toISOString(),
        });
      }
    } else {
      const start = allDay ? `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}T00:00:00` : parseIcsDate(dtStart);
      const end = dtEnd ? (allDay ? `${dtEnd.slice(0, 4)}-${dtEnd.slice(4, 6)}-${dtEnd.slice(6, 8)}T23:59:59` : parseIcsDate(dtEnd)) : new Date(new Date(start).getTime() + 3600000).toISOString();
      events.push({ uid, summary, description, location, start, end, allDay });
    }
  }
  return events;
}

export const calendarsRouter = Router();

// ──────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────

calendarsRouter.get("/", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  try {
    const { rows } = await pool.query<ExternalCalendarRow>(
      `SELECT id, provider, display_name, email, last_sync_at, sync_enabled, created_at
       FROM external_calendars ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

calendarsRouter.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { provider, display_name, email, caldav_url, caldav_username, caldav_password } = req.body;
  if (!display_name) return res.status(400).json({ error: "display_name required" });
  const prov = provider || "ics";
  try {
    const { rows } = await pool.query<ExternalCalendarRow>(
      `INSERT INTO external_calendars (provider, display_name, email, caldav_url, caldav_username, caldav_password)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, provider, display_name, email, last_sync_at, sync_enabled, created_at`,
      [prov, display_name, email ?? null, caldav_url ?? null, caldav_username ?? null, caldav_password ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

calendarsRouter.patch("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const key of ["display_name", "email", "access_token", "refresh_token", "token_expires_at", "sync_token", "caldav_url", "caldav_username", "caldav_password", "sync_enabled", "last_sync_at"]) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(req.body[key]);
      idx++;
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: "no fields to update" });
  values.push(id);
  try {
    const { rows } = await pool.query<ExternalCalendarRow>(
      `UPDATE external_calendars SET ${fields.join(", ")} WHERE id = $${idx}
       RETURNING id, provider, display_name, email, last_sync_at, sync_enabled, created_at`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: "calendar not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

calendarsRouter.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM external_calendars WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ──────────────────────────────────────────
// Events
// ──────────────────────────────────────────

calendarsRouter.get("/:id/events", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const { start, end } = req.query;
  try {
    let query = `SELECT * FROM external_events WHERE calendar_id = $1`;
    const params: unknown[] = [id];
    let idx = 2;
    if (start) {
      query += ` AND "start" >= $${idx}`;
      params.push(start);
      idx++;
    }
    if (end) {
      query += ` AND "end" <= $${idx}`;
      params.push(end);
      idx++;
    }
    query += ` ORDER BY "start" ASC`;
    const { rows } = await pool.query<ExternalEventRow>(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

calendarsRouter.patch("/events/:id/link", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  const { linked_project_id, linked_task_id, linked_note_id, linked_meeting_id, profile_ids } = req.body;
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [k, v] of Object.entries({ linked_project_id, linked_task_id, linked_note_id, linked_meeting_id, profile_ids })) {
    if (v !== undefined) {
      fields.push(`${k} = $${idx}`);
      if (k === "profile_ids") {
        values.push(JSON.stringify(v));
      } else {
        values.push(v);
      }
      idx++;
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: "no fields to update" });
  try {
    const { rows } = await pool.query<ExternalEventRow>(
      `UPDATE external_events SET ${fields.join(", ")} WHERE id = $${idx}
       RETURNING *`,
      [...values, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "event not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ──────────────────────────────────────────
// Google OAuth2
// ──────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/calendars/google/callback";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

calendarsRouter.get("/google/auth", (_req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ error: "Google OAuth not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)" });
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

calendarsRouter.get("/google/callback", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { code } = req.query;
  if (!code || typeof code !== "string") return res.status(400).json({ error: "code required" });
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (tokens.error) throw new Error(tokens.error);
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    // Fetch user email
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userRes.json() as { email?: string };
    // Upsert calendar
    const { rows } = await pool.query<ExternalCalendarRow>(
      `INSERT INTO external_calendars (provider, display_name, email, access_token, refresh_token, token_expires_at)
       VALUES ('google', $1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
        access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at
       RETURNING id, provider, display_name, email, last_sync_at, sync_enabled, created_at`,
      [user.email ?? "Google Calendar", user.email ?? null, tokens.access_token, tokens.refresh_token, expiresAt]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ──────────────────────────────────────────
// Google Calendar API sync
// ──────────────────────────────────────────

async function refreshGoogleToken(cal: ExternalCalendarRow): Promise<string> {
  if (!cal.refresh_token) throw new Error("no refresh token");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: cal.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await tokenRes.json() as { access_token?: string; expires_in?: number; error?: string };
  if (tokens.error) throw new Error(tokens.error);
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  await pool.query(
    "UPDATE external_calendars SET access_token = $1, token_expires_at = $2 WHERE id = $3",
    [tokens.access_token, expiresAt, cal.id]
  );
  return tokens.access_token!;
}

async function syncGoogleCalendar(cal: ExternalCalendarRow): Promise<number> {
  let accessToken = cal.access_token;
  if (!accessToken) throw new Error("no access token");
  // Refresh if expired
  if (cal.token_expires_at && new Date(cal.token_expires_at) < new Date()) {
    accessToken = await refreshGoogleToken(cal);
  }
  // Fetch calendar list
  const calListRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const calList = await calListRes.json() as { items?: Array<{ id?: string; summary?: string }>; error?: { message?: string } };
  if (calList.error) throw new Error(calList.error.message);
  let totalSynced = 0;
  for (const calItem of calList.items ?? []) {
    if (!calItem.id) continue;
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const eventsRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calItem.id)}/events?maxResults=100&singleEvents=true&orderBy=startTime&timeMin=${timeMin}&timeMax=${timeMax}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const eventsData = await eventsRes.json() as { items?: Array<{
      id?: string; summary?: string; description?: string; location?: string;
      start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
      htmlLink?: string; status?: string;
    }>; error?: { message?: string } };
    if (eventsData.error) continue;
    for (const ev of eventsData.items ?? []) {
      if (!ev.id || !ev.summary) continue;
      const start = ev.start?.dateTime ?? ev.start?.date ?? "";
      const end = ev.end?.dateTime ?? ev.end?.date ?? "";
      const allDay = !!ev.start?.date;
      await pool.query(
        `INSERT INTO external_events (calendar_id, external_id, title, description, location, "start", "end", all_day, status, html_link)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (calendar_id, external_id) DO UPDATE SET
          title = EXCLUDED.title, description = EXCLUDED.description, location = EXCLUDED.location,
          "start" = EXCLUDED."start", "end" = EXCLUDED."end", status = EXCLUDED.status,
          html_link = EXCLUDED.html_link, synced_at = now()`,
        [cal.id, ev.id, ev.summary, ev.description ?? "", ev.location ?? "", start, end, allDay, ev.status ?? "confirmed", ev.htmlLink ?? null]
      );
      totalSynced++;
    }
  }
  return totalSynced;
}

// ──────────────────────────────────────────
// Yandex CalDAV sync
// ──────────────────────────────────────────

async function syncYandexCalendar(cal: ExternalCalendarRow): Promise<number> {
  const url = cal.caldav_url;
  const username = cal.caldav_username;
  const password = cal.caldav_password;
  if (!url || !username || !password) throw new Error("Yandex CalDAV requires caldav_url, caldav_username, caldav_password");
  // Basic CalDAV PROPFIND for calendar list
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  const propfindBody = `<?xml version="1.0" encoding="utf-8"?>
  <d:propfind xmlns:d="DAV:">
    <d:prop><d:resourcetype/></d:prop>
  </d:propfind>`;
  const calRes = await fetch(url, {
    method: "PROPFIND",
    headers: { Authorization: authHeader, "Content-Type": "application/xml", Depth: "1" },
    body: propfindBody,
  });
  if (!calRes.ok) throw new Error(`CalDAV request failed: ${calRes.status}`);
  const calXml = await calRes.text();
  // Extract calendar URLs from response
  const calUrlMatches = calXml.match(/<d:href>([^<]+)<\/d:href>/g) ?? [];
  const calUrls = calUrlMatches.map(m => m.replace(/<\/?d:href>/g, ""));
  let totalSynced = 0;
  for (const calUrl of calUrls) {
    if (!calUrl.endsWith("/")) continue;
    // Fetch events from this calendar
    const eventRes = await fetch(calUrl, {
      method: "REPORT",
      headers: { Authorization: authHeader, "Content-Type": "application/xml", Depth: "1" },
      body: `<?xml version="1.0" encoding="utf-8"?>
      <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:prop><d:getetag/><c:calendar-data/></d:prop>
        <c:filter><c:comp-filter name="VCALENDAR"/></c:filter>
      </c:calendar-query>`,
    });
    if (!eventRes.ok) continue;
    const eventXml = await eventRes.text();
    const icsBlocks = eventXml.match(/BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/g) ?? [];
    for (const icsBlock of icsBlocks) {
      const events = parseIcsEvents(icsBlock);
      for (const ev of events) {
        await pool.query(
          `INSERT INTO external_events (calendar_id, external_id, title, description, location, "start", "end", all_day, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')
           ON CONFLICT (calendar_id, external_id) DO UPDATE SET
            title = EXCLUDED.title, description = EXCLUDED.description, location = EXCLUDED.location,
            "start" = EXCLUDED."start", "end" = EXCLUDED."end", synced_at = now()`,
          [cal.id, ev.uid, ev.summary, ev.description, ev.location, ev.start, ev.end, ev.allDay]
        );
        totalSynced++;
      }
    }
  }
  return totalSynced;
}

// ──────────────────────────────────────────
// ICS URL sync (simple public calendar links)
// ──────────────────────────────────────────

async function syncIcsUrlCalendar(cal: ExternalCalendarRow): Promise<number> {
  if (!cal.caldav_url) throw new Error("no ICS URL configured");
  const response = await fetch(cal.caldav_url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const ics = await response.text();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const events = parseIcsEvents(ics, now, windowEnd);
  for (const event of events) {
    await pool.query(
      `INSERT INTO external_events (calendar_id, external_id, title, description, location, "start", "end", all_day, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')
       ON CONFLICT (calendar_id, external_id) DO UPDATE SET
        title = EXCLUDED.title, description = EXCLUDED.description, location = EXCLUDED.location,
        "start" = EXCLUDED."start", "end" = EXCLUDED."end", synced_at = now()`,
      [cal.id, event.uid, event.summary, event.description, event.location, event.start, event.end, event.allDay]
    );
  }
  await pool.query(
    `DELETE FROM external_events WHERE calendar_id = $1 AND "end" < $2`,
    [cal.id, now.toISOString()]
  );
  return events.length;
}

// ──────────────────────────────────────────
// Unified sync endpoint
// ──────────────────────────────────────────

calendarsRouter.post("/sync/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { id } = req.params;
  try {
    const { rows: calendars } = await pool.query<ExternalCalendarRow>(
      "SELECT * FROM external_calendars WHERE id = $1",
      [id]
    );
    if (calendars.length === 0) return res.status(404).json({ error: "calendar not found" });
    const cal = calendars[0];
    let synced = 0;
    if (cal.provider === "google") {
      synced = await syncGoogleCalendar(cal);
    } else if (cal.provider === "yandex") {
      synced = await syncYandexCalendar(cal);
    } else if (cal.provider === "ics") {
      synced = await syncIcsUrlCalendar(cal);
    } else {
      return res.status(400).json({ error: `unknown provider: ${cal.provider}` });
    }
    await pool.query(
      "UPDATE external_calendars SET last_sync_at = now() WHERE id = $1",
      [id]
    );
    res.json({ ok: true, synced });
  } catch (err) {
    console.error("[calendars] sync error for", id, ":", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ──────────────────────────────────────────
// Yandex connect (stores credentials, syncs later)
// ──────────────────────────────────────────

calendarsRouter.post("/yandex/connect", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { display_name, caldav_url, caldav_username, caldav_password } = req.body;
  if (!display_name || !caldav_url || !caldav_username || !caldav_password) {
    return res.status(400).json({ error: "display_name, caldav_url, caldav_username, caldav_password required" });
  }
  try {
    const { rows } = await pool.query<ExternalCalendarRow>(
      `INSERT INTO external_calendars (provider, display_name, caldav_url, caldav_username, caldav_password)
       VALUES ('yandex', $1, $2, $3, $4)
       RETURNING id, provider, display_name, email, last_sync_at, sync_enabled, created_at`,
      [display_name, caldav_url, caldav_username, caldav_password]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ──────────────────────────────────────────
// Settings
// ──────────────────────────────────────────

calendarsRouter.get("/settings", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  try {
    const { rows } = await pool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM settings WHERE key LIKE 'calendar_%'"
    );
    const settings: Record<string, unknown> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

calendarsRouter.post("/settings", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "database unavailable" });
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "key required" });
  try {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = $2::jsonb",
      [key, JSON.stringify(value)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
