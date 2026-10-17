"use server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { avgCosts, balances, balanceOf, insertMovements, nextNumber, ruleMsg, RuleError } from "./common";
import { opCosts } from "./production-costs";
import { cleanCustom, copyBom, firstStage, syncOrderProduction } from "./production-common";
import { isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";
import type { Tx } from "@/lib/db";

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
  work: z.string().max(200).optional().nullable(), custom: z.record(z.string().max(64), z.string().max(500)).optional(),
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
        responsibleId: d.responsibleId || null, priority: d.priority, startDate: dt(d.startDate), needDate: dt(d.needDate), notes: d.notes?.trim() || null,
        work: d.work?.trim() || null, ...(d.custom ? { custom: await cleanCustom(tx, "production_order", d.custom, true) } : {}) };
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
      // OP cancelada: os locais da medição voltam a ficar livres para gerar outra OP
      if (st.kind === "cancelada") await tx.update(E.measurementItems).set({ productionOrderId: null }).where(eq(E.measurementItems.productionOrderId, id));
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
      await tx.update(E.measurementItems).set({ productionOrderId: null }).where(eq(E.measurementItems.productionOrderId, id));
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
      // com medição: a montagem nasce com a árvore andar → local e as peças medidas (o que ainda não foi enviado)
      const lines = op.measurementId ? await tx.select().from(E.measurementItems).where(eq(E.measurementItems.productionOrderId, op.id)).orderBy(asc(E.measurementItems.position)) : [];
      const used = lines.length ? await tx.select({ mi: E.assemblyParts.measurementItemId, q: sql<string>`sum(${E.assemblyParts.qty})::text` }).from(E.assemblyParts)
        .where(inArray(E.assemblyParts.measurementItemId, lines.map((l) => l.id))).groupBy(E.assemblyParts.measurementItemId) : [];
      let rest = d.qty;
      const plan: { l: (typeof lines)[number]; q: number }[] = [];
      for (const l of lines) {
        const free = Number(l.qty) - Number(used.find((u) => u.mi === l.id)?.q ?? 0);
        const q = Math.min(free, rest);
        if (q > 1e-9) { plan.push({ l, q }); rest -= q; }
        if (rest <= 1e-9) break;
      }
      if (plan.length) {
        const floors = new Map<string, string>();
        let pos = 0;
        for (const { l } of plan) {
          const f = l.floor?.trim();
          if (f && !floors.has(f)) {
            const [fl] = await tx.insert(E.assemblyLocations).values({ tenantId: s.tenant.id, assemblyId: a.id, name: f, type: "Andar", stageId: st?.id ?? null, position: pos++ }).returning({ id: E.assemblyLocations.id });
            floors.set(f, fl.id);
          }
        }
        const locs = new Map<string, string>();
        for (const { l, q } of plan) {
          const key = `${l.floor ?? ""}|${l.location}`;
          let lid = locs.get(key);
          if (!lid) {
            const [lc] = await tx.insert(E.assemblyLocations).values({ tenantId: s.tenant.id, assemblyId: a.id, parentId: l.floor?.trim() ? floors.get(l.floor.trim())! : null, name: l.location, type: "Ambiente", stageId: st?.id ?? null, position: pos++ }).returning({ id: E.assemblyLocations.id });
            lid = lc.id; locs.set(key, lid);
          }
          await tx.insert(E.assemblyParts).values({ tenantId: s.tenant.id, assemblyId: a.id, locationId: lid, itemId: it.id, description: l.description, qty: String(q), measurementItemId: l.id });
        }
        if (rest > 1e-9) {
          const [lc] = await tx.insert(E.assemblyLocations).values({ tenantId: s.tenant.id, assemblyId: a.id, name: `Outros itens da OP ${op.number}`, type: "Outro", stageId: st?.id ?? null, position: pos++ }).returning({ id: E.assemblyLocations.id });
          await tx.insert(E.assemblyParts).values({ tenantId: s.tenant.id, assemblyId: a.id, locationId: lc.id, itemId: it.id, qty: String(rest) });
        }
        return a.id;
      }
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

// ------------------------------------------------------------------------------------
// Importar OPs de planilha (Excel ou CSV)
// ------------------------------------------------------------------------------------
const impSchema = z.object({ rows: z.array(z.record(z.string().max(80), z.string().max(400))).min(1, "A planilha está vazia.").max(2000) });
const pickC = (r: Record<string, string>, ...keys: string[]) => { for (const k of keys) { const v = r[k]; if (v != null && String(v).trim() !== "") return String(v).trim(); } return ""; };
const nlC = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const numC = (v: string) => { const t = v.replace(/\s/g, ""); return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); };
const dateC = (v: string) => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(v);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = Number(v);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
  return "x";
};
/**
 * Cria OPs a partir de uma planilha. Colunas: Item (código) e Quantidade; opcionais: Necessidade, Prioridade,
 * Pedido (nº do pedido de venda), Obra, Observação e uma coluna para cada campo da OP (ex.: Tipo, Pintura).
 */
