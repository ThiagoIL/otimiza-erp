import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { receivables, salesOrders } from "@/db/schema";
import { installments } from "@/lib/sales";

/**
 * Mantém as parcelas a receber de acordo com a situação do pedido: orçamento e cancelado não têm
 * parcelas em aberto; aprovado em diante tem as parcelas calculadas pela condição de pagamento.
 * Parcelas já recebidas nunca são apagadas.
 */
export async function syncReceivables(tx: Tx, orderId: string): Promise<void> {
  const [o] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  if (!o) return;
  if (o.status === "ORCAMENTO" || o.status === "CANCELADO") {
    await tx.delete(receivables).where(and(eq(receivables.salesOrderId, orderId), sql`${receivables.paidAt} is null`));
    return;
  }
  const [has] = await tx.select({ n: sql<number>`count(*)::int` }).from(receivables).where(eq(receivables.salesOrderId, orderId));
  if (has.n || Number(o.total) <= 0) return;
  await tx.insert(receivables).values(installments(Number(o.total), o.installments, o.issueDate, o.firstDueDays, o.intervalDays).map((p) => ({
    tenantId: o.tenantId, salesOrderId: o.id, customerId: o.customerId, installment: p.number, installmentsTotal: o.installments,
    dueDate: p.dueDate, amount: String(p.amount), paymentMethod: o.paymentMethod,
  })));
}
