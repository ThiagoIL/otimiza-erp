"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { items, partners, productionOrders, productionStages, productionStatuses, receivables, salesOrderItems, salesOrders } from "@/db/schema";
import { SESSION_EXPIRED, tenantUserForAction } from "@/lib/context";
import { audit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/errors";
import { formObject, keepValues, parseLines, zDay, zDecimal, zOpt, zodFail } from "@/lib/forms";
import { opNumber, PAYMENT_METHODS, pvNumber, SALES_STATUS, today } from "@/lib/format";
import { isValidCnpj, isValidCpf, lineTotal, orderTotals } from "@/lib/sales";
import type { ActionState } from "@/lib/action";
import { ensureSetup, moveStock, nextNumber, StockError } from "./stock";
import { syncReceivables } from "./receivables";

class UserError extends Error {}
const toNumber = (v: string | number) => { const t = String(v).trim(); return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); };
const zNum = (label: string, min: number, max: number) =>
  z.union([z.string(), z.number()]).transform(toNumber).refine((n) => Number.isFinite(n) && n >= min && n <= max, `${label} inválido(a)`);

// ---------- Clientes e fornecedores ----------

const partnerSchema = z.object({
  id: z.string().max(64).optional(),
  pessoa: z.enum(["PJ", "PF"]),
  nome: z.string().trim().min(2, "Informe o nome ou a razão social.").max(160),
  fantasia: zOpt(120),
  documento: z.string().trim().max(20).optional().transform((s) => (s ?? "").replace(/\D/g, "")),
  ie: zOpt(20),
  cliente: z.string().optional(), fornecedor: z.string().optional(), transportadora: z.string().optional(),
  email: z.string().trim().toLowerCase().max(160).optional().refine((s) => !s || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s), "E-mail inválido.").transform((s) => s || null),
  telefone: zOpt(30), contato: zOpt(80),
  cep: z.string().trim().max(10).optional().transform((s) => (s ?? "").replace(/\D/g, "") || null),
  endereco: zOpt(160), numero: zOpt(20), bairro: zOpt(80), cidade: zOpt(80),
  uf: z.string().trim().toUpperCase().max(2).optional().refine((s) => !s || /^[A-Z]{2}$/.test(s), "UF com 2 letras.").transform((s) => s || null),
  observacoes: zOpt(1000), ativo: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.documento) {
    const ok = d.pessoa === "PJ" ? isValidCnpj(d.documento) : isValidCpf(d.documento);
    if (!ok) ctx.addIssue({ code: "custom", path: ["documento"], message: d.pessoa === "PJ" ? "CNPJ inválido." : "CPF inválido." });
  }
  if (d.cliente !== "on" && d.fornecedor !== "on" && d.transportadora !== "on") ctx.addIssue({ code: "custom", path: ["cliente"], message: "Marque ao menos um tipo de cadastro." });
});

