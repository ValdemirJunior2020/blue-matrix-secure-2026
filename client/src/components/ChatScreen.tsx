// File: client/src/components/ChatScreen.tsx
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, User } from "../lib/api";
import SettingsModal from "./SettingsModal";

type Props = {
  user: User;
  messages: Message[];
  loading: boolean;
  ask: (message: string) => Promise<void>;
  logout: () => void;
  matrixLabel: string;
  onSaveKey: (apiKey: string, model: string) => Promise<void>;
  onRemoveKey: () => Promise<void>;
};

export default function ChatScreen({
  user,
  messages,
  loading,
  ask,
  logout,
  matrixLabel,
  onSaveKey,
  onRemoveKey
}: Props) {
  const [text, setText] = useState("");
  const [openSettings, setOpenSettings] = useState(false);

  const placeholder = useMemo(() => {
    if (!user.hasApiKey) return "Open Settings first and save the OpenAI key for this call center.";
    return "Ask a matrix procedure question...";
  }, [user.hasApiKey]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="badge">Blue Matrix AI</div>
          <h2>{user.name}</h2>
          <p className="small-copy">Signed in as {user.username}</p>
        </div>

        <div className="info-box">
          <strong>Saved key:</strong><br />
          {user.hasApiKey ? user.maskedApiKey : "Not saved yet"}
        </div>

        <div className="info-box">
          <strong>Model:</strong><br />
          {user.model}
        </div>

        <div className="info-box">
          <strong>Matrix:</strong><br />
          {matrixLabel}
        </div>

        <div className="stack top-gap">
          <button className="primary-btn" onClick={() => setOpenSettings(true)}>Settings</button>
          <button className="ghost-btn" onClick={logout}>Logout</button>
        </div>
      </aside>

      <main className="chat-panel">
        <div className="chat-header">
          <div>
            <h1>Matrix-only assistant</h1>
            <p>Answers are shaped by your company matrix and billed to each call center&apos;s own OpenAI key.</p>
          </div>
        </div>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <h3>Start with a real procedure question</h3>
              <p>Example: guest wants refund after hotel canceled reservation and has refund protection plan.</p>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`message-card ${message.role}`}>
              <div className="message-role">{message.role === "user" ? user.name : "Blue Matrix AI"}</div>
              {message.role === "assistant" ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <div>{message.content}</div>
              )}
            </div>
          ))}

          {loading ? <div className="typing-pill">Thinking...</div> : null}
        </div>

        <form
          className="composer"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!text.trim()) return;
            const current = text;
            setText("");
            await ask(current);
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
          />
          <button className="primary-btn" type="submit" disabled={loading || !text.trim()}>
            Send
          </button>
        </form>
      </main>

      {openSettings ? (
        <SettingsModal
          user={user}
          onClose={() => setOpenSettings(false)}
          onSave={onSaveKey}
          onRemove={onRemoveKey}
        />
      ) : null}
    </div>
  );
}
