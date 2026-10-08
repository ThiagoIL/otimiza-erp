import { randomBytes } from "node:crypto";
/** Identificador aleatório, curto e seguro para URL (não sequencial, não adivinhável). */
export function createId(): string {
  return randomBytes(16).toString("base64url");
}
