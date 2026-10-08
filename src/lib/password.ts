import "server-only";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const COST = 12;
// hash fixo usado quando o usuário não existe, para o tempo de resposta não revelar quais e-mails existem
const DUMMY_HASH = "$2b$12$opd9debQNUhrElkU44mKh.Ohe6/IWyv0jNqxU8ObcXDiY3Ib3REeq";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) { await bcrypt.compare(plain, DUMMY_HASH); return false; }
  try { return await bcrypt.compare(plain, hash); } catch { return false; }
}

const COMMON = ["12345678", "password", "senha123", "qwerty", "admin123", "abcdef"];

/** Política de senha. Devolve a mensagem de erro ou null se estiver ok. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (typeof pw !== "string" || pw.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (pw.length > 128) return "A senha pode ter no máximo 128 caracteres.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Use letras maiúsculas, minúsculas e números.";
  const low = pw.toLowerCase();
  if (COMMON.some((c) => low.includes(c))) return "Essa senha é fácil de adivinhar. Escolha outra.";
  const user = (email ?? "").split("@")[0].toLowerCase();
  if (user.length >= 4 && low.includes(user)) return "A senha não pode conter o seu e-mail.";
  return null;
}

/** Senha provisória forte, entregue uma única vez ao administrador. */
export function generateTempPassword(): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnpqrstuvwxyz", D = "23456789", S = "!@#%*?";
  const all = U + L + D;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(U), pick(L), pick(D), pick(S), ...Array.from({ length: 10 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
