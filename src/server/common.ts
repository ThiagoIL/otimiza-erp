import "server-only";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { withTenant, type Tx } from "@/lib/db";
import * as E from "@/db/erp";

// ------------------------------------------------------------------------------------
// Numeração
// ------------------------------------------------------------------------------------
/** Próximo número de um documento (pedido, OP, nota…), sem repetir mesmo com duas pessoas salvando juntas. */
export async function nextNumber(tx: Tx, tenantId: string, key: string, table: PgTable, col: PgColumn): Promise<number> {
  const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${col}), 0)::int` }).from(table);
  const r = await tx.execute<{ value: number }>(sql`
    insert into sequences (tenant_id, key, value) values (${tenantId}, ${key}, ${m + 1})
    on conflict (tenant_id, key) do update set value = greatest(sequences.value, ${m}) + 1
    returning value`);
  return Number(r.rows[0].value);
}

// ------------------------------------------------------------------------------------
// Estoque
// ------------------------------------------------------------------------------------
/** Quantidade com sinal de cada movimentação no local de origem. */
export const SIGNED_QTY = sql`case ${E.stockMovements.type}
  when 'SAIDA' then -${E.stockMovements.qty} when 'TRANSFERENCIA' then -${E.stockMovements.qty}
  else ${E.stockMovements.qty} end`;

/** Saldos por item e local, calculados das movimentações. Chave: `itemId|locationId`. */
export async function balances(tx: Tx, opts: { itemIds?: string[]; locationId?: string; until?: string } = {}): Promise<Map<string, number>> {
  const conds: SQL[] = [];
  if (opts.itemIds) { if (!opts.itemIds.length) return new Map(); conds.push(sql`item_id in (${sql.join(opts.itemIds.map((i) => sql`${i}`), sql`, `)})`); }
  if (opts.until) conds.push(sql`date <= ${opts.until}`);
  const w = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;
  const wt = sql`where ${sql.join([...conds, sql`type = 'TRANSFERENCIA'`], sql` and `)}`;
  const r = await tx.execute<{ item_id: string; loc: string; q: string }>(sql`
    select item_id, loc, sum(q)::text q from (
      select item_id, location_id loc, case type when 'SAIDA' then -qty when 'TRANSFERENCIA' then -qty else qty end q from stock_movements ${w}
      union all
      select item_id, dest_location_id loc, qty q from stock_movements ${wt}
    ) x ${opts.locationId ? sql`where loc = ${opts.locationId}` : sql``}
    group by item_id, loc`);
  const m = new Map<string, number>();
  for (const row of r.rows) m.set(`${row.item_id}|${row.loc}`, Number(row.q));
  return m;
}
export function balanceOf(m: Map<string, number>, itemId: string, locationId?: string): number {
  if (locationId) return m.get(`${itemId}|${locationId}`) ?? 0;
  let t = 0;
  for (const [k, v] of m) if (k.startsWith(itemId + "|")) t += v;
  return t;
}

/** Custo médio ponderado das entradas com custo; sem entradas, o custo padrão do item. */
export async function avgCosts(tx: Tx, itemIds?: string[]): Promise<Map<string, number>> {
  if (itemIds && !itemIds.length) return new Map();
  const r = await tx.execute<{ id: string; c: string }>(sql`
    select i.id, coalesce(
      (select sum(m.qty * m.unit_cost) / nullif(sum(m.qty), 0) from stock_movements m
        where m.item_id = i.id and m.type in ('ENTRADA','PRODUCAO') and m.unit_cost > 0 and m.qty > 0),
      i.cost)::text c
    from items i ${itemIds ? sql`where i.id in (${sql.join(itemIds.map((i) => sql`${i}`), sql`, `)})` : sql``}`);
  return new Map(r.rows.map((x) => [x.id, Number(x.c)]));
}

/** Data do último fechamento de estoque ativo (movimentos até ela ficam travados). */
export async function closedUntil(tx: Tx): Promise<string | null> {
  const r = await tx.execute<{ d: string | null }>(sql`select max(closing_date)::text d from stock_closings where reopened_at is null`);
  return r.rows[0]?.d ?? null;
}

export async function insertMovements(tx: Tx, tenantId: string, rows: (Omit<typeof E.stockMovements.$inferInsert, "tenantId">)[]): Promise<{ id: string }[]> {
  if (!rows.length) return [];
  const lock = await closedUntil(tx);
  const bad = lock && rows.find((r) => r.date <= lock);
  if (bad) throw new RuleError(`O estoque está fechado até ${lock.split("-").reverse().join("/")}. Use uma data posterior ao fechamento.`);
  return tx.insert(E.stockMovements).values(rows.map((r) => ({ ...r, tenantId }))).returning({ id: E.stockMovements.id });
}

/** Erro de regra de negócio com mensagem para o usuário. */
export class RuleError extends Error {}

export function ruleMsg(err: unknown, fallback = "Não foi possível salvar. Tente novamente."): string {
  if (err instanceof RuleError) return err.message;
  const e = err as { code?: string; cause?: { code?: string; constraint?: string; message?: string }; constraint?: string; message?: string };
  const code = e?.cause?.code ?? e?.code;
  const constraint = e?.cause?.constraint ?? e?.constraint ?? "";
  if (code === "23505") {
    if (constraint.includes("code")) return "Já existe um registro com este código.";
    if (constraint.includes("name")) return "Já existe um registro com este nome.";
    if (constraint.includes("number")) return "Este número já foi usado.";
    return "Já existe um registro com estes dados.";
  }
  if (code === "23503") return "Este registro está ligado a outros dados e não pode ser excluído. Marque como inativo.";
  console.error("[erp]", code, e?.cause?.message ?? e?.message);
  return fallback;
}

// ------------------------------------------------------------------------------------
// Cadastros padrão de cada empresa
// ------------------------------------------------------------------------------------
const DEFAULTS_VERSION = 2;
const done = new Set<string>();

/** Cria (uma vez por empresa) os cadastros básicos para o sistema já sair usável. */
export async function ensureDefaults(tenantId: string): Promise<void> {
  if (done.has(tenantId)) return;
  await withTenant(tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"defaults:" + tenantId}))`);
    const [cs] = await tx.select().from(E.companySettings).limit(1);
    if (cs && cs.defaultsVersion >= DEFAULTS_VERSION) return;
    const empty = async (t: PgTable) => (await tx.select({ c: sql<number>`count(*)::int` }).from(t))[0].c === 0;
    const ins = async <T extends PgTable>(t: T, rows: Record<string, unknown>[]) => {
      if (await empty(t)) await tx.insert(t).values(rows.map((r) => ({ ...r, tenantId })) as never);
    };
    await ins(E.units, [["UN", "Unidade"], ["PC", "Peça"], ["KG", "Quilograma", 3], ["M", "Metro", 2], ["M2", "Metro quadrado", 2], ["M3", "Metro cúbico", 3], ["L", "Litro", 2], ["GL", "Galão"], ["CX", "Caixa"], ["PR", "Par"], ["KIT", "Kit"], ["H", "Hora", 2]]
      .map(([code, name, decimals]) => ({ code, name, decimals: decimals ?? 0 })));
    await ins(E.itemTypes, [["Matéria-prima", "MATERIA_PRIMA"], ["Semiacabado", "SEMIACABADO"], ["Produto acabado", "PRODUTO_ACABADO"], ["Uso e consumo", "CONSUMO"], ["Revenda", "REVENDA"]]
      .map(([name, kind]) => ({ name, kind })));
    // itens antigos (antes dos tipos cadastráveis) ganham o tipo equivalente
    await tx.execute(sql`update items i set type_id = t.id from item_types t where i.type_id is null and t.kind = i.type`);
    await ins(E.stockLocations, [{ code: "001", name: "Almoxarifado", type: "Almoxarifado" }, { code: "002", name: "Expedição", type: "Expedição" }]);
    await ins(E.productionStages, [["A produzir", "#6B7785", "aberta"], ["Em produção", "#2F6E9A", "andamento"], ["Inspeção de qualidade", "#1F8A8A", "andamento"], ["Concluída", "#2E7D4F", "finalizada"], ["Cancelada", "#B3261E", "cancelada"]]
      .map(([name, color, kind], i) => ({ name, color, kind, position: i + 1 })));
    await ins(E.assemblyStages, [["A iniciar", "#6B7785", "aguardando"], ["Em montagem", "#2F6E9A", "andamento"], ["Pendência", "#B3261E", "pendencia"], ["Concluído", "#2E7D4F", "concluido"]]
      .map(([name, color, kind], i) => ({ name, color, kind, position: i + 1 })));
    await ins(E.paymentMethods, ["Boleto", "PIX", "Transferência", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Cheque"].map((name) => ({ name })));
    await ins(E.paymentTerms, ([["À vista", [0]], ["28 dias", [28]], ["30 dias", [30]], ["30/60", [30, 60]], ["30/60/90", [30, 60, 90]], ["Entrada + 2x", [0, 30, 60]], ["Entrada + 3x", [0, 30, 60, 90]]] as const)
      .map(([name, days]) => ({ name, days: [...days] })));
    await ins(E.finCategories, [
      ...["Venda de produtos", "Serviços", "Outras receitas"].map((name) => ({ name, kind: "RECEBER" })),
      ...["Matéria-prima", "Folha de pagamento", "Energia", "Aluguel", "Impostos", "Manutenção", "Frete", "Outras despesas"].map((name) => ({ name, kind: "PAGAR" })),
    ]);
    await ins(E.bankAccounts, [{ name: "Caixa da empresa", bank: "Caixa interno" }]);
    await ins(E.finSituations, [["Aguardando aprovação", "#C77700"], ["Aprovado para pagamento", "#2E7D4F"], ["Agendado", "#2F6E9A"]].map(([name, color]) => ({ name, color })));
    await ins(E.salesStages, [["Proposta", "#6B7785", "PROPOSTA"], ["Aprovado", "#E0601A", "APROVADO"], ["Faturado", "#2E7D4F", "FATURADO"], ["Cancelado", "#B3261E", "CANCELADO"]]
      .map(([name, color, kind], i) => ({ name, color, kind, position: i + 1, system: true })));
    await tx.execute(sql`update sales_orders o set stage_id = s.id from sales_stages s where s.system and s.kind = o.status and o.stage_id is null`);
    if (cs) await tx.update(E.companySettings).set({ defaultsVersion: DEFAULTS_VERSION }).where(eq(E.companySettings.id, cs.id));
    else await tx.insert(E.companySettings).values({ tenantId, defaultsVersion: DEFAULTS_VERSION });
  });
  done.add(tenantId);
}

