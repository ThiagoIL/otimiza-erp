"use server";
import { and, eq, sql } from "drizzle-orm";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import { SIMPLE, isSimpleKey, type SField } from "./simple-registry";
import { ruleMsg, RuleError } from "./common";
import type { ActionState } from "@/lib/action";
import { isDate } from "@/lib/dates";

/** Converte o texto do formulário no valor da coluna, conforme o tipo do campo. */
function parse(f: SField, raw: string | null, fd: FormData): { v?: unknown; err?: string } {
  const s = (raw ?? "").trim();
  switch (f.t ?? "text") {
    case "check": return { v: fd.get(f.k) === "on" };
    case "int": {
      if (s === "") return f.req ? { err: "Preencha este campo." } : { v: 0 };
      const n = Number(s); return Number.isInteger(n) && n >= 0 && n < 1e9 ? { v: n } : { err: "Informe um número inteiro." };
    }
    case "num": case "money": {
      if (s === "") return f.req ? { err: "Preencha este campo." } : { v: "0" };
      const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
      return Number.isFinite(n) && Math.abs(n) < 1e12 ? { v: String(n) } : { err: "Informe um número válido." };
    }
    case "days": {
      const ds = s.split(/[,;/\s]+/).filter(Boolean).map(Number);
      if (!ds.length || ds.some((d) => !Number.isInteger(d) || d < 0 || d > 3650)) return { err: "Informe os prazos em dias, separados por vírgula." };
      return { v: ds };
    }
    case "list": return { v: s.split(";").map((x) => x.trim()).filter(Boolean).slice(0, 50) };
    case "date": if (s === "") return f.req ? { err: "Preencha este campo." } : { v: null }; return isDate(s) ? { v: s } : { err: "Data inválida." };
    case "color": return { v: /^#[0-9A-Fa-f]{6}$/.test(s) ? s : "#1E3A5F" };
    case "group": case "partner": return { v: s ? s.slice(0, 64) : null };
    default: {
      if (!s) return f.req ? { err: "Preencha este campo." } : { v: null };
      if (s.length > (f.max ?? 300)) return { err: `Use até ${f.max ?? 300} caracteres.` };
      return { v: f.upper ? s.toUpperCase() : s };
    }
  }
}

export async function saveSimpleAction(key: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!isSimpleKey(key)) return { error: "Cadastro desconhecido." };
  const E = SIMPLE[key];
  const s = await act(E.mod);
  if (!s) return NO_ACCESS;
  const id = String(fd.get("id") ?? "");
  const values: Record<string, unknown> = {};
  const fields: Record<string, string> = {};
  for (const f of E.fields) {
    const r = parse(f, typeof fd.get(f.k) === "string" ? (fd.get(f.k) as string) : null, fd);
    if (r.err) fields[f.k] = r.err; else values[f.k] = r.v;
  }
  const raw: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") raw[k] = v;
  if (Object.keys(fields).length) return { error: "Confira os campos destacados.", fields, values: raw };
  if (key === "campos-pedido") values.entity = "sales_order";
  if (key === "campos-compra") values.entity = "purchase_order";
  if (key === "campos-medicao") values.entity = "measurement";
  if (key === "campos-op") values.entity = "production_order";
  const tbl = E.table;
  try {
    await s.tx(async (tx) => {
      const bad = E.check ? await E.check(tx, values, id) : null;
      if (bad) throw new RuleError(bad);
      if (id) {
        const r = await tx.update(tbl).set(values as never).where(and(eq(tbl.id, id), eq(tbl.tenantId, s.tenant.id))).returning({ id: tbl.id });
        if (!r.length) throw new Error("not found");
      } else {
        await tx.insert(tbl).values({ ...values, tenantId: s.tenant.id } as never);
      }
    });
  } catch (err) {
    return { error: ruleMsg(err), values: raw };
  }
  await audit({ action: `${key}.${id ? "alterado" : "criado"}`, tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: key, entityId: id || undefined });
  return { ok: true, message: id ? "Alterações salvas." : `${E.fem ? "Nova" : "Novo"} ${E.one} cadastrad${E.fem ? "a" : "o"}.` };
}

export async function deleteSimpleAction(key: string, id: string): Promise<ActionState> {
  if (!isSimpleKey(key)) return { error: "Cadastro desconhecido." };
  const E = SIMPLE[key];
  const s = await act(E.mod);
  if (!s) return NO_ACCESS;
  const tbl = E.table;
  try {
    const msg = await s.tx(async (tx) => {
      const g = E.guard ? await E.guard(tx, id) : null;
      if (g) return g;
      for (const [t, col, m] of E.uses ?? []) {
        const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(t).where(eq(col, id));
        if (c > 0) return m;
      }
      const r = await tx.delete(tbl).where(and(eq(tbl.id, id), eq(tbl.tenantId, s.tenant.id))).returning({ id: tbl.id });
      return r.length ? null : "Registro não encontrado.";
    });
    if (msg) return { error: msg };
  } catch (err) {
    return { error: ruleMsg(err, "Não foi possível excluir.") };
  }
  await audit({ action: `${key}.excluido`, tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: key, entityId: id });
  return { ok: true, message: "Registro excluído." };
}
