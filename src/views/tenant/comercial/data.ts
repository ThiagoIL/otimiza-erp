import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { items, partners, receivables, salesOrderItems, salesOrders } from "@/db/schema";
import type { SalesLookups } from "@/components/SalesOrderForm";

export async function salesLookups(tx: Tx): Promise<SalesLookups> {
  return {
    customers: await tx.select({ id: partners.id, name: partners.name }).from(partners).where(and(eq(partners.isCustomer, true), eq(partners.active, true))).orderBy(asc(partners.name)),
    items: await tx.select({ id: items.id, code: items.code, name: items.name, unit: items.unit, price: items.salePrice }).from(items).where(eq(items.active, true)).orderBy(asc(items.code)),
  };
}

/** Pedido completo: cabeçalho, cliente, linhas e parcelas. */
export async function loadSalesOrder(tx: Tx, tenantId: string, id: string) {
  const [row] = await tx.select({ o: salesOrders, c: partners }).from(salesOrders).innerJoin(partners, eq(partners.id, salesOrders.customerId))
    .where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, tenantId))).limit(1);
  if (!row) return null;
  const lines = await tx.select({ l: salesOrderItems, code: items.code, name: items.name, unit: items.unit, type: items.type, ncm: items.ncm })
    .from(salesOrderItems).innerJoin(items, eq(items.id, salesOrderItems.itemId)).where(eq(salesOrderItems.orderId, id)).orderBy(asc(salesOrderItems.line));
  const parts = await tx.select().from(receivables).where(eq(receivables.salesOrderId, id)).orderBy(asc(receivables.installment));
  return { ...row, lines, parts };
}
