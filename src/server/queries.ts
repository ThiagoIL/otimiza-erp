import "server-only";
import { and, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import * as E from "@/db/erp";
import { isDate } from "@/lib/dates";

type SP = Record<string, string | undefined>;

/** Filtros da lista de pedidos (também usados na exportação CSV). */
/** Etapa do pedido (a da situação, para pedidos antigos sem etapa gravada). */
export const SO_STAGE = sql`coalesce("sales_orders"."stage_id", (select ss.id from sales_stages ss where ss.system and ss.kind = "sales_orders"."status" limit 1))`;

export async function salesWhere(tenantId: string, sp: SP, withStatus = true): Promise<SQL> {
  const c: SQL[] = [eq(E.salesOrders.tenantId, tenantId)];
  // sem situação escolhida: só os em aberto (proposta e aprovado). "todos" mostra também faturados e cancelados.
  if (withStatus) {
    if (sp.st === "todos") { /* sem filtro */ }
    else if (sp.st && ["PROPOSTA", "APROVADO", "FATURADO", "CANCELADO"].includes(sp.st)) c.push(eq(E.salesOrders.status, sp.st));
    else if (sp.st) c.push(sql`${SO_STAGE} = ${sp.st}`);
    else c.push(sql`${E.salesOrders.status} in ('PROPOSTA', 'APROVADO')`);
  }
  if (sp.num && /^\d+$/.test(sp.num.trim())) c.push(eq(E.salesOrders.number, Number(sp.num.trim())));
  if (sp.cli) c.push(eq(E.salesOrders.partnerId, sp.cli));
  if (sp.de && isDate(sp.de)) c.push(gte(E.salesOrders.issueDate, sp.de));
  if (sp.ate && isDate(sp.ate)) c.push(lte(E.salesOrders.issueDate, sp.ate));
  if (sp.ent_de && isDate(sp.ent_de)) c.push(gte(E.salesOrders.deliveryDate, sp.ent_de));
  if (sp.ent_ate && isDate(sp.ent_ate)) c.push(lte(E.salesOrders.deliveryDate, sp.ent_ate));
  if (sp.vend) c.push(eq(E.salesOrders.salespersonId, sp.vend));
  if (sp.local) c.push(ilike(E.salesOrders.deliveryPlace, `%${sp.local.trim()}%`));
  if (sp.prod) c.push(eq(E.salesOrders.productionStatus, sp.prod));
  if (sp.item) {
    const q = `%${sp.item.trim()}%`;
    c.push(sql`exists (select 1 from sales_order_items si join items i on i.id = si.item_id where si.order_id = "sales_orders"."id" and (i.code ilike ${q} or i.name ilike ${q}))`);
  }
  return and(...c)!;
}


/** Itens do grupo e de todos os subgrupos dele (Toalha inclui Toalha › Algodão). */
export function inGroupTree(groupId: string): SQL {
  return sql`${E.items.groupId} in (with recursive t(id) as (select ${groupId}::text union select g.id from item_groups g join t on g.parent_id = t.id) select id from t)`;
}
