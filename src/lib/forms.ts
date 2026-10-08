import { z } from "zod";
import type { ActionState } from "./action";

export const zEmail = z.string().trim().toLowerCase().min(3, "Informe o e-mail.").max(160).email("E-mail inválido.");
export const zName = z.string().trim().min(2, "Informe o nome.").max(120, "Nome muito longo.");

/** Lê os campos do formulário como texto (ignora arquivos e campos internos do Next). */
export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v;
  return o;
}

/** Valores para devolver ao formulário em caso de erro (sem senhas). */
export function keepValues(o: Record<string, string>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (!/senha|password/i.test(k)) r[k] = v.slice(0, 500);
  return r;
}

export function zodFail(err: z.ZodError, raw: Record<string, string>): ActionState {
  const fields: Record<string, string> = {};
  for (const i of err.issues) { const k = String(i.path[0] ?? ""); if (k && !fields[k]) fields[k] = i.message; }
  return { error: "Confira os campos destacados.", fields, values: keepValues(raw) };
}

/** Número em formato brasileiro ou internacional ("1.234,56" ou "1234.56"). */
export const zDecimal = (label: string, max = 1e12) =>
  z.string().trim().transform((s, ctx) => {
    if (s === "") return "0";
    const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    const n = Number(norm);
    if (!Number.isFinite(n) || n < 0 || n > max) { ctx.addIssue({ code: "custom", message: `${label}: informe um número válido.` }); return z.NEVER; }
    return String(n);
  });
