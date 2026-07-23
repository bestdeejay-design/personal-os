import type { Task, Project } from "../types";
import { useProfiles, isUnsorted } from "../ProfilesContext";
import { PriorityBadge } from "./PriorityBadge";
import { Calendar, User } from "lucide-react";
import { useLocale } from "../locales";
import { formatDate } from "../format";

export function TaskCard({
  task,
  projects,
  isDragging,
  onDragStart,
  onEdit,
}: {
  task: Task;
  projects: Project[];
  isDragging?: boolean;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onEdit?: (task: Task) => void;
}): JSX.Element {
  const { t } = useLocale();
  const { colorOf, nameOf } = useProfiles();

  const project = task.project_id ? projects.find((p) => p.id === task.project_id) : null;

  return (
    <div
      className={"task-card" + (isDragging ? " dragging" : "")}
      onPointerDown={(e) => onDragStart(task.id, e)}
    >
      <h4>{task.title}</h4>
      <div className="meta">
        <PriorityBadge priority={task.priority} />
        {task.due_date ? <span><Calendar size={14} /> {formatDate(task.due_date)}</span> : null}
        {task.assignee ? <span><User size={14} /> {task.assignee}</span> : null}
      </div>
      <div className="meta">
        {project ? (
          <span className="badge" style={{ background: "transparent", color: "var(--accent)" }}>
            <span className="swatch" style={{ background: "var(--accent)" }} />
            {project.name}
          </span>
        ) : null}
        {isUnsorted(task.profile_ids) ? (
          <span className="badge unsorted-badge">{t("common.unsorted")}</span>
        ) : (
          task.profile_ids.map((id) => (
            <span key={id} className="badge" style={{ background: "transparent", color: colorOf(id) }}>
              <span className="swatch" style={{ background: colorOf(id) }} />
              {nameOf(id)}
            </span>
          ))
        )}
      </div>
      {Array.isArray(task.tags) && task.tags.length > 0 ? (
        <div className="meta" style={{ gap: 4 }}>
          {task.tags.map((tag) => (
            <span key={tag} className="badge" style={{ background: "var(--accent)", color: "var(--bg)", fontSize: 11 }}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {onEdit ? (
        <div className="meta">
          <button type="button" className="btn ghost" onClick={() => onEdit(task)}>
            {t("common.edit")}
          </button>
        </div>
      ) : null}
    </div>
  );
}