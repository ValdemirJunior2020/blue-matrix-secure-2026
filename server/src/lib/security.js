// File: server/src/lib/security.js
import crypto from "crypto";

const APP_SECRET = process.env.APP_SECRET || "dev-secret-change-me";

function makeKey() {
  return crypto.createHash("sha256").update(APP_SECRET).digest();
}

export function hashPassword(password) {
  return crypto.createHash("sha256").update(`${APP_SECRET}::${password}`).digest("hex");
}

export function verifyPassword(password, hashed) {
  return hashPassword(password) === hashed;
}

export function encryptText(plainText) {
  const iv = crypto.randomBytes(12);
  const key = makeKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptText(payload) {
  if (!payload) return "";
  const [ivHex, tagHex, dataHex] = String(payload).split(".");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    makeKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

export function maskApiKey(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 3)}••••••••${key.slice(-4)}`;
}