export async function importOpsAction(input: z.input<typeof impSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = impSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a planilha." };
  const rows = p.data.rows;
  try {
    const nums = await s.tx(async (tx) => {
      const fields = await tx.select().from(E.customFields).where(and(eq(E.customFields.entity, "production_order"), eq(E.customFields.active, true)));
      const codes = [...new Set(rows.map((r) => pickC(r, "item", "codigo", "codigo do item", "cod", "produto")).filter(Boolean))];
      const items = codes.length ? await tx.select({ id: E.items.id, code: E.items.code }).from(E.items).where(inArray(E.items.code, codes)) : [];
      const byCode = new Map(items.map((i) => [i.code.toLowerCase(), i.id]));
      const pvs = [...new Set(rows.map((r) => Number(pickC(r, "pedido", "pedido de venda", "pv"))).filter((n) => n > 0))];
      const orders = pvs.length ? await tx.select().from(E.salesOrders).where(inArray(E.salesOrders.number, pvs)) : [];
      const prios = ["Baixa", "Normal", "Alta", "Urgente"];
      const errs: string[] = [];
      const plan: { itemId: string; qty: number; needDate: string | null; priority: string; so: (typeof orders)[number] | undefined; work: string | null; notes: string | null; custom: Record<string, string> }[] = [];
      rows.forEach((r, k) => {
        const line = k + 2;
        const code = pickC(r, "item", "codigo", "codigo do item", "cod", "produto");
        const qs = pickC(r, "quantidade", "qtd", "qtde", "quant");
        if (!code && !qs) return;
        const itemId = byCode.get(code.toLowerCase());
        if (!code) errs.push(`linha ${line}: falta o código do item`); else if (!itemId) errs.push(`linha ${line}: item ${code} não cadastrado`);
        const qty = numC(qs);
        if (!(qty > 0)) errs.push(`linha ${line}: quantidade inválida`);
        const need = dateC(pickC(r, "necessidade", "data de necessidade", "entrega", "prazo"));
        if (need === "x") errs.push(`linha ${line}: data inválida`);
        const pr = pickC(r, "prioridade");
        const priority = pr ? prios.find((x) => nlC(x) === nlC(pr)) : "Normal";
        if (!priority) errs.push(`linha ${line}: prioridade deve ser Baixa, Normal, Alta ou Urgente`);
        const pvN = Number(pickC(r, "pedido", "pedido de venda", "pv"));
        const so = pvN ? orders.find((o) => o.number === pvN) : undefined;
        if (pvN && !so) errs.push(`linha ${line}: pedido ${pvN} não encontrado`);
        const custom: Record<string, string> = {};
        for (const f of fields) {
          const v = r[nlC(f.label)];
          if (v == null || String(v).trim() === "") { if (f.required) errs.push(`linha ${line}: preencha ${f.label}`); continue; }
          let val = String(v).trim();
          if (f.type === "lista" && f.options.length) { const hit = f.options.find((o) => nlC(o) === nlC(val)); if (!hit) { errs.push(`linha ${line}: “${val}” não é opção de ${f.label}`); continue; } val = hit; }
          custom[f.id] = val;
        }
        if (itemId && qty > 0 && priority && need !== "x") plan.push({ itemId, qty, needDate: need, priority, so, work: pickC(r, "obra", "local", "local de entrega") || so?.deliveryPlace || null, notes: pickC(r, "observacao", "obs") || null, custom });
      });
      if (errs.length) throw new RuleError(`Nada foi importado. Corrija a planilha: ${errs.slice(0, 8).join("; ")}${errs.length > 8 ? ` e mais ${errs.length - 8}` : ""}.`);
      if (!plan.length) throw new RuleError("Nenhuma linha com item e quantidade na planilha.");
      const st = await firstStage(tx);
      const out: number[] = [];
      for (const l of plan) {
        const number = await nextNumber(tx, s.tenant.id, "production_order", E.productionOrders, E.productionOrders.number);
        const [op] = await tx.insert(E.productionOrders).values({ tenantId: s.tenant.id, number, itemId: l.itemId, qty: String(l.qty), salesOrderId: l.so?.id ?? null, partnerId: l.so?.partnerId ?? null,
          stageId: st.id, priority: l.priority, startDate: today(), needDate: l.needDate ?? l.so?.deliveryDate ?? null, notes: l.notes, work: l.work, custom: l.custom }).returning({ id: E.productionOrders.id });
        await copyBom(tx, s.tenant.id, op.id, l.itemId, l.qty);
        out.push(number);
      }
      for (const id of new Set(plan.map((l) => l.so?.id).filter(Boolean) as string[])) await syncOrderProduction(tx, id);
      return out;
    });
    await audit({ action: "op.importada", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "op", entityId: String(nums[0] ?? ""), data: { ops: nums } });
    return { ok: true, message: `${nums.length} ${nums.length === 1 ? "OP importada" : "OPs importadas"} (${nums[0]}${nums.length > 1 ? ` a ${nums[nums.length - 1]}` : ""}).` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}
