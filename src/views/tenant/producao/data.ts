import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { items, partners, productionStatuses, salesOrders, teamMembers, workCenters } from "@/db/schema";
import type { OrderLookups } from "@/components/OrderForm";
import { stagesOf } from "@/server/stock";

/** Listas dos campos de seleção da ordem de produção. */
export async function orderLookups(tx: Tx, tenantId: string): Promise<OrderLookups> {
  const [its, stages, statuses, centers, members, sales] = [
    await tx.select({ id: items.id, code: items.code, name: items.name, unit: items.unit, type: items.type }).from(items).where(eq(items.active, true)).orderBy(asc(items.code)),
    await stagesOf(tx, tenantId),
    await tx.select({ id: productionStatuses.id, name: productionStatuses.name }).from(productionStatuses).orderBy(desc(productionStatuses.isDefault), asc(productionStatuses.name)),
    await tx.select({ id: workCenters.id, name: workCenters.name }).from(workCenters).where(eq(workCenters.active, true)).orderBy(asc(workCenters.name)),
    await tx.select({ id: teamMembers.id, name: teamMembers.name, role: teamMembers.role }).from(teamMembers).where(eq(teamMembers.active, true)).orderBy(asc(teamMembers.name)),
    await tx.select({ id: salesOrders.id, number: salesOrders.number, customer: partners.name }).from(salesOrders).innerJoin(partners, eq(partners.id, salesOrders.customerId))
      .where(and(sql`${salesOrders.status} in ('ORCAMENTO', 'APROVADO', 'EM_PRODUCAO')`)).orderBy(desc(salesOrders.number)).limit(300),
  ];
  return { items: its, stages: stages.map((s) => ({ id: s.id, name: s.name })), statuses, centers, members, sales };
}
