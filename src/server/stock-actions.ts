"use server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { avgCosts, balances, balanceOf, closedUntil, insertMovements, nextNumber, ruleMsg, RuleError } from "./common";
import { isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";
import type { Tx } from "@/lib/db";

const mvSchema = z.object({
  type: z.enum(["ENTRADA", "SAIDA", "TRANSFERENCIA", "AJUSTE"]),
  itemId: z.string().min(1, "Escolha o item.").max(64), locationId: z.string().min(1, "Escolha o local.").max(64), destLocationId: z.string().max(64).optional().nullable(),
  qty: z.number().min(0).max(1e9), unitCost: z.number().min(0).max(1e9).optional().nullable(), date: z.string().refine(isDate, "Data inválida."),
  document: z.string().max(80).optional().nullable(), notes: z.string().max(500).optional().nullable(), partnerId: z.string().max(64).optional().nullable(),
  productionOrderId: z.string().max(64).optional().nullable(),
});

/** Registra uma movimentação manual (entrada, saída, transferência ou ajuste por contagem). */
export async function createMovementAction(input: z.input<typeof mvSchema>): Promise<ActionState> {
  const s = await act(["estoque", "producao"]);
  if (!s) return NO_ACCESS;
  const p = mvSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a movimentação." };
  const d = p.data;
  if (d.type !== "AJUSTE" && !(d.qty > 0)) return { error: "Informe uma quantidade maior que zero." };
  if (d.type === "TRANSFERENCIA" && (!d.destLocationId || d.destLocationId === d.locationId)) return { error: "Escolha um destino diferente da origem." };
  // quem só tem produção pode requisitar material para OP, mas não movimentar o estoque livremente
  if (s.access.mods.estoque !== "editar" && !(d.type === "SAIDA" && d.productionOrderId)) return NO_ACCESS;
  let msg = "";
  try {
    await s.tx(async (tx) => {
      const [it] = await tx.select().from(E.items).where(eq(E.items.id, d.itemId)).limit(1);
      if (!it) throw new RuleError("Item não encontrado.");
      const bal = await balances(tx, { itemIds: [d.itemId] });
      const cur = balanceOf(bal, d.itemId, d.locationId);
      const cost = (await avgCosts(tx, [d.itemId])).get(d.itemId) ?? 0;
      if ((d.type === "SAIDA" || d.type === "TRANSFERENCIA") && d.qty > cur + 1e-9) throw new RuleError(`Saldo insuficiente neste local (disponível: ${cur.toLocaleString("pt-BR")} ${it.unit}).`);
      let qty = d.qty;
      if (d.type === "AJUSTE") {
        qty = Math.round((d.qty - cur) * 10000) / 10000;
        if (qty === 0) throw new RuleError("A quantidade contada é igual ao saldo. Nada a ajustar.");
      }
      await insertMovements(tx, s.tenant.id, [{
        date: d.date, type: d.type, itemId: d.itemId, locationId: d.locationId, destLocationId: d.type === "TRANSFERENCIA" ? d.destLocationId : null,
        qty: String(qty), unitCost: String(d.type === "ENTRADA" && d.unitCost ? d.unitCost : cost),
        document: d.document?.trim() || (d.type === "AJUSTE" ? "Inventário" : null), notes: d.notes?.trim() || null,
        partnerId: d.type === "ENTRADA" ? d.partnerId || null : null, productionOrderId: d.type === "SAIDA" || d.type === "TRANSFERENCIA" ? d.productionOrderId || null : null, userName: s.user.name,
      }]);
      msg = `${{ ENTRADA: "Entrada", SAIDA: "Saída", TRANSFERENCIA: "Transferência", AJUSTE: "Ajuste" }[d.type]} registrada: ${Math.abs(qty).toLocaleString("pt-BR")} ${it.unit} de ${it.name}.`;
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: msg };
}

async function editableMovement(tx: Tx, id: string) {
  const [m] = await tx.select().from(E.stockMovements).where(eq(E.stockMovements.id, id)).limit(1);
  if (!m) throw new RuleError("Movimentação não encontrada.");
  if (m.invoiceId) throw new RuleError("Esta saída veio de uma nota fiscal. Cancele a nota em Faturamento para estornar.");
  if (m.purchaseOrderId) throw new RuleError("Esta entrada veio do recebimento de um pedido de compra. Ajuste pelo pedido de compra.");
  if (m.inventoryId) throw new RuleError("Este ajuste veio de um inventário concluído. Faça um novo inventário para corrigir.");
  const lock = await closedUntil(tx);
  if (lock && m.date <= lock) throw new RuleError(`O estoque está fechado até ${lock.split("-").reverse().join("/")}. Reabra o fechamento para alterar esta movimentação.`);
  return m;
}

/** Altera só a quantidade de uma movimentação manual (o botão pequeno ao lado de excluir). */
export async function updateMovementQtyAction(id: string, qty: number): Promise<ActionState> {
  const s = await act("estoque");
  if (!s) return NO_ACCESS;
  if (!Number.isFinite(qty) || qty === 0 || Math.abs(qty) > 1e9) return { error: "Informe uma quantidade válida." };
  try {
    await s.tx(async (tx) => {
      const m = await editableMovement(tx, id);
      if (m.type !== "AJUSTE" && qty < 0) throw new RuleError("A quantidade deve ser positiva.");
      if (m.type === "PRODUCAO" && m.productionOrderId) {
        const diff = qty - Number(m.qty);
        await tx.update(E.productionOrders).set({ qtyProduced: sql`greatest(0, ${E.productionOrders.qtyProduced} + ${diff})` }).where(eq(E.productionOrders.id, m.productionOrderId));
      }
      await tx.update(E.stockMovements).set({ qty: String(qty), notes: [m.notes, `Quantidade alterada de ${Number(m.qty).toLocaleString("pt-BR")} por ${s.user.name}`].filter(Boolean).join(" · ").slice(0, 500) }).where(eq(E.stockMovements.id, id));
      // saldo não pode ficar negativo no local de origem
      const bal = await balances(tx, { itemIds: [m.itemId] });
      const neg = [...bal].find(([k, v]) => k.startsWith(m.itemId + "|") && v < -1e-9);
      if (neg) throw new RuleError("Com essa quantidade o saldo do item ficaria negativo em um local.");
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "estoque.movimento.alterado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "movimento", entityId: id, data: { qty } });
  return { ok: true, message: "Quantidade alterada. O saldo foi recalculado." };
}

export async function deleteMovementAction(id: string): Promise<ActionState> {
  const s = await act("estoque");
  if (!s) return NO_ACCESS;
  try {
    await s.tx(async (tx) => {
      const m = await editableMovement(tx, id);
      if (m.type === "PRODUCAO" && m.productionOrderId) {
        await tx.update(E.productionOrders).set({ qtyProduced: sql`greatest(0, ${E.productionOrders.qtyProduced} - ${m.qty})` }).where(eq(E.productionOrders.id, m.productionOrderId));
        await tx.delete(E.productionOutputs).where(and(eq(E.productionOutputs.productionOrderId, m.productionOrderId), eq(E.productionOutputs.date, m.date), eq(E.productionOutputs.qty, m.qty)));
      }
      await tx.delete(E.stockMovements).where(eq(E.stockMovements.id, id));
      const bal = await balances(tx, { itemIds: [m.itemId] });
      const neg = [...bal].find(([k, v]) => k.startsWith(m.itemId + "|") && v < -1e-9);
      if (neg) throw new RuleError("Excluir esta entrada deixaria o saldo do item negativo. Exclua antes as saídas que dependem dela.");
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "estoque.movimento.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "movimento", entityId: id });
  return { ok: true, message: "Movimentação excluída. O saldo foi recalculado." };
}

// ------------------------------------------------------------------------------------
// Inventário
// ------------------------------------------------------------------------------------
const invSchema = z.object({ locationId: z.string().min(1, "Escolha o local.").max(64), groupId: z.string().max(64).optional().nullable(), date: z.string().refine(isDate), description: z.string().max(200).optional().nullable(), withZero: z.boolean().default(false) });
export async function createInventoryAction(input: z.input<typeof invSchema>): Promise<ActionState> {
  const s = await act("estoque");
  if (!s) return NO_ACCESS;
  const p = invSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira os dados." };
  const d = p.data;
  try {
    const id = await s.tx(async (tx) => {
      const lock = await closedUntil(tx);
      if (lock && d.date <= lock) throw new RuleError("A data do inventário precisa ser posterior ao último fechamento de estoque.");
      const its = await tx.select({ id: E.items.id }).from(E.items).where(and(eq(E.items.active, true), d.groupId ? eq(E.items.groupId, d.groupId) : sql`true`));
      const bal = await balances(tx, { itemIds: its.map((i) => i.id), locationId: d.locationId, until: d.date });
      const sel = its.filter((i) => d.withZero || Math.abs(balanceOf(bal, i.id, d.locationId)) > 1e-9);
      if (!sel.length) throw new RuleError("Nenhum item com saldo neste local. Marque “incluir itens sem saldo” para contar mesmo assim.");
      const cost = await avgCosts(tx, sel.map((i) => i.id));
      const number = await nextNumber(tx, s.tenant.id, "inventory", E.inventories, E.inventories.number);
      const [inv] = await tx.insert(E.inventories).values({ tenantId: s.tenant.id, number, date: d.date, locationId: d.locationId, groupId: d.groupId || null, description: d.description?.trim() || null, userName: s.user.name }).returning({ id: E.inventories.id });
      for (let i = 0; i < sel.length; i += 500) {
        await tx.insert(E.inventoryItems).values(sel.slice(i, i + 500).map((it) => ({ tenantId: s.tenant.id, inventoryId: inv.id, itemId: it.id, systemQty: String(balanceOf(bal, it.id, d.locationId)), unitCost: String(cost.get(it.id) ?? 0) })));
      }
      return inv.id;
    });
    return { ok: true, redirectTo: `/estoque/inventarios/${id}?msg=${encodeURIComponent("Inventário aberto. Informe as quantidades contadas.")}` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function saveCountsAction(inventoryId: string, counts: { id: string; counted: number | null }[]): Promise<ActionState> {
  const s = await act("estoque");
  if (!s) return NO_ACCESS;
  try {
    await s.tx(async (tx) => {
      const [inv] = await tx.select().from(E.inventories).where(eq(E.inventories.id, inventoryId)).limit(1);
      if (!inv || inv.status !== "ABERTO") throw new RuleError("Este inventário não está aberto.");
      for (const c of counts.slice(0, 5000)) {
        if (c.counted != null && (!Number.isFinite(c.counted) || c.counted < 0)) throw new RuleError("Quantidade contada inválida.");
        await tx.update(E.inventoryItems).set({ countedQty: c.counted == null ? null : String(c.counted) }).where(and(eq(E.inventoryItems.id, c.id), eq(E.inventoryItems.inventoryId, inventoryId)));
      }
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: "Contagem salva." };
}

/** Conclui: gera ajustes para as diferenças entre o contado e o saldo do sistema na data. */
export async function closeInventoryAction(inventoryId: string): Promise<ActionState> {
  const s = await act("estoque");
  if (!s) return NO_ACCESS;
  try {
    const n = await s.tx(async (tx) => {
      const [inv] = await tx.select().from(E.inventories).where(eq(E.inventories.id, inventoryId)).limit(1).for("update");
      if (!inv || inv.status !== "ABERTO") throw new RuleError("Este inventário não está aberto.");
      const rows = await tx.select().from(E.inventoryItems).where(eq(E.inventoryItems.inventoryId, inventoryId));
      const counted = rows.filter((r) => r.countedQty != null);
      if (!counted.length) throw new RuleError("Informe a contagem de pelo menos um item.");
      // saldo atual na data (pode ter mudado desde a abertura)
      const bal = await balances(tx, { itemIds: counted.map((r) => r.itemId), locationId: inv.locationId, until: inv.date });
      const mv = counted.map((r) => ({ r, diff: Math.round((Number(r.countedQty) - balanceOf(bal, r.itemId, inv.locationId)) * 10000) / 10000 })).filter((x) => x.diff !== 0);
      await insertMovements(tx, s.tenant.id, mv.map(({ r, diff }) => ({ date: inv.date, type: "AJUSTE", itemId: r.itemId, locationId: inv.locationId, qty: String(diff), unitCost: r.unitCost,
        document: `Inventário ${inv.number}`, notes: inv.description, inventoryId: inv.id, userName: s.user.name })));
      await tx.update(E.inventories).set({ status: "CONCLUIDO", closedAt: new Date() }).where(eq(E.inventories.id, inventoryId));
      return mv.length;
    });
    return { ok: true, message: n ? `Inventário concluído: ${n} ${n === 1 ? "ajuste gerado" : "ajustes gerados"}.` : "Inventário concluído sem diferenças." };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function cancelInventoryAction(inventoryId: string): Promise<ActionState> {
  const s = await act("estoque");
  if (!s) return NO_ACCESS;
  const r = await s.tx((tx) => tx.update(E.inventories).set({ status: "CANCELADO" }).where(and(eq(E.inventories.id, inventoryId), eq(E.inventories.status, "ABERTO"))).returning({ id: E.inventories.id }));
  return r.length ? { ok: true, message: "Inventário cancelado." } : { error: "Só inventários abertos podem ser cancelados." };
}

// ------------------------------------------------------------------------------------
// Fechamento de estoque
// ------------------------------------------------------------------------------------
export async function closeStockAction(date: string, notes: string): Promise<ActionState> {
  const s = await act("estoque");
  if (!s) return NO_ACCESS;
  if (!isDate(date)) return { error: "Data inválida." };
  if (date > today()) return { error: "Não é possível fechar uma data futura." };
  try {
    await s.tx(async (tx) => {
      const lock = await closedUntil(tx);
      if (lock && date <= lock) throw new RuleError(`Já existe fechamento até ${lock.split("-").reverse().join("/")}. Escolha uma data posterior.`);
      const open = await tx.select({ n: E.inventories.number }).from(E.inventories).where(and(eq(E.inventories.status, "ABERTO"), sql`${E.inventories.date} <= ${date}`)).limit(1);
      if (open.length) throw new RuleError(`Conclua ou cancele o inventário ${open[0].n} antes de fechar o estoque.`);
      const bal = await balances(tx, { until: date });
      const ids = [...new Set([...bal.keys()].map((k) => k.split("|")[0]))];
      const cost = await avgCosts(tx, ids);
      const rows = [...bal].filter(([, q]) => Math.abs(q) > 1e-9).map(([k, q]) => { const [itemId, locationId] = k.split("|"); const c = cost.get(itemId) ?? 0; return { itemId, locationId, qty: q, c }; });
      const total = rows.reduce((a, r) => a + r.qty * r.c, 0);
      const [cl] = await tx.insert(E.stockClosings).values({ tenantId: s.tenant.id, closingDate: date, totalValue: String(Math.round(total * 100) / 100), itemCount: new Set(rows.map((r) => r.itemId)).size, notes: notes.trim().slice(0, 300) || null, userName: s.user.name }).returning({ id: E.stockClosings.id });
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(E.stockClosingItems).values(rows.slice(i, i + 500).map((r) => ({ tenantId: s.tenant.id, closingId: cl.id, itemId: r.itemId, locationId: r.locationId, qty: String(r.qty), avgCost: String(r.c), value: String(Math.round(r.qty * r.c * 100) / 100) })));
      }
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "estoque.fechado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "fechamento", data: { date } });
  return { ok: true, message: `Estoque fechado até ${date.split("-").reverse().join("/")}. Movimentações até essa data ficam travadas.` };
}

export async function reopenStockAction(id: string): Promise<ActionState> {
  const s = await act("estoque");
  if (!s) return NO_ACCESS;
  if (!s.access.isAdmin) return { error: "Só administradores da empresa podem reabrir um fechamento." };
  try {
    await s.tx(async (tx) => {
      const [last] = await tx.select().from(E.stockClosings).where(isNull(E.stockClosings.reopenedAt)).orderBy(desc(E.stockClosings.closingDate)).limit(1);
      if (!last || last.id !== id) throw new RuleError("Só o último fechamento pode ser reaberto.");
      await tx.update(E.stockClosings).set({ reopenedAt: new Date() }).where(eq(E.stockClosings.id, id));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "estoque.reaberto", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "fechamento", entityId: id });
  return { ok: true, message: "Fechamento reaberto. As movimentações do período voltam a poder ser alteradas." };
}

/** Saldo por local e custo médio de um item (para a janela de movimentação). */
export async function itemStockInfoAction(itemId: string): Promise<{ unit: string; cost: number; byLoc: Record<string, number>; defaultLocationId: string | null } | null> {
  const s = await act(["estoque", "producao"]);
  if (!s) return null;
  return s.tx(async (tx) => {
    const [it] = await tx.select().from(E.items).where(eq(E.items.id, itemId)).limit(1);
    if (!it) return null;
    const bal = await balances(tx, { itemIds: [itemId] });
    const cost = (await avgCosts(tx, [itemId])).get(itemId) ?? 0;
    const byLoc: Record<string, number> = {};
    for (const [k, v] of bal) byLoc[k.split("|")[1]] = v;
    return { unit: it.unit, cost, byLoc, defaultLocationId: it.defaultLocationId };
  });
}