export async function savePartnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = partnerSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const values = {
    personType: d.pessoa, name: d.nome, tradeName: d.fantasia, document: d.documento || null, stateRegistration: d.ie,
    isCustomer: d.cliente === "on", isSupplier: d.fornecedor === "on", isCarrier: d.transportadora === "on",
    email: d.email, phone: d.telefone, contact: d.contato, zip: d.cep, street: d.endereco, number: d.numero, district: d.bairro,
    city: d.cidade, state: d.uf, notes: d.observacoes, active: d.id ? d.ativo === "on" : true,
  };
  let id = d.id ?? "";
  try {
    await withTenant(s.tenant.id, async (tx) => {
      if (values.document) {
        const [dup] = await tx.select({ id: partners.id }).from(partners).where(and(eq(partners.document, values.document), id ? sql`${partners.id} <> ${id}` : sql`true`)).limit(1);
        if (dup) throw new UserError("Já existe um cadastro com este documento.");
      }
      if (id) {
        const r = await tx.update(partners).set(values).where(and(eq(partners.id, id), eq(partners.tenantId, s.tenant.id))).returning({ id: partners.id });
        if (!r.length) throw new UserError("Cadastro não encontrado.");
      } else {
        id = (await tx.insert(partners).values({ ...values, tenantId: s.tenant.id }).returning({ id: partners.id }))[0].id;
      }
    });
  } catch (err) {
    if (err instanceof UserError) return { fields: err.message.includes("documento") ? { documento: err.message } : undefined, error: err.message, values: keepValues(raw) };
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  await audit({ action: d.id ? "cadastro.alterado" : "cadastro.criado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "cliente_fornecedor", entityId: id, data: { nome: d.nome } });
  return { ok: true, redirectTo: `/comercial/cadastros?salvo=${encodeURIComponent(d.nome)}` };
}

export async function deletePartnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  if (s.user.role !== "TENANT_ADMIN") return { error: "Apenas administradores da empresa podem excluir cadastros. Você pode desativá-lo." };
  const id = String(fd.get("id") ?? "").slice(0, 64);
  try {
    const n = await withTenant(s.tenant.id, (tx) => tx.delete(partners).where(and(eq(partners.id, id), eq(partners.tenantId, s.tenant.id))).returning({ name: partners.name }));
    if (!n.length) return { error: "Cadastro não encontrado." };
    await audit({ action: "cadastro.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "cliente_fornecedor", entityId: id, data: { nome: n[0].name } });
  } catch (err) {
    return { error: friendlyDbError(err, "Não foi possível excluir.").replace("Este registro está em uso por outros dados e não pode ser alterado assim.", "Este cadastro tem pedidos ou lançamentos. Desative-o em vez de excluir.") };
  }
  return { ok: true, redirectTo: "/comercial/cadastros?excluido=1" };
}

// ---------- Pedidos de venda ----------

const saleLine = z.object({
  item: z.string().min(1, "escolha o item").max(64),
  qtd: zNum("quantidade", 0.0001, 1e9),
  preco: zNum("preço", 0, 1e10),
  desc: zNum("desconto", 0, 100).default(0),
});

const orderSchema = z.object({
  id: z.string().max(64).optional(),
  cliente: z.string().trim().min(1, "Escolha o cliente.").max(64),
  emissao: zDay("Emissão").refine((v) => !!v, "Informe a data do pedido."),
  entrega: zDay("Entrega"),
  pagamento: z.enum(PAYMENT_METHODS.map(([k]) => k) as [string, ...string[]], { message: "Escolha a forma de pagamento." }),
  parcelas: z.coerce.number({ message: "Parcelas inválidas." }).int().min(1, "Mínimo 1 parcela.").max(60, "Máximo 60 parcelas."),
  primeira: z.coerce.number({ message: "Prazo inválido." }).int().min(0).max(365),
  intervalo: z.coerce.number({ message: "Intervalo inválido." }).int().min(0).max(365),
  desconto: zDecimal("Desconto"),
  frete: zDecimal("Frete"),
  vendedor: zOpt(80),
  observacoes: zOpt(2000),
  situacao: z.enum(["ORCAMENTO", "APROVADO"]).optional(),
  linhas: z.string().max(20000).optional(),
});

export async function saveSalesOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = orderSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const lines = parseLines(d.linhas, saleLine);
  if (typeof lines === "string") return { error: `Itens do pedido: ${lines}`, values: keepValues(raw) };
  if (!lines.length) return { error: "Inclua ao menos um item no pedido.", values: keepValues(raw) };
  const { subtotal, total } = orderTotals(lines.map((l) => ({ qty: l.qtd, price: l.preco, disc: l.desc })), Number(d.desconto), Number(d.frete));
  if (Number(d.desconto) > subtotal) return { fields: { desconto: "O desconto não pode passar do subtotal." }, error: "Confira os campos destacados.", values: keepValues(raw) };
  const tid = s.tenant.id;
  let id = d.id ?? "";
  let number = 0;
  try {
    await withTenant(tid, async (tx) => {
      const [c] = await tx.select({ id: partners.id }).from(partners).where(eq(partners.id, d.cliente)).limit(1);
      if (!c) throw new UserError("Cliente não encontrado.");
      const found = await tx.select({ id: items.id }).from(items).where(inArray(items.id, lines.map((l) => l.item)));
      if (found.length !== new Set(lines.map((l) => l.item)).size) throw new UserError("Algum item do pedido não foi encontrado. Atualize a página.");
      const values = {
        customerId: d.cliente, issueDate: d.emissao!, deliveryDate: d.entrega, paymentMethod: d.pagamento, installments: d.parcelas,
        firstDueDays: d.primeira, intervalDays: d.intervalo, subtotal: String(subtotal), discount: d.desconto, freight: d.frete,
        total: String(total), sellerName: d.vendedor, notes: d.observacoes,
      };
      if (id) {
        const [cur] = await tx.select({ status: salesOrders.status, number: salesOrders.number }).from(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, tid))).for("update");
        if (!cur) throw new UserError("Pedido não encontrado.");
        if (cur.status !== "ORCAMENTO" && cur.status !== "APROVADO") throw new UserError("Pedidos em produção, prontos, entregues ou cancelados não podem mais ser alterados.");
        const [paid] = await tx.select({ n: sql<number>`count(*)::int` }).from(receivables).where(and(eq(receivables.salesOrderId, id), sql`${receivables.paidAt} is not null`));
        if (paid.n) throw new UserError("Este pedido já tem parcelas recebidas e não pode ser alterado.");
        number = cur.number;
        await tx.update(salesOrders).set({ ...values, ...(d.situacao && { status: d.situacao }) }).where(eq(salesOrders.id, id));
        await tx.delete(salesOrderItems).where(eq(salesOrderItems.orderId, id));
        await tx.delete(receivables).where(eq(receivables.salesOrderId, id));
      } else {
        number = await nextNumber(tx, "sales_orders", tid);
        id = (await tx.insert(salesOrders).values({ ...values, tenantId: tid, number, status: d.situacao ?? "ORCAMENTO", createdBy: s.user.name }).returning({ id: salesOrders.id }))[0].id;
      }
      await tx.insert(salesOrderItems).values(lines.map((l, i) => ({
        tenantId: tid, orderId: id, line: i + 1, itemId: l.item, quantity: String(l.qtd), unitPrice: String(l.preco),
        discountPct: String(l.desc), total: String(lineTotal(l.qtd, l.preco, l.desc)),
      })));
      await syncReceivables(tx, id);
    });
  } catch (err) {
    if (err instanceof UserError) return { error: err.message, values: keepValues(raw) };
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  await audit({ action: d.id ? "pedido.alterado" : "pedido.criado", tenantId: tid, userId: s.user.id, userEmail: s.user.email, entity: "pedido_venda", entityId: id, data: { numero: number, total } });
  return { ok: true, redirectTo: `/comercial/pedidos/${id}?msg=${encodeURIComponent(`${pvNumber(number)} ${d.id ? "salvo" : "criado"}.`)}` };
}

export async function changeSalesStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const status = String(fd.get("situacao") ?? "");
  if (!SALES_STATUS.some(([k]) => k === status)) return { error: "Situação inválida." };
  try {
    await withTenant(s.tenant.id, async (tx) => {
      const r = await tx.update(salesOrders).set({ status: status as (typeof SALES_STATUS)[number][0] }).where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, s.tenant.id))).returning({ id: salesOrders.id });
      if (!r.length) throw new UserError("Pedido não encontrado.");
      // aprovado gera as parcelas; orçamento e cancelado tiram as que ainda não foram recebidas
      await syncReceivables(tx, id);
    });
  } catch (err) {
    return { error: err instanceof UserError ? err.message : friendlyDbError(err) };
  }
  await audit({ action: "pedido.situacao", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "pedido_venda", entityId: id, data: { situacao: status } });
  return { ok: true, message: "Situação do pedido atualizada." };
}

