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
  // listas em JSON (itens do pedido, materiais) voltam inteiras
  for (const [k, v] of Object.entries(o)) if (!/senha|password/i.test(k)) r[k] = v.slice(0, k === "linhas" || k === "materiais" ? 20000 : 500);
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

/** Data de campo type="date" ("AAAA-MM-DD"); vazio vira null. */
export const zDay = (label: string) =>
  z.string().trim().optional().transform((s, ctx) => {
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) { ctx.addIssue({ code: "custom", message: `${label}: data inválida.` }); return z.NEVER; }
    return s;
  });
/** Texto opcional; vazio vira null. */
export const zOpt = (max: number) => z.string().trim().max(max, `Use até ${max} caracteres.`).optional().transform((s) => s || null);
/** Identificador de registro escolhido num campo de seleção; vazio vira null. */
export const zRef = z.string().trim().max(64).optional().transform((s) => s || null);
/** Cor no formato #RRGGBB. */
export const zColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Escolha uma cor.").default("#5F6B78");

/** Linhas enviadas em JSON por um campo oculto (itens do pedido, materiais da ordem). */
export function parseLines<S extends z.ZodTypeAny>(raw: string | undefined, schema: S): z.output<S>[] | string {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr) || arr.length > 200) return "Lista inválida.";
    const out: z.output<S>[] = [];
    for (const [i, l] of arr.entries()) {
      const p = schema.safeParse(l);
      if (!p.success) return `Linha ${i + 1}: ${p.error.issues[0]?.message ?? "dados inválidos"}`;
      out.push(p.data);
    }
    return out;
  } catch {
    return "Lista inválida.";
  }
}
