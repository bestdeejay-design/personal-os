import { Router } from "express";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const voiceRouter = Router();

/* POST /speak — заглушка TTS (реальный синтез — в браузере) */
voiceRouter.post("/speak", async (req, res) => {
  const { text } = (req.body ?? {}) as { text?: string };
  if (!text || typeof text !== "string" || text.length === 0) {
    return res.status(400).json({ error: "text required" });
  }
  res.json({ ok: true, text });
});

/* POST /transcribe — серверная STT (опционально, 501 если не настроено) */
export async function handleTranscribe(
  req: import("express").Request,
  res: import("express").Response
): Promise<void> {
  const whisperBin = process.env.WHISPER_BIN;
  if (!whisperBin) {
    res.status(501).json({
      error: "server-side STT not configured; use browser Web Speech API",
    });
    return;
  }

  let tmpFile = "";
  try {
    const audioBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body ?? ""));
    if (audioBuffer.length === 0) {
      res.status(400).json({ error: "empty audio body" });
      return;
    }

    tmpFile = join(tmpdir(), `stt-${randomUUID()}.wav`);
    await writeFile(tmpFile, audioBuffer);

    const output = execSync(
      `"${whisperBin}" "${tmpFile}" --output-format txt`,
      { encoding: "utf-8", timeout: 30000 }
    );

    const text = output.replace(tmpFile, "").trim();
    res.json({ text });
  } catch (err) {
    console.error("[voice] whisper failed:", (err as Error).message);
    res.status(501).json({
      error: "server-side STT failed; use browser Web Speech API",
    });
  } finally {
    if (tmpFile) {
      unlink(tmpFile).catch(() => {
        // временный файл мог не создаться
      });
    }
  }
}

voiceRouter.post("/transcribe", handleTranscribe);
