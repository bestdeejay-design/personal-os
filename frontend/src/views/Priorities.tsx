import { useEffect, useMemo, useState } from "react";
import type { Priority, Profile, Task } from "../types";
import { getPriorities, getProfiles, reorderPriorities } from "../api";
import { useData } from "../useData";
import { PriorityBadge } from "../components/PriorityBadge";
import "./Priorities.css";

const PRIO_FACTOR: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 5,
};

function formatDue(due: string | null | undefined): string {
  if (!due) return "—";
  return due.slice(0, 10);
}

export function Priorities({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const { data, loading, error } = useData<Task[]>(
    () => getPriorities(activeProfiles),
    [activeProfiles.join(",")],
  );

  // Local ordered list — allows optimistic reorder before the server confirms.
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    setTasks(data ?? []);
  }, [data]);

  // Profiles fetched once to map profile_ids → name/color for chips.
  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    let cancelled = false;
    getProfiles()
      .then((p) => {
        if (!cancelled) setProfiles(p);
      })
      .catch(() => {
        /* chips simply fall back to neutral color */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  /* ---------- drag-and-drop handlers (mirrors Notes.tsx) ---------- */
  const handleDragStart = (e: React.DragEvent, taskId: string): void => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, idx: number): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };

  const handleDragLeave = (): void => {
    setDragOverIdx(null);
  };

  const handleDragEnd = (): void => {
    setDraggingId(null);
    setDragOverIdx(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIdx: number): Promise<void> => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setDragOverIdx(null);
    if (!draggedId) return;

    const ids = tasks.map((t) => t.id);
    const fromIdx = ids.indexOf(draggedId);
    if (fromIdx === -1 || fromIdx === targetIdx) return;

    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    const adjustedTarget = fromIdx < targetIdx ? targetIdx - 1 : targetIdx;
    reordered.splice(adjustedTarget, 0, draggedId);

    if (reordered.every((id, i) => id === ids[i])) return;

    // Optimistic reorder of local state for instant feedback.
    const prev = tasks;
    const newTasks = reordered
      .map((id) => prev.find((t) => t.id === id))
      .filter((t): t is Task => Boolean(t));
    setTasks(newTasks);

    try {
      const res = await reorderPriorities(reordered);
      if (!res.ok) throw new Error("Сервер отклонил сохранение порядка");
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 1600);
    } catch (err) {
      // Revert on failure.
      setTasks(prev);
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Не удалось сохранить порядок: ${message}`);
    }
  };

  return (
    <div className="view">
      <div className="section-head">
        <h2>Priorities</h2>
        <span className="prio-hint muted">
          Перетащите строку за&nbsp;≡&nbsp;для изменения приоритета
        </span>
        {savedHint ? <span className="prio-saved">сохранено</span> : null}
      </div>

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : error ? (
        <div className="empty">
          <span className="emoji">⚠️</span>
          <p>Не удалось загрузить приоритеты</p>
          <p>{error}</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty">
          <span className="emoji">📭</span>
          <p>Нет задач для приоритизации</p>
        </div>
      ) : (
        <ul className="prio-list">
          {tasks.map((t, idx) => (
            <li
              key={t.id}
              className={
                "prio-row" +
                (draggingId === t.id ? " dragging" : "") +
                (dragOverIdx === idx ? " drag-over" : "")
              }
              draggable
              onDragStart={(e) => handleDragStart(e, t.id)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
            >
              <span className="prio-handle" aria-hidden="true">
                ≡
              </span>
              <span className="prio-title">{t.title}</span>
              <PriorityBadge priority={t.priority} />
              <span className="prio-weight" title="Вес задачи">
                {t.weight}
              </span>
              <span className="prio-chips">
                {t.profile_ids.length === 0 ? (
                  <span className="muted prio-no-profile">—</span>
                ) : (
                  t.profile_ids.map((pid) => {
                    const p = profileById.get(pid);
                    const color = p?.color ?? "#888888";
                    const name = p?.name ?? pid;
                    return (
                      <span
                        key={pid}
                        className="prio-chip"
                        style={{ "--chip-color": color } as React.CSSProperties}
                        title={name}
                      >
                        <span className="prio-dot" />
                        {name}
                      </span>
                    );
                  })
                )}
              </span>
              <span className="prio-due" title="Срок">
                {formatDue(t.due_date)}
              </span>
              <span className="prio-score muted" title="Вес × фактор приоритета">
                {t.weight * PRIO_FACTOR[t.priority]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
