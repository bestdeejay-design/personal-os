import { useCallback, useEffect, useState } from "react";
import type { CreateNoteInput, Meeting, Note, Task } from "../types";
import {
  deleteMeeting,
  deleteNote,
  deleteTask,
  getCalendar,
  getNotes,
  getTasks,
  updateMeeting,
  updateNote,
  updateTask,
} from "../api";
import { useProfiles } from "../ProfilesContext";
import "./Archive.css";

interface ArchiveProps {
  activeProfiles: string[];
}

function ItemChips({
  ids,
  colorOf,
  nameOf,
}: {
  ids: string[];
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}): JSX.Element {
  if (ids.length === 0) {
    return <span className="archive-empty-chips">—</span>;
  }
  return (
    <div className="chips-row">
      {ids.map((id) => (
        <span
          key={id}
          className="chip"
          style={{ ["--chip-color" as string]: colorOf(id) }}
        >
          <span className="swatch" style={{ background: colorOf(id) }} />
          {nameOf(id)}
        </span>
      ))}
    </div>
  );
}

function ArchiveRow({
  title,
  ids,
  onRestore,
  onPurge,
  colorOf,
  nameOf,
}: {
  title: string;
  ids: string[];
  onRestore: () => void;
  onPurge: () => void;
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}): JSX.Element {
  return (
    <li className="archive-row">
      <div className="archive-row-main">
        <span className="archive-title">{title}</span>
        <ItemChips ids={ids} colorOf={colorOf} nameOf={nameOf} />
      </div>
      <div className="archive-actions">
        <button type="button" className="btn secondary" onClick={onRestore}>
          Восстановить
        </button>
        <button type="button" className="btn danger" onClick={onPurge}>
          Удалить навсегда
        </button>
      </div>
    </li>
  );
}

function ArchiveSection<T>({
  title,
  loading,
  items,
  getId,
  getTitle,
  getIds,
  onRestore,
  onPurge,
  colorOf,
  nameOf,
}: {
  title: string;
  loading: boolean;
  items: T[];
  getId: (item: T) => string;
  getTitle: (item: T) => string;
  getIds: (item: T) => string[];
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}): JSX.Element {
  return (
    <section className="archive-section">
      <h3 className="archive-section-title">{title}</h3>
      {loading ? (
        <p className="archive-loading">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="archive-empty">Архив пуст</p>
      ) : (
        <ul className="archive-list">
          {items.map((item) => (
            <ArchiveRow
              key={getId(item)}
              title={getTitle(item)}
              ids={getIds(item)}
              onRestore={() => onRestore(getId(item))}
              onPurge={() => onPurge(getId(item))}
              colorOf={colorOf}
              nameOf={nameOf}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Archive({ activeProfiles }: ArchiveProps): JSX.Element {
  const { colorOf, nameOf } = useProfiles();
  const profileKey = activeProfiles.join(",");
  const profileArg = activeProfiles.length > 0 ? activeProfiles : undefined;

  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadNotes = useCallback(async (): Promise<void> => {
    setLoadingNotes(true);
    try {
      setNotes(await getNotes(profileArg, undefined, "only"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить заметки");
    } finally {
      setLoadingNotes(false);
    }
  }, [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadTasks = useCallback(async (): Promise<void> => {
    setLoadingTasks(true);
    try {
      setTasks(await getTasks({ profile: profileArg, archived: "only" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить задачи");
    } finally {
      setLoadingTasks(false);
    }
  }, [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadMeetings = useCallback(async (): Promise<void> => {
    setLoadingMeetings(true);
    try {
      setMeetings(await getCalendar({ profile: profileArg, archived: "only" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить встречи");
    } finally {
      setLoadingMeetings(false);
    }
  }, [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoadingNotes(true);
    setLoadingTasks(true);
    setLoadingMeetings(true);
    setError(null);
    Promise.all([
      getNotes(profileArg, undefined, "only"),
      getTasks({ profile: profileArg, archived: "only" }),
      getCalendar({ profile: profileArg, archived: "only" }),
    ])
      .then(([n, t, m]) => {
        if (cancelled) return;
        setNotes(n);
        setTasks(t);
        setMeetings(m);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Не удалось загрузить архив");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingNotes(false);
        setLoadingTasks(false);
        setLoadingMeetings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const restoreNote = useCallback(
    async (id: string): Promise<void> => {
      await updateNote(id, { archived: false } as unknown as Partial<CreateNoteInput>);
      await reloadNotes();
    },
    [reloadNotes],
  );

  const purgeNote = useCallback(
    async (id: string): Promise<void> => {
      if (!window.confirm("Удалить навсегда?")) return;
      await deleteNote(id);
      await reloadNotes();
    },
    [reloadNotes],
  );

  const restoreTask = useCallback(
    async (id: string): Promise<void> => {
      await updateTask(id, { archived: false });
      await reloadTasks();
    },
    [reloadTasks],
  );

  const purgeTask = useCallback(
    async (id: string): Promise<void> => {
      if (!window.confirm("Удалить навсегда?")) return;
      await deleteTask(id);
      await reloadTasks();
    },
    [reloadTasks],
  );

  const restoreMeeting = useCallback(
    async (id: string): Promise<void> => {
      await updateMeeting(id, { archived: false });
      await reloadMeetings();
    },
    [reloadMeetings],
  );

  const purgeMeeting = useCallback(
    async (id: string): Promise<void> => {
      if (!window.confirm("Удалить навсегда?")) return;
      await deleteMeeting(id);
      await reloadMeetings();
    },
    [reloadMeetings],
  );

  return (
    <div className="view archive-view">
      <h2>Архив</h2>
      {error ? <p className="archive-error">{error}</p> : null}
      <ArchiveSection
        title="Заметки"
        loading={loadingNotes}
        items={notes}
        getId={(n) => n.id}
        getTitle={(n) => n.title}
        getIds={(n) => n.profile_ids}
        onRestore={restoreNote}
        onPurge={purgeNote}
        colorOf={colorOf}
        nameOf={nameOf}
      />
      <ArchiveSection
        title="Задачи"
        loading={loadingTasks}
        items={tasks}
        getId={(t) => t.id}
        getTitle={(t) => t.title}
        getIds={(t) => t.profile_ids}
        onRestore={restoreTask}
        onPurge={purgeTask}
        colorOf={colorOf}
        nameOf={nameOf}
      />
      <ArchiveSection
        title="Встречи"
        loading={loadingMeetings}
        items={meetings}
        getId={(m) => m.id}
        getTitle={(m) => m.title}
        getIds={(m) => m.profile_ids}
        onRestore={restoreMeeting}
        onPurge={purgeMeeting}
        colorOf={colorOf}
        nameOf={nameOf}
      />
    </div>
  );
}
