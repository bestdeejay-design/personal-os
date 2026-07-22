import { useState } from "react";
import type { Project, Note, Task, Meeting, FileMeta } from "../types";
import { getProjects, createProject, updateProject, deleteProject, getProjectItems } from "../api";
import { useData } from "../useData";
import { EmptyState } from "../components/EmptyState";
import { useLocale } from "../locales";
import { AlertTriangle, Folder, Plus, Edit3, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";

interface ProjectItems {
  notes: Note[];
  tasks: Task[];
  meetings: Meeting[];
  files: FileMeta[];
}

function ProjectForm({
  initial,
  onSave,
  onCancel,
  t,
}: {
  initial?: Partial<Project>;
  onSave: (p: { name: string; desc_md: string; profile_ids: string[]; status: string; goal?: string | null }) => void;
  onCancel: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [descMd, setDescMd] = useState(initial?.desc_md ?? "");
  const [status, setStatus] = useState(initial?.status ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const canSave = name.trim().length > 0;

  return (
    <div className="field-group">
      <div className="field">
        <label>{t("projects.fieldName")}</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("projects.placeholderName")} />
      </div>
      <div className="field">
        <label>{t("projects.fieldDesc")}</label>
        <textarea value={descMd} onChange={(e) => setDescMd(e.target.value)} rows={3} placeholder={t("projects.placeholderDesc")} />
      </div>
      <div className="field">
        <label>{t("projects.fieldStatus")}</label>
        <input type="text" value={status} onChange={(e) => setStatus(e.target.value)} placeholder={t("projects.placeholderStatus")} />
      </div>
      <div className="field">
        <label>{t("projects.fieldGoal")}</label>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder={t("projects.placeholderGoal")} />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="btn" disabled={!canSave} onClick={() => onSave({ name: name.trim(), desc_md: descMd, profile_ids: initial?.profile_ids ?? [], status, goal: goal || null })}>
          {initial?.id ? t("common.save") : t("projects.new")}
        </button>
      </div>
    </div>
  );
}

export function Projects({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const { data: projects, loading, error, reload } = useData<Project[]>(() => getProjects(), []);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, ProjectItems>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { t } = useLocale();

  const list = (projects ?? []).filter((p) => {
    if (activeProfiles.length === 0) return true;
    return p.profile_ids.some((pid) => activeProfiles.includes(pid));
  });

  const handleCreate = async (input: { name: string; desc_md: string; profile_ids: string[]; status: string; goal?: string | null }) => {
    await createProject({ ...input, profile_ids: input.profile_ids.length > 0 ? input.profile_ids : activeProfiles });
    setShowForm(false);
    reload();
  };

  const handleUpdate = async (input: { name: string; desc_md: string; profile_ids: string[]; status: string; goal?: string | null }) => {
    if (!editId) return;
    await updateProject(editId, input);
    setEditId(null);
    reload();
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setConfirmDelete(null);
    setExpandedId((prev) => (prev === id ? null : prev));
    reload();
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!items[id]) {
      setLoadingItems((prev) => ({ ...prev, [id]: true }));
      getProjectItems(id).then((result) => {
        setItems((prev) => ({ ...prev, [id]: result }));
      }).finally(() => {
        setLoadingItems((prev) => ({ ...prev, [id]: false }));
      });
    }
  };

  const editing = editId ? list.find((p) => p.id === editId) ?? null : null;

  return (
    <div>
      <div className="section-head">
        <h2>{t("nav.item.projects")}</h2>
        <button type="button" className="btn" onClick={() => { setEditId(null); setShowForm(true); }}>
          <Plus size={14} /> {t("projects.new")}
        </button>
      </div>
      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <ProjectForm t={t} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}
      {editId && editing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>{t("common.edit")}: {editing.name}</strong>
            <button type="button" className="icon-btn" onClick={() => setEditId(null)}><X size={14} /></button>
          </div>
          <ProjectForm t={t} initial={editing} onSave={handleUpdate} onCancel={() => setEditId(null)} />
        </div>
      )}
      {loading ? (
        <div className="spinner">{t("common.loading")}</div>
      ) : error ? (
        <EmptyState icon={<AlertTriangle size={32} />} title={t("projects.errorLoad")} hint={error} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Folder size={32} />} title={t("projects.emptyTitle")} hint={t("projects.emptyHint")} />
      ) : (
        <div className="list">
          {list.map((p) => (
            <div key={p.id}>
              <div className="card" style={{ cursor: "pointer" }} onClick={() => toggleExpand(p.id)}>
                <div className="row between">
                  <div>
                    <strong>{p.name}</strong>
                    {p.status ? <span className="badge" style={{ marginLeft: 8 }}>{p.status}</span> : null}
                  </div>
                  <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="icon-btn" onClick={() => { setShowForm(false); setEditId(p.id); }} title={t("common.edit")}>
                      <Edit3 size={14} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => setConfirmDelete(p.id)} title={t("common.delete")} style={{ color: "var(--danger)" }}>
                      <Trash2 size={14} />
                    </button>
                    {expandedId === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {p.desc_md ? <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{p.desc_md}</div> : null}
                <div className="meta">
                  {p.goal ? <span>{t("projects.fieldGoal")}: {p.goal}</span> : null}
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                  {p.profile_ids.length > 0 ? <span>{p.profile_ids.length} profile{p.profile_ids.length !== 1 ? "s" : ""}</span> : null}
                </div>
              </div>
              {expandedId === p.id && (() => {
                const pi = items[p.id];
                return (
                  <div className="project-items">
                    {loadingItems[p.id] ? <div className="spinner">{t("common.loading")}…</div>
                    : pi ? (<>
                      <div className="project-items-section">
                        <strong>{t("projects.sectionNotes")} ({pi.notes.length})</strong>
                        {pi.notes.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>{t("projects.emptyNotes")}</div>
                        : pi.notes.map((n) => <div key={n.id} className="project-item-row">{n.title}</div>)}
                      </div>
                      <div className="project-items-section">
                        <strong>{t("projects.sectionTasks")} ({pi.tasks.length})</strong>
                        {pi.tasks.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>{t("projects.emptyTasks")}</div>
                        : pi.tasks.map((t) => <div key={t.id} className="project-item-row"><span className={`prio prio-${t.priority}`} style={{ marginRight: 6, fontSize: 10 }}>{t.priority}</span>{t.title}</div>)}
                      </div>
                      <div className="project-items-section">
                        <strong>{t("projects.sectionMeetings")} ({pi.meetings.length})</strong>
                        {pi.meetings.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>{t("projects.emptyMeetings")}</div>
                        : pi.meetings.map((m) => <div key={m.id} className="project-item-row">{m.title} — {new Date(m.start).toLocaleDateString()}</div>)}
                      </div>
                      <div className="project-items-section">
                        <strong>{t("projects.sectionFiles")} ({pi.files.length})</strong>
                        {pi.files.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>{t("projects.emptyFiles")}</div>
                        : pi.files.map((f) => <div key={f.id} className="project-item-row">{f.filename}</div>)}
                      </div>
                    </>) : null}
                  </div>
                );
              })()}
              {confirmDelete === p.id && (
                <div className="card" style={{ marginTop: 6, borderLeft: "3px solid var(--danger)" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13 }}>{t("projects.confirmDelete", { name: p.name })}</p>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn danger" onClick={() => handleDelete(p.id)}>{t("common.delete")}</button>
                    <button type="button" className="btn secondary" onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