/** Cria uma ordem de produção para cada item fabricado do pedido que ainda não tem ordem. */
export async function createOrdersFromSalesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const tid = s.tenant.id;
  const created: number[] = [];
  try {
    await withTenant(tid, async (tx) => {
      await ensureSetup(tx, tid);
      const [so] = await tx.select({ status: salesOrders.status, due: salesOrders.deliveryDate }).from(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, tid))).for("update");
      if (!so) throw new UserError("Pedido não encontrado.");
      if (so.status === "CANCELADO") throw new UserError("Pedido cancelado.");
      const lines = await tx.select({ itemId: salesOrderItems.itemId, qty: salesOrderItems.quantity }).from(salesOrderItems)
        .innerJoin(items, eq(items.id, salesOrderItems.itemId))
        .where(and(eq(salesOrderItems.orderId, id), inArray(items.type, ["PRODUTO_ACABADO", "SEMIACABADO"])));
      const existing = await tx.select({ itemId: productionOrders.itemId }).from(productionOrders).where(eq(productionOrders.salesOrderId, id));
      const [first] = await tx.select({ id: productionStages.id }).from(productionStages).orderBy(productionStages.position).limit(1);
      const [st] = await tx.select({ id: productionStatuses.id }).from(productionStatuses).where(eq(productionStatuses.isDefault, true)).limit(1);
      // soma as quantidades se o mesmo produto aparece em mais de uma linha
      const byItem = new Map<string, number>();
      for (const l of lines) if (!existing.some((e) => e.itemId === l.itemId)) byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + Number(l.qty));
      for (const [itemId, qty] of byItem) {
        const number = await nextNumber(tx, "production_orders", tid);
        await tx.insert(productionOrders).values({
          tenantId: tid, number, itemId, quantity: String(qty), stageId: first.id, statusId: st?.id ?? null, salesOrderId: id,
          dueDate: so.due, startDate: today(), createdBy: s.user.name,
        });
        created.push(number);
      }
      if (created.length && (so.status === "ORCAMENTO" || so.status === "APROVADO")) {
        await tx.update(salesOrders).set({ status: "EM_PRODUCAO" }).where(eq(salesOrders.id, id));
        await syncReceivables(tx, id);
      }
    });
  } catch (err) {
    return { error: err instanceof UserError ? err.message : friendlyDbError(err) };
  }
  if (!created.length) return { message: "Todos os itens fabricados deste pedido já têm ordem de produção." };
  await audit({ action: "pedido.gerou_ops", tenantId: tid, userId: s.user.id, userEmail: s.user.email, entity: "pedido_venda", entityId: id, data: { ops: created } });
  return { ok: true, redirectTo: `/comercial/pedidos/${id}?msg=${encodeURIComponent(`Ordens criadas: ${created.map(opNumber).join(", ")}.`)}` };
}

