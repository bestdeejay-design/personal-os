import { useData } from "../useData";
import { getAnalytics } from "../api";
import type { Analytics, Priority } from "../types";
import { useLocale } from "../locales";
import { AlertTriangle, BarChart3 } from "lucide-react";
import "./Analytics.css";

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
  const { t } = useLocale();
  const { data, loading, error } = useData<Analytics>(
    () => getAnalytics({ profile: activeProfiles }),
    [activeProfiles.join(",")],
  );

  const statusLabels: Record<string, string> = {
    backlog: t("analytics.statusBacklog"),
    in_progress: t("analytics.statusInProgress"),
    done: t("analytics.statusDone"),
  };

  const priorityLabels: Record<Priority, string> = {
    low: t("analytics.priorityLow"),
    medium: t("analytics.priorityMedium"),
    high: t("analytics.priorityHigh"),
    critical: t("analytics.priorityCritical"),
  };

  if (loading) {
    return (
      <div className="view">
        <h2>{t("analytics.title")}</h2>
        <div className="analytics-skeleton">
          {Array.from({ length: 7 }).map((_, i) => (
            <div className="card analytics-skeleton-card" key={i} />
          ))}
        </div>
        <p className="analytics-loading">{t("analytics.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view">
        <h2>{t("analytics.title")}</h2>
        <div className="empty">
          <span className="empty-icon"><AlertTriangle size={28} /></span>
          <p>{t("analytics.errorLoad")}: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="view">
        <h2>{t("analytics.title")}</h2>
        <div className="empty">
          <span className="empty-icon"><BarChart3 size={28} /></span>
          <p>{t("analytics.noData")}</p>
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
      <h2>{t("analytics.title")}</h2>

      <div className="analytics-grid">
        <MetricCard label={t("analytics.totalTasks")} value={data.tasks_total} />
        <MetricCard label={t("analytics.done")} value={data.tasks_done} />
        <MetricCard label={t("analytics.overdue")} value={data.tasks_overdue} />
        <MetricCard label={t("analytics.notes")} value={data.notes_total} />
        <MetricCard label={t("analytics.meetings")} value={data.meetings_total} />
        <MetricCard label={t("analytics.files")} value={data.files_total} />

        <div className="card analytics-metric analytics-completion">
          <div className="analytics-metric-label">{t("analytics.completionRate")}</div>
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
          <h3>{t("analytics.byStatus")}</h3>
          {statusEntries.length === 0 ? (
            <p className="muted">{t("analytics.noData")}</p>
          ) : (
            statusEntries.map(([status, count]) => (
              <BarRow
                key={status}
                label={statusLabels[status] ?? status}
                count={count}
                max={statusMax}
                color="var(--accent)"
              />
            ))
          )}
        </div>

        <div className="card analytics-bar-block">
          <h3>{t("analytics.byPriority")}</h3>
          {priorityEntries.length === 0 ? (
            <p className="muted">{t("analytics.noData")}</p>
          ) : (
            priorityEntries.map(([priority, count]) => (
              <BarRow
                key={priority}
                label={priorityLabels[priority]}
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
          <h3>{t("analytics.byProfile")}</h3>
          <table className="analytics-table">
            <thead>
              <tr>
                <th>{t("analytics.tableProfile")}</th>
                <th>{t("analytics.tableTasks")}</th>
                <th>{t("analytics.tableNotes")}</th>
                <th>{t("analytics.tableMeetings")}</th>
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
