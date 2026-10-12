"use server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { balances, balanceOf, insertMovements, nextNumber, ruleMsg, RuleError } from "./common";
import { docTotals, installments, isDate, today, addDays } from "@/lib/dates";
import type { ActionState } from "@/lib/action";

const num = z.number().finite();
const day = z.string().optional().nullable().transform((v) => (v && isDate(v) ? v : null));

// ------------------------------------------------------------------------------------
// Solicitação de compra
// ------------------------------------------------------------------------------------
const reqSchema = z.object({
  id: z.string().max(64).optional(), requester: z.string().max(120).optional().nullable(), department: z.string().max(80).optional().nullable(), needDate: day,
  notes: z.string().max(2000).optional().nullable(), items: z.array(z.object({ itemId: z.string().max(64), qty: num.positive(), notes: z.string().max(200).optional().nullable() })).min(1, "Inclua pelo menos um item.").max(300),
});
export async function saveRequestAction(input: z.input<typeof reqSchema>): Promise<ActionState> {
  const s = await act(["compras", "producao", "estoque"]);
  if (!s) return NO_ACCESS;
  const p = reqSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a solicitação." };
  const d = p.data;
  let id = d.id ?? "";
  try {
    await s.tx(async (tx) => {
      const v = { requester: d.requester?.trim() || s.user.name, department: d.department?.trim() || null, needDate: d.needDate, notes: d.notes?.trim() || null };
      if (id) {
        const [cur] = await tx.select().from(E.purchaseRequests).where(eq(E.purchaseRequests.id, id)).limit(1);
        if (!cur) throw new RuleError("Solicitação não encontrada.");
        if (!["ABERTA", "APROVADA"].includes(cur.status)) throw new RuleError("Esta solicitação já está em cotação ou atendida e não pode ser alterada.");
        await tx.update(E.purchaseRequests).set(v).where(eq(E.purchaseRequests.id, id));
        await tx.delete(E.purchaseRequestItems).where(eq(E.purchaseRequestItems.requestId, id));
      } else {
        const number = await nextNumber(tx, s.tenant.id, "purchase_request", E.purchaseRequests, E.purchaseRequests.number);
        const [r] = await tx.insert(E.purchaseRequests).values({ ...v, number, tenantId: s.tenant.id }).returning({ id: E.purchaseRequests.id });
        id = r.id;
      }
      await tx.insert(E.purchaseRequestItems).values(d.items.map((i) => ({ tenantId: s.tenant.id, requestId: id, itemId: i.itemId, qty: String(i.qty), notes: i.notes?.trim() || null })));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: "Solicitação salva.", redirectTo: d.id ? undefined : `/compras/solicitacoes/${id}` };
}

export async function setRequestStatusAction(id: string, status: "ABERTA" | "APROVADA" | "CANCELADA"): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  const r = await s.tx((tx) => tx.update(E.purchaseRequests).set({ status }).where(and(eq(E.purchaseRequests.id, id), inArray(E.purchaseRequests.status, ["ABERTA", "APROVADA", "CANCELADA"]))).returning({ n: E.purchaseRequests.number }));
  if (!r.length) return { error: "Solicitação em cotação ou atendida não muda de situação aqui." };
  return { ok: true, message: { APROVADA: `Solicitação ${r[0].n} aprovada.`, CANCELADA: `Solicitação ${r[0].n} cancelada.`, ABERTA: `Solicitação ${r[0].n} reaberta.` }[status] };
}

export async function deleteRequestAction(id: string): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  const r = await s.tx((tx) => tx.delete(E.purchaseRequests).where(and(eq(E.purchaseRequests.id, id), inArray(E.purchaseRequests.status, ["ABERTA", "CANCELADA"]))).returning({ id: E.purchaseRequests.id }));
  return r.length ? { ok: true, redirectTo: "/compras/solicitacoes?msg=Solicita%C3%A7%C3%A3o%20exclu%C3%ADda." } : { error: "Só solicitações abertas ou canceladas podem ser excluídas." };
}

