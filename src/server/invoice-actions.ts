"use server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { avgCosts, balances, balanceOf, insertMovements, ruleMsg, RuleError, closedUntil, stageIdFor } from "./common";
import { installments, isDate } from "@/lib/dates";
import type { ActionState } from "@/lib/action";

const invSchema = z.object({
  orderId: z.string().max(64), number: z.number().int().positive().max(999999999), series: z.string().trim().min(1).max(3),
  issueDate: z.string().refine(isDate, "Data inválida."), stockOut: z.boolean(), locationId: z.string().max(64).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createInvoiceAction(input: z.input<typeof invSchema>): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  const p = invSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira os dados da nota." };
  const d = p.data;
  if (d.stockOut && !d.locationId) return { error: "Escolha o local de saída do estoque." };
  let invId = "";
  try {
    await s.tx(async (tx) => {
      const [so] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, d.orderId)).limit(1).for("update");
      if (!so) throw new RuleError("Pedido não encontrado.");
      if (so.status !== "APROVADO") throw new RuleError("Só pedidos aprovados podem ser faturados.");
      const [dup] = await tx.select({ id: E.invoices.id }).from(E.invoices).where(and(eq(E.invoices.series, d.series), eq(E.invoices.number, d.number))).limit(1);
      if (dup) throw new RuleError(`A nota ${d.number} da série ${d.series} já existe.`);
      const lines = await tx.select().from(E.salesOrderItems).where(eq(E.salesOrderItems.orderId, so.id));
      const ids = lines.map((l) => l.itemId);
      if (d.stockOut) {
        const bal = await balances(tx, { itemIds: ids });
        const need = new Map<string, number>();
        for (const l of lines) need.set(l.itemId, (need.get(l.itemId) ?? 0) + Number(l.qty));
        const falta = [...need].filter(([i, q]) => balanceOf(bal, i, d.locationId!) + 1e-9 < q);
        if (falta.length) {
          const names = await tx.select({ id: E.items.id, n: E.items.name }).from(E.items).where(sql`${E.items.id} in (${sql.join(falta.map(([i]) => sql`${i}`), sql`, `)})`);
          throw new RuleError(`Saldo insuficiente no local escolhido: ${names.map((x) => x.n).join(", ")}. Escolha outro local ou fature sem baixar o estoque.`);
        }
      }
      const [inv] = await tx.insert(E.invoices).values({ tenantId: s.tenant.id, number: d.number, series: d.series, issueDate: d.issueDate, partnerId: so.partnerId, salesOrderId: so.id,
        total: so.total, status: "EMITIDA", stockOut: d.stockOut, locationId: d.stockOut ? d.locationId : null, notes: d.notes?.trim() || null }).returning({ id: E.invoices.id });
      invId = inv.id;
      await tx.insert(E.invoiceItems).values(lines.map((l) => ({ tenantId: s.tenant.id, invoiceId: inv.id, itemId: l.itemId, qty: l.qty, price: l.price, discountPct: l.discountPct })));
      if (d.stockOut) {
        const cost = await avgCosts(tx, ids);
        await insertMovements(tx, s.tenant.id, lines.map((l) => ({ date: d.issueDate, type: "SAIDA", itemId: l.itemId, locationId: d.locationId!, qty: l.qty, unitCost: String(cost.get(l.itemId) ?? 0),
          document: `NF ${d.number}`, notes: `Faturamento do pedido ${so.number}`, partnerId: so.partnerId, invoiceId: inv.id, userName: s.user.name })));
      }
      // contas a receber: condição do pedido, a partir da data da nota
      const [term] = so.paymentTermId ? await tx.select().from(E.paymentTerms).where(eq(E.paymentTerms.id, so.paymentTermId)) : [];
      // condição "Manual" (sem condição e com parcelas lançadas no pedido): mantém as parcelas como foram lançadas
      const manual = !so.paymentTermId && so.installments.length > 0;
      const parc = manual ? so.installments : installments(Number(so.total), term?.days ?? [0], d.issueDate);
      const [cat] = await tx.select({ id: E.finCategories.id }).from(E.finCategories).where(and(eq(E.finCategories.kind, "RECEBER"), eq(E.finCategories.name, "Venda de produtos"))).limit(1);
      if (Number(so.total) > 0) await tx.insert(E.finTitles).values(parc.map((x) => ({
        tenantId: s.tenant.id, kind: "RECEBER", description: `NF ${d.number} · Pedido ${so.number}`, document: `NF ${d.number}`, partnerId: so.partnerId, categoryId: cat?.id ?? null,
        issueDate: d.issueDate, dueDate: x.due, amount: String(x.value), status: "ABERTO", paymentMethodId: so.paymentMethodId, installment: `${x.n}/${parc.length}`,
        originType: "NF", originId: inv.id, originNumber: String(d.number),
      })));
      await tx.update(E.salesOrders).set({ status: "FATURADO", stageId: await stageIdFor(tx, "FATURADO", so.stageId), installments: parc }).where(eq(E.salesOrders.id, so.id));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "nota.emitida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "nota", entityId: invId, data: { numero: d.number } });
  return { ok: true, redirectTo: `/faturamento/${invId}?msg=${encodeURIComponent(`Nota ${d.number} registrada e contas a receber geradas.`)}` };
}

/** Cancela a nota: estorna a baixa de estoque, cancela as contas em aberto e reabre o pedido. */
export async function cancelInvoiceAction(id: string): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  try {
    await s.tx(async (tx) => {
      const [inv] = await tx.select().from(E.invoices).where(eq(E.invoices.id, id)).limit(1).for("update");
      if (!inv) throw new RuleError("Nota não encontrada.");
      if (inv.status === "CANCELADA") throw new RuleError("A nota já está cancelada.");
      const pagos = await tx.select({ id: E.finTitles.id }).from(E.finTitles).where(and(eq(E.finTitles.originType, "NF"), eq(E.finTitles.originId, id), eq(E.finTitles.status, "PAGO"))).limit(1);
      if (pagos.length) throw new RuleError("Há parcelas desta nota já recebidas. Estorne os recebimentos no financeiro antes de cancelar.");
      const lock = await closedUntil(tx);
      if (lock && inv.stockOut && inv.issueDate <= lock) throw new RuleError("O estoque do período desta nota já foi fechado. Reabra o fechamento para cancelar.");
      await tx.delete(E.stockMovements).where(eq(E.stockMovements.invoiceId, id));
      await tx.update(E.finTitles).set({ status: "CANCELADO" }).where(and(eq(E.finTitles.originType, "NF"), eq(E.finTitles.originId, id), eq(E.finTitles.status, "ABERTO")));
      await tx.update(E.invoices).set({ status: "CANCELADA" }).where(eq(E.invoices.id, id));
      if (inv.salesOrderId) await tx.update(E.salesOrders).set({ status: "APROVADO", stageId: await stageIdFor(tx, "APROVADO") }).where(eq(E.salesOrders.id, inv.salesOrderId));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "nota.cancelada", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "nota", entityId: id });
  return { ok: true, message: "Nota cancelada. O estoque foi estornado e o pedido voltou para aprovado." };
}

export async function nextInvoiceNumber(series: string): Promise<number> {
  const s = await act("comercial");
  if (!s) return 1;
  return s.tx(async (tx) => {
    const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${E.invoices.number}), 0)::int` }).from(E.invoices).where(eq(E.invoices.series, series));
    return m + 1;
  });
}
