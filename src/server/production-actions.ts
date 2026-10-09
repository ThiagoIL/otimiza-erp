"use server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@/lib/db";
import {
  items, productionOrderMaterials, productionOrders, productionStages, productionStatuses, salesOrders,
  stockMovements, teamMembers, workCenters,
} from "@/db/schema";
import { SESSION_EXPIRED, tenantUserForAction } from "@/lib/context";
import { audit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/errors";
import { formObject, keepValues, parseLines, zColor, zDay, zDecimal, zOpt, zodFail, zRef } from "@/lib/forms";
import { opNumber } from "@/lib/format";
import type { ActionState } from "@/lib/action";
import { ensureSetup, moveStock, nextNumber, StockError } from "./stock";
import { syncReceivables } from "./receivables";
import { col } from "@/lib/sql";

class UserError extends Error {}
const toNumber = (v: string | number) => { const t = String(v).trim(); return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); };
const zQty = (label: string) => zDecimal(label).refine((v) => Number(v) > 0, `${label}: informe uma quantidade maior que zero.`);

const materialLine = z.object({
  item: z.string().min(1, "escolha o material").max(64),
  qtd: z.union([z.string(), z.number()]).transform(toNumber).refine((n) => Number.isFinite(n) && n > 0 && n < 1e10, "informe a quantidade do material"),
});

const orderSchema = z.object({
  id: z.string().max(64).optional(),
  item: z.string().trim().min(1, "Escolha o produto a fabricar.").max(64),
  quantidade: zQty("Quantidade"),
  etapa: zRef,
  situacao: zRef,
  centro: zRef,
  responsavel: zRef,
  pedido: zRef,
  prioridade: z.enum(["1", "2", "3"]).default("2"),
  inicio: zDay("Início"),
  prazo: zDay("Prazo"),
  observacoes: zOpt(1000),
  materiais: z.string().max(20000).optional(),
});

/** Confere que cada referência escolhida existe nesta empresa (o RLS já barra outras empresas). */
async function exists(tx: Tx, table: typeof items | typeof productionStages | typeof productionStatuses | typeof workCenters | typeof teamMembers | typeof salesOrders, id: string | null, label: string) {
  if (!id) return;
  const [r] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (!r) throw new UserError(`${label} não encontrado(a). Atualize a página.`);
}

