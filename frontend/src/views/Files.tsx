import { useState, useRef } from "react";
import type { FileMeta, Project } from "../types";
import { getFiles, uploadFile, getProjects, updateFileMeta, deleteFileMeta } from "../api";
import { useData } from "../useData";
import { useProfiles } from "../ProfilesContext";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { AlertTriangle, Paperclip, Calendar, Upload, Edit3, Trash2 } from "lucide-react";
import { useLocale } from "../locales";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Files({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const { t } = useLocale();
  const { profiles } = useProfiles();
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [editFile, setEditFile] = useState<FileMeta | null>(null);
  const [editFilename, setEditFilename] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editProfileIds, setEditProfileIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data, loading, error, reload } = useData<FileMeta[]>(
    () => getFiles(activeProfiles.length > 0 ? activeProfiles : undefined),
    [activeProfiles.join(",")],
  );
  const projectsState = useData<Project[]>(() => getProjects(), []);
  const projects = projectsState.data ?? [];

  const handleFilePick = (): void => { fileInputRef.current?.click(); };
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setSelectedProjectId("");
    setSelectedProfileIds([]);
    setShowUpload(true);
    e.target.value = "";
  };

  const doUpload = async (): Promise<void> => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      await uploadFile(pendingFile, selectedProjectId ? "project" : undefined, selectedProjectId || undefined, selectedProfileIds.length > 0 ? selectedProfileIds : undefined);
      setShowUpload(false);
      setPendingFile(null);
      setSelectedProjectId("");
      setSelectedProfileIds([]);
      reload();
    } finally { setUploading(false); }
  };

  const toggleUploadProfile = (id: string): void => {
    setSelectedProfileIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const openEdit = (f: FileMeta): void => {
    setEditFile(f);
    setEditFilename(f.filename);
    setEditProjectId(f.owner_type === "project" && f.owner_id ? f.owner_id : "");
    setEditProfileIds(f.profile_ids ?? []);
  };

  const toggleEditProfile = (id: string): void => {
    setEditProfileIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const doEdit = async (): Promise<void> => {
    if (!editFile) return;
    setSaving(true);
    try {
      await updateFileMeta(editFile.id, {
        filename: editFilename.trim(),
        profile_ids: editProfileIds,
        owner_type: editProjectId ? "project" : undefined,
        owner_id: editProjectId || undefined,
      });
      setEditFile(null);
      reload();
    } finally { setSaving(false); }
  };

  const [confirmDeleteFile, setConfirmDeleteFile] = useState(false);
  const handleDeleteFile = async (): Promise<void> => {
    if (!editFile) return;
    await deleteFileMeta(editFile.id);
    setEditFile(null);
    setConfirmDeleteFile(false);
    reload();
  };

  const files = data ?? [];
  return (
    <div>
      <div className="section-head">
        <h2>{t("files.title")}</h2>
        <button type="button" className="btn" onClick={handleFilePick}><Upload size={14} /> {t("files.upload")}</button>
        <input ref={fileInputRef} type="file" onChange={handleFileSelected} style={{ display: "none" }} />
      </div>
      {loading ? (<div className="spinner">{t("common.loading")}</div>)
      : error ? (<EmptyState icon={<AlertTriangle size={32} />} title={t("files.errorLoad")} hint={error} />)
      : files.length === 0 ? (<EmptyState icon={<Paperclip size={32} />} title={t("files.emptyTitle")} hint={t("files.emptyHint")} />)
      : (<div className="list">{files.map((f) => (
          <div key={f.id} className="list-item">
            <div className="title">
              <Paperclip size={16} style={{ flexShrink: 0 }} /> {f.filename}
              <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
                <button type="button" className="icon-btn" onClick={() => openEdit(f)} title={t("common.edit")} aria-label={t("common.edit")} style={{ width: 28, height: 28 }}><Edit3 size={13} /></button>
                <a href={`/api/files/${f.id}/download`} className="btn ghost" download={f.filename}>{t("files.download")}</a>
              </div>
            </div>
            <div className="meta">
              <span>{formatSize(f.size)}</span><span>{f.mime}</span>
              <span><Calendar size={14} /> {new Date(f.uploaded_at).toLocaleDateString()}</span>
              {f.owner_type ? <span>{t("files.owner").replace("{type}", f.owner_type)}</span> : null}
            </div>
          </div>
      ))}</div>)}
      {showUpload && pendingFile ? (
        <Modal title={t("files.upload")} onClose={() => { if (!uploading) setShowUpload(false); }}>
          <div className="field"><label>{t("files.file")}</label><div className="card" style={{ padding: 10, fontSize: 13 }}><Paperclip size={14} style={{ marginRight: 6 }} /> {pendingFile.name}<span className="muted" style={{ marginLeft: 8 }}>({formatSize(pendingFile.size)})</span></div></div>
          <div className="field"><label>{t("notes.fieldProject")}</label><select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}><option value="">{t("common.none")}</option>{projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
          <div className="field"><label>{t("notes.fieldProfiles")}</label><div className="chips-row">{profiles.map((p) => (<button key={p.id} type="button" className={"chip" + (selectedProfileIds.includes(p.id) ? " active" : "")} style={{ ["--chip-color" as string]: p.color }} onClick={() => toggleUploadProfile(p.id)}><span className="swatch" style={{ background: p.color }} /> {p.name}</button>))}</div></div>
          <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setShowUpload(false)} disabled={uploading}>{t("common.cancel")}</button><button type="button" className="btn" onClick={() => void doUpload()} disabled={uploading}>{uploading ? t("files.uploading") : t("files.upload")}</button></div>
        </Modal>
      ) : null}
      {editFile ? (
        <Modal title={t("common.edit")} onClose={() => { if (!saving) setEditFile(null); }}>
          <div className="field"><label>{t("files.file")}</label><input type="text" value={editFilename} onChange={(e) => setEditFilename(e.target.value)} /></div>
          <div className="field"><label>{t("notes.fieldProject")}</label><select value={editProjectId} onChange={(e) => setEditProjectId(e.target.value)}><option value="">{t("common.none")}</option>{projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
          <div className="field"><label>{t("notes.fieldProfiles")}</label><div className="chips-row">{profiles.map((p) => (<button key={p.id} type="button" className={"chip" + (editProfileIds.includes(p.id) ? " active" : "")} style={{ ["--chip-color" as string]: p.color }} onClick={() => toggleEditProfile(p.id)}><span className="swatch" style={{ background: p.color }} /> {p.name}</button>))}</div></div>
          {confirmDeleteFile ? (
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>{t("common.confirm")}?</span>
              <button type="button" className="btn danger" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => void handleDeleteFile()}>{t("common.delete")}</button>
              <button type="button" className="btn ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setConfirmDeleteFile(false)}>{t("common.cancel")}</button>
            </div>
          ) : (
            <button type="button" className="btn ghost" style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }} onClick={() => setConfirmDeleteFile(true)}><Trash2 size={12} /> {t("common.delete")}</button>
          )}
          <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setEditFile(null)} disabled={saving}>{t("common.cancel")}</button><button type="button" className="btn" onClick={() => void doEdit()} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</button></div>
        </Modal>
      ) : null}
    </div>
  );
}
