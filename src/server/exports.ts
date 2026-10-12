import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import * as E from "@/db/erp";
import type { ModuleKey } from "@/lib/modules";
import { salesWhere } from "./queries";
import { brDate, toCsv } from "./csv";
import { avgCosts, balances, balanceOf } from "./common";
import { accountBalances, weeklyFlow } from "./finance-queries";
import { addDays, diffDays, isDate } from "@/lib/dates";
import { SO_STATUS, PROD_STATUS } from "@/lib/consts";
import { today } from "@/lib/dates";

type SP = Record<string, string | undefined>;
export type Export = { mod: ModuleKey; run: (tx: Tx, tenantId: string, sp: SP, costs: boolean) => Promise<{ name: string; csv: string }> };

export const EXPORTS: Record<string, Export> = {
  pedidos: {
    mod: "comercial",
    run: async (tx, tenantId, sp) => {
      const rows = await tx.select({ o: E.salesOrders, cli: E.partners.name, doc: E.partners.document, pm: E.paymentMethods.name, pt: E.paymentTerms.name })
        .from(E.salesOrders).innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId))
        .leftJoin(E.paymentMethods, eq(E.paymentMethods.id, E.salesOrders.paymentMethodId)).leftJoin(E.paymentTerms, eq(E.paymentTerms.id, E.salesOrders.paymentTermId))
        .where(await salesWhere(tenantId, sp)).orderBy(desc(E.salesOrders.number));
      return {
        name: `pedidos-de-venda-${today()}.csv`,
        csv: toCsv(["Número", "Emissão", "Entrega", "Cliente", "CNPJ/CPF", "Local de entrega", "Vendedor", "Situação", "Produção", "Forma", "Condição", "Desconto", "Frete", "Total"],
          rows.map(({ o, cli, doc, pm, pt }) => [o.number, brDate(o.issueDate), brDate(o.deliveryDate), cli, doc, o.deliveryPlace, o.salespersonName, SO_STATUS[o.status]?.label, o.productionStatus ? PROD_STATUS[o.productionStatus]?.label : "", pm, pt, Number(o.discount), Number(o.freight), Number(o.total)])),
      };
    },
  },
  "pedidos-itens": {
    mod: "comercial",
    run: async (tx) => {
      const rows = await tx.select({ o: E.salesOrders, cli: E.partners.name, i: E.items, l: E.salesOrderItems }).from(E.salesOrderItems)
        .innerJoin(E.salesOrders, eq(E.salesOrders.id, E.salesOrderItems.orderId)).innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId)).innerJoin(E.items, eq(E.items.id, E.salesOrderItems.itemId))
        .orderBy(desc(E.salesOrders.number), asc(E.salesOrderItems.position));
      return { name: `itens-vendidos-${today()}.csv`, csv: toCsv(["Pedido", "Emissão", "Situação", "Cliente", "Código", "Item", "Un.", "Qtd.", "Preço", "Desc. %", "Total"],
        rows.map(({ o, cli, i, l }) => [o.number, brDate(o.issueDate), SO_STATUS[o.status]?.label, cli, i.code, i.name, i.unit, Number(l.qty), Number(l.price), Number(l.discountPct), Number(l.qty) * Number(l.price) * (1 - Number(l.discountPct) / 100)])) };
    },
  },
  estoque: {
    mod: "estoque",
    run: async (tx, _t, sp) => {
      const c: SQL[] = [eq(E.items.active, true)];
      if (sp.q) { const q = `%${sp.q.trim()}%`; c.push(or(ilike(E.items.code, q), ilike(E.items.name, q))!); }
      if (sp.grupo) c.push(eq(E.items.groupId, sp.grupo));
      if (sp.tipo) c.push(eq(E.items.typeId, sp.tipo));
      const items = await tx.select({ i: E.items, g: E.itemGroups.name }).from(E.items).leftJoin(E.itemGroups, eq(E.itemGroups.id, E.items.groupId)).where(and(...c)).orderBy(asc(E.items.name));
      const ids = items.map((x) => x.i.id);
      const [bal, cost] = await Promise.all([balances(tx, { itemIds: ids }), avgCosts(tx, ids)]);
      const locs = await tx.select().from(E.stockLocations).orderBy(asc(E.stockLocations.code));
      const rows: (string | number | null)[][] = [];
      for (const { i, g } of items) for (const l of locs) {
        if (sp.local && sp.local !== l.id) continue;
        const q = balanceOf(bal, i.id, l.id);
        if (Math.abs(q) < 1e-9) continue;
        const cm = cost.get(i.id) ?? 0;
        rows.push([i.code, i.name, g, l.code, l.name, q, i.unit, Number(i.minStock), cm, q * cm]);
      }
      return { name: `posicao-de-estoque-${today()}.csv`, csv: toCsv(["Código", "Descrição", "Grupo", "Local", "Nome do local", "Quantidade", "Un.", "Mínimo", "Custo médio", "Valor"], rows) };
    },
  },
  fechamento: {
    mod: "estoque",
    run: async (tx, _t, sp) => {
      const [cl] = await tx.select().from(E.stockClosings).where(eq(E.stockClosings.id, sp.id ?? "")).limit(1);
      const rows = cl ? await tx.select({ r: E.stockClosingItems, i: E.items, l: E.stockLocations }).from(E.stockClosingItems).innerJoin(E.items, eq(E.items.id, E.stockClosingItems.itemId))
        .innerJoin(E.stockLocations, eq(E.stockLocations.id, E.stockClosingItems.locationId)).where(eq(E.stockClosingItems.closingId, cl.id)).orderBy(asc(E.items.name)) : [];
      return { name: `fechamento-estoque-${cl?.closingDate ?? "x"}.csv`, csv: toCsv(["Código", "Descrição", "Local", "Quantidade", "Un.", "Custo médio", "Valor"],
        rows.map(({ r, i, l }) => [i.code, i.name, l.code + " · " + l.name, Number(r.qty), i.unit, Number(r.avgCost), Number(r.value)])) };
    },
  },
  movimentacoes: {
    mod: "estoque",
    run: async (tx, _t, sp) => {
      const c: SQL[] = [sql`true`];
      if (sp.de) c.push(sql`${E.stockMovements.date} >= ${sp.de}`);
      if (sp.ate) c.push(sql`${E.stockMovements.date} <= ${sp.ate}`);
      const rows = await tx.select({ m: E.stockMovements, i: E.items, l: E.stockLocations.code }).from(E.stockMovements).innerJoin(E.items, eq(E.items.id, E.stockMovements.itemId))
        .innerJoin(E.stockLocations, eq(E.stockLocations.id, E.stockMovements.locationId)).where(and(...c)).orderBy(desc(E.stockMovements.date));
      return { name: `movimentacoes-${today()}.csv`, csv: toCsv(["Data", "Tipo", "Código", "Item", "Local", "Quantidade", "Custo unit.", "Documento", "Observação", "Usuário"],
        rows.map(({ m, i, l }) => [brDate(m.date), m.type, i.code, i.name, l, Number(m.qty), Number(m.unitCost), m.document, m.notes, m.userName])) };
    },
  },
  "fin-receber": { mod: "financeiro", run: (tx, _t, sp) => titlesCsv(tx, "RECEBER", sp) },
  "fin-pagar": { mod: "financeiro", run: (tx, _t, sp) => titlesCsv(tx, "PAGAR", sp) },
  "fin-recebimentos": { mod: "financeiro", run: (tx, _t, sp) => paidCsv(tx, "RECEBER", sp) },
  "fin-pagamentos": { mod: "financeiro", run: (tx, _t, sp) => paidCsv(tx, "PAGAR", sp) },
  "fin-categorias": {
    mod: "financeiro",
    run: async (tx, _t, sp) => {
      const { de, ate } = period(sp);
      const r = await tx.execute<{ kind: string; cat: string | null; v: string; n: number }>(sql`
        select t.kind, c.name cat, sum(coalesce(t.paid_amount, t.amount))::text v, count(*)::int n from fin_titles t left join fin_categories c on c.id = t.category_id
        where t.status = 'PAGO' and t.paid_at between ${de} and ${ate} group by t.kind, c.name order by t.kind desc, 3 desc`);
      return { name: `resultado-por-categoria-${de}-a-${ate}.csv`, csv: toCsv(["Tipo", "Categoria", "Lançamentos", "Valor"], r.rows.map((x) => [x.kind === "RECEBER" ? "Receita" : "Despesa", x.cat ?? "Sem categoria", x.n, Number(x.v)])) };
    },
  },
  "fin-parceiros": {
    mod: "financeiro",
    run: async (tx) => {
      const r = await tx.execute<{ nome: string; doc: string | null; kind: string; aberto: string; vencido: string; pago: string }>(sql`
        select coalesce(p.trade_name, p.name) nome, p.document doc, t.kind,
          coalesce(sum(t.amount) filter (where t.status = 'ABERTO'), 0)::text aberto,
          coalesce(sum(t.amount) filter (where t.status = 'ABERTO' and t.due_date < ${today()}), 0)::text vencido,
          coalesce(sum(coalesce(t.paid_amount, t.amount)) filter (where t.status = 'PAGO'), 0)::text pago
        from fin_titles t join partners p on p.id = t.partner_id group by 1, 2, 3 order by 3 desc, 4 desc`);
      return { name: `totais-por-cliente-e-fornecedor-${today()}.csv`, csv: toCsv(["Nome", "CNPJ/CPF", "Tipo", "Em aberto", "Vencido", "Realizado"], r.rows.map((x) => [x.nome, x.doc, x.kind === "RECEBER" ? "A receber" : "A pagar", Number(x.aberto), Number(x.vencido), Number(x.pago)])) };
    },
  },
  "fin-inadimplencia": {
    mod: "financeiro",
    run: async (tx) => {
      const rows = await tx.select({ t: E.finTitles, p: E.partners.name, doc: E.partners.document, tel: E.partners.phone }).from(E.finTitles).leftJoin(E.partners, eq(E.partners.id, E.finTitles.partnerId))
        .where(sql`${E.finTitles.kind} = 'RECEBER' and ${E.finTitles.status} = 'ABERTO' and ${E.finTitles.dueDate} < ${today()}`).orderBy(asc(E.finTitles.dueDate));
      return { name: `inadimplencia-${today()}.csv`, csv: toCsv(["Cliente", "CNPJ/CPF", "Telefone", "Descrição", "Parcela", "Vencimento", "Dias em atraso", "Valor"],
        rows.map(({ t, p, doc, tel }) => [p, doc, tel, t.description, t.installment, brDate(t.dueDate), diffDays(t.dueDate, today()), Number(t.amount)])) };
    },
  },
  "fin-fluxo": {
    mod: "financeiro",
    run: async (tx) => {
      const f = await weeklyFlow(tx, 13);
      return { name: `fluxo-de-caixa-${today()}.csv`, csv: toCsv(["Semana (início)", "Semana (fim)", "Entradas", "Saídas", "Resultado", "Saldo projetado"], [["Saldo atual", "", "", "", "", f.start], ...f.weeks.map((w) => [brDate(w.ini), brDate(w.fim), w.e, w.s, w.res, w.saldo])]) };
    },
  },
  "fin-extrato": {
    mod: "financeiro",
    run: async (tx, _t, sp) => {
      const { de, ate } = period(sp);
      const [acc] = await tx.select().from(E.bankAccounts).where(eq(E.bankAccounts.id, sp.conta ?? "")).limit(1);
      if (!acc) return { name: "extrato.csv", csv: toCsv(["Conta não encontrada"], []) };
      const before = (await accountBalances(tx, addDays(de, -1))).find((a) => a.id === acc.id)?.balance ?? 0;
      const tits = await tx.select({ t: E.finTitles, p: E.partners.name }).from(E.finTitles).leftJoin(E.partners, eq(E.partners.id, E.finTitles.partnerId))
        .where(sql`${E.finTitles.bankAccountId} = ${acc.id} and ${E.finTitles.status} = 'PAGO' and ${E.finTitles.paidAt} between ${de} and ${ate}`);
      const ents = await tx.select().from(E.bankEntries).where(sql`${E.bankEntries.bankAccountId} = ${acc.id} and ${E.bankEntries.date} between ${de} and ${ate}`);
      const lines = [...tits.map(({ t, p }) => ({ d: t.paidAt!, x: t.description, who: p ?? "", v: (t.kind === "RECEBER" ? 1 : -1) * Number(t.paidAmount ?? t.amount) })), ...ents.map((e) => ({ d: e.date, x: e.description, who: "", v: Number(e.amount) }))].sort((a, b) => a.d.localeCompare(b.d));
      let run = before;
      return { name: `extrato-${de}-a-${ate}.csv`, csv: toCsv(["Data", "Descrição", "Cliente ou fornecedor", "Entrada", "Saída", "Saldo"],
        [["", "Saldo anterior", "", "", "", before], ...lines.map((l) => { run += l.v; return [brDate(l.d), l.x, l.who, l.v > 0 ? l.v : "", l.v < 0 ? -l.v : "", run]; })]) };
    },
  },
};