/** Sugestão de compra: itens abaixo do mínimo e materiais que faltam para as OPs abertas viram uma solicitação. */
export async function suggestRequestAction(): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  try {
    const id = await s.tx(async (tx) => {
      const items = await tx.select().from(E.items).where(and(eq(E.items.active, true), sql`${E.items.type} not in ('PRODUTO_ACABADO','SEMIACABADO')`));
      const bal = await balances(tx, { itemIds: items.map((i) => i.id) });
      // material que ainda falta retirar para as OPs abertas
      const need = await tx.execute<{ item_id: string; q: string }>(sql`
        select c.item_id, sum(greatest(c.qty_required - coalesce((select sum(m.qty) from stock_movements m where m.production_order_id = o.id and m.item_id = c.item_id and m.type = 'SAIDA'), 0), 0))::text q
        from production_order_components c join production_orders o on o.id = c.production_order_id join production_stages st on st.id = o.stage_id
        where c.item_id is not null and st.kind not in ('finalizada','cancelada') group by c.item_id`);
      const nec = new Map(need.rows.map((r) => [r.item_id, Number(r.q)]));
      // o que já está pedido e não chegou, ou já solicitado
      const pend = await tx.execute<{ item_id: string; q: string }>(sql`
        select item_id, sum(q)::text q from (
          select i.item_id, greatest(i.qty - i.received_qty, 0) q from purchase_order_items i join purchase_orders o on o.id = i.order_id where o.status in ('RASCUNHO','ENVIADO','RECEBIDO_PARCIAL')
          union all select ri.item_id, ri.qty from purchase_request_items ri join purchase_requests r on r.id = ri.request_id where r.status in ('ABERTA','APROVADA','EM_COTACAO')
        ) x group by item_id`);
      const ped = new Map(pend.rows.map((r) => [r.item_id, Number(r.q)]));
      const sel = items.map((i) => {
        const proj = balanceOf(bal, i.id) + (ped.get(i.id) ?? 0) - (nec.get(i.id) ?? 0);
        const min = Number(i.minStock), max = Number(i.maxStock);
        const target = max > 0 ? max : min * 2;
        const q = proj < min || proj < 0 ? Math.max(Number(i.minPurchaseQty) || 0, Math.ceil(Math.max(target, 0) - proj)) : 0;
        return { i, q };
      }).filter((x) => x.q > 0);
      if (!sel.length) throw new RuleError("Nada a comprar agora: o estoque, os pedidos em aberto e as solicitações cobrem o mínimo e as OPs.");
      const number = await nextNumber(tx, s.tenant.id, "purchase_request", E.purchaseRequests, E.purchaseRequests.number);
      const [r] = await tx.insert(E.purchaseRequests).values({ tenantId: s.tenant.id, number, requester: s.user.name, department: "Sugestão automática", needDate: addDays(today(), 10),
        notes: "Gerada pela sugestão de compra: itens abaixo do mínimo e materiais que faltam para as OPs abertas." }).returning({ id: E.purchaseRequests.id });
      await tx.insert(E.purchaseRequestItems).values(sel.map((x) => ({ tenantId: s.tenant.id, requestId: r.id, itemId: x.i.id, qty: String(x.q), notes: (nec.get(x.i.id) ?? 0) > 0 ? "Falta para OPs" : "Abaixo do mínimo" })));
      return r.id;
    });
    return { ok: true, message: "Solicitação criada com a sugestão de compra. Revise as quantidades.", redirectTo: `/compras/solicitacoes/${id}` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

// ------------------------------------------------------------------------------------
// Cotação
// ------------------------------------------------------------------------------------
export async function createQuotationAction(requestIds: string[]): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  try {
    const id = await s.tx(async (tx) => {
      const reqs = requestIds.length ? await tx.select().from(E.purchaseRequests).where(inArray(E.purchaseRequests.id, requestIds.slice(0, 50))) : [];
      if (reqs.some((r) => !["ABERTA", "APROVADA"].includes(r.status))) throw new RuleError("Escolha solicitações abertas ou aprovadas.");
      const lines = reqs.length ? await tx.select().from(E.purchaseRequestItems).where(inArray(E.purchaseRequestItems.requestId, reqs.map((r) => r.id))) : [];
      const merged = new Map<string, number>();
      for (const l of lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + Number(l.qty));
      const number = await nextNumber(tx, s.tenant.id, "quotation", E.quotations, E.quotations.number);
      const [q] = await tx.insert(E.quotations).values({ tenantId: s.tenant.id, number, date: today(), dueDate: addDays(today(), 7), requestIds: reqs.map((r) => r.id),
        notes: reqs.length ? `Solicitações ${reqs.map((r) => r.number).join(", ")}` : null }).returning({ id: E.quotations.id });
      if (merged.size) await tx.insert(E.quotationItems).values([...merged].map(([itemId, qty], i) => ({ tenantId: s.tenant.id, quotationId: q.id, itemId, qty: String(qty), position: i })));
      // sugere os fornecedores habituais dos itens
      if (merged.size) {
        const its = await tx.select({ s: E.items.defaultSupplierId }).from(E.items).where(inArray(E.items.id, [...merged.keys()]));
        const sup = await tx.select({ p: E.itemSuppliers.partnerId }).from(E.itemSuppliers).where(inArray(E.itemSuppliers.itemId, [...merged.keys()]));
        const ps = [...new Set([...its.map((x) => x.s), ...sup.map((x) => x.p)].filter(Boolean))].slice(0, 6) as string[];
        if (ps.length) await tx.insert(E.quotationSuppliers).values(ps.map((partnerId) => ({ tenantId: s.tenant.id, quotationId: q.id, partnerId })));
      }
      if (reqs.length) await tx.update(E.purchaseRequests).set({ status: "EM_COTACAO" }).where(inArray(E.purchaseRequests.id, reqs.map((r) => r.id)));
      return q.id;
    });
    return { ok: true, message: "Cotação criada. Inclua os fornecedores e os preços.", redirectTo: `/compras/cotacoes/${id}` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

const qSchema = z.object({
  id: z.string().max(64), dueDate: day, notes: z.string().max(2000).optional().nullable(),
  items: z.array(z.object({ id: z.string().max(64).optional(), itemId: z.string().max(64), qty: num.positive() })).max(300),
  suppliers: z.array(z.object({ id: z.string().max(64).optional(), partnerId: z.string().max(64), freight: num.min(0), paymentTerms: z.string().max(80).optional().nullable(), deliveryDays: z.number().int().min(0).max(999).optional().nullable() })).max(20),
  prices: z.array(z.object({ itemKey: z.string(), supKey: z.string(), price: num.min(0).nullable(), selected: z.boolean() })).max(6000),
});
/** Salva a cotação inteira (itens, fornecedores e o mapa de preços). As chaves ligam preço ↔ item ↔ fornecedor. */
export async function saveQuotationAction(input: z.input<typeof qSchema>): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  const p = qSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a cotação." };
  const d = p.data;
  if (new Set(d.suppliers.map((x) => x.partnerId)).size !== d.suppliers.length) return { error: "O mesmo fornecedor aparece duas vezes." };
  try {
    await s.tx(async (tx) => {
      const [q] = await tx.select().from(E.quotations).where(eq(E.quotations.id, d.id)).limit(1).for("update");
      if (!q) throw new RuleError("Cotação não encontrada.");
      if (q.status !== "ABERTA") throw new RuleError("Esta cotação já foi concluída ou cancelada.");
      await tx.update(E.quotations).set({ dueDate: d.dueDate, notes: d.notes?.trim() || null }).where(eq(E.quotations.id, q.id));
      await tx.delete(E.quotationItems).where(eq(E.quotationItems.quotationId, q.id));
      await tx.delete(E.quotationSuppliers).where(eq(E.quotationSuppliers.quotationId, q.id));
      const itemIds = new Map<string, string>(), supIds = new Map<string, string>();
      for (const [i, it] of d.items.entries()) {
        const [r] = await tx.insert(E.quotationItems).values({ tenantId: s.tenant.id, quotationId: q.id, itemId: it.itemId, qty: String(it.qty), position: i }).returning({ id: E.quotationItems.id });
        itemIds.set(it.id ?? it.itemId, r.id);
      }
      for (const sp of d.suppliers) {
        const [r] = await tx.insert(E.quotationSuppliers).values({ tenantId: s.tenant.id, quotationId: q.id, partnerId: sp.partnerId, freight: String(sp.freight), paymentTerms: sp.paymentTerms?.trim() || null, deliveryDays: sp.deliveryDays ?? null }).returning({ id: E.quotationSuppliers.id });
        supIds.set(sp.id ?? sp.partnerId, r.id);
      }
      const rows = d.prices.map((x) => ({ i: itemIds.get(x.itemKey), s: supIds.get(x.supKey), x })).filter((r) => r.i && r.s && (r.x.price != null || r.x.selected));
      if (rows.length) await tx.insert(E.quotationPrices).values(rows.map((r) => ({ tenantId: s.tenant.id, quotationId: q.id, quotationItemId: r.i!, quotationSupplierId: r.s!, unitPrice: r.x.price == null ? null : String(r.x.price), selected: r.x.selected })));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: "Cotação salva." };
}

/** Conclui a cotação: um pedido de compra (rascunho) por fornecedor vencedor. */
export async function concludeQuotationAction(id: string): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  try {
    const nums = await s.tx(async (tx) => {
      const [q] = await tx.select().from(E.quotations).where(eq(E.quotations.id, id)).limit(1).for("update");
      if (!q || q.status !== "ABERTA") throw new RuleError("A cotação não está em aberto.");
      const sel = await tx.select({ pr: E.quotationPrices, it: E.quotationItems, sp: E.quotationSuppliers }).from(E.quotationPrices)
        .innerJoin(E.quotationItems, eq(E.quotationItems.id, E.quotationPrices.quotationItemId)).innerJoin(E.quotationSuppliers, eq(E.quotationSuppliers.id, E.quotationPrices.quotationSupplierId))
        .where(and(eq(E.quotationPrices.quotationId, id), eq(E.quotationPrices.selected, true))).orderBy(asc(E.quotationItems.position));
      if (!sel.length) throw new RuleError("Escolha o fornecedor vencedor de pelo menos um item (marque o preço na tabela).");
      const items = await tx.select().from(E.quotationItems).where(eq(E.quotationItems.quotationId, id));
      const dup = items.find((i) => sel.filter((x) => x.it.id === i.id).length > 1);
      if (dup) throw new RuleError("Há item com mais de um fornecedor marcado. Deixe só um vencedor por item.");
      const bySup = new Map<string, typeof sel>();
      for (const x of sel) bySup.set(x.sp.id, [...(bySup.get(x.sp.id) ?? []), x]);
      const [pm] = await tx.select({ id: E.paymentMethods.id }).from(E.paymentMethods).where(eq(E.paymentMethods.name, "Boleto")).limit(1);
      const out: number[] = [];
      for (const [, rows] of bySup) {
        const sp = rows[0].sp;
        const lines = rows.map((r) => ({ itemId: r.it.itemId, qty: Number(r.it.qty), price: Number(r.pr.unitPrice ?? 0) }));
        const t = docTotals(lines, 0, Number(sp.freight));
        const number = await nextNumber(tx, s.tenant.id, "purchase_order", E.purchaseOrders, E.purchaseOrders.number);
        const delivery = addDays(today(), sp.deliveryDays ?? 10);
        const [po] = await tx.insert(E.purchaseOrders).values({ tenantId: s.tenant.id, number, status: "RASCUNHO", partnerId: sp.partnerId, issueDate: today(), deliveryDate: delivery, buyer: s.user.name,
          paymentMethodId: pm?.id ?? null, installments: installments(t.total, [28], delivery), freight: sp.freight, total: String(t.total), quotationId: q.id,
          notes: [`Cotação ${q.number}`, sp.paymentTerms ? `Condição combinada: ${sp.paymentTerms}` : null].filter(Boolean).join(" · ") }).returning({ id: E.purchaseOrders.id });
        await tx.insert(E.purchaseOrderItems).values(lines.map((l, i) => ({ tenantId: s.tenant.id, orderId: po.id, itemId: l.itemId, qty: String(l.qty), price: String(l.price), position: i })));
        for (const l of lines) await tx.insert(E.itemSuppliers).values({ tenantId: s.tenant.id, itemId: l.itemId, partnerId: sp.partnerId, lastPrice: String(l.price), leadDays: sp.deliveryDays ?? null })
          .onConflictDoUpdate({ target: [E.itemSuppliers.tenantId, E.itemSuppliers.itemId, E.itemSuppliers.partnerId], set: { lastPrice: String(l.price) } });
        out.push(number);
      }
      await tx.update(E.quotations).set({ status: "CONCLUIDA" }).where(eq(E.quotations.id, id));
      if (q.requestIds.length) await tx.update(E.purchaseRequests).set({ status: "ATENDIDA" }).where(inArray(E.purchaseRequests.id, q.requestIds));
      return out;
    });
    return { ok: true, message: `Cotação concluída: ${nums.length === 1 ? "pedido de compra" : "pedidos de compra"} ${nums.join(", ")} criado(s) como rascunho.`, redirectTo: "/compras/pedidos?st=RASCUNHO" };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function cancelQuotationAction(id: string): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  await s.tx(async (tx) => {
    const [q] = await tx.update(E.quotations).set({ status: "CANCELADA" }).where(and(eq(E.quotations.id, id), eq(E.quotations.status, "ABERTA"))).returning();
    if (q?.requestIds.length) await tx.update(E.purchaseRequests).set({ status: "APROVADA" }).where(and(inArray(E.purchaseRequests.id, q.requestIds), eq(E.purchaseRequests.status, "EM_COTACAO")));
  });
  return { ok: true, message: "Cotação cancelada. As solicitações voltaram para aprovadas." };
}

// ------------------------------------------------------------------------------------
// Pedido de compra e recebimento
// ------------------------------------------------------------------------------------
const poSchema = z.object({
  id: z.string().max(64).optional(), partnerId: z.string().min(1, "Escolha o fornecedor.").max(64), status: z.enum(["RASCUNHO", "ENVIADO", "CANCELADO"]),
  issueDate: z.string().refine(isDate), deliveryDate: day, buyer: z.string().max(120).optional().nullable(),
  paymentMethodId: z.string().max(64).optional().nullable(), paymentTermId: z.string().max(64).optional().nullable(),
  installments: z.array(z.object({ n: z.number().int(), due: z.string().refine(isDate), value: num })).max(120), discount: num.min(0), freight: num.min(0), notes: z.string().max(4000).optional().nullable(),
  items: z.array(z.object({ id: z.string().max(64).optional(), itemId: z.string().max(64), qty: num.positive(), price: num.min(0), discountPct: num.min(0).max(100) })).min(1, "Inclua pelo menos um item.").max(500),
});
export async function savePurchaseOrderAction(input: z.input<typeof poSchema>): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  const p = poSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o pedido." };
  const d = p.data;
  const t = docTotals(d.items, d.discount, d.freight);
  let id = d.id ?? "";
  try {
    await s.tx(async (tx) => {
      const v = { partnerId: d.partnerId, issueDate: d.issueDate, deliveryDate: d.deliveryDate, buyer: d.buyer?.trim() || s.user.name, paymentMethodId: d.paymentMethodId || null, paymentTermId: d.paymentTermId || null,
        installments: d.installments, discount: String(d.discount), freight: String(d.freight), total: String(t.total), notes: d.notes?.trim() || null };
      if (id) {
        const [cur] = await tx.select().from(E.purchaseOrders).where(eq(E.purchaseOrders.id, id)).limit(1).for("update");
        if (!cur) throw new RuleError("Pedido não encontrado.");
        if (["RECEBIDO", "RECEBIDO_PARCIAL"].includes(cur.status)) {
          // já recebido: só deixa ajustar observações e datas
          await tx.update(E.purchaseOrders).set({ notes: v.notes, deliveryDate: v.deliveryDate }).where(eq(E.purchaseOrders.id, id));
          return;
        }
        await tx.update(E.purchaseOrders).set({ ...v, status: d.status }).where(eq(E.purchaseOrders.id, id));
        await tx.delete(E.purchaseOrderItems).where(eq(E.purchaseOrderItems.orderId, id));
      } else {
        const number = await nextNumber(tx, s.tenant.id, "purchase_order", E.purchaseOrders, E.purchaseOrders.number);
        const [r] = await tx.insert(E.purchaseOrders).values({ ...v, status: d.status, number, tenantId: s.tenant.id }).returning({ id: E.purchaseOrders.id });
        id = r.id;
      }
      await tx.insert(E.purchaseOrderItems).values(d.items.map((i, k) => ({ tenantId: s.tenant.id, orderId: id, itemId: i.itemId, qty: String(i.qty), price: String(i.price), discountPct: String(i.discountPct), position: k })));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: "Pedido de compra salvo.", redirectTo: d.id ? undefined : `/compras/pedidos/${id}` };
}

export async function deletePurchaseOrderAction(id: string): Promise<ActionState> {
  const s = await act("compras");
  if (!s) return NO_ACCESS;
  try {
    await s.tx(async (tx) => {
      const [cur] = await tx.select().from(E.purchaseOrders).where(eq(E.purchaseOrders.id, id));
      if (!cur) throw new RuleError("Pedido não encontrado.");
      if (!["RASCUNHO", "CANCELADO"].includes(cur.status)) throw new RuleError("Só rascunhos ou pedidos cancelados podem ser excluídos.");
      const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.stockMovements).where(eq(E.stockMovements.purchaseOrderId, id));
      if (c) throw new RuleError("Este pedido já teve recebimento. Mantenha-o como cancelado.");
      await tx.delete(E.purchaseOrders).where(eq(E.purchaseOrders.id, id));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, redirectTo: "/compras/pedidos?msg=Pedido%20exclu%C3%ADdo." };
}

const recSchema = z.object({ id: z.string().max(64), invoice: z.string().max(40).optional().nullable(), date: z.string().refine(isDate), locationId: z.string().min(1, "Escolha o local.").max(64),
  lines: z.array(z.object({ lineId: z.string().max(64), qty: num.min(0) })).max(500) });
/** Recebe o pedido (total ou parcial): entrada no estoque e, no primeiro recebimento, as contas a pagar. */
export async function receivePurchaseAction(input: z.input<typeof recSchema>): Promise<ActionState> {
  const s = await act(["compras", "estoque"]);
  if (!s) return NO_ACCESS;
  const p = recSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o recebimento." };
  const d = p.data;
  const got = d.lines.filter((l) => l.qty > 0);
  if (!got.length) return { error: "Informe a quantidade recebida de pelo menos um item." };
  try {
    const st = await s.tx(async (tx) => {
      const [po] = await tx.select().from(E.purchaseOrders).where(eq(E.purchaseOrders.id, d.id)).limit(1).for("update");
      if (!po) throw new RuleError("Pedido não encontrado.");
      if (!["RASCUNHO", "ENVIADO", "RECEBIDO_PARCIAL"].includes(po.status)) throw new RuleError("Este pedido não está aguardando recebimento.");
      const lines = await tx.select().from(E.purchaseOrderItems).where(eq(E.purchaseOrderItems.orderId, po.id));
      const doc = d.invoice?.trim() ? `NF ${d.invoice.trim()}` : `Receb. PC ${po.number}`;
      const moves = [];
      for (const g of got) {
        const l = lines.find((x) => x.id === g.lineId);
        if (!l) throw new RuleError("Item do pedido não encontrado.");
        const unit = Number(l.price) * (1 - Number(l.discountPct) / 100);
        moves.push({ date: d.date, type: "ENTRADA", itemId: l.itemId, locationId: d.locationId, qty: String(g.qty), unitCost: String(Math.round(unit * 10000) / 10000), document: doc,
          notes: `Recebimento do pedido de compra ${po.number}`, partnerId: po.partnerId, purchaseOrderId: po.id, userName: s.user.name });
        await tx.update(E.purchaseOrderItems).set({ receivedQty: sql`${E.purchaseOrderItems.receivedQty} + ${g.qty}` }).where(eq(E.purchaseOrderItems.id, l.id));
      }
      await insertMovements(tx, s.tenant.id, moves);
      const first = !(await tx.select({ id: E.finTitles.id }).from(E.finTitles).where(and(eq(E.finTitles.originType, "PC"), eq(E.finTitles.originId, po.id))).limit(1)).length;
      if (first && Number(po.total) > 0) {
        const [term] = po.paymentTermId ? await tx.select().from(E.paymentTerms).where(eq(E.paymentTerms.id, po.paymentTermId)) : [];
        const parc = po.installments.length && !term ? po.installments : installments(Number(po.total), term?.days ?? [28], d.date);
        const [cat] = await tx.select({ id: E.finCategories.id }).from(E.finCategories).where(and(eq(E.finCategories.kind, "PAGAR"), eq(E.finCategories.name, "Matéria-prima"))).limit(1);
        await tx.insert(E.finTitles).values(parc.map((x) => ({ tenantId: s.tenant.id, kind: "PAGAR", description: `PC ${po.number} · ${doc}`, document: doc, partnerId: po.partnerId, categoryId: cat?.id ?? null,
          issueDate: d.date, dueDate: x.due, amount: String(x.value), status: "ABERTO", paymentMethodId: po.paymentMethodId, installment: `${x.n}/${parc.length}`, originType: "PC", originId: po.id, originNumber: String(po.number) })));
      }
      const after = await tx.select().from(E.purchaseOrderItems).where(eq(E.purchaseOrderItems.orderId, po.id));
      const status = after.every((l) => Number(l.receivedQty) >= Number(l.qty) - 1e-9) ? "RECEBIDO" : "RECEBIDO_PARCIAL";
      await tx.update(E.purchaseOrders).set({ status }).where(eq(E.purchaseOrders.id, po.id));
      // atualiza o último preço do fornecedor para cada item
      for (const l of lines) await tx.insert(E.itemSuppliers).values({ tenantId: s.tenant.id, itemId: l.itemId, partnerId: po.partnerId, lastPrice: l.price })
        .onConflictDoUpdate({ target: [E.itemSuppliers.tenantId, E.itemSuppliers.itemId, E.itemSuppliers.partnerId], set: { lastPrice: l.price } });
      return status;
    });
    await audit({ action: "compra.recebida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "pedido_compra", entityId: d.id });
    return { ok: true, message: st === "RECEBIDO" ? "Recebimento registrado: pedido totalmente recebido." : "Recebimento parcial registrado." };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}
