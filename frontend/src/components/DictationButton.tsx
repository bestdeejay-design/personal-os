import { useSpeechRecognition } from "../useSpeechRecognition";

export function DictationButton({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}): JSX.Element {
  const { isListening, transcript, supported, start, stop } = useSpeechRecognition();

  const toggle = (): void => {
    if (isListening) {
      stop();
      if (transcript) onTranscript(transcript);
    } else {
      start();
    }
  };

  if (!supported) {
    return (
      <button
        type="button"
        className="icon-btn dictation-btn"
        disabled
        title="Голосовой ввод не поддерживается в этом браузере"
        aria-label="Dictation not supported"
      >
        🎤
      </button>
    );
  }

  return (
    <button
      type="button"
      className={"icon-btn dictation-btn" + (isListening ? " listening" : "")}
      onClick={toggle}
      title={isListening ? "Остановить запись" : "Начать голосовой ввод"}
      aria-label={isListening ? "Stop dictation" : "Start dictation"}
    >
      {isListening ? "🔴" : "🎤"}
    </button>
  );
}