export async function saveOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = orderSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const mats = parseLines(d.materiais, materialLine);
  if (typeof mats === "string") return { error: `Materiais: ${mats}`, values: keepValues(raw) };
  if (new Set(mats.map((m) => m.item)).size !== mats.length) return { error: "Materiais: o mesmo item aparece mais de uma vez.", values: keepValues(raw) };
  if (d.inicio && d.prazo && d.prazo < d.inicio) return { fields: { prazo: "O prazo não pode ser antes do início." }, error: "Confira os campos destacados.", values: keepValues(raw) };
  const tid = s.tenant.id;
  let id = d.id ?? "";
  let number = 0;
  try {
    await withTenant(tid, async (tx) => {
      await ensureSetup(tx, tid);
      await exists(tx, items, d.item, "Produto");
      await exists(tx, productionStages, d.etapa, "Etapa");
      await exists(tx, productionStatuses, d.situacao, "Situação");
      await exists(tx, workCenters, d.centro, "Centro de trabalho");
      await exists(tx, teamMembers, d.responsavel, "Responsável");
      await exists(tx, salesOrders, d.pedido, "Pedido de venda");
      for (const m of mats) await exists(tx, items, m.item, "Material");
      const [first] = await tx.select({ id: productionStages.id }).from(productionStages).orderBy(productionStages.position).limit(1);
      const [defStatus] = await tx.select({ id: productionStatuses.id }).from(productionStatuses).where(eq(productionStatuses.isDefault, true)).limit(1);
      const values = {
        itemId: d.item, quantity: d.quantidade, workCenterId: d.centro, responsibleId: d.responsavel, salesOrderId: d.pedido,
        priority: Number(d.prioridade), startDate: d.inicio, dueDate: d.prazo, notes: d.observacoes,
      };
      if (id) {
        const r = await tx.update(productionOrders).set({ ...values, statusId: d.situacao })
          .where(and(eq(productionOrders.id, id), eq(productionOrders.tenantId, tid))).returning({ number: productionOrders.number });
        if (!r.length) throw new UserError("Ordem de produção não encontrada.");
        number = r[0].number;
        if (d.etapa) await setStage(tx, tid, id, d.etapa);
        await tx.delete(productionOrderMaterials).where(eq(productionOrderMaterials.orderId, id));
      } else {
        number = await nextNumber(tx, "production_orders", tid);
        const stageId = d.etapa ?? first.id;
        const [st] = await tx.select({ isFinal: productionStages.isFinal }).from(productionStages).where(eq(productionStages.id, stageId));
        const [r] = await tx.insert(productionOrders).values({
          ...values, tenantId: tid, number, stageId, statusId: d.situacao ?? defStatus?.id ?? null, createdBy: s.user.name,
          finishedAt: st?.isFinal ? new Date() : null,
        }).returning({ id: productionOrders.id });
        id = r.id;
        if (d.pedido) {
          await tx.update(salesOrders).set({ status: "EM_PRODUCAO" }).where(and(eq(salesOrders.id, d.pedido), sql`${salesOrders.status} in ('ORCAMENTO', 'APROVADO')`));
          await syncReceivables(tx, d.pedido);
        }
      }
      if (mats.length) await tx.insert(productionOrderMaterials).values(mats.map((m) => ({ tenantId: tid, orderId: id, itemId: m.item, quantity: String(m.qtd) })));
    });
  } catch (err) {
    if (err instanceof UserError) return { error: err.message, values: keepValues(raw) };
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  await audit({ action: d.id ? "op.alterada" : "op.criada", tenantId: tid, userId: s.user.id, userEmail: s.user.email, entity: "ordem_producao", entityId: id, data: { numero: number } });
  return { ok: true, redirectTo: `/producao/${id}?msg=${encodeURIComponent(`${opNumber(number)} ${d.id ? "salva" : "criada"}.`)}` };
}

/** Muda a etapa e marca/desmarca a conclusão conforme a etapa final. */
async function setStage(tx: Tx, tid: string, orderId: string, stageId: string) {
  const [st] = await tx.select({ isFinal: productionStages.isFinal }).from(productionStages).where(eq(productionStages.id, stageId)).limit(1);
  if (!st) throw new UserError("Etapa não encontrada.");
  const r = await tx.update(productionOrders)
    .set({ stageId, finishedAt: st.isFinal ? sql`coalesce(${productionOrders.finishedAt}, now())` : null })
    .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tid))).returning({ number: productionOrders.number });
  if (!r.length) throw new UserError("Ordem de produção não encontrada.");
  return r[0].number;
}

/** Usada pelo kanban ao arrastar um cartão para outra coluna. */
export async function moveOrderToStage(orderId: string, stageId: string): Promise<{ error?: string }> {
  const s = await tenantUserForAction();
  if (!s) return { error: SESSION_EXPIRED.error };
  if (typeof orderId !== "string" || typeof stageId !== "string" || orderId.length > 64 || stageId.length > 64) return { error: "Dados inválidos." };
  try {
    const n = await withTenant(s.tenant.id, (tx) => setStage(tx, s.tenant.id, orderId, stageId));
    await audit({ action: "op.etapa", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "ordem_producao", entityId: orderId, data: { numero: n, etapa: stageId } });
    return {};
  } catch (err) {
    return { error: err instanceof UserError ? err.message : friendlyDbError(err) };
  }
}

export async function changeStageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await moveOrderToStage(String(fd.get("id") ?? ""), String(fd.get("etapa") ?? ""));
  return r.error ? { error: r.error } : { ok: true, message: "Etapa atualizada." };
}

export async function changeOrderStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const statusId = String(fd.get("situacao") ?? "").slice(0, 64) || null;
  try {
    await withTenant(s.tenant.id, async (tx) => {
      await exists(tx, productionStatuses, statusId, "Situação");
      const r = await tx.update(productionOrders).set({ statusId }).where(and(eq(productionOrders.id, id), eq(productionOrders.tenantId, s.tenant.id))).returning({ id: productionOrders.id });
      if (!r.length) throw new UserError("Ordem de produção não encontrada.");
    });
  } catch (err) {
    return { error: err instanceof UserError ? err.message : friendlyDbError(err) };
  }
  return { ok: true, message: "Situação atualizada." };
}

