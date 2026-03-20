// File: server/src/lib/dataStore.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { decryptText, encryptText, hashPassword, maskApiKey } from "./security.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../../data");
const seedPath = path.join(dataDir, "call-centers.seed.json");
const runtimePath = path.join(dataDir, "call-centers.runtime.json");

function ensureRuntimeFile() {
  if (fs.existsSync(runtimePath)) return;
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const runtime = seed.map((center) => ({
    id: center.id,
    name: center.name,
    username: center.username,
    passwordHash: hashPassword(center.password),
    model: center.model || process.env.DEFAULT_OPENAI_MODEL || "gpt-5.4-mini",
    maskedApiKey: "",
    encryptedApiKey: "",
    updatedAt: null
  }));
  fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2), "utf8");
}

function readRuntime() {
  ensureRuntimeFile();
  return JSON.parse(fs.readFileSync(runtimePath, "utf8"));
}

function writeRuntime(items) {
  fs.writeFileSync(runtimePath, JSON.stringify(items, null, 2), "utf8");
}

export function listCallCenters() {
  return readRuntime().map(stripSecrets);
}

export function stripSecrets(center) {
  return {
    id: center.id,
    name: center.name,
    username: center.username,
    model: center.model,
    maskedApiKey: center.maskedApiKey || "",
    hasApiKey: Boolean(center.encryptedApiKey),
    updatedAt: center.updatedAt || null
  };
}

export function findByUsername(username) {
  return readRuntime().find((item) => item.username.toLowerCase() === String(username || "").toLowerCase()) || null;
}

export function findById(id) {
  return readRuntime().find((item) => item.id === id) || null;
}

export function getDecryptedApiKey(id) {
  const center = findById(id);
  if (!center?.encryptedApiKey) return "";
  return decryptText(center.encryptedApiKey);
}

export function updateApiKeyForCenter(id, apiKey, model) {
  const items = readRuntime();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Call center not found.");

  const safeModel = String(model || items[index].model || process.env.DEFAULT_OPENAI_MODEL || "gpt-5.4-mini").trim();
  const safeKey = String(apiKey || "").trim();

  items[index] = {
    ...items[index],
    model: safeModel,
    encryptedApiKey: encryptText(safeKey),
    maskedApiKey: maskApiKey(safeKey),
    updatedAt: new Date().toISOString()
  };

  writeRuntime(items);
  return stripSecrets(items[index]);
}

export function clearApiKeyForCenter(id) {
  const items = readRuntime();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Call center not found.");

  items[index] = {
    ...items[index],
    encryptedApiKey: "",
    maskedApiKey: "",
    updatedAt: new Date().toISOString()
  };

  writeRuntime(items);
  return stripSecrets(items[index]);
}
