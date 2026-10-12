"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { ruleMsg, RuleError } from "./common";
import { addMonths, isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";

const opt = z.string().max(64).optional().nullable().transform((v) => v || null);
const titleSchema = z.object({
  id: z.string().max(64).optional(), kind: z.enum(["RECEBER", "PAGAR"]), description: z.string().trim().min(2, "Informe a descrição.").max(200),
  document: z.string().max(60).optional().nullable(), partnerId: opt, categoryId: opt, issueDate: z.string().optional().nullable(), dueDate: z.string().refine(isDate, "Informe o vencimento."),
  amount: z.number().positive("Informe o valor.").max(1e12), paymentMethodId: opt, situationId: opt, responsibleId: opt, notes: z.string().max(2000).optional().nullable(),
  repeat: z.number().int().min(1).max(60).default(1),
});
export async function saveTitleAction(input: z.input<typeof titleSchema>): Promise<ActionState> {
  const s = await act("financeiro");
  if (!s) return NO_ACCESS;
  const p = titleSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o lançamento." };
  const d = p.data;
  const base = { kind: d.kind, description: d.description, document: d.document?.trim() || null, partnerId: d.partnerId, categoryId: d.categoryId, issueDate: d.issueDate && isDate(d.issueDate) ? d.issueDate : today(),
    amount: String(d.amount), paymentMethodId: d.paymentMethodId, situationId: d.situationId, responsibleId: d.responsibleId, notes: d.notes?.trim() || null };
  try {
    await s.tx(async (tx) => {
      if (d.id) {
        const [cur] = await tx.select().from(E.finTitles).where(eq(E.finTitles.id, d.id)).limit(1);
        if (!cur) throw new RuleError("Lançamento não encontrado.");
        // títulos gerados por nota ou compra: o valor e o cliente/fornecedor vêm do documento
        const locked = cur.originType !== "MANUAL";
        await tx.update(E.finTitles).set(locked ? { description: base.description, categoryId: base.categoryId, dueDate: d.dueDate, paymentMethodId: base.paymentMethodId, situationId: base.situationId, responsibleId: base.responsibleId, notes: base.notes, document: base.document }
          : { ...base, dueDate: d.dueDate }).where(eq(E.finTitles.id, d.id));
      } else {
        await tx.insert(E.finTitles).values(Array.from({ length: d.repeat }, (_, i) => ({ ...base, tenantId: s.tenant.id, dueDate: i ? addMonths(d.dueDate, i) : d.dueDate,
          installment: d.repeat > 1 ? `${i + 1}/${d.repeat}` : "1/1", originType: "MANUAL", status: "ABERTO" })));
      }
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: d.id ? "Lançamento salvo." : d.repeat > 1 ? `${d.repeat} lançamentos criados.` : "Lançamento criado." };
}

const paySchema = z.object({ id: z.string().max(64), paidAt: z.string().refine(isDate, "Data inválida."), paidAmount: z.number().positive().max(1e12), bankAccountId: z.string().min(1, "Escolha a conta.").max(64), paymentMethodId: opt });
export async function payTitleAction(input: z.input<typeof paySchema>): Promise<ActionState> {
  const s = await act("financeiro");
  if (!s) return NO_ACCESS;
  const p = paySchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a baixa." };
  const d = p.data;
  const r = await s.tx((tx) => tx.update(E.finTitles).set({ status: "PAGO", paidAt: d.paidAt, paidAmount: String(d.paidAmount), bankAccountId: d.bankAccountId, ...(d.paymentMethodId ? { paymentMethodId: d.paymentMethodId } : {}) })
    .where(and(eq(E.finTitles.id, d.id), eq(E.finTitles.status, "ABERTO"))).returning({ k: E.finTitles.kind }));
  if (!r.length) return { error: "Este lançamento não está em aberto." };
  await audit({ action: "financeiro.baixa", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "titulo", entityId: d.id, data: { valor: d.paidAmount } });
  return { ok: true, message: r[0].k === "RECEBER" ? "Recebimento registrado." : "Pagamento registrado." };
}

export async function reversePaymentAction(id: string): Promise<ActionState> {
  const s = await act("financeiro");
  if (!s) return NO_ACCESS;
  const r = await s.tx((tx) => tx.update(E.finTitles).set({ status: "ABERTO", paidAt: null, paidAmount: null, bankAccountId: null }).where(and(eq(E.finTitles.id, id), eq(E.finTitles.status, "PAGO"))).returning({ id: E.finTitles.id }));
  if (!r.length) return { error: "Este lançamento não está baixado." };
  await audit({ action: "financeiro.estorno", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "titulo", entityId: id });
  return { ok: true, message: "Baixa estornada." };
}

export async function cancelTitleAction(id: string, undo = false): Promise<ActionState> {
  const s = await act("financeiro");
  if (!s) return NO_ACCESS;
  const r = await s.tx((tx) => tx.update(E.finTitles).set({ status: undo ? "ABERTO" : "CANCELADO" }).where(and(eq(E.finTitles.id, id), eq(E.finTitles.status, undo ? "CANCELADO" : "ABERTO"))).returning({ id: E.finTitles.id }));
  if (!r.length) return { error: undo ? "O lançamento não está cancelado." : "Só lançamentos em aberto podem ser cancelados." };
  return { ok: true, message: undo ? "Lançamento reativado." : "Lançamento cancelado. Ele deixa de contar no fluxo de caixa." };
}

export async function deleteTitleAction(id: string): Promise<ActionState> {
  const s = await act("financeiro");
  if (!s) return NO_ACCESS;
  try {
    await s.tx(async (tx) => {
      const [t] = await tx.select().from(E.finTitles).where(eq(E.finTitles.id, id));
      if (!t) throw new RuleError("Lançamento não encontrado.");
      if (t.originType !== "MANUAL") throw new RuleError("Este lançamento veio de uma nota ou compra. Cancele em vez de excluir.");
      if (t.status === "PAGO") throw new RuleError("Estorne a baixa antes de excluir.");
      await tx.delete(E.finTitles).where(eq(E.finTitles.id, id));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: "Lançamento excluído." };
}

// ---------- extrato: lançamentos avulsos e transferências ----------
const entrySchema = z.object({ bankAccountId: z.string().min(1).max(64), date: z.string().refine(isDate), description: z.string().trim().min(2, "Informe a descrição.").max(200), amount: z.number().refine((v) => v !== 0, "Informe o valor.").refine((v) => Math.abs(v) < 1e12), notes: z.string().max(500).optional().nullable() });
export async function saveBankEntryAction(input: z.input<typeof entrySchema>): Promise<ActionState> {
  const s = await act("financeiro");
  if (!s) return NO_ACCESS;
  const p = entrySchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o lançamento." };
  await s.tx((tx) => tx.insert(E.bankEntries).values({ ...p.data, amount: String(p.data.amount), notes: p.data.notes?.trim() || null, tenantId: s.tenant.id }));
  return { ok: true, message: "Lançamento registrado no extrato." };
}
export async function transferAction(input: { from: string; to: string; date: string; amount: number; description?: string }): Promise<ActionState> {
  const s = await act("financeiro");
  if (!s) return NO_ACCESS;
  if (!input.from || !input.to || input.from === input.to) return { error: "Escolha contas de origem e destino diferentes." };
  if (!isDate(input.date) || !(input.amount > 0)) return { error: "Informe a data e o valor." };
  const desc = input.description?.trim() || "Transferência entre contas";
  await s.tx(async (tx) => {
    await tx.insert(E.bankEntries).values([
      { tenantId: s.tenant.id, bankAccountId: input.from, date: input.date, description: desc, amount: String(-input.amount) },
      { tenantId: s.tenant.id, bankAccountId: input.to, date: input.date, description: desc, amount: String(input.amount) },
    ]);
  });
  return { ok: true, message: "Transferência registrada." };
}
export async function deleteBankEntryAction(id: string): Promise<ActionState> {
  const s = await act("financeiro");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.bankEntries).where(eq(E.bankEntries.id, id)));
  return { ok: true, message: "Lançamento excluído do extrato." };
}
