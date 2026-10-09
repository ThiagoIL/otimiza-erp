import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { productionStages, productionStatuses, stockBalances, stockLocations, stockMovements } from "@/db/schema";

/** Saída maior que o saldo do local. A mensagem já vem pronta para o usuário. */
export class StockError extends Error {}

type Movement = {
  tenantId: string; kind: "ENTRADA" | "SAIDA";
  origin?: "MANUAL" | "CONSUMO_OP" | "PRODUCAO_OP" | "PEDIDO_VENDA" | "AJUSTE";
  itemId: string; locationId: string; quantity: number; unitCost?: string | null;
  productionOrderId?: string | null; salesOrderId?: string | null; partnerId?: string | null;
  document?: string | null; notes?: string | null; user: { id: string; name: string };
};

/**
 * Registra uma movimentação e atualiza o saldo do item no local, na mesma transação.
 * O saldo da linha fica travado até o fim da transação, então duas saídas ao mesmo tempo
 * nunca deixam o estoque negativo.
 */
export async function moveStock(tx: Tx, m: Movement): Promise<number> {
  await tx.insert(stockBalances).values({ tenantId: m.tenantId, itemId: m.itemId, locationId: m.locationId, quantity: "0" })
    .onConflictDoNothing({ target: [stockBalances.tenantId, stockBalances.itemId, stockBalances.locationId] });
  const [b] = await tx.select({ id: stockBalances.id, q: stockBalances.quantity }).from(stockBalances)
    .where(and(eq(stockBalances.tenantId, m.tenantId), eq(stockBalances.itemId, m.itemId), eq(stockBalances.locationId, m.locationId)))
    .for("update");
  const current = Number(b.q);
  const next = m.kind === "ENTRADA" ? current + m.quantity : current - m.quantity;
  if (next < -1e-9) throw new StockError(`Saldo insuficiente neste local: há ${current.toLocaleString("pt-BR")} e a saída pede ${m.quantity.toLocaleString("pt-BR")}.`);
  const after = String(Math.max(0, Math.round(next * 1e4) / 1e4));
  await tx.update(stockBalances).set({ quantity: after }).where(eq(stockBalances.id, b.id));
  await tx.insert(stockMovements).values({
    tenantId: m.tenantId, kind: m.kind, origin: m.origin ?? "MANUAL", itemId: m.itemId, locationId: m.locationId,
    quantity: String(m.quantity), unitCost: m.unitCost ?? null, balanceAfter: after,
    productionOrderId: m.productionOrderId ?? null, salesOrderId: m.salesOrderId ?? null, partnerId: m.partnerId ?? null,
    document: m.document ?? null, notes: m.notes ?? null, userId: m.user.id, userName: m.user.name,
  });
  return Number(after);
}

/** Próximo número sequencial da empresa (ordens, pedidos, montagens), sem repetir em acessos simultâneos. */
export async function nextNumber(tx: Tx, table: "production_orders" | "sales_orders" | "assemblies", tenantId: string): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${table}:${tenantId}`}))`);
  const r = await tx.execute<{ n: number }>(sql`select coalesce(max(number), 0)::int + 1 as n from ${sql.identifier(table)} where tenant_id = ${tenantId}`);
  return Number(r.rows[0].n);
}

/** Cadastros iniciais para a empresa começar a usar: local de estoque, etapas e situações da produção. */
export async function ensureSetup(tx: Tx, tenantId: string): Promise<void> {
  const [loc] = await tx.select({ id: stockLocations.id }).from(stockLocations).where(eq(stockLocations.tenantId, tenantId)).limit(1);
  if (!loc) await tx.insert(stockLocations).values({ tenantId, name: "Almoxarifado", description: "Local padrão", isDefault: true }).onConflictDoNothing();
  const [st] = await tx.select({ id: productionStages.id }).from(productionStages).where(eq(productionStages.tenantId, tenantId)).limit(1);
  if (!st) {
    await tx.insert(productionStages).values([
      { tenantId, name: "Programada", position: 1, color: "#5F6B78" },
      { tenantId, name: "Em produção", position: 2, color: "#2557A0" },
      { tenantId, name: "Acabamento", position: 3, color: "#8F6200" },
      { tenantId, name: "Inspeção", position: 4, color: "#7A4FB0" },
      { tenantId, name: "Concluída", position: 5, color: "#2E7D4F", isFinal: true },
    ]).onConflictDoNothing();
  }
  const [ss] = await tx.select({ id: productionStatuses.id }).from(productionStatuses).where(eq(productionStatuses.tenantId, tenantId)).limit(1);
  if (!ss) {
    await tx.insert(productionStatuses).values([
      { tenantId, name: "Normal", color: "#2E7D4F", isDefault: true },
      { tenantId, name: "Aguardando material", color: "#8F6200", isAlert: true },
      { tenantId, name: "Parada", color: "#B3261E", isAlert: true },
      { tenantId, name: "Urgente", color: "#C94D0B", isAlert: true },
    ]).onConflictDoNothing();
  }
}

export async function stagesOf(tx: Tx, tenantId: string) {
  return tx.select().from(productionStages).where(eq(productionStages.tenantId, tenantId)).orderBy(asc(productionStages.position), asc(productionStages.name));
}
