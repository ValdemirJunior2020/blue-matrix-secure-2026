// File: client/src/components/SettingsModal.tsx
import { useState } from "react";
import type { User } from "../lib/api";

type Props = {
  user: User;
  onClose: () => void;
  onSave: (apiKey: string, model: string) => Promise<void>;
  onRemove: () => Promise<void>;
};

export default function SettingsModal({ user, onClose, onSave, onRemove }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(user.model || "gpt-5.4-mini");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSave() {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await onSave(apiKey, model);
      setApiKey("");
      setMessage("Saved. This key is already active for new questions.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await onRemove();
      setMessage("The saved key was removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="badge">Settings</div>
            <h2>{user.name}</h2>
          </div>
          <button className="ghost-btn" onClick={onClose}>Close</button>
        </div>

        <div className="stack">
          <div className="info-box">
            Current key: {user.hasApiKey ? user.maskedApiKey : "No key saved yet"}
          </div>

          <label>
            OpenAI API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste a fresh sk-... key"
            />
          </label>

          <label>
            Model
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-5.4-mini" />
          </label>

          {error ? <div className="error-box">{error}</div> : null}
          {message ? <div className="success-box">{message}</div> : null}

          <div className="row-actions">
            <button className="primary-btn" onClick={handleSave} disabled={busy}>
              {busy ? "Saving..." : "Save key"}
            </button>
            <button className="danger-btn" onClick={handleRemove} disabled={busy || !user.hasApiKey}>
              Remove key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
