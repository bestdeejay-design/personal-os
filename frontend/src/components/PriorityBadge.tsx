import type { Priority } from "../types";

const PRIO_VAR: Record<Priority, string> = {
  low: "var(--prio-low)",
  medium: "var(--prio-medium)",
  high: "var(--prio-high)",
  critical: "var(--prio-critical)",
};

export function PriorityBadge({ priority }: { priority: Priority }): JSX.Element {
  return (
    <span className="prio" style={{ background: PRIO_VAR[priority] }}>
      {priority}
    </span>
  );
}
