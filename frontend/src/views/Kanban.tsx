import { useMemo, useRef, useState } from "react";
import type { Priority, Profile, Project, Recurrence, Task, TaskStatus } from "../types";
import { createTask, getProjects, getTasks, updateTask } from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { ProfileChips } from "../components/ProfileChips";
import { TaskCard } from "../components/TaskCard";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { PriorityBadge } from "../components/PriorityBadge";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "../locales";

type RecurrenceRule = Exclude<Recurrence, null>;

function RecurrenceControl({
  value,
  onChange,
}: {
  value: RecurrenceRule;
  onChange: (r: RecurrenceRule) => void;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="row">
      <div className="field" style={{ flex: 1 }}>
        <label>{t("kanban.recurrenceInterval")}</label>
        <input
          type="number"
          min={1}
          value={value.interval ?? 1}
          onChange={(e) => onChange({ ...value, interval: Number(e.target.value) || 1 })}
        />
      </div>
      <div className="field" style={{ flex: 1 }}>
        <label>{t("kanban.recurrenceUntil")}</label>
        <input
          type="date"
          value={value.until ? value.until.slice(0, 10) : ""}
          onChange={(e) => onChange({ ...value, until: e.target.value || null })}
        />
      </div>
    </div>
  );
}

interface TaskFormState {
  id?: string;
  title: string;
  desc_md: string;
  priority: Priority;
  weight: number;
  assignee: string;
  due_date: string;
  project_id: string;
  profile_ids: string[];
  recurrence: Recurrence;
  _invalidCount: number;
}

const EMPTY_FORM: TaskFormState = {
  title: "",
  desc_md: "",
  priority: "medium",
  weight: 1,
  assignee: "",
  due_date: "",
  project_id: "",
  profile_ids: [],
  recurrence: null,
  _invalidCount: 0,
};

