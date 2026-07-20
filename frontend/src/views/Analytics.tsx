import { useData } from "../useData";
import { getAnalytics } from "../api";
import type { Analytics, Priority } from "../types";
import "./Analytics.css";

const STATUS_LABELS: Record<string, string> = {
  backlog: "Бэклог",
  in_progress: "В работе",
  done: "Готово",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
};

const PRIORITY_ORDER: Priority[] = ["low", "medium", "high", "critical"];

const PRIORITY_VAR: Record<Priority, string> = {
  low: "var(--muted)",
  medium: "var(--prio-medium)",
  high: "var(--prio-high)",
  critical: "var(--prio-critical)",
};

function MetricCard({ label, value }: { label: string; value: number | string }): JSX.Element {
  return (
    <div className="card analytics-metric">
      <div className="analytics-metric-value">{value}</div>
      <div className="analytics-metric-label">{label}</div>
    </div>
  );
}

function BarRow({
  label,
  count,
  max,
  color,
}: {
  label: string;
  count: number;
  max: number;
  color: string;
}): JSX.Element {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="analytics-bar-row">
      <div className="analytics-bar-head">
        <span className="analytics-bar-label">{label}</span>
        <span className="analytics-bar-count">{count}</span>
      </div>
      <div className="analytics-bar-track">
        <div
          className="analytics-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function Analytics({ activeProfiles }: { activeProfiles: string[] }): JSX.Element {
  const { data, loading, error } = useData<Analytics>(
    () => getAnalytics({ profile: activeProfiles }),
    [activeProfiles.join(",")],
  );

  if (loading) {
    return (
      <div className="view">
        <h2>Аналитика</h2>
        <div className="analytics-skeleton">
          {Array.from({ length: 7 }).map((_, i) => (
            <div className="card analytics-skeleton-card" key={i} />
          ))}
        </div>
        <p className="analytics-loading">Загрузка…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view">
        <h2>Аналитика</h2>
        <div className="empty">
          <span className="emoji">⚠️</span>
          <p>Не удалось загрузить аналитику: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="view">
        <h2>Аналитика</h2>
        <div className="empty">
          <span className="emoji">📊</span>
          <p>Нет данных</p>
        </div>
      </div>
    );
  }

  const completionPct = Math.round(data.completion_rate * 100);

  const statusEntries = Object.entries(data.tasks_by_status);
  const statusMax = statusEntries.reduce((m, [, v]) => Math.max(m, v), 0);

  const priorityEntries = PRIORITY_ORDER.filter((p) => p in data.tasks_by_priority).map(
    (p) => [p, data.tasks_by_priority[p] ?? 0] as const,
  );
  const priorityMax = priorityEntries.reduce((m, [, v]) => Math.max(m, v), 0);

  const perProfileEntries = data.per_profile
    ? Object.entries(data.per_profile)
    : [];

  return (
    <div className="view">
      <h2>Аналитика</h2>

      <div className="analytics-grid">
        <MetricCard label="Всего задач" value={data.tasks_total} />
        <MetricCard label="Выполнено" value={data.tasks_done} />
        <MetricCard label="Просрочено" value={data.tasks_overdue} />
        <MetricCard label="Заметки" value={data.notes_total} />
        <MetricCard label="Встречи" value={data.meetings_total} />
        <MetricCard label="Файлы" value={data.files_total} />

        <div className="card analytics-metric analytics-completion">
          <div className="analytics-metric-label">Completion rate</div>
          <div className="analytics-progress-track">
            <div
              className="analytics-progress-fill"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <div className="analytics-progress-label">{completionPct}%</div>
        </div>
      </div>

      <div className="analytics-bars">
        <div className="card analytics-bar-block">
          <h3>По статусам</h3>
          {statusEntries.length === 0 ? (
            <p className="muted">Нет данных</p>
          ) : (
            statusEntries.map(([status, count]) => (
              <BarRow
                key={status}
                label={STATUS_LABELS[status] ?? status}
                count={count}
                max={statusMax}
                color="var(--accent)"
              />
            ))
          )}
        </div>

        <div className="card analytics-bar-block">
          <h3>По приоритету</h3>
          {priorityEntries.length === 0 ? (
            <p className="muted">Нет данных</p>
          ) : (
            priorityEntries.map(([priority, count]) => (
              <BarRow
                key={priority}
                label={PRIORITY_LABELS[priority]}
                count={count}
                max={priorityMax}
                color={PRIORITY_VAR[priority]}
              />
            ))
          )}
        </div>
      </div>

      {perProfileEntries.length > 0 && (
        <div className="card analytics-per-profile">
          <h3>По профилям</h3>
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Профиль</th>
                <th>Задачи</th>
                <th>Заметки</th>
                <th>Встречи</th>
              </tr>
            </thead>
            <tbody>
              {perProfileEntries.map(([name, counts]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{counts.tasks}</td>
                  <td>{counts.notes}</td>
                  <td>{counts.meetings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