const reportSchema = z.object({
  id: z.string().min(1).max(64),
  quantidade: zQty("Quantidade produzida"),
  local: z.string().trim().min(1, "Escolha o local de estoque.").max(64),
  concluir: z.string().optional(),
});

/** Apontamento: dá entrada no produto fabricado e soma na quantidade produzida da ordem. */
export async function reportProductionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = reportSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const tid = s.tenant.id;
  let number = 0;
  try {
    await withTenant(tid, async (tx) => {
      const [op] = await tx.select({ number: productionOrders.number, itemId: productionOrders.itemId, cost: items.cost, salesOrderId: productionOrders.salesOrderId })
        .from(productionOrders).innerJoin(items, eq(items.id, productionOrders.itemId)).where(and(eq(productionOrders.id, d.id), eq(productionOrders.tenantId, tid))).limit(1).for("update", { of: productionOrders });
      if (!op) throw new UserError("Ordem de produção não encontrada.");
      number = op.number;
      await moveStock(tx, {
        tenantId: tid, kind: "ENTRADA", origin: "PRODUCAO_OP", itemId: op.itemId, locationId: d.local, quantity: Number(d.quantidade),
        unitCost: op.cost, productionOrderId: d.id, salesOrderId: op.salesOrderId, document: opNumber(op.number), user: { id: s.user.id, name: s.user.name },
      });
      await tx.update(productionOrders).set({ producedQty: sql`${productionOrders.producedQty} + ${d.quantidade}` }).where(eq(productionOrders.id, d.id));
      if (d.concluir === "on") {
        const [fin] = await tx.select({ id: productionStages.id }).from(productionStages).where(eq(productionStages.isFinal, true)).orderBy(productionStages.position).limit(1);
        if (fin) await setStage(tx, tid, d.id, fin.id);
      }
    });
  } catch (err) {
    if (err instanceof UserError || err instanceof StockError) return { error: err.message, values: keepValues(raw) };
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  await audit({ action: "op.apontamento", tenantId: tid, userId: s.user.id, userEmail: s.user.email, entity: "ordem_producao", entityId: d.id, data: { numero: number, quantidade: d.quantidade } });
  return { ok: true, message: `Produção apontada: ${d.quantidade.replace(".", ",")} com entrada no estoque.`, values: {} };
}

/** Retira do estoque, de uma vez, tudo o que ainda falta dos materiais previstos da ordem. */
export async function withdrawMaterialsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const local = String(fd.get("local") ?? "").slice(0, 64);
  if (!local) return { fields: { local: "Escolha o local." }, error: "Confira os campos destacados." };
  const tid = s.tenant.id;
  let count = 0;
  try {
    await withTenant(tid, async (tx) => {
      const [op] = await tx.select({ number: productionOrders.number }).from(productionOrders).where(and(eq(productionOrders.id, id), eq(productionOrders.tenantId, tid))).limit(1);
      if (!op) throw new UserError("Ordem de produção não encontrada.");
      const pend = await tx.select({
        itemId: productionOrderMaterials.itemId, cost: items.cost,
        falta: sql<string>`${col(productionOrderMaterials.quantity)} - coalesce((select sum(case when ${col(stockMovements.kind)} = 'SAIDA' then ${col(stockMovements.quantity)} else -${col(stockMovements.quantity)} end)
          from ${stockMovements} where ${col(stockMovements.productionOrderId)} = ${id} and ${col(stockMovements.itemId)} = ${col(productionOrderMaterials.itemId)} and ${col(stockMovements.origin)} = 'CONSUMO_OP'), 0)`,
      }).from(productionOrderMaterials).innerJoin(items, eq(items.id, productionOrderMaterials.itemId)).where(eq(productionOrderMaterials.orderId, id));
      for (const m of pend) {
        const q = Math.round(Number(m.falta) * 1e4) / 1e4;
        if (q <= 0) continue;
        await moveStock(tx, {
          tenantId: tid, kind: "SAIDA", origin: "CONSUMO_OP", itemId: m.itemId, locationId: local, quantity: q, unitCost: m.cost,
          productionOrderId: id, document: opNumber(op.number), user: { id: s.user.id, name: s.user.name },
        });
        count++;
      }
    });
  } catch (err) {
    if (err instanceof UserError || err instanceof StockError) return { error: err.message };
    return { error: friendlyDbError(err) };
  }
  if (!count) return { message: "Nenhum material pendente de retirada." };
  await audit({ action: "op.retirada", tenantId: tid, userId: s.user.id, userEmail: s.user.email, entity: "ordem_producao", entityId: id, data: { materiais: count } });
  return { ok: true, redirectTo: `/producao/${id}?msg=${encodeURIComponent(`${count} ${count === 1 ? "material retirado" : "materiais retirados"} do estoque para a ordem.`)}` };
}

