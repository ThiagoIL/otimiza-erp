"use server";
import { and, asc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import { formObject, keepValues, zDecimal, zodFail } from "@/lib/forms";
import * as E from "@/db/erp";
import { avgCosts, balances, balanceOf, ruleMsg, RuleError } from "./common";
import type { ActionState } from "@/lib/action";
import type { Tx } from "@/lib/db";

const optId = z.string().max(64).optional().transform((v) => v || null);
const itemSchema = z.object({
  id: z.string().max(64).optional(),
  modo_codigo: z.enum(["auto", "manual"]).default("manual"),
  codigo: z.string().trim().max(40, "Use até 40 caracteres.").optional().default(""),
  descricao: z.string().trim().min(2, "Informe a descrição.").max(200, "Descrição muito longa.").transform((s) => s.toUpperCase()),
  complemento: z.string().trim().max(200).optional().transform((v) => v || null),
  unidade: z.string().trim().toUpperCase().min(1, "Escolha a unidade.").max(6),
  tipo: z.string().min(1, "Escolha o tipo.").max(64),
  grupo: optId,
  ativo: z.string().optional(),
  estoque_minimo: zDecimal("Estoque mínimo"),
  estoque_maximo: zDecimal("Estoque máximo"),
  local_padrao: optId,
  endereco: z.string().trim().max(80).optional().transform((v) => v || null),
  fornecedor_padrao: optId,
  prazo_entrega: z.string().trim().optional().transform((v, ctx) => { if (!v) return null; const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 999) { ctx.addIssue({ code: "custom", message: "Prazo em dias inválido." }); return z.NEVER; } return n; }),
  lote_minimo: zDecimal("Lote mínimo"),
  custo: zDecimal("Custo"),
  preco_venda: zDecimal("Preço de venda"),
  ncm: z.string().trim().transform((s) => s.replace(/\D/g, "")).refine((s) => s === "" || s.length === 8, "O NCM tem 8 dígitos.").optional(),
  cest: z.string().trim().transform((s) => s.replace(/\D/g, "")).refine((s) => s === "" || s.length === 7, "O CEST tem 7 dígitos.").optional(),
  origem: z.string().regex(/^[0-8]$/).default("0"),
  gtin: z.string().trim().max(14).optional().transform((v) => v || null),
  peso_liquido: zDecimal("Peso líquido"),
  peso_bruto: zDecimal("Peso bruto"),
  observacoes: z.string().trim().max(2000).optional().transform((v) => v || null),
});

/** Gera o próximo código livre do prefixo do grupo e avança a numeração. */
async function codeFromPrefix(tx: Tx, groupId: string | null): Promise<string> {
  if (!groupId) throw new RuleError("Escolha o grupo para gerar o código automático, ou digite o código.");
  const [g] = await tx.select({ prefixId: E.itemGroups.prefixId }).from(E.itemGroups).where(eq(E.itemGroups.id, groupId)).limit(1);
  if (!g?.prefixId) throw new RuleError("O grupo escolhido não tem prefixo de código. Ligue um prefixo ao grupo ou digite o código.");
  for (let i = 0; i < 500; i++) {
    const [p] = await tx.update(E.codePrefixes).set({ nextNumber: sql`${E.codePrefixes.nextNumber} + 1` }).where(eq(E.codePrefixes.id, g.prefixId))
      .returning({ prefix: E.codePrefixes.prefix, digits: E.codePrefixes.digits, n: sql<number>`${E.codePrefixes.nextNumber} - 1` });
    const code = p.prefix + String(p.n).padStart(p.digits, "0");
    const [used] = await tx.select({ id: E.items.id }).from(E.items).where(eq(E.items.code, code)).limit(1);
    if (!used) return code;
  }
  throw new RuleError("Não foi possível gerar um código livre para este prefixo.");
}

