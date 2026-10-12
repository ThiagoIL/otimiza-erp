import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import * as E from "@/db/erp";
import { avgCosts } from "./common";

/**
 * Custo previsto (estrutura e roteiro do item × quantidade) e realizado da OP
 * (materiais retirados do estoque para ela + horas apontadas × custo/hora do centro).
 */
export async function opCosts(tx: Tx, op: { id: string; itemId: string; qty: string }) {
  const q = Number(op.qty);
  const bom = await tx.select().from(E.itemBom).where(eq(E.itemBom.itemId, op.itemId));
  const cost = await avgCosts(tx, bom.map((b) => b.componentId));
  const prevMat = bom.reduce((a, b) => a + Number(b.qty) * (1 + Number(b.lossPct) / 100) * (cost.get(b.componentId) ?? 0), 0) * q;
  const rot = await tx.select({ h: E.itemRouting.hours, c: E.workCenters.costPerHour }).from(E.itemRouting).innerJoin(E.workCenters, eq(E.workCenters.id, E.itemRouting.workCenterId)).where(eq(E.itemRouting.itemId, op.itemId));
  const prevH = rot.reduce((a, r) => a + Number(r.h), 0) * q;
  const prevMo = rot.reduce((a, r) => a + Number(r.h) * Number(r.c), 0) * q;
  const [m] = await tx.select({ v: sql<string>`coalesce(sum(case when ${E.stockMovements.type} = 'SAIDA' then ${E.stockMovements.qty} * ${E.stockMovements.unitCost} when ${E.stockMovements.type} = 'TRANSFERENCIA' then 0 else 0 end), 0)::text` })
    .from(E.stockMovements).where(eq(E.stockMovements.productionOrderId, op.id));
  const [t] = await tx.select({ h: sql<string>`coalesce(sum(${E.timeEntries.hours}), 0)::text`, v: sql<string>`coalesce(sum(${E.timeEntries.hours} * coalesce(${E.workCenters.costPerHour}, 0)), 0)::text` })
    .from(E.timeEntries).leftJoin(E.workCenters, eq(E.workCenters.id, E.timeEntries.workCenterId)).where(eq(E.timeEntries.productionOrderId, op.id));
  const realMat = Number(m.v), realMo = Number(t.v);
  return { prev: { mat: prevMat, mo: prevMo, hours: prevH, total: prevMat + prevMo }, real: { mat: realMat, mo: realMo, hours: Number(t.h), total: realMat + realMo } };
}
