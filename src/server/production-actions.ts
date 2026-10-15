"use server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { avgCosts, balances, balanceOf, insertMovements, nextNumber, ruleMsg, RuleError } from "./common";
import { opCosts } from "./production-costs";
import { isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";
import type { Tx } from "@/lib/db";

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Copia a estrutura do item para a OP, já multiplicada pela quantidade e com a perda. */
async function copyBom(tx: Tx, tenantId: string, opId: string, itemId: string, qty: number) {
  const bom = await tx.select().from(E.itemBom).where(eq(E.itemBom.itemId, itemId)).orderBy(asc(E.itemBom.position));
  if (bom.length) await tx.insert(E.productionOrderComponents).values(bom.map((b, i) => ({
    tenantId, productionOrderId: opId, itemId: b.componentId, qtyRequired: String(r4(Number(b.qty) * qty * (1 + Number(b.lossPct) / 100))), supply: b.supply, fromBom: true, position: i,
  })));
  return bom.length;
}

async function firstStage(tx: Tx) {
  const [st] = await tx.select().from(E.productionStages).where(ne(E.productionStages.kind, "cancelada")).orderBy(sql`case when ${E.productionStages.kind} = 'aberta' then 0 else 1 end`, asc(E.productionStages.position)).limit(1);
  if (!st) throw new RuleError("Cadastre as etapas das OPs em Produção › Configurações.");
  return st;
}

/** Atualiza a situação de produção do pedido de venda conforme as OPs dele. */
async function syncOrderProduction(tx: Tx, salesOrderId: string | null) {
  if (!salesOrderId) return;
  const ops = await tx.select({ kind: E.productionStages.kind }).from(E.productionOrders).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId)).where(eq(E.productionOrders.salesOrderId, salesOrderId));
  const live = ops.filter((o) => o.kind !== "cancelada");
  const st = !live.length ? "PENDENTE" : live.every((o) => o.kind === "finalizada") ? "PRODUZIDO" : "EM_PRODUCAO";
  await tx.update(E.salesOrders).set({ productionStatus: st }).where(and(eq(E.salesOrders.id, salesOrderId), ne(E.salesOrders.status, "CANCELADO")));
}

// ------------------------------------------------------------------------------------
// Fila de pedidos aprovados
// ------------------------------------------------------------------------------------
const genSchema = z.object({
  orderId: z.string().max(64), lines: z.array(z.object({ itemId: z.string().max(64), qty: z.number().positive().max(1e9) })).min(1, "Marque pelo menos um item.").max(200),
  workCenterId: z.string().max(64).optional().nullable(), responsibleId: z.string().max(64).optional().nullable(), priority: z.enum(["Baixa", "Normal", "Alta", "Urgente"]).default("Normal"),
  needDate: z.string().optional().nullable(),
});
export async function generateOpsAction(input: z.input<typeof genSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = genSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira os itens." };
  const d = p.data;
  try {
    const nums = await s.tx(async (tx) => {
      const [so] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, d.orderId)).limit(1).for("update");
      if (!so || so.status !== "APROVADO") throw new RuleError("O pedido precisa estar aprovado para gerar OP.");
      const st = await firstStage(tx);
      const out: number[] = [];
      for (const l of d.lines) {
        const number = await nextNumber(tx, s.tenant.id, "production_order", E.productionOrders, E.productionOrders.number);
        const [op] = await tx.insert(E.productionOrders).values({ tenantId: s.tenant.id, number, itemId: l.itemId, qty: String(l.qty), salesOrderId: so.id, partnerId: so.partnerId, stageId: st.id,
          workCenterId: d.workCenterId || null, responsibleId: d.responsibleId || null, priority: d.priority, startDate: today(), needDate: d.needDate && isDate(d.needDate) ? d.needDate : so.deliveryDate,
          notes: so.internalNotes }).returning({ id: E.productionOrders.id });
        await copyBom(tx, s.tenant.id, op.id, l.itemId, l.qty);
        out.push(number);
      }
      await syncOrderProduction(tx, so.id);
      return out;
    });
    await audit({ action: "op.gerada", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "pedido", entityId: d.orderId, data: { ops: nums } });
    return { ok: true, message: `${nums.length === 1 ? "OP" : "OPs"} ${nums.join(", ")} ${nums.length === 1 ? "criada" : "criadas"}.` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function noProductionAction(orderId: string, undo = false): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const r = await s.tx(async (tx) => {
    if (undo) return tx.update(E.salesOrders).set({ productionStatus: "PENDENTE" }).where(and(eq(E.salesOrders.id, orderId), eq(E.salesOrders.productionStatus, "NAO_NECESSITA"))).returning({ n: E.salesOrders.number });
    return tx.update(E.salesOrders).set({ productionStatus: "NAO_NECESSITA" }).where(and(eq(E.salesOrders.id, orderId), eq(E.salesOrders.productionStatus, "PENDENTE"))).returning({ n: E.salesOrders.number });
  });
  if (!r.length) return { error: "O pedido não está aguardando produção." };
  return { ok: true, message: undo ? `Pedido ${r[0].n} voltou para a fila da produção.` : `Pedido ${r[0].n} marcado como sem necessidade de produção.` };
}

