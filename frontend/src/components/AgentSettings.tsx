import { useCallback, useEffect, useState } from "react";
import { getSettings, saveSetting } from "../api";
import { Modal } from "./Modal";

interface AgentSettingsState {
  agent_dnd_start: string;
  agent_dnd_end: string;
  agent_daily_cap: number;
  agent_enabled: boolean;
  tts_enabled: boolean;
}

const DEFAULTS: AgentSettingsState = {
  agent_dnd_start: "22:00",
  agent_dnd_end: "08:00",
  agent_daily_cap: 5,
  agent_enabled: true,
  tts_enabled: false,
};

export function AgentSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const [settings, setSettings] = useState<AgentSettingsState>(DEFAULTS);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSavedKey(null);
    void getSettings()
      .then((list) => {
        const map: Record<string, string> = {};
        for (const s of list) map[s.key] = s.value;
        setSettings({
          agent_dnd_start: map.agent_dnd_start ?? DEFAULTS.agent_dnd_start,
          agent_dnd_end: map.agent_dnd_end ?? DEFAULTS.agent_dnd_end,
          agent_daily_cap: map.agent_daily_cap
            ? Number(map.agent_daily_cap)
            : DEFAULTS.agent_daily_cap,
          agent_enabled: map.agent_enabled ? map.agent_enabled === "true" : DEFAULTS.agent_enabled,
          tts_enabled: map.tts_enabled ? map.tts_enabled === "true" : DEFAULTS.tts_enabled,
        });
      })
      .catch(() => {
        // use defaults
      })
      .finally(() => setLoading(false));
  }, [open]);

  const update = useCallback(
    (key: keyof AgentSettingsState, value: string | number | boolean): void => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      const strVal = String(value);
      void saveSetting(key, strVal)
        .then(() => setSavedKey(key))
        .catch(() => {});
    },
    [],
  );

  if (!open) return null;

  return (
    <Modal title="Agent Settings" onClose={onClose}>
      {loading ? (
        <div className="spinner">Loading…</div>
      ) : (
        <div>
          <div className="field">
            <label>DND Start</label>
            <input
              type="time"
              value={settings.agent_dnd_start}
              onChange={(e) => update("agent_dnd_start", e.target.value)}
            />
          </div>
          <div className="field">
            <label>DND End</label>
            <input
              type="time"
              value={settings.agent_dnd_end}
              onChange={(e) => update("agent_dnd_end", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Daily message cap</label>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.agent_daily_cap}
              onChange={(e) => update("agent_daily_cap", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={settings.agent_enabled}
                onChange={(e) => update("agent_enabled", e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Agent enabled
            </label>
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={settings.tts_enabled}
                onChange={(e) => update("tts_enabled", e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Text-to-Speech (TTS) enabled
            </label>
          </div>
          {savedKey ? (
            <span className="muted" style={{ fontSize: 12 }}>
              Saved: {savedKey}
            </span>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
