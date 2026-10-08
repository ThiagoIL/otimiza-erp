import pg from "pg";
import { randomBytes, randomInt } from "node:crypto";

export function pool() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("Defina DATABASE_URL."); process.exit(1); }
  return new pg.Pool({ connectionString: url, max: 2 });
}
export const newId = () => randomBytes(16).toString("base64url");
export function passwordProblem(pw, email = "") {
  if (!pw || pw.length < 10) return "a senha precisa ter pelo menos 10 caracteres";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return "use letras maiúsculas, minúsculas e números";
  const user = email.split("@")[0].toLowerCase();
  if (user.length >= 4 && pw.toLowerCase().includes(user)) return "a senha não pode conter o e-mail";
  return null;
}
export function tempPassword() {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnpqrstuvwxyz", D = "23456789";
  const all = U + L + D, p = (s) => s[randomInt(s.length)];
  return [p(U), p(L), p(D), ...Array.from({ length: 11 }, () => p(all))].join("");
}