export async function saveItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await act("itens");
  if (!s) return NO_ACCESS;
  const raw = formObject(fd);
  const p = itemSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  if (d.modo_codigo === "manual" && !d.codigo) return { error: "Confira os campos destacados.", fields: { codigo: "Informe o código ou escolha o código automático." }, values: keepValues(raw) };
  let id = d.id ?? "";
  let code = d.codigo;
  try {
    await s.tx(async (tx) => {
      const [tp] = await tx.select({ kind: E.itemTypes.kind }).from(E.itemTypes).where(eq(E.itemTypes.id, d.tipo)).limit(1);
      if (!tp) throw new RuleError("Escolha um tipo de item válido.");
      if (!id && d.modo_codigo === "auto") code = await codeFromPrefix(tx, d.grupo);
      const values = {
        name: d.descricao, complement: d.complemento, unit: d.unidade, typeId: d.tipo, type: tp.kind, groupId: d.grupo, active: d.ativo === "on",
        minStock: d.estoque_minimo, maxStock: d.estoque_maximo, defaultLocationId: d.local_padrao, stockAddress: d.endereco,
        defaultSupplierId: d.fornecedor_padrao, leadDays: d.prazo_entrega, minPurchaseQty: d.lote_minimo,
        cost: d.custo, salePrice: d.preco_venda, ncm: d.ncm || null, cest: d.cest || null, origin: d.origem, gtin: d.gtin,
        netWeight: d.peso_liquido, grossWeight: d.peso_bruto, notes: d.observacoes,
      };
      if (id) {
        const r = await tx.update(E.items).set({ ...values, ...(d.codigo ? { code: d.codigo } : {}) }).where(and(eq(E.items.id, id), eq(E.items.tenantId, s.tenant.id))).returning({ id: E.items.id, code: E.items.code });
        if (!r.length) throw new RuleError("Item não encontrado.");
        code = r[0].code;
      } else {
        const [r] = await tx.insert(E.items).values({ ...values, code, tenantId: s.tenant.id }).returning({ id: E.items.id });
        id = r.id;
      }
    });
  } catch (err) {
    const msg = ruleMsg(err);
    return msg.includes("código") ? { error: "Confira os campos destacados.", fields: { codigo: msg }, values: keepValues(raw) } : { error: msg, values: keepValues(raw) };
  }
  await audit({ action: d.id ? "item.alterado" : "item.criado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "item", entityId: id, data: { codigo: code } });
  return { ok: true, redirectTo: `/itens/${id}?msg=${encodeURIComponent(`Item ${code} salvo.`)}` };
}

export async function deleteItemAction(id: string): Promise<ActionState> {
  const s = await act("itens");
  if (!s) return NO_ACCESS;
  try {
    const n = await s.tx(async (tx) => {
      const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.stockMovements).where(eq(E.stockMovements.itemId, id));
      if (c) throw new RuleError("Este item já tem movimentações de estoque. Marque como inativo em vez de excluir.");
      return tx.delete(E.items).where(and(eq(E.items.id, id), eq(E.items.tenantId, s.tenant.id))).returning({ code: E.items.code });
    });
    if (!n.length) return { error: "Item não encontrado." };
  } catch (err) {
    return { error: ruleMsg(err, "Não foi possível excluir o item.").replace("Este registro", "Este item") };
  }
  await audit({ action: "item.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "item", entityId: id });
  return { ok: true, redirectTo: "/itens?msg=Item%20exclu%C3%ADdo." };
}

// ------------------------------------------------------------------------------------
// Estrutura (materiais) e roteiro (horas por centro)
// ------------------------------------------------------------------------------------
const bomSchema = z.object({
  itemId: z.string().max(64),
  components: z.array(z.object({ itemId: z.string().max(64), qty: z.number().positive().max(1e9), lossPct: z.number().min(0).max(1000) })).max(300),
  routing: z.array(z.object({ workCenterId: z.string().max(64), hours: z.number().positive().max(1e6) })).max(60),
});
export async function saveBomAction(input: z.infer<typeof bomSchema>): Promise<ActionState> {
  const s = await act("itens");
  if (!s) return NO_ACCESS;
  const p = bomSchema.safeParse(input);
  if (!p.success) return { error: "Confira as quantidades da estrutura." };
  const d = p.data;
  if (d.components.some((c) => c.itemId === d.itemId)) return { error: "Um item não pode ser componente dele mesmo." };
  try {
    await s.tx(async (tx) => {
      await tx.delete(E.itemBom).where(eq(E.itemBom.itemId, d.itemId));
      await tx.delete(E.itemRouting).where(eq(E.itemRouting.itemId, d.itemId));
      if (d.components.length) await tx.insert(E.itemBom).values(d.components.map((c, i) => ({ tenantId: s.tenant.id, itemId: d.itemId, componentId: c.itemId, qty: String(c.qty), lossPct: String(c.lossPct), position: i })));
      if (d.routing.length) await tx.insert(E.itemRouting).values(d.routing.map((r, i) => ({ tenantId: s.tenant.id, itemId: d.itemId, workCenterId: r.workCenterId, hours: String(r.hours), position: i })));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: "Estrutura salva." };
}

// ------------------------------------------------------------------------------------
// Fornecedores do item
// ------------------------------------------------------------------------------------
export async function saveItemSupplierAction(input: { itemId: string; partnerId: string; supplierCode?: string; lastPrice?: number; leadDays?: number | null }): Promise<ActionState> {
  const s = await act(["itens", "compras"]);
  if (!s) return NO_ACCESS;
  if (!input.itemId || !input.partnerId) return { error: "Escolha o fornecedor." };
  try {
    await s.tx((tx) => tx.insert(E.itemSuppliers).values({
      tenantId: s.tenant.id, itemId: input.itemId, partnerId: input.partnerId, supplierCode: input.supplierCode?.slice(0, 40) || null,
      lastPrice: String(Math.max(0, Number(input.lastPrice) || 0)), leadDays: input.leadDays ?? null,
    }).onConflictDoUpdate({ target: [E.itemSuppliers.tenantId, E.itemSuppliers.itemId, E.itemSuppliers.partnerId], set: { supplierCode: input.supplierCode?.slice(0, 40) || null, lastPrice: String(Math.max(0, Number(input.lastPrice) || 0)), leadDays: input.leadDays ?? null } }));
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: "Fornecedor salvo." };
}
export async function deleteItemSupplierAction(id: string): Promise<ActionState> {
  const s = await act(["itens", "compras"]);
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.itemSuppliers).where(eq(E.itemSuppliers.id, id)));
  return { ok: true, message: "Fornecedor removido." };
}

// ------------------------------------------------------------------------------------
// Tela de pesquisa de itens (usada em pedidos, compras, OPs, inventário e estrutura)
// ------------------------------------------------------------------------------------
export type PickRow = { id: string; code: string; name: string; unit: string; type: string; typeName: string; group: string; price: number; cost: number; balance: number; active: boolean };
const pickSchema = z.object({
  q: z.string().max(80).default(""), groupId: z.string().max(64).default(""), typeId: z.string().max(64).default(""),
  kinds: z.array(z.string()).max(6).optional(), page: z.number().int().min(1).max(500).default(1), exclude: z.string().max(64).optional(),
});
export async function searchItemsAction(input: z.input<typeof pickSchema>): Promise<{ rows: PickRow[]; total: number; groups: [string, string][]; types: [string, string][] } | { error: string }> {
  const s = await act(["itens", "comercial", "compras", "producao", "estoque"]);
  if (!s) {
    // consulta também vale para quem só tem acesso de leitura
    return { error: NO_ACCESS.error };
  }
  const d = pickSchema.parse(input);
  const PAGE = 40;
  return s.tx(async (tx) => {
    const conds: SQL[] = [eq(E.items.active, true)];
    if (d.q.trim()) { const q = `%${d.q.trim()}%`; conds.push(or(ilike(E.items.code, q), ilike(E.items.name, q), ilike(E.items.complement, q))!); }
    if (d.groupId) conds.push(eq(E.items.groupId, d.groupId));
    if (d.typeId) conds.push(eq(E.items.typeId, d.typeId));
    if (d.kinds?.length) conds.push(inArray(E.items.type, d.kinds as never[]));
    if (d.exclude) conds.push(ne(E.items.id, d.exclude));
    const where = and(...conds);
    const rows = await tx.select({ i: E.items, g: E.itemGroups.name, t: E.itemTypes.name }).from(E.items)
      .leftJoin(E.itemGroups, eq(E.itemGroups.id, E.items.groupId)).leftJoin(E.itemTypes, eq(E.itemTypes.id, E.items.typeId))
      .where(where).orderBy(asc(E.items.name)).limit(PAGE).offset((d.page - 1) * PAGE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(E.items).where(where);
    const ids = rows.map((r) => r.i.id);
    const [bal, costs] = await Promise.all([balances(tx, { itemIds: ids }), avgCosts(tx, ids)]);
    const groups = (await tx.select({ id: E.itemGroups.id, n: E.itemGroups.name }).from(E.itemGroups).orderBy(asc(E.itemGroups.name))).map((g) => [g.id, g.n] as [string, string]);
    const types = (await tx.select({ id: E.itemTypes.id, n: E.itemTypes.name }).from(E.itemTypes).orderBy(asc(E.itemTypes.name))).map((g) => [g.id, g.n] as [string, string]);
    return {
      total, groups, types,
      rows: rows.map(({ i, g, t }) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, type: i.type, typeName: t ?? "", group: g ?? "", price: Number(i.salePrice), cost: costs.get(i.id) ?? Number(i.cost), balance: balanceOf(bal, i.id), active: i.active })),
    };
  });
}
