import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}): JSX.Element {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <p>
        <strong>{title}</strong>
      </p>
      <p>{hint}</p>
    </div>
  );
}