export function Kanban({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const { t } = useLocale();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const { profiles } = useProfiles();
  const validProfileIds = useMemo(() => new Set(profiles.map((p) => p.id)), [profiles]);
  const ghostRef = useRef<HTMLElement | null>(null);

  const colBacklog = (typeof window !== "undefined" ? window.localStorage.getItem("personalos_kanban_col_backlog") : null) || t("kanban.columnBacklog");
  const colInProgress = (typeof window !== "undefined" ? window.localStorage.getItem("personalos_kanban_col_in_progress") : null) || t("kanban.columnInProgress");
  const colDone = (typeof window !== "undefined" ? window.localStorage.getItem("personalos_kanban_col_done") : null) || t("kanban.columnDone");

  const COLUMNS: { status: TaskStatus; label: string }[] = [
    { status: "backlog", label: colBacklog },
    { status: "in_progress", label: colInProgress },
    { status: "done", label: colDone },
  ];

  const { data, loading, error, reload } = useData<Task[]>(
    () => getTasks({ profile: activeProfiles }),
    [activeProfiles.join(",")],
  );
  const projectsState = useData<Project[]>(() => getProjects(), []);

  const tasks = data ?? [];

  const handlePointerDown = (taskId: string, e: React.PointerEvent): void => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, textarea, select")) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setDraggingId(taskId);

    const cardEl = e.currentTarget as HTMLElement;
    const rect = cardEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const ghost = cardEl.cloneNode(true) as HTMLElement;
    ghost.style.position = "fixed";
    ghost.style.left = `${e.clientX - offsetX}px`;
    ghost.style.top = `${e.clientY - offsetY}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    ghost.style.opacity = "0.92";
    ghost.style.transform = "rotate(3deg) scale(1.04)";
    ghost.style.boxShadow = "0 12px 40px rgba(0,0,0,0.25)";
    ghost.style.transition = "none";
    ghost.style.cursor = "grabbing";
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    const ptrId = e.pointerId;
    const lastCol = { current: null as TaskStatus | null };

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== ptrId) return;
      const g = ghostRef.current;
      if (g) {
        g.style.left = `${ev.clientX - offsetX}px`;
        g.style.top = `${ev.clientY - offsetY}px`;
      }
      const cols = document.querySelectorAll<HTMLElement>(".kanban .column");
      let found: TaskStatus | null = null;
      cols.forEach((col) => {
        const r = col.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          found = col.dataset.status as TaskStatus;
        }
      });
      lastCol.current = found;
      setDragOver(found);
    };

    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId !== ptrId) return;
      if (ghostRef.current && ghostRef.current.parentNode) {
        ghostRef.current.parentNode.removeChild(ghostRef.current);
      }
      ghostRef.current = null;

      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      const targetStatus = lastCol.current;
      setDraggingId(null);
      setDragOver(null);

      if (targetStatus && task.status !== targetStatus) {
        updateTask(taskId, { status: targetStatus }).then(() => reload());
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const openCreate = (): void => setForm({ ...EMPTY_FORM });
  const openEdit = (task: Task): void =>
    setForm({
      id: task.id,
      title: task.title,
      desc_md: task.desc_md,
      priority: task.priority,
      weight: task.weight,
      assignee: task.assignee,
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
      project_id: task.project_id ?? "",
      profile_ids: task.profile_ids.filter((id) => validProfileIds.has(id)),
      recurrence: task.recurrence ?? null,
      _invalidCount: task.profile_ids.length - task.profile_ids.filter((id) => validProfileIds.has(id)).length,
    });

  const submit = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        desc_md: form.desc_md,
        priority: form.priority,
        weight: form.weight,
        assignee: form.assignee,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        project_id: form.project_id || null,
        profile_ids: form.profile_ids,
        recurrence: form.recurrence,
      };
      if (form.id) {
        await updateTask(form.id, payload);
      } else {
        await createTask(payload);
      }
      setForm(null);
      reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="section-head">
        <h2>{t("kanban.title")}</h2>
        <button type="button" className="btn" onClick={openCreate}>
          + {t("kanban.new")}
        </button>
      </div>

      {loading ? (
        <div className="spinner">{t("common.loading")}</div>
      ) : error ? (
        <EmptyState icon={<AlertTriangle size={32} />} title={t("kanban.errorLoad")} hint={error} />
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className={"column" + (dragOver === col.status ? " drag-over" : "")}
                data-status={col.status}
              >
                <h3>
                  {col.label} ({colTasks.length})
                </h3>
                {colTasks.length === 0 ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {t("kanban.dropHint")}
                  </span>
                ) : (
                  colTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      projects={projectsState.data ?? []}
                      isDragging={draggingId === t.id}
                      onDragStart={handlePointerDown}
                      onEdit={openEdit}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {form ? (
        <TaskModal
          form={form}
          profiles={profiles}
          projects={projectsState.data ?? []}
          saving={saving}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSave={submit}
        />
      ) : null}
    </div>
  );
}

function TaskModal({
  form,
  profiles,
  projects,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  form: TaskFormState;
  profiles: Profile[];
  projects: Project[];
  saving: boolean;
  onChange: (f: TaskFormState) => void;
  onCancel: () => void;
  onSave: () => void;
}): JSX.Element {
  const { t } = useLocale();
  const toggleProfile = (id: string): void => {
    const has = form.profile_ids.includes(id);
    onChange({
      ...form,
      profile_ids: has
        ? form.profile_ids.filter((p) => p !== id)
        : [...form.profile_ids, id],
    });
  };

  return (
    <Modal
      title={form.id ? t("kanban.edit") : t("kanban.new")}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn" onClick={onSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="field">
        <label>{t("kanban.fieldTitle")}</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
        />
      </div>
      <div className="field">
        <label>{t("kanban.fieldDesc")}</label>
        <textarea
          rows={4}
          value={form.desc_md}
          onChange={(e) => onChange({ ...form, desc_md: e.target.value })}
        />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>{t("kanban.fieldPriority")}</label>
          <select
            value={form.priority}
            onChange={(e) => onChange({ ...form, priority: e.target.value as Priority })}
          >
            <option value="low">{t("kanban.priorityLow")}</option>
            <option value="medium">{t("kanban.priorityMedium")}</option>
            <option value="high">{t("kanban.priorityHigh")}</option>
            <option value="critical">{t("kanban.priorityCritical")}</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t("kanban.fieldWeight")}</label>
          <input
            type="number"
            value={form.weight}
            min={0}
            onChange={(e) => onChange({ ...form, weight: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>{t("kanban.fieldAssignee")}</label>
          <input
            type="text"
            value={form.assignee}
            onChange={(e) => onChange({ ...form, assignee: e.target.value })}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t("kanban.fieldDueDate")}</label>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => onChange({ ...form, due_date: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>{t("kanban.fieldProject")}</label>
        <select
          value={form.project_id}
          onChange={(e) => onChange({ ...form, project_id: e.target.value })}
        >
          <option value="">{t("common.none")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{t("kanban.fieldRecurrence")}</label>
        <select
          value={form.recurrence ? form.recurrence.freq : "none"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "none") {
              onChange({ ...form, recurrence: null });
              return;
            }
            const freq = v as "daily" | "weekly" | "monthly" | "yearly";
            const prev = form.recurrence ?? { freq, interval: 1, until: null };
            onChange({ ...form, recurrence: { ...prev, freq } });
          }}
        >
          <option value="none">{t("kanban.recurrenceNone")}</option>
          <option value="daily">{t("kanban.recurrenceDaily")}</option>
          <option value="weekly">{t("kanban.recurrenceWeekly")}</option>
          <option value="monthly">{t("kanban.recurrenceMonthly")}</option>
          <option value="yearly">{t("kanban.recurrenceYearly")}</option>
        </select>
      </div>
      {form.recurrence ? (
        <RecurrenceControl
          value={form.recurrence}
          onChange={(r) => onChange({ ...form, recurrence: r })}
        />
      ) : null}
      <div className="field">
        <label>{t("kanban.fieldProfiles")}</label>
        <ProfileChips
          profiles={profiles}
          selected={form.profile_ids}
          onToggle={toggleProfile}
        />
        {form._invalidCount > 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>
            {t("notes.profileInvalid", { count: String(form._invalidCount) })}
          </span>
        ) : form.profile_ids.length === 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>{t("notes.profileNone")}</span>
        ) : null}
      </div>
      <div className="meta">
        <PriorityBadge priority={form.priority} />
      </div>
    </Modal>
  );
}