/** Expedição: dá saída no estoque de todos os itens do pedido e marca como entregue. */
export async function shipSalesOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const local = String(fd.get("local") ?? "").slice(0, 64);
  if (!local) return { fields: { local: "Escolha o local." }, error: "Confira os campos destacados." };
  const tid = s.tenant.id;
  let number = 0;
  try {
    await withTenant(tid, async (tx) => {
      const [so] = await tx.select({ status: salesOrders.status, number: salesOrders.number, customerId: salesOrders.customerId }).from(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, tid))).for("update");
      if (!so) throw new UserError("Pedido não encontrado.");
      if (so.status === "ENTREGUE" || so.status === "CANCELADO") throw new UserError("Este pedido já foi entregue ou está cancelado.");
      if (so.status === "ORCAMENTO") throw new UserError("Aprove o orçamento antes de expedir.");
      number = so.number;
      const lines = await tx.select({ itemId: salesOrderItems.itemId, qty: salesOrderItems.quantity, cost: items.cost }).from(salesOrderItems)
        .innerJoin(items, eq(items.id, salesOrderItems.itemId)).where(eq(salesOrderItems.orderId, id));
      for (const l of lines) {
        await moveStock(tx, {
          tenantId: tid, kind: "SAIDA", origin: "PEDIDO_VENDA", itemId: l.itemId, locationId: local, quantity: Number(l.qty), unitCost: l.cost,
          salesOrderId: id, partnerId: so.customerId, document: pvNumber(so.number), user: { id: s.user.id, name: s.user.name },
        });
      }
      await tx.update(salesOrders).set({ status: "ENTREGUE" }).where(eq(salesOrders.id, id));
      await syncReceivables(tx, id);
    });
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    if (err instanceof StockError) return { error: `Expedição não feita. ${err.message} Confira a posição de estoque ou o local escolhido.` };
    return { error: friendlyDbError(err) };
  }
  await audit({ action: "pedido.expedido", tenantId: tid, userId: s.user.id, userEmail: s.user.email, entity: "pedido_venda", entityId: id, data: { numero: number } });
  return { ok: true, redirectTo: `/comercial/pedidos/${id}?msg=${encodeURIComponent(`${pvNumber(number)} expedido: itens baixados do estoque e pedido marcado como entregue.`)}` };
}

export async function deleteSalesOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  if (s.user.role !== "TENANT_ADMIN") return { error: "Apenas administradores da empresa podem excluir pedidos. Você pode cancelá-lo." };
  const id = String(fd.get("id") ?? "").slice(0, 64);
  let r: string | number = 0;
  try {
    r = await withTenant(s.tenant.id, async (tx) => {
      const [so] = await tx.select({ status: salesOrders.status, number: salesOrders.number }).from(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, s.tenant.id)));
      if (!so) return "Pedido não encontrado.";
      if (so.status !== "ORCAMENTO" && so.status !== "CANCELADO") return "Só é possível excluir orçamentos ou pedidos cancelados.";
      const [paid] = await tx.select({ n: sql<number>`count(*)::int` }).from(receivables).where(and(eq(receivables.salesOrderId, id), sql`${receivables.paidAt} is not null`));
      if (paid.n) return "Este pedido tem parcelas recebidas e não pode ser excluído.";
      await tx.delete(salesOrders).where(eq(salesOrders.id, id));
      return so.number;
    });
  } catch (err) {
    return { error: friendlyDbError(err, "Não foi possível excluir o pedido.") };
  }
  if (typeof r === "string") return { error: r };
  await audit({ action: "pedido.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "pedido_venda", entityId: id, data: { numero: r } });
  return { ok: true, redirectTo: `/comercial?msg=${encodeURIComponent(`${pvNumber(r)} excluído.`)}` };
}

// ---------- Contas a receber ----------

export async function settleReceivableAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const undo = fd.get("desfazer") === "1";
  const r = await withTenant(s.tenant.id, (tx) => tx.update(receivables).set({ paidAt: undo ? null : today() })
    .where(and(eq(receivables.id, id), eq(receivables.tenantId, s.tenant.id))).returning({ id: receivables.id }));
  if (!r.length) return { error: "Parcela não encontrada." };
  await audit({ action: undo ? "receber.estornado" : "receber.baixado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "conta_receber", entityId: id });
  return { ok: true, message: undo ? "Recebimento desfeito." : "Parcela marcada como recebida." };
}
