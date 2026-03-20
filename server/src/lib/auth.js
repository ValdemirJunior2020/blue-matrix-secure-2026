// File: server/src/lib/auth.js
import jwt from "jsonwebtoken";
import { findById, findByUsername, stripSecrets } from "./dataStore.js";
import { verifyPassword } from "./security.js";

const JWT_SECRET = process.env.APP_SECRET || "dev-secret-change-me";

export function loginWithUsernamePassword(username, password) {
  const center = findByUsername(username);
  if (!center) return null;
  if (!verifyPassword(password, center.passwordHash)) return null;

  const token = jwt.sign(
    { sub: center.id, username: center.username, callCenter: center.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: stripSecrets(center)
  };
}

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return res.status(401).json({ ok: false, error: "Missing token." });

    const decoded = jwt.verify(token, JWT_SECRET);
    const center = findById(decoded.sub);
    if (!center) return res.status(401).json({ ok: false, error: "User not found." });

    req.user = stripSecrets(center);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Session expired. Please log in again." });
  }
}
