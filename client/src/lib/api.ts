// File: client/src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5050";

export type User = {
  id: string;
  name: string;
  username: string;
  model: string;
  maskedApiKey: string;
  hasApiKey: boolean;
  updatedAt: string | null;
};

export type Message = {
  role: "user" | "assistant";
  content: string;
};

function authHeaders() {
  const token = localStorage.getItem("blue-matrix-token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function login(username: string, password: string) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await parseJson(response);
  localStorage.setItem("blue-matrix-token", data.token);
  localStorage.setItem("blue-matrix-user", JSON.stringify(data.user));
  return data as { ok: true; token: string; user: User };
}

export function logout() {
  localStorage.removeItem("blue-matrix-token");
  localStorage.removeItem("blue-matrix-user");
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem("blue-matrix-user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function me() {
  const response = await fetch(`${API_BASE}/api/me`, { headers: { ...authHeaders() } });
  const data = await parseJson(response);
  localStorage.setItem("blue-matrix-user", JSON.stringify(data.user));
  return data.user as User;
}

export async function saveApiKey(apiKey: string, model: string) {
  const response = await fetch(`${API_BASE}/api/settings/api-key`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ apiKey, model })
  });
  const data = await parseJson(response);
  localStorage.setItem("blue-matrix-user", JSON.stringify(data.user));
  return data as { ok: true; user: User; message: string };
}

export async function removeApiKey() {
  const response = await fetch(`${API_BASE}/api/settings/api-key`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await parseJson(response);
  localStorage.setItem("blue-matrix-user", JSON.stringify(data.user));
  return data as { ok: true; user: User; message: string };
}

export async function askQuestion(message: string) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ message })
  });
  return parseJson(response) as Promise<{ ok: true; answer: string }>;
}

export async function getMatrixStatus() {
  const response = await fetch(`${API_BASE}/api/matrix/status`, {
    headers: { ...authHeaders() }
  });
  return parseJson(response);
}