// ------------------------------------------------------------------------------------
// Ordem de produção
// ------------------------------------------------------------------------------------
const opSchema = z.object({
  id: z.string().max(64).optional(), itemId: z.string().min(1, "Escolha o produto.").max(64), qty: z.number().positive("Informe a quantidade.").max(1e9),
  salesOrderId: z.string().max(64).optional().nullable(), partnerId: z.string().max(64).optional().nullable(), stageId: z.string().max(64).optional().nullable(),
  workCenterId: z.string().max(64).optional().nullable(), responsibleId: z.string().max(64).optional().nullable(), priority: z.enum(["Baixa", "Normal", "Alta", "Urgente"]).default("Normal"),
  startDate: z.string().optional().nullable(), needDate: z.string().optional().nullable(), notes: z.string().max(4000).optional().nullable(),
});
export async function saveOpAction(input: z.input<typeof opSchema>): Promise<ActionState & { id?: string }> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = opSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira os dados da OP." };
  const d = p.data;
  const dt = (v?: string | null) => (v && isDate(v) ? v : null);
  let id = d.id ?? "";
  let number = 0;
  try {
    await s.tx(async (tx) => {
      const values = { itemId: d.itemId, qty: String(d.qty), salesOrderId: d.salesOrderId || null, partnerId: d.partnerId || null, workCenterId: d.workCenterId || null,
        responsibleId: d.responsibleId || null, priority: d.priority, startDate: dt(d.startDate), needDate: dt(d.needDate), notes: d.notes?.trim() || null };
      if (values.salesOrderId && !values.partnerId) {
        const [so] = await tx.select({ p: E.salesOrders.partnerId }).from(E.salesOrders).where(eq(E.salesOrders.id, values.salesOrderId));
        values.partnerId = so?.p ?? null;
      }
      if (id) {
        const [cur] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, id)).limit(1);
        if (!cur) throw new RuleError("OP não encontrada.");
        if (cur.itemId !== d.itemId) {
          const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.productionOrderComponents).where(and(eq(E.productionOrderComponents.productionOrderId, id), sql`${E.productionOrderComponents.qtyDone} > 0`));
          if (c) throw new RuleError("Esta OP já tem apontamentos na estrutura; o produto não pode ser trocado.");
          await tx.delete(E.productionOrderComponents).where(eq(E.productionOrderComponents.productionOrderId, id));
          await copyBom(tx, s.tenant.id, id, d.itemId, d.qty);
        } else if (Number(cur.qty) !== d.qty && Number(cur.qty) > 0) {
          // recalcula as quantidades previstas da estrutura na proporção da nova quantidade
          const f = d.qty / Number(cur.qty);
          await tx.update(E.productionOrderComponents).set({ qtyRequired: sql`round(${E.productionOrderComponents.qtyRequired} * ${f}, 4)` }).where(and(eq(E.productionOrderComponents.productionOrderId, id), eq(E.productionOrderComponents.fromBom, true)));
        }
        await tx.update(E.productionOrders).set(values).where(eq(E.productionOrders.id, id));
        number = cur.number;
        await syncOrderProduction(tx, cur.salesOrderId);
        if (cur.salesOrderId !== values.salesOrderId) await syncOrderProduction(tx, values.salesOrderId);
      } else {
        const st = d.stageId ? (await tx.select().from(E.productionStages).where(eq(E.productionStages.id, d.stageId)))[0] : await firstStage(tx);
        if (!st) throw new RuleError("Etapa inválida.");
        number = await nextNumber(tx, s.tenant.id, "production_order", E.productionOrders, E.productionOrders.number);
        const [op] = await tx.insert(E.productionOrders).values({ ...values, startDate: values.startDate ?? today(), tenantId: s.tenant.id, number, stageId: st.id }).returning({ id: E.productionOrders.id });
        id = op.id;
        await copyBom(tx, s.tenant.id, id, d.itemId, d.qty);
        await syncOrderProduction(tx, values.salesOrderId);
      }
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, id, message: d.id ? `OP ${number} atualizada.` : `OP ${number} criada com a estrutura do produto.`, redirectTo: d.id ? undefined : `/ops/${id}` };
}

