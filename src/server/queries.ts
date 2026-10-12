import "server-only";
import { and, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import * as E from "@/db/erp";
import { isDate } from "@/lib/dates";

type SP = Record<string, string | undefined>;

/** Filtros da lista de pedidos (também usados na exportação CSV). */
export async function salesWhere(tenantId: string, sp: SP, withStatus = true): Promise<SQL> {
  const c: SQL[] = [eq(E.salesOrders.tenantId, tenantId)];
  if (withStatus && sp.st) c.push(eq(E.salesOrders.status, sp.st));
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