export async function deleteOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  if (s.user.role !== "TENANT_ADMIN") return { error: "Apenas administradores da empresa podem excluir ordens de produção." };
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const r = await withTenant(s.tenant.id, async (tx) => {
    const [m] = await tx.select({ n: sql<number>`count(*)::int` }).from(stockMovements).where(eq(stockMovements.productionOrderId, id));
    if (m.n) return -1;
    return (await tx.delete(productionOrders).where(and(eq(productionOrders.id, id), eq(productionOrders.tenantId, s.tenant.id))).returning({ number: productionOrders.number }))[0]?.number ?? 0;
  });
  if (r === -1) return { error: "Esta ordem já movimentou o estoque e não pode ser excluída. Mova-a para a etapa final ou marque uma situação." };
  if (!r) return { error: "Ordem de produção não encontrada." };
  await audit({ action: "op.excluida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "ordem_producao", entityId: id, data: { numero: r } });
  return { ok: true, redirectTo: `/producao?msg=${encodeURIComponent(`${opNumber(r)} excluída.`)}` };
}

// ---------- Configurações da produção: etapas, situações, centros e equipe ----------

type Cfg = { ok: true } | { error: string; field?: string };
async function saveCfg(fd: FormData, label: string, run: (tx: Tx, tid: string, raw: Record<string, string>) => Promise<void>): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  try {
    await withTenant(s.tenant.id, (tx) => run(tx, s.tenant.id, raw));
  } catch (err) {
    if (err instanceof z.ZodError) return zodFail(err, raw);
    if (err instanceof UserError) return { error: err.message, values: keepValues(raw) };
    return { fields: { nome: friendlyDbError(err) }, error: "Confira os campos destacados.", values: keepValues(raw) };
  }
  await audit({ action: `${label}.salvo`, tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: label, entityId: raw.id, data: { nome: raw.nome } });
  return { ok: true, message: "Salvo.", values: raw.id ? undefined : {} };
}

async function deleteCfg(fd: FormData, label: string, run: (tx: Tx, id: string) => Promise<Cfg>): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  if (s.user.role !== "TENANT_ADMIN") return { error: "Apenas administradores da empresa podem excluir cadastros." };
  const id = String(fd.get("id") ?? "").slice(0, 64);
  let r: Cfg;
  try { r = await withTenant(s.tenant.id, (tx) => run(tx, id)); } catch (err) { return { error: friendlyDbError(err, "Não foi possível excluir.") }; }
  if ("error" in r) return { error: r.error };
  await audit({ action: `${label}.excluido`, tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: label, entityId: id });
  return { ok: true, message: "Excluído." };
}