function period(sp: SP) {
  const de = sp.de && isDate(sp.de) ? sp.de : today().slice(0, 8) + "01";
  const ate = sp.ate && isDate(sp.ate) ? sp.ate : today();
  return { de, ate };
}

async function titlesCsv(tx: Tx, kind: "RECEBER" | "PAGAR", sp: SP) {
  const c: SQL[] = [eq(E.finTitles.kind, kind)];
  if (sp.de && isDate(sp.de)) c.push(sql`${E.finTitles.dueDate} >= ${sp.de}`);
  if (sp.ate && isDate(sp.ate)) c.push(sql`${E.finTitles.dueDate} <= ${sp.ate}`);
  if (sp.st === "aberto") c.push(eq(E.finTitles.status, "ABERTO"));
  else if (sp.st === "vencido") c.push(sql`${E.finTitles.status} = 'ABERTO' and ${E.finTitles.dueDate} < ${today()}`);
  else if (sp.st === "pago") c.push(eq(E.finTitles.status, "PAGO"));
  else if (sp.st === "cancelado") c.push(eq(E.finTitles.status, "CANCELADO"));
  if (sp.parc) c.push(eq(E.finTitles.partnerId, sp.parc));
  if (sp.cat) c.push(eq(E.finTitles.categoryId, sp.cat));
  const rows = await tx.select({ t: E.finTitles, p: E.partners.name, doc: E.partners.document, cat: E.finCategories.name, sit: E.finSituations.name, resp: E.finResponsibles.name, pm: E.paymentMethods.name, acc: E.bankAccounts.name })
    .from(E.finTitles).leftJoin(E.partners, eq(E.partners.id, E.finTitles.partnerId)).leftJoin(E.finCategories, eq(E.finCategories.id, E.finTitles.categoryId))
    .leftJoin(E.finSituations, eq(E.finSituations.id, E.finTitles.situationId)).leftJoin(E.finResponsibles, eq(E.finResponsibles.id, E.finTitles.responsibleId))
    .leftJoin(E.paymentMethods, eq(E.paymentMethods.id, E.finTitles.paymentMethodId)).leftJoin(E.bankAccounts, eq(E.bankAccounts.id, E.finTitles.bankAccountId))
    .where(and(...c)).orderBy(asc(E.finTitles.dueDate));
  const st = (t: typeof E.finTitles.$inferSelect) => t.status === "PAGO" ? (kind === "RECEBER" ? "Recebido" : "Pago") : t.status === "CANCELADO" ? "Cancelado" : t.dueDate < today() ? "Vencido" : "Em aberto";
  return { name: `contas-a-${kind === "RECEBER" ? "receber" : "pagar"}-${today()}.csv`, csv: toCsv(
    ["Vencimento", "Descrição", "Documento", kind === "RECEBER" ? "Cliente" : "Fornecedor", "CNPJ/CPF", "Categoria", "Parcela", "Forma", "Situação", "Responsável", "Valor", "Status", "Baixado em", "Valor baixado", "Conta"],
    rows.map(({ t, p, doc, cat, sit, resp, pm, acc }) => [brDate(t.dueDate), t.description, t.document, p, doc, cat, t.installment, pm, sit, resp, Number(t.amount), st(t), brDate(t.paidAt), t.paidAmount == null ? "" : Number(t.paidAmount), acc])) };
}

