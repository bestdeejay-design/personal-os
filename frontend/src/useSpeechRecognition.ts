import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechRecognitionState {
  isListening: boolean;
  transcript: string;
  error: string | null;
  supported: boolean;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionAPI(): unknown {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, unknown>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeechRecognition(): SpeechRecognitionState {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void; abort: () => void } | null>(
    null,
  );

  const api = getSpeechRecognitionAPI();
  const supported = typeof api === "function";

  useEffect(() => {
    if (!supported) return;

    const Recognition = api as new () => {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((event: Record<string, unknown>) => void) | null;
      onerror: ((event: Record<string, unknown>) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
      abort: () => void;
    };

    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: Record<string, unknown>): void => {
      const results = event.results as
        | { item: (i: number) => { item: (j: number) => { transcript: string } | undefined } | undefined; length: number }
        | undefined;
      if (!results) return;
      let final = "";
      for (let i = 0; i < results.length; i++) {
        const alt = results.item(i);
        if (!alt) continue;
        const word = alt.item(0);
        if (word && word.transcript) final += word.transcript;
      }
      setTranscript(final);
    };

    recognition.onerror = (event: Record<string, unknown>): void => {
      setError(typeof event.error === "string" ? event.error : "Unknown error");
      setIsListening(false);
    };

    recognition.onend = (): void => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [supported, api]);

  const start = useCallback((): void => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setTranscript("");
    setError(null);
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      // already started
    }
  }, []);

  const stop = useCallback((): void => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.stop();
    setIsListening(false);
  }, []);

  return { isListening, transcript, error, supported, start, stop };
}
