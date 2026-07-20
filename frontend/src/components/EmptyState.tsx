export function EmptyState({
  emoji,
  title,
  hint,
}: {
  emoji: string;
  title: string;
  hint: string;
}): JSX.Element {
  return (
    <div className="empty">
      <span className="emoji">{emoji}</span>
      <p>
        <strong>{title}</strong>
      </p>
      <p>{hint}</p>
    </div>
  );
}
