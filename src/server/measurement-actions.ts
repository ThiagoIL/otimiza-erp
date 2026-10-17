"use server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { nextNumber, ruleMsg, RuleError } from "./common";
import { cleanCustom, copyBom, fieldsOf, firstStage, measureToOpMapper, syncOrderProduction } from "./production-common";
import { isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";

/**
 * Medição: a obra é medida local por local (andar, Janela 1, 2…) antes da fabricação.
 * Liberada, ela gera as OPs (uma por item e combinação dos campos da OP) e depois a estrutura da montagem.
 */
const dt = (v?: string | null) => (v && isDate(v) ? v : null);

const hdr = z.object({
  id: z.string().max(64).optional(), work: z.string().trim().min(2, "Informe o nome da obra.").max(160), address: z.string().max(240).optional().nullable(),
  partnerId: z.string().max(64).optional().nullable(), salesOrderId: z.string().max(64).optional().nullable(), measurerId: z.string().max(64).optional().nullable(),
  date: z.string().refine(isDate, "Informe a data da medição."), dueDate: z.string().optional().nullable(), notes: z.string().max(4000).optional().nullable(),
});
export async function saveMeasurementAction(input: z.input<typeof hdr>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = hdr.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira os dados da medição." };
  const d = p.data;
  try {
    const r = await s.tx(async (tx) => {
      const v = { work: d.work, address: d.address?.trim() || null, partnerId: d.partnerId || null, salesOrderId: d.salesOrderId || null, measurerId: d.measurerId || null, date: d.date, dueDate: dt(d.dueDate), notes: d.notes?.trim() || null };
      if (v.salesOrderId && !v.partnerId) v.partnerId = (await tx.select({ p: E.salesOrders.partnerId }).from(E.salesOrders).where(eq(E.salesOrders.id, v.salesOrderId)))[0]?.p ?? null;
      if (d.id) {
        const u = await tx.update(E.measurements).set(v).where(eq(E.measurements.id, d.id)).returning({ id: E.measurements.id, n: E.measurements.number });
        if (!u.length) throw new RuleError("Medição não encontrada.");
        // a obra e o cliente acompanham nas OPs já geradas
        await tx.update(E.productionOrders).set({ work: v.work }).where(eq(E.productionOrders.measurementId, d.id));
        return { id: d.id, n: u[0].n, created: false };
      }
      const number = await nextNumber(tx, s.tenant.id, "measurement", E.measurements, E.measurements.number);
      const [m] = await tx.insert(E.measurements).values({ ...v, tenantId: s.tenant.id, number }).returning({ id: E.measurements.id });
      return { id: m.id, n: number, created: true };
    });
    return { ok: true, message: r.created ? `Medição ${r.n} criada. Agora inclua os locais a medir.` : `Medição ${r.n} salva.`, redirectTo: r.created ? `/medicoes/${r.id}` : undefined };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function setMeasurementStatusAction(id: string, status: "MEDINDO" | "LIBERADA" | "CANCELADA"): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  if (!["MEDINDO", "LIBERADA", "CANCELADA"].includes(status)) return { error: "Situação inválida." };
  try {
    await s.tx(async (tx) => {
      if (status === "LIBERADA") {
        const lines = await tx.select().from(E.measurementItems).where(eq(E.measurementItems.measurementId, id));
        if (!lines.length) throw new RuleError("Inclua os locais medidos antes de liberar.");
        const open = lines.filter((l) => !l.measured).length;
        if (open) throw new RuleError(`Ainda há ${open} ${open === 1 ? "local não medido" : "locais não medidos"}. Marque como medido ou exclua antes de liberar.`);
      }
      if (status === "CANCELADA") {
        const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.productionOrders).where(eq(E.productionOrders.measurementId, id));
        if (c) throw new RuleError("Esta medição já gerou OPs. Cancele as OPs antes.");
      }
      await tx.update(E.measurements).set({ status }).where(eq(E.measurements.id, id));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: status === "LIBERADA" ? "Medição liberada para a produção." : status === "CANCELADA" ? "Medição cancelada." : "Medição reaberta." };
}

export async function deleteMeasurementAction(id: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  try {
    await s.tx(async (tx) => {
      const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.productionOrders).where(eq(E.productionOrders.measurementId, id));
      if (c) throw new RuleError("Esta medição já gerou OPs e não pode ser excluída.");
      await tx.delete(E.measurements).where(eq(E.measurements.id, id));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "medicao.excluida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "medicao", entityId: id });
  return { ok: true, redirectTo: "/medicoes?msg=Medi%C3%A7%C3%A3o%20exclu%C3%ADda." };
}

// ------------------------------------------------------------------ locais medidos
const lineSchema = z.object({
  id: z.string().max(64).optional().nullable(), floor: z.string().max(80).optional().nullable(), location: z.string().trim().min(1, "Informe o local (ex.: Janela 1).").max(120),
  itemId: z.string().max(64).optional().nullable(), description: z.string().max(240).optional().nullable(), qty: z.number().positive("Quantidade deve ser maior que zero.").max(1e7),
  custom: z.record(z.string().max(64), z.string().max(240)).default({}), measured: z.boolean().default(false), notes: z.string().max(500).optional().nullable(),
});
const linesSchema = z.object({ measurementId: z.string().max(64), lines: z.array(lineSchema).max(3000) });

/** Grava a grade de locais da medição: inclui, altera e exclui (linhas já em OP não mudam item nem quantidade). */
export async function saveMeasurementLinesAction(input: z.input<typeof linesSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = linesSchema.safeParse(input);
  if (!p.success) { const i = p.error.issues[0]; return { error: `${i?.path[1] != null ? `Linha ${Number(i.path[1]) + 1}: ` : ""}${i?.message ?? "Confira os locais."}` }; }
  const d = p.data;
  try {
    const n = await s.tx(async (tx) => {
      const [m] = await tx.select().from(E.measurements).where(eq(E.measurements.id, d.measurementId)).limit(1);
      if (!m) throw new RuleError("Medição não encontrada.");
      if (m.status === "CANCELADA") throw new RuleError("A medição está cancelada.");
      const cur = await tx.select().from(E.measurementItems).where(eq(E.measurementItems.measurementId, m.id));
      const keep = new Set(d.lines.map((l) => l.id).filter(Boolean) as string[]);
      const gone = cur.filter((c) => !keep.has(c.id));
      if (gone.some((g) => g.productionOrderId)) throw new RuleError("Há locais que já estão em OP e não podem ser excluídos.");
      if (gone.length) await tx.delete(E.measurementItems).where(inArray(E.measurementItems.id, gone.map((g) => g.id)));
      let pos = 0;
      for (const [k, l] of d.lines.entries()) {
        const custom = await cleanCustom(tx, "measurement", l.custom, l.measured, `na linha ${k + 1} (${l.location})`);
        const v = { floor: l.floor?.trim() || null, location: l.location, itemId: l.itemId || null, description: l.description?.trim() || null, qty: String(l.qty), custom, measured: l.measured, notes: l.notes?.trim() || null, position: pos++ };
        const old = l.id ? cur.find((c) => c.id === l.id) : undefined;
        if (old) {
          if (old.productionOrderId && (old.itemId !== v.itemId || Number(old.qty) !== l.qty)) throw new RuleError(`Linha ${k + 1} (${l.location}) já está na OP: o item e a quantidade não mudam.`);
          await tx.update(E.measurementItems).set(v).where(eq(E.measurementItems.id, old.id));
        } else {
          await tx.insert(E.measurementItems).values({ ...v, tenantId: s.tenant.id, measurementId: m.id });
        }
      }
      return d.lines.length;
    });
    return { ok: true, message: `${n} ${n === 1 ? "local salvo" : "locais salvos"}.` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

/** Marca (ou desmarca) locais como medidos, direto na grade ou pelo celular. */
export async function markMeasuredAction(ids: string[], measured: boolean): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  if (!ids.length || ids.length > 3000) return { error: "Escolha os locais." };
  try {
    await s.tx(async (tx) => {
      if (measured) {
        const rows = await tx.select().from(E.measurementItems).where(inArray(E.measurementItems.id, ids));
        for (const r of rows) await cleanCustom(tx, "measurement", r.custom, true, `em ${r.floor ? r.floor + " · " : ""}${r.location}`);
      }
      await tx.update(E.measurementItems).set({ measured }).where(inArray(E.measurementItems.id, ids));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: measured ? "Marcado como medido." : "Desmarcado." };
}

// ------------------------------------------------------------------ importar planilha
const impSchema = z.object({ measurementId: z.string().max(64), replace: z.boolean().default(false), rows: z.array(z.record(z.string().max(80), z.string().max(400))).min(1, "A planilha está vazia.").max(3000) });
const pick = (r: Record<string, string>, ...keys: string[]) => { for (const k of keys) { const v = r[k]; if (v != null && String(v).trim() !== "") return String(v).trim(); } return ""; };
const nl = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const toN = (v: string) => { const s = v.replace(/\s/g, ""); if (!s) return NaN; const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return n; };

/**
 * Importa os locais de uma planilha (Excel ou CSV). Colunas: Andar, Local, Item (código), Descrição, Quantidade
 * e uma coluna para cada campo da medição (pelo nome do campo, ex.: Largura, Altura, Vidro, Peso, Linha).
 */
export async function importMeasurementAction(input: z.input<typeof impSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = impSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a planilha." };
  const d = p.data;
  try {
    const n = await s.tx(async (tx) => {
      const [m] = await tx.select().from(E.measurements).where(eq(E.measurements.id, d.measurementId)).limit(1);
      if (!m) throw new RuleError("Medição não encontrada.");
      if (m.status !== "MEDINDO") throw new RuleError("Reabra a medição para importar.");
      const fields = await fieldsOf(tx, "measurement");
      const codes = [...new Set(d.rows.map((r) => pick(r, "item", "codigo", "codigo do item", "cod", "produto codigo")).filter(Boolean))];
      const items = codes.length ? await tx.select({ id: E.items.id, code: E.items.code }).from(E.items).where(inArray(E.items.code, codes)) : [];
      const byCode = new Map(items.map((i) => [i.code.toLowerCase(), i.id]));
      const errs: string[] = [];
      const out: (typeof E.measurementItems.$inferInsert)[] = [];
      const [{ last }] = await tx.select({ last: sql<number>`coalesce(max(${E.measurementItems.position}), -1)::int` }).from(E.measurementItems).where(eq(E.measurementItems.measurementId, m.id));
      d.rows.forEach((r, k) => {
        const line = k + 2;
        const location = pick(r, "local", "localizacao", "identificacao", "posicao", "vao", "esquadria");
        const code = pick(r, "item", "codigo", "codigo do item", "cod", "produto codigo");
        const desc = pick(r, "descricao", "produto", "nome");
        const qtyS = pick(r, "quantidade", "qtd", "qtde", "quant");
        if (!location && !code && !desc) return; // linha em branco
        const qty = qtyS ? toN(qtyS) : 1;
        if (!location) errs.push(`linha ${line}: falta o local`);
        if (!(qty > 0)) errs.push(`linha ${line}: quantidade inválida`);
        const itemId = code ? byCode.get(code.toLowerCase()) : undefined;
        if (code && !itemId) errs.push(`linha ${line}: item ${code} não cadastrado`);
        const custom: Record<string, string> = {};
        for (const f of fields) {
          const v = r[nl(f.label)];
          if (v == null || String(v).trim() === "") continue;
          let val = String(v).trim();
          if (f.type === "lista" && f.options.length) {
            const hit = f.options.find((o) => nl(o) === nl(val));
            if (!hit) { errs.push(`linha ${line}: “${val}” não é opção de ${f.label}`); continue; }
            val = hit;
          }
          if (f.type === "numero" && !Number.isFinite(toN(val))) { errs.push(`linha ${line}: ${f.label} não é número`); continue; }
          custom[f.id] = val;
        }
        const measured = /^(sim|s|x|ok|1|medido)$/i.test(pick(r, "medido"));
        const miss = measured ? fields.find((f) => f.required && !custom[f.id]) : undefined;
        if (miss) errs.push(`linha ${line}: marcada como medida sem ${miss.label}`);
        out.push({ tenantId: s.tenant.id, measurementId: m.id, floor: pick(r, "andar", "pavimento", "bloco", "torre", "setor") || null, location, itemId: itemId ?? null, description: desc || null,
          qty: String(qty), custom, measured, notes: pick(r, "observacao", "obs") || null, position: last + 1 + out.length });
      });
      if (errs.length) throw new RuleError(`Nada foi importado. Corrija a planilha: ${errs.slice(0, 8).join("; ")}${errs.length > 8 ? ` e mais ${errs.length - 8}` : ""}.`);
      if (!out.length) throw new RuleError("Nenhuma linha com local na planilha.");
      if (d.replace) {
        const used = await tx.select({ c: sql<number>`count(*)::int` }).from(E.measurementItems).where(and(eq(E.measurementItems.measurementId, m.id), sql`${E.measurementItems.productionOrderId} is not null`));
        if (used[0].c) throw new RuleError("Há locais em OP: não dá para substituir tudo. Importe sem substituir.");
        await tx.delete(E.measurementItems).where(eq(E.measurementItems.measurementId, m.id));
        out.forEach((o, i) => (o.position = i));
      }
      for (let i = 0; i < out.length; i += 500) await tx.insert(E.measurementItems).values(out.slice(i, i + 500));
      return out.length;
    });
    return { ok: true, message: `${n} ${n === 1 ? "local importado" : "locais importados"}.` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

// ------------------------------------------------------------------ gerar a produção
const genSchema = z.object({
  measurementId: z.string().max(64), workCenterId: z.string().max(64).optional().nullable(), responsibleId: z.string().max(64).optional().nullable(),
  priority: z.enum(["Baixa", "Normal", "Alta", "Urgente"]).default("Normal"), needDate: z.string().optional().nullable(),
});
/** Gera as OPs dos locais medidos que ainda não estão em OP: uma OP por item e combinação dos campos da OP (ex.: Pintura). */
export async function generateOpsFromMeasurementAction(input: z.input<typeof genSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = genSchema.safeParse(input);
  if (!p.success) return { error: "Confira os dados." };
  const d = p.data;
  try {
    const nums = await s.tx(async (tx) => {
      const [m] = await tx.select().from(E.measurements).where(eq(E.measurements.id, d.measurementId)).limit(1).for("update");
      if (!m) throw new RuleError("Medição não encontrada.");
      if (m.status !== "LIBERADA") throw new RuleError("Libere a medição para a produção antes de gerar as OPs.");
      const lines = await tx.select().from(E.measurementItems).where(and(eq(E.measurementItems.measurementId, m.id), isNull(E.measurementItems.productionOrderId))).orderBy(asc(E.measurementItems.position));
      if (!lines.length) throw new RuleError("Todos os locais desta medição já estão em OP.");
      const noItem = lines.filter((l) => !l.itemId);
      if (noItem.length) throw new RuleError(`Escolha o item do cadastro em ${noItem.length === 1 ? "1 local" : `${noItem.length} locais`} (ex.: ${noItem[0].floor ? noItem[0].floor + " · " : ""}${noItem[0].location}) para gerar a OP.`);
      const map = await measureToOpMapper(tx);
      const groups = new Map<string, { itemId: string; custom: Record<string, string>; ids: string[]; qty: number }>();
      for (const l of lines) {
        const custom = map(l.custom);
        const key = `${l.itemId}|${JSON.stringify(Object.entries(custom).sort())}`;
        const g = groups.get(key) ?? { itemId: l.itemId!, custom, ids: [], qty: 0 };
        g.ids.push(l.id); g.qty += Number(l.qty);
        groups.set(key, g);
      }
      const st = await firstStage(tx);
      const out: number[] = [];
      for (const g of groups.values()) {
        const number = await nextNumber(tx, s.tenant.id, "production_order", E.productionOrders, E.productionOrders.number);
        const [op] = await tx.insert(E.productionOrders).values({ tenantId: s.tenant.id, number, itemId: g.itemId, qty: String(g.qty), salesOrderId: m.salesOrderId, partnerId: m.partnerId, stageId: st.id,
          workCenterId: d.workCenterId || null, responsibleId: d.responsibleId || null, priority: d.priority, startDate: today(), needDate: dt(d.needDate) ?? m.dueDate,
          notes: `Medição ${m.number} · ${m.work}`, measurementId: m.id, work: m.work, custom: g.custom }).returning({ id: E.productionOrders.id });
        await copyBom(tx, s.tenant.id, op.id, g.itemId, g.qty);
        await tx.update(E.measurementItems).set({ productionOrderId: op.id }).where(inArray(E.measurementItems.id, g.ids));
        out.push(number);
      }
      await syncOrderProduction(tx, m.salesOrderId);
      return out;
    });
    await audit({ action: "medicao.ops", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "medicao", entityId: d.measurementId, data: { ops: nums } });
    return { ok: true, message: `${nums.length === 1 ? "OP" : "OPs"} ${nums.join(", ")} ${nums.length === 1 ? "gerada" : "geradas"} a partir da medição.` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}
