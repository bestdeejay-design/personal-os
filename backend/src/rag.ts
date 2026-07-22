import { Ollama } from "ollama";

// Адаптировано из voice-assistant/src/embed.ts, store.ts, rag.ts.
// Используется Ollama npm-клиент (fetch к OLLAMA_HOST /api/embeddings и /api/generate).

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text";
const GEN_MODEL = process.env.GEN_MODEL ?? "qwen2.5:7b";

const ollama = new Ollama({ host: OLLAMA_HOST });

/** Векторизует текст через Ollama embeddings. Бросает ошибку, если Ollama недоступна. */
export async function embedText(text: string): Promise<number[]> {
  const res = await ollama.embeddings({ model: EMBED_MODEL, prompt: text });
  return res.embedding;
}

/** Косинусное сходство двух векторов (из store.ts). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// Fallback-цепочка генерации: сначала заданная модель, затем запасные.
// Первая доступная отвечает; при ошибке — следующая.
const GEN_FALLBACK: readonly string[] = GEN_MODEL
  ? [GEN_MODEL]
  : ["qwen2.5:7b", "deepseek-r1", "yi-coder"];

export interface GenerationResult {
  text: string;
}

/** Генерирует текст через Ollama с fallback-цепочкой моделей. */
export async function generate(prompt: string): Promise<string> {
  let text = "";
  for (const model of GEN_FALLBACK) {
    try {
      const r = await ollama.generate({ model, prompt, stream: false });
      text = r.response.trim();
      if (text) break;
    } catch {
      // модель недоступна — пробуем следующую в цепочке
    }
  }
  return text;
}