async function paidCsv(tx: Tx, kind: "RECEBER" | "PAGAR", sp: SP) {
  const { de, ate } = period(sp);
  const rows = await tx.select({ t: E.finTitles, p: E.partners.name, cat: E.finCategories.name, pm: E.paymentMethods.name, acc: E.bankAccounts.name }).from(E.finTitles)
    .leftJoin(E.partners, eq(E.partners.id, E.finTitles.partnerId)).leftJoin(E.finCategories, eq(E.finCategories.id, E.finTitles.categoryId))
    .leftJoin(E.paymentMethods, eq(E.paymentMethods.id, E.finTitles.paymentMethodId)).leftJoin(E.bankAccounts, eq(E.bankAccounts.id, E.finTitles.bankAccountId))
    .where(sql`${E.finTitles.kind} = ${kind} and ${E.finTitles.status} = 'PAGO' and ${E.finTitles.paidAt} between ${de} and ${ate}`).orderBy(asc(E.finTitles.paidAt));
  return { name: `${kind === "RECEBER" ? "recebimentos" : "pagamentos"}-${de}-a-${ate}.csv`, csv: toCsv(["Data", "Descrição", kind === "RECEBER" ? "Cliente" : "Fornecedor", "Categoria", "Vencimento", "Forma", "Conta", "Valor"],
    rows.map(({ t, p, cat, pm, acc }) => [brDate(t.paidAt), t.description, p, cat, brDate(t.dueDate), pm, acc, Number(t.paidAmount ?? t.amount)])) };
}