const stageSchema = z.object({
  id: z.string().max(64).optional(), nome: z.string().trim().min(2, "Informe o nome.").max(40),
  ordem: z.coerce.number().int().min(0).max(99).default(0), cor: zColor, final: z.string().optional(),
});
export async function saveStageAction(_: ActionState, fd: FormData) {
  return saveCfg(fd, "etapa", async (tx, tenantId, raw) => {
    const d = stageSchema.parse(raw);
    const v = { name: d.nome, position: d.ordem, color: d.cor, isFinal: d.final === "on" };
    if (d.id) await tx.update(productionStages).set(v).where(and(eq(productionStages.id, d.id), eq(productionStages.tenantId, tenantId)));
    else await tx.insert(productionStages).values({ ...v, tenantId });
  });
}
export async function deleteStageAction(_: ActionState, fd: FormData) {
  return deleteCfg(fd, "etapa", async (tx, id) => {
    const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(productionOrders).where(eq(productionOrders.stageId, id));
    if (u.n) return { error: `Há ${u.n} ordens nesta etapa. Mova-as antes de excluir.` };
    const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(productionStages);
    if (c.n <= 1) return { error: "É preciso manter ao menos uma etapa." };
    await tx.delete(productionStages).where(eq(productionStages.id, id));
    return { ok: true };
  });
}

const statusSchema = z.object({
  id: z.string().max(64).optional(), nome: z.string().trim().min(2, "Informe o nome.").max(40), cor: zColor,
  alerta: z.string().optional(), padrao: z.string().optional(),
});
export async function saveStatusAction(_: ActionState, fd: FormData) {
  return saveCfg(fd, "situacao", async (tx, tenantId, raw) => {
    const d = statusSchema.parse(raw);
    const v = { name: d.nome, color: d.cor, isAlert: d.alerta === "on", isDefault: d.padrao === "on" };
    if (v.isDefault) await tx.update(productionStatuses).set({ isDefault: false }).where(eq(productionStatuses.tenantId, tenantId));
    if (d.id) await tx.update(productionStatuses).set(v).where(and(eq(productionStatuses.id, d.id), eq(productionStatuses.tenantId, tenantId)));
    else await tx.insert(productionStatuses).values({ ...v, tenantId });
  });
}
export async function deleteStatusAction(_: ActionState, fd: FormData) {
  return deleteCfg(fd, "situacao", async (tx, id) => {
    await tx.delete(productionStatuses).where(eq(productionStatuses.id, id));
    return { ok: true };
  });
}

const centerSchema = z.object({
  id: z.string().max(64).optional(), nome: z.string().trim().min(2, "Informe o nome.").max(60), descricao: zOpt(160), ativo: z.string().optional(),
});
export async function saveCenterAction(_: ActionState, fd: FormData) {
  return saveCfg(fd, "centro", async (tx, tenantId, raw) => {
    const d = centerSchema.parse(raw);
    const v = { name: d.nome, description: d.descricao, active: d.id ? d.ativo === "on" : true };
    if (d.id) await tx.update(workCenters).set(v).where(and(eq(workCenters.id, d.id), eq(workCenters.tenantId, tenantId)));
    else await tx.insert(workCenters).values({ ...v, tenantId });
  });
}
export async function deleteCenterAction(_: ActionState, fd: FormData) {
  return deleteCfg(fd, "centro", async (tx, id) => {
    await tx.delete(workCenters).where(eq(workCenters.id, id));
    return { ok: true };
  });
}

const memberSchema = z.object({
  id: z.string().max(64).optional(), nome: z.string().trim().min(2, "Informe o nome.").max(80), funcao: zOpt(40),
  centro: zRef, telefone: zOpt(30), ativo: z.string().optional(),
});
export async function saveMemberAction(_: ActionState, fd: FormData) {
  return saveCfg(fd, "equipe", async (tx, tenantId, raw) => {
    const d = memberSchema.parse(raw);
    await exists(tx, workCenters, d.centro, "Centro de trabalho");
    const v = { name: d.nome, role: d.funcao, workCenterId: d.centro, phone: d.telefone, active: d.id ? d.ativo === "on" : true };
    if (d.id) await tx.update(teamMembers).set(v).where(and(eq(teamMembers.id, d.id), eq(teamMembers.tenantId, tenantId)));
    else await tx.insert(teamMembers).values({ ...v, tenantId });
  });
}
export async function deleteMemberAction(_: ActionState, fd: FormData) {
  return deleteCfg(fd, "equipe", async (tx, id) => {
    await tx.delete(teamMembers).where(eq(teamMembers.id, id));
    return { ok: true };
  });
}
