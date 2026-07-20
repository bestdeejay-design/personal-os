import type { Task } from "../types";
import { useProfiles } from "../ProfilesContext";
import { PriorityBadge } from "./PriorityBadge";

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TaskCard({
  task,
  onDragStart,
  onEdit,
}: {
  task: Task;
  onDragStart: (id: string) => void;
  onEdit?: (task: Task) => void;
}): JSX.Element {
  const { colorOf, nameOf } = useProfiles();
  return (
    <div
      className="task-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
    >
      <h4>{task.title}</h4>
      <div className="meta">
        <PriorityBadge priority={task.priority} />
        {task.due_date ? <span>📅 {formatDate(task.due_date)}</span> : null}
        {task.assignee ? <span>👤 {task.assignee}</span> : null}
      </div>
      {task.profile_ids.length > 0 ? (
        <div className="meta">
          {task.profile_ids.map((id) => (
            <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
              <span className="swatch" style={{ background: colorOf(id) }} />
              {nameOf(id)}
            </span>
          ))}
        </div>
      ) : null}
      {onEdit ? (
        <div className="meta">
          <button type="button" className="btn ghost" onClick={() => onEdit(task)}>
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}
