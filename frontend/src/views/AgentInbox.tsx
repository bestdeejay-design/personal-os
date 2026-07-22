import { useCallback, useEffect, useState } from "react";
import type { AgentMessage } from "../types";
import { dismissAllAgentMessages, getAgentInbox, respondToAgent } from "../api";
import { useProfiles } from "../ProfilesContext";
import { useSpeechSynthesis } from "../useSpeechSynthesis";
import { EmptyState } from "../components/EmptyState";
import { useLocale } from "../locales";
import {
  AlertTriangle,
  AlarmClock,
  ClipboardList,
  MessageSquare,
  Sparkles,
  Clock,
} from "lucide-react";

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  meeting_ended: <Clock size={16} />,
  task_no_assignee: <AlertTriangle size={16} />,
  deadline_soon: <AlarmClock size={16} />,
  project_plan: <ClipboardList size={16} />,
  daily_digest: <Sparkles size={16} />,
};

function triggerIcon(triggerType: string): React.ReactNode {
  return TRIGGER_ICONS[triggerType] ?? <MessageSquare size={16} />;
}

function relativeTime(iso: string, t: (key: string, vars?: Record<string, string> | string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("inbox.justNow");
  if (mins < 60) return t("inbox.minutesAgo", { m: String(mins) });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("inbox.hoursAgo", { h: String(hours) });
  const days = Math.floor(hours / 24);
  return t("inbox.daysAgo", { d: String(days) });
}

export function AgentInbox({
  activeProfiles,
  onUnreadChange,
}: {
  activeProfiles: string[];
  onUnreadChange?: (n: number) => void;
}): JSX.Element {
  const { t } = useLocale();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const { colorOf } = useProfiles();
  const { speak } = useSpeechSynthesis();

  const load = useCallback((): void => {
    setLoading(true);
    setError(null);
    void getAgentInbox(activeProfiles.length > 0 ? activeProfiles : undefined)
      .then((msgs) => {
        setMessages(msgs.filter((m) => !m.resolved));
        onUnreadChange?.(msgs.filter((m) => !m.resolved).length);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [activeProfiles, onUnreadChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRespond = async (
    id: string,
    action: "accept" | "reject" | "reply",
    text?: string,
  ): Promise<void> => {
    try {
      await respondToAgent(id, action, text);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setReplyingId(null);
      setReplyText("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  };

  const handleDismissAll = async (): Promise<void> => {
    try {
      await dismissAllAgentMessages();
      setMessages([]);
      onUnreadChange?.(0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  };

  const handleSpeak = (body: string): void => {
    speak(body);
  };

  if (loading) return <div className="spinner">{t("inbox.loading")}</div>;
  if (error) return <EmptyState icon={<AlertTriangle size={32} />} title={t("inbox.errorLoad")} hint={error} />;
  if (messages.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={32} />}
        title={t("inbox.emptyTitle")}
        hint={t("inbox.emptyHint")}
      />
    );
  }

  return (
    <div>
      <div className="section-head">
        <h2>{t("inbox.title")}</h2>
        <button type="button" className="btn ghost" onClick={handleDismissAll}>
          {t("inbox.dismissAll")}
        </button>
      </div>

      <div className="inbox-list">
        {messages.map((msg) => (
          <div key={msg.id} className="inbox-message">
            <div className="inbox-header">
              <span className="inbox-icon">{triggerIcon(msg.trigger_type)}</span>
              <span className="inbox-trigger">{msg.trigger_type.replace(/_/g, " ")}</span>
              <span className="inbox-time">{relativeTime(msg.created_at, t)}</span>
              <button
                type="button"
                className="icon-btn"
                title={t("inbox.readAloud")}
                aria-label={t("inbox.readAloud")}
                onClick={() => handleSpeak(msg.body)}
                style={{ marginLeft: "auto", width: 28, height: 28, fontSize: 13 }}
              >
                🔊
              </button>
            </div>

            <h3 className="inbox-title">{msg.title}</h3>
            <p className="inbox-body">{msg.body}</p>

            {msg.profile_ids.length > 0 ? (
              <div className="inbox-profiles">
                {msg.profile_ids.map((pid) => (
                  <span
                    key={pid}
                    className="inbox-profile-chip"
                    style={{
                      background: colorOf(pid),
                      color: "#fff",
                    }}
                  >
                    {pid.slice(0, 8)}
                  </span>
                ))}
              </div>
            ) : null}

            {msg.suggested_actions_json.length > 0 ? (
              <div className="inbox-suggested">
                {msg.suggested_actions_json.map((act, i) => (
                  <button
                    key={i}
                    type="button"
                    className="inbox-chip"
                    onClick={() => handleRespond(msg.id, "accept")}
                    title={`Suggest: ${act.type}`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="inbox-actions">
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12, padding: "5px 10px" }}
                onClick={() => handleRespond(msg.id, "accept")}
              >
                {t("inbox.accept")}
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 12, padding: "5px 10px" }}
                onClick={() => handleRespond(msg.id, "reject")}
              >
                {t("inbox.reject")}
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 12, padding: "5px 10px" }}
                onClick={() =>
                  setReplyingId(replyingId === msg.id ? null : msg.id)
                }
              >
                {t("inbox.reply")}
              </button>
            </div>

            {replyingId === msg.id ? (
              <div className="inbox-reply">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t("inbox.replyPlaceholder")}
                />
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: 12, marginTop: 6 }}
                  disabled={!replyText.trim()}
                  onClick={() => handleRespond(msg.id, "reply", replyText)}
                >
                  {t("inbox.sendReply")}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
