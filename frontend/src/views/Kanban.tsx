import { useState } from "react";
import type { Priority, Profile, Project, Task, TaskStatus } from "../types";
import { createTask, getProjects, getTasks, updateTask } from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { ProfileChips } from "../components/ProfileChips";
import { TaskCard } from "../components/TaskCard";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { PriorityBadge } from "../components/PriorityBadge";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

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
};

export function Kanban({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const { profiles } = useProfiles();

  const { data, loading, error, reload } = useData<Task[]>(
    () => getTasks({ profile: activeProfiles }),
    [activeProfiles.join(",")],
  );
  const projectsState = useData<Project[]>(() => getProjects(), []);

  const tasks = data ?? [];

  const onDrop = async (status: TaskStatus): Promise<void> => {
    setDragOver(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    await updateTask(id, { status });
    reload();
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
      profile_ids: task.profile_ids,
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
        <h2>Kanban</h2>
        <button type="button" className="btn" onClick={openCreate}>
          + New task
        </button>
      </div>

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : error ? (
        <EmptyState emoji="⚠️" title="Could not load tasks" hint={error} />
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className={"column" + (dragOver === col.status ? " drag-over" : "")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.status);
                }}
                onDragLeave={() => setDragOver((s) => (s === col.status ? null : s))}
                onDrop={() => void onDrop(col.status)}
              >
                <h3>
                  {col.label} ({colTasks.length})
                </h3>
                {colTasks.length === 0 ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Drop tasks here
                  </span>
                ) : (
                  colTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onDragStart={setDraggingId}
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
      title={form.id ? "Edit task" : "New task"}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Title</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Description (Markdown)</label>
        <textarea
          rows={4}
          value={form.desc_md}
          onChange={(e) => onChange({ ...form, desc_md: e.target.value })}
        />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Priority</label>
          <select
            value={form.priority}
            onChange={(e) => onChange({ ...form, priority: e.target.value as Priority })}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Weight</label>
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
          <label>Assignee</label>
          <input
            type="text"
            value={form.assignee}
            onChange={(e) => onChange({ ...form, assignee: e.target.value })}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Due date</label>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => onChange({ ...form, due_date: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Project</label>
        <select
          value={form.project_id}
          onChange={(e) => onChange({ ...form, project_id: e.target.value })}
        >
          <option value="">— none —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Profiles</label>
        <ProfileChips
          profiles={profiles}
          selected={form.profile_ids}
          onToggle={toggleProfile}
        />
      </div>
      <div className="meta">
        <PriorityBadge priority={form.priority} />
      </div>
    </Modal>
  );
}