export async function moveOpAction(id: string, stageId: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  try {
    const msg = await s.tx(async (tx) => {
      const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, id)).limit(1);
      const [st] = await tx.select().from(E.productionStages).where(eq(E.productionStages.id, stageId)).limit(1);
      if (!op || !st) throw new RuleError("OP ou etapa não encontrada.");
      await tx.update(E.productionOrders).set({ stageId, completedAt: st.kind === "finalizada" ? (op.completedAt ?? today()) : null }).where(eq(E.productionOrders.id, id));
      await syncOrderProduction(tx, op.salesOrderId);
      const left = Number(op.qty) - Number(op.qtyProduced);
      return st.kind === "finalizada" && left > 0
        ? `OP ${op.number} concluída. Atenção: ainda faltam ${left.toLocaleString("pt-BR")} unidades apontadas como produzidas.`
        : `OP ${op.number} movida para “${st.name}”.`;
    });
    return { ok: true, message: msg };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function deleteOpAction(id: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  try {
    await s.tx(async (tx) => {
      const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, id)).limit(1);
      if (!op) throw new RuleError("OP não encontrada.");
      const [{ m }] = await tx.select({ m: sql<number>`count(*)::int` }).from(E.stockMovements).where(eq(E.stockMovements.productionOrderId, id));
      const [{ a }] = await tx.select({ a: sql<number>`count(*)::int` }).from(E.assemblies).where(eq(E.assemblies.productionOrderId, id));
      if (m || a) throw new RuleError("Esta OP já tem retiradas de estoque, produção apontada ou montagem. Mova-a para a etapa de cancelamento em vez de excluir.");
      await tx.delete(E.productionOrders).where(eq(E.productionOrders.id, id));
      await syncOrderProduction(tx, op.salesOrderId);
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "op.excluida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "op", entityId: id });
  return { ok: true, redirectTo: "/ops?msg=OP%20exclu%C3%ADda." };
}

// ---------- estrutura da OP: apontar o que foi feito e incluir itens ----------
export async function setComponentDoneAction(id: string, qtyDone: number): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  if (!Number.isFinite(qtyDone) || qtyDone < 0) return { error: "Quantidade inválida." };
  await s.tx((tx) => tx.update(E.productionOrderComponents).set({ qtyDone: String(qtyDone) }).where(eq(E.productionOrderComponents.id, id)));
  return { ok: true };
}
export async function setComponentSupplyAction(id: string, supply: "FABRICADO" | "ESTOQUE"): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  if (supply !== "FABRICADO" && supply !== "ESTOQUE") return { error: "Operação inválida." };
  await s.tx((tx) => tx.update(E.productionOrderComponents).set({ supply }).where(eq(E.productionOrderComponents.id, id)));
  return { ok: true, message: supply === "FABRICADO" ? "Item marcado como fabricado na OP." : "Item marcado como retirada do estoque." };
}
export async function addComponentsAction(opId: string, rows: { itemId?: string | null; description?: string | null; qty: number }[]): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const ok = rows.filter((r) => (r.itemId || r.description?.trim()) && r.qty > 0).slice(0, 200);
  if (!ok.length) return { error: "Informe o item e a quantidade." };
  await s.tx(async (tx) => {
    const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${E.productionOrderComponents.position}), 0)::int` }).from(E.productionOrderComponents).where(eq(E.productionOrderComponents.productionOrderId, opId));
    const ids = ok.map((r) => r.itemId).filter(Boolean) as string[];
    const types = new Map(ids.length ? (await tx.select({ id: E.items.id, t: E.items.type }).from(E.items).where(inArray(E.items.id, ids))).map((x) => [x.id, String(x.t)]) : []);
    // semiacabado e produto acabado: fabricado na OP; o resto sai do estoque; item sem cadastro é feito na OP
    const sup = (id?: string | null) => (!id || ["SEMIACABADO", "PRODUTO_ACABADO"].includes(types.get(id) ?? "") ? "FABRICADO" : "ESTOQUE");
    await tx.insert(E.productionOrderComponents).values(ok.map((r, i) => ({ tenantId: s.tenant.id, productionOrderId: opId, itemId: r.itemId || null, description: r.itemId ? null : r.description!.trim().slice(0, 200), qtyRequired: String(r.qty), supply: sup(r.itemId), fromBom: false, position: m + i + 1 })));
  });
  return { ok: true, message: ok.length === 1 ? "Item incluído na OP." : `${ok.length} itens incluídos na OP.` };
}
export async function removeComponentAction(id: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.productionOrderComponents).where(eq(E.productionOrderComponents.id, id)));
  return { ok: true, message: "Item removido da OP." };
}
export async function reloadBomAction(opId: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  try {
    const n = await s.tx(async (tx) => {
      const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, opId));
      if (!op) throw new RuleError("OP não encontrada.");
      const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.productionOrderComponents).where(and(eq(E.productionOrderComponents.productionOrderId, opId), sql`${E.productionOrderComponents.qtyDone} > 0`));
      if (c) throw new RuleError("A estrutura desta OP já tem apontamentos. Inclua os itens novos manualmente.");
      await tx.delete(E.productionOrderComponents).where(and(eq(E.productionOrderComponents.productionOrderId, opId), eq(E.productionOrderComponents.fromBom, true)));
      return copyBom(tx, s.tenant.id, opId, op.itemId, Number(op.qty));
    });
    return n ? { ok: true, message: "Estrutura recarregada do cadastro do item." } : { error: "O produto não tem estrutura cadastrada." };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

/** Requisição pela estrutura: retira do estoque o que falta dos componentes da OP. */
export async function requisitionAction(opId: string, rows: { itemId: string; locationId: string; qty: number }[]): Promise<ActionState> {
  const s = await act(["producao", "estoque"]);
  if (!s) return NO_ACCESS;
  const ok = rows.filter((r) => r.qty > 0 && r.itemId && r.locationId).slice(0, 300);
  if (!ok.length) return { error: "Informe a quantidade de pelo menos um material." };
  try {
    await s.tx(async (tx) => {
      const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, opId));
      if (!op) throw new RuleError("OP não encontrada.");
      const bal = await balances(tx, { itemIds: ok.map((r) => r.itemId) });
      for (const r of ok) if (r.qty > balanceOf(bal, r.itemId, r.locationId) + 1e-9) {
        const [it] = await tx.select({ n: E.items.name }).from(E.items).where(eq(E.items.id, r.itemId));
        throw new RuleError(`Saldo insuficiente de ${it?.n ?? "item"} no local escolhido.`);
      }
      const cost = await avgCosts(tx, ok.map((r) => r.itemId));
      await insertMovements(tx, s.tenant.id, ok.map((r) => ({ date: today(), type: "SAIDA", itemId: r.itemId, locationId: r.locationId, qty: String(r.qty), unitCost: String(cost.get(r.itemId) ?? 0),
        document: `OP ${op.number}`, notes: "Requisição pela estrutura da OP", productionOrderId: opId, userName: s.user.name })));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: ok.length === 1 ? "Retirada registrada para a OP." : `${ok.length} retiradas registradas para a OP.` };
}

// ---------- produção apontada (quantidade pronta) ----------
const outSchema = z.object({ opId: z.string().max(64), qty: z.number().positive().max(1e9), date: z.string().refine(isDate), toStock: z.boolean(), locationId: z.string().max(64).optional().nullable(), notes: z.string().max(300).optional().nullable() });
export async function reportOutputAction(input: z.input<typeof outSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = outSchema.safeParse(input);
  if (!p.success) return { error: "Informe a quantidade produzida." };
  const d = p.data;
  if (d.toStock && !d.locationId) return { error: "Escolha o local de entrada no estoque." };
  try {
    const msg = await s.tx(async (tx) => {
      const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, d.opId)).limit(1).for("update");
      if (!op) throw new RuleError("OP não encontrada.");
      const left = Number(op.qty) - Number(op.qtyProduced);
      if (d.qty > left + 1e-9) throw new RuleError(`A OP pede ${Number(op.qty).toLocaleString("pt-BR")} e já tem ${Number(op.qtyProduced).toLocaleString("pt-BR")} produzidas. Faltam ${left.toLocaleString("pt-BR")}.`);
      const [out] = await tx.insert(E.productionOutputs).values({ tenantId: s.tenant.id, productionOrderId: op.id, date: d.date, qty: String(d.qty), locationId: d.toStock ? d.locationId : null, notes: d.notes?.trim() || null, userName: s.user.name }).returning({ id: E.productionOutputs.id });
      let movementId: string | null = null;
      await tx.update(E.productionOrders).set({ qtyProduced: sql`${E.productionOrders.qtyProduced} + ${d.qty}` }).where(eq(E.productionOrders.id, op.id));
      if (d.toStock) {
        const c = await opCosts(tx, op);
        const unit = c.real.total > 0 && Number(op.qty) > 0 ? c.real.total / Number(op.qty) : (await avgCosts(tx, [op.itemId])).get(op.itemId) ?? 0;
        const [mv] = await insertMovements(tx, s.tenant.id, [{ date: d.date, type: "PRODUCAO", itemId: op.itemId, locationId: d.locationId!, qty: String(d.qty), unitCost: String(Math.round(unit * 10000) / 10000),
          document: `OP ${op.number}`, notes: d.notes?.trim() || "Entrada de produção", productionOrderId: op.id, userName: s.user.name }]);
        movementId = mv?.id ?? null;
      }
      // fica também na lista de apontamentos de finalização
      const [it] = await tx.select({ n: E.items.name }).from(E.items).where(eq(E.items.id, op.itemId));
      await tx.insert(E.productionReports).values({ tenantId: s.tenant.id, kind: "FABRICA", date: d.date, productionOrderId: op.id, itemId: op.itemId, description: it?.n ?? "Produto", qty: String(d.qty),
        outputId: out.id, movementId, notes: d.notes?.trim() || null, userId: s.user.id, userName: s.user.name });
      return `${d.qty.toLocaleString("pt-BR")} ${d.qty === 1 ? "unidade apontada" : "unidades apontadas"} na OP ${op.number}${d.toStock ? " e lançadas no estoque" : ""}.`;
    });
    return { ok: true, message: msg };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

// ---------- montagem a partir da OP ----------
const asmSchema = z.object({ opId: z.string().max(64), qty: z.number().positive().max(1e9), name: z.string().trim().min(2, "Informe o nome da montagem.").max(160), address: z.string().max(200).optional().nullable(),
  responsibleId: z.string().max(64).optional().nullable(), dueDate: z.string().optional().nullable() });
export async function createAssemblyFromOpAction(input: z.input<typeof asmSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = asmSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira os dados." };
  const d = p.data;
  try {
    const id = await s.tx(async (tx) => {
      const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, d.opId)).limit(1).for("update");
      if (!op) throw new RuleError("OP não encontrada.");
      const [{ sent }] = await tx.select({ sent: sql<number>`coalesce(sum(${E.assemblies.qty}), 0)::float` }).from(E.assemblies).where(eq(E.assemblies.productionOrderId, op.id));
      const free = Number(op.qtyProduced) - sent;
      if (d.qty > free + 1e-9) throw new RuleError(free > 0 ? `Só há ${free.toLocaleString("pt-BR")} produzidas ainda não enviadas para montagem.` : "Aponte a quantidade produzida na OP antes de enviar para a montagem.");
      const [it] = await tx.select().from(E.items).where(eq(E.items.id, op.itemId));
      const [st] = await tx.select().from(E.assemblyStages).orderBy(asc(E.assemblyStages.position)).limit(1);
      const number = await nextNumber(tx, s.tenant.id, "assembly", E.assemblies, E.assemblies.number);
      const [a] = await tx.insert(E.assemblies).values({ tenantId: s.tenant.id, number, name: d.name, productionOrderId: op.id, qty: String(d.qty), partnerId: op.partnerId, address: d.address?.trim() || null,
        responsibleId: d.responsibleId || null, startDate: today(), dueDate: d.dueDate && isDate(d.dueDate) ? d.dueDate : op.needDate }).returning({ id: E.assemblies.id });
      const [loc] = await tx.insert(E.assemblyLocations).values({ tenantId: s.tenant.id, assemblyId: a.id, name: `Itens da OP ${op.number}`, type: "Outro", stageId: st?.id ?? null }).returning({ id: E.assemblyLocations.id });
      await tx.insert(E.assemblyParts).values({ tenantId: s.tenant.id, assemblyId: a.id, locationId: loc.id, itemId: it.id, qty: String(d.qty) });
      return a.id;
    });
    return { ok: true, message: "Montagem criada a partir da OP.", redirectTo: `/montagens/${id}` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

// ------------------------------------------------------------------------------------
// Apontamentos de horas
// ------------------------------------------------------------------------------------
const hm = (s?: string | null) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? +m[1] * 60 + +m[2] : null; };
const teSchema = z.object({
  id: z.string().max(64).optional(), productionOrderId: z.string().min(1, "Escolha a OP.").max(64), memberId: z.string().min(1, "Escolha quem trabalhou.").max(64),
  stageId: z.string().max(64).optional().nullable(), workCenterId: z.string().max(64).optional().nullable(), date: z.string().refine(isDate, "Data inválida."),
  start: z.string().regex(/^\d{1,2}:\d{2}$/, "Hora de início inválida."), end: z.string().optional().nullable(), breakMinutes: z.number().int().min(0).max(600).default(0),
  notes: z.string().max(500).optional().nullable(), advance: z.boolean().default(false),
});
export async function saveTimeEntryAction(input: z.input<typeof teSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = teSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o apontamento." };
  const d = p.data;
  let hours = 0;
  if (d.end) {
    const a = hm(d.start), b = hm(d.end);
    if (a == null || b == null) return { error: "Horário inválido." };
    hours = (b - a - d.breakMinutes) / 60;
    if (!(hours > 0)) return { error: "O fim precisa ser depois do início, descontado o intervalo." };
  }
  try {
    const msg = await s.tx(async (tx) => {
      const values = { productionOrderId: d.productionOrderId, memberId: d.memberId, stageId: d.stageId || null, workCenterId: d.workCenterId || null, date: d.date, start: d.start, end: d.end || null,
        breakMinutes: d.breakMinutes, hours: String(Math.round(hours * 100) / 100), notes: d.notes?.trim() || null };
      if (d.id) await tx.update(E.timeEntries).set(values).where(eq(E.timeEntries.id, d.id));
      else await tx.insert(E.timeEntries).values({ ...values, tenantId: s.tenant.id });
      if (d.advance && d.end) {
        const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, d.productionOrderId));
        const stages = await tx.select().from(E.productionStages).where(ne(E.productionStages.kind, "cancelada")).orderBy(asc(E.productionStages.position));
        const i = stages.findIndex((x) => x.id === op?.stageId);
        const nx = stages[i + 1];
        if (op && nx && (!d.stageId || d.stageId === op.stageId)) {
          await tx.update(E.productionOrders).set({ stageId: nx.id, completedAt: nx.kind === "finalizada" ? today() : null }).where(eq(E.productionOrders.id, op.id));
          await syncOrderProduction(tx, op.salesOrderId);
          return `Apontamento salvo e OP ${op.number} movida para “${nx.name}”.`;
        }
      }
      return d.end ? `Apontamento salvo: ${hours.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h.` : "Trabalho iniciado.";
    });
    return { ok: true, message: msg };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}
export async function deleteTimeEntryAction(id: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.timeEntries).where(eq(E.timeEntries.id, id)));
  return { ok: true, message: "Apontamento excluído." };
}