// ------------------------------------------------------------------------------------
// Consultas pequenas e reaproveitadas
// ------------------------------------------------------------------------------------
export async function namesById<T extends PgTable>(tx: Tx, table: T, idCol: PgColumn, nameCol: PgColumn, ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter(Boolean))] as string[];
  if (!u.length) return new Map<string, string>();
  const rows = await tx.select({ id: idCol, n: nameCol }).from(table as PgTable).where(inArray(idCol, u));
  return new Map(rows.map((r) => [String(r.id), String(r.n)]));
}

export const partnerLabel = (p: { name: string; tradeName: string | null } | undefined | null) => (p ? p.tradeName || p.name : "—");
export { and, eq };

/** Anexos de um registro (sem o conteúdo do arquivo). */
export async function loadAttachments(tx: Tx, entity: string, entityId: string) {
  const rows = await tx.select({ id: E.attachments.id, fileName: E.attachments.fileName, size: E.attachments.size, userName: E.attachments.userName, createdAt: E.attachments.createdAt })
    .from(E.attachments).where(and(eq(E.attachments.entity, entity), eq(E.attachments.entityId, entityId))).orderBy(sql`${E.attachments.createdAt} desc`);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Cabeçalho dos documentos impressos (dados da empresa). */
export async function companyHeader(tx: Tx, fallbackName: string) {
  const [c] = await tx.select().from(E.companySettings).limit(1);
  const name = c?.tradeName || c?.legalName || fallbackName;
  const line = [c?.legalName && c.legalName !== name ? c.legalName : null, c?.document ? `CNPJ ${c.document}` : null, c?.city ? `${c.city}/${c.uf ?? ""}` : null, c?.phone].filter(Boolean).join(" · ");
  return { name, line: line || fallbackName };
}

export function partnerAddress(p: { street: string | null; number: string | null; district: string | null; city: string | null; uf: string | null; zip: string | null }) {
  return [p.street && `${p.street}${p.number ? ", " + p.number : ""}`, p.district, p.city && `${p.city}/${p.uf ?? ""}`, p.zip && `CEP ${p.zip}`].filter(Boolean).join(" · ");
}

// ------------------------------------------------------------------------------------
// Etapas do pedido de venda
// ------------------------------------------------------------------------------------
/** Etapa que o pedido deve ter para a situação: mantém a atual se ela já tem esse comportamento. */
export async function stageIdFor(tx: Tx, status: string, current?: string | null): Promise<string | null> {
  if (current) {
    const [cur] = await tx.select({ kind: E.salesStages.kind }).from(E.salesStages).where(eq(E.salesStages.id, current)).limit(1);
    if (cur?.kind === status) return current;
  }
  const [st] = await tx.select({ id: E.salesStages.id }).from(E.salesStages).where(and(eq(E.salesStages.kind, status), eq(E.salesStages.system, true))).limit(1);
  return st?.id ?? null;
}
