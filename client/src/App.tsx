// File: client/src/App.tsx
import { useEffect, useMemo, useState } from "react";
import ChatScreen from "./components/ChatScreen";
import LoginScreen from "./components/LoginScreen";
import {
  askQuestion,
  getMatrixStatus,
  getStoredUser,
  login,
  logout as clearSession,
  me,
  removeApiKey,
  saveApiKey,
  type Message,
  type User
} from "./lib/api";

const STORAGE_PREFIX = "blue-matrix-messages-";

function loadMessages(userId: string): Message[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

function persistMessages(userId: string, messages: Message[]) {
  localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(messages));
}

export default function App() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [matrixLabel, setMatrixLabel] = useState("Checking matrix...");

  useEffect(() => {
    if (!user) return;
    setMessages(loadMessages(user.id));
  }, [user]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const freshUser = await me();
        setUser(freshUser);
        const status = await getMatrixStatus();
        setMatrixLabel(status.loaded ? `Loaded ${status.tabs.length} tab(s)` : "Not loaded yet");
      } catch {
        clearSession();
        setUser(null);
      }
    })();
  }, [user?.id]);

  const canShowChat = useMemo(() => Boolean(user), [user]);

  async function handleLogin(username: string, password: string) {
    try {
      setLoginLoading(true);
      setLoginError("");
      const result = await login(username, password);
      setUser(result.user);
      setMessages(loadMessages(result.user.id));
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleAsk(message: string) {
    if (!user) return;
    const nextMessages: Message[] = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    persistMessages(user.id, nextMessages);

    try {
      setLoading(true);
      const result = await askQuestion(message);
      const updated = [...nextMessages, { role: "assistant", content: result.answer } as Message];
      setMessages(updated);
      persistMessages(user.id, updated);
    } catch (error) {
      const updated = [
        ...nextMessages,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Something went wrong."
        } as Message
      ];
      setMessages(updated);
      persistMessages(user.id, updated);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveKey(apiKey: string, model: string) {
    const result = await saveApiKey(apiKey, model);
    setUser(result.user);
  }

  async function handleRemoveKey() {
    const result = await removeApiKey();
    setUser(result.user);
  }

  function handleLogout() {
    clearSession();
    setUser(null);
    setMessages([]);
    setMatrixLabel("Checking matrix...");
  }

  if (!canShowChat || !user) {
    return <LoginScreen onSubmit={handleLogin} error={loginError} loading={loginLoading} />;
  }

  return (
    <ChatScreen
      user={user}
      messages={messages}
      loading={loading}
      ask={handleAsk}
      logout={handleLogout}
      matrixLabel={matrixLabel}
      onSaveKey={handleSaveKey}
      onRemoveKey={handleRemoveKey}
    />
  );
}
