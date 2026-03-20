// File: server/src/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { loginWithUsernamePassword, requireAuth } from "./lib/auth.js";
import { clearApiKeyForCenter, getDecryptedApiKey, updateApiKeyForCenter } from "./lib/dataStore.js";
import { getMatrixStatus, refreshMatrix, searchMatrix } from "./lib/matrixStore.js";
import { safeAskOpenAiWithCenterKey } from "./lib/openaiClient.js";

const app = express();
const port = Number(process.env.PORT || 5050);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.disable("x-powered-by");
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "Blue Matrix OpenAI Clone" });
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();
  const session = loginWithUsernamePassword(username, password);

  if (!session) {
    return res.status(401).json({
      ok: false,
      error: "Login failed. Check the call center username and password."
    });
  }

  return res.json({ ok: true, ...session });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get("/api/matrix/status", requireAuth, (req, res) => {
  res.json(getMatrixStatus());
});

app.post("/api/matrix/refresh", requireAuth, async (req, res) => {
  try {
    const status = await refreshMatrix();
    res.json({ ok: true, status });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/settings", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.put("/api/settings/api-key", requireAuth, (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey || "").trim();
    const model = String(req.body?.model || process.env.DEFAULT_OPENAI_MODEL || "gpt-5.4-mini").trim();

    if (!apiKey) {
      return res.status(400).json({ ok: false, error: "Please paste an OpenAI API key." });
    }

    if (!apiKey.startsWith("sk-")) {
      return res.status(400).json({ ok: false, error: "That does not look like an OpenAI API key." });
    }

    const user = updateApiKeyForCenter(req.user.id, apiKey, model);
    return res.json({
      ok: true,
      user,
      message: "The API key was saved for this call center and is ready to use right away."
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.delete("/api/settings/api-key", requireAuth, (req, res) => {
  try {
    const user = clearApiKeyForCenter(req.user.id);
    return res.json({ ok: true, user, message: "The saved API key was removed." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ ok: false, error: "Please type a question before sending." });
    }

    const apiKey = getDecryptedApiKey(req.user.id);
    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: "This call center does not have an OpenAI key saved yet. Open Settings and paste the key first."
      });
    }

    if (!getMatrixStatus().loaded) {
      try {
        await refreshMatrix();
      } catch {
        // ignore boot failure here and return nicer error below if needed
      }
    }

    const matches = searchMatrix(message);
    if (!matches.found) {
      return res.json({
        ok: true,
        answer: "NOT FOUND IN DOCS\n\nPlease clarify the exact scenario, reservation status, and what action the agent is trying to take.",
        source: "matrix-fallback"
      });
    }

    const result = await safeAskOpenAiWithCenterKey({
      apiKey,
      model: req.user.model || process.env.DEFAULT_OPENAI_MODEL || "gpt-5.4-mini",
      userMessage: message,
      matches
    });

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    return res.json({
      ok: true,
      answer: result.answer,
      source: "openai",
      matches: matches.summary
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.listen(port, async () => {
  console.log(`Server running on http://localhost:${port}`);
  try {
    await refreshMatrix();
    console.log("Matrix loaded.");
  } catch (error) {
    console.log("Matrix not loaded on boot:", String(error?.message || error));
  }
});
