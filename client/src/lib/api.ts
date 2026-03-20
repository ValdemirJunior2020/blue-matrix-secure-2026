// File: client/src/lib/api.ts
const env = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;

const API_BASE =
  env?.VITE_API_BASE_URL ||
  env?.VITE_API_BASE ||
  "http://localhost:5050";

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

function getToken(): string {
  return localStorage.getItem("blue-matrix-token") || "";
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function jsonHeaders(): HeadersInit {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function parseJson(response: Response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok || (data as { ok?: boolean })?.ok === false) {
    const errorMessage =
      (data as { error?: string })?.error || `Request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  return data;
}

export async function login(username: string, password: string) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password })
  });

  const data = await parseJson(response);
  const typed = data as { ok: true; token: string; user: User };

  localStorage.setItem("blue-matrix-token", typed.token);
  localStorage.setItem("blue-matrix-user", JSON.stringify(typed.user));

  return typed;
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
  const response = await fetch(`${API_BASE}/api/me`, {
    headers: authHeaders()
  });

  const data = await parseJson(response);
  const typed = data as { ok: true; user: User };

  localStorage.setItem("blue-matrix-user", JSON.stringify(typed.user));
  return typed.user;
}

export async function saveApiKey(apiKey: string, model: string) {
  const response = await fetch(`${API_BASE}/api/settings/api-key`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ apiKey, model })
  });

  const data = await parseJson(response);
  const typed = data as { ok: true; user: User; message: string };

  localStorage.setItem("blue-matrix-user", JSON.stringify(typed.user));
  return typed;
}

export async function removeApiKey() {
  const response = await fetch(`${API_BASE}/api/settings/api-key`, {
    method: "DELETE",
    headers: authHeaders()
  });

  const data = await parseJson(response);
  const typed = data as { ok: true; user: User; message: string };

  localStorage.setItem("blue-matrix-user", JSON.stringify(typed.user));
  return typed;
}

export async function askQuestion(message: string) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ message })
  });

  return parseJson(response) as Promise<{ ok: true; answer: string }>;
}

export async function getMatrixStatus() {
  const response = await fetch(`${API_BASE}/api/matrix/status`, {
    headers: authHeaders()
  });

  return parseJson(response);
}