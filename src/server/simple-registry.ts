import "server-only";
import { asc, eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Tx } from "@/lib/db";
import * as E from "@/db/erp";
import type { ModuleKey } from "@/lib/modules";

/** Tipos de campo dos cadastros simples. */
export type SFieldType = "text" | "textarea" | "date" | "num" | "int" | "money" | "select" | "check" | "color" | "days" | "list" | "group" | "partner";
export type Opt = [string, string];
export type SField = {
  k: string; label: string; t?: SFieldType; req?: boolean; full?: boolean; hint?: string; upper?: boolean; max?: number;
  opts?: Opt[] | ((tx: Tx) => Promise<Opt[]>); def?: string | number | boolean | number[] | string[];
};
export type SColFmt = "num" | "money" | "active" | "color" | "code" | "desc" | "opt" | "days" | "list" | "hours";
export type SCol = { k: string; label: string; f?: SColFmt };
export type SEntity = {
  mod: ModuleKey; table: PgTable & { id: PgColumn; tenantId: PgColumn }; title: string; sub: string; one: string; fem?: boolean;
  fields: SField[]; cols: SCol[]; order: (t: never) => SQL | PgColumn | (SQL | PgColumn)[];
  /** colunas calculadas (contagens) */
  counts?: { k: string; label: string; sql: SQL; f?: SColFmt }[];
  /** registros que impedem a exclusão: [tabela, coluna, mensagem] */
  uses?: [PgTable, PgColumn, string][];
  /** posição automática para etapas */
  autoPos?: boolean;
  where?: SQL;
  /** regra extra antes de salvar; devolve a mensagem de erro ou null */
  check?: (tx: Tx, values: Record<string, unknown>, id: string) => Promise<string | null>;
  /** regra extra antes de excluir; devolve a mensagem de erro ou null */
  guard?: (tx: Tx, id: string) => Promise<string | null>;
};

const SO_KINDS: Opt[] = [["PROPOSTA", "Proposta (ainda não aprovada)"], ["APROVADO", "Aprovado (vai para a produção)"], ["FATURADO", "Faturado (depois da nota)"], ["CANCELADO", "Cancelado"]];

/** Caminho completo de cada grupo ("Toalha › Algodão"), para mostrar o grupo pai. */
async function groupPaths(tx: Tx): Promise<Opt[]> {
  const all = await tx.select({ id: E.itemGroups.id, n: E.itemGroups.name, p: E.itemGroups.parentId }).from(E.itemGroups);
  const by = new Map(all.map((g) => [g.id, g]));
  const path = (id: string) => { const parts: string[] = []; const seen = new Set<string>(); let g = by.get(id);
    while (g && !seen.has(g.id)) { seen.add(g.id); parts.unshift(g.n); g = g.p ? by.get(g.p) : undefined; } return parts.join(" › "); };
  return all.map((g) => [g.id, path(g.id)] as Opt).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
}

const t = <T extends PgTable & { id: PgColumn; tenantId: PgColumn }>(x: T) => x as T;
const KINDS_ITEM: Opt[] = [["MATERIA_PRIMA", "Matéria-prima (comprado e consumido)"], ["SEMIACABADO", "Semiacabado (fabricado, vira componente)"], ["PRODUTO_ACABADO", "Produto acabado (fabricado e vendido)"], ["CONSUMO", "Uso e consumo"], ["REVENDA", "Revenda (comprado e vendido)"]];

export const SIMPLE: Record<string, SEntity> = {
  unidades: {
    mod: "itens", table: t(E.units), title: "Unidades de medida", sub: "Unidades usadas no cadastro de itens, pedidos e estoque.", one: "unidade", fem: true,
    fields: [{ k: "code", label: "Sigla", req: true, upper: true, max: 6 }, { k: "name", label: "Descrição", req: true }, { k: "decimals", label: "Casas decimais na quantidade", t: "int", def: 0, hint: "0 para itens contados por unidade; 2 ou 3 para peso e medida." }, { k: "active", label: "Unidade ativa", t: "check", def: true }],
    cols: [{ k: "code", label: "Sigla", f: "code" }, { k: "name", label: "Descrição", f: "desc" }, { k: "decimals", label: "Decimais", f: "num" }, { k: "active", label: "Situação", f: "active" }],
    counts: [{ k: "n", label: "Itens", sql: sql`(select count(*)::int from items i where i.unit = units.code)`, f: "num" }],
    order: () => asc(E.units.code),
  },
  tipos: {
    mod: "itens", table: t(E.itemTypes), title: "Tipos de item", sub: "Classificação dos itens. O comportamento define se o item é fabricado (tem estrutura e OP), comprado ou de consumo.", one: "tipo",
    fields: [{ k: "name", label: "Nome", req: true, full: true }, { k: "kind", label: "Comportamento no sistema", t: "select", req: true, full: true, opts: KINDS_ITEM, def: "MATERIA_PRIMA" }, { k: "active", label: "Tipo ativo", t: "check", def: true }],
    cols: [{ k: "name", label: "Tipo", f: "desc" }, { k: "kind", label: "Comportamento", f: "opt" }, { k: "active", label: "Situação", f: "active" }],
    counts: [{ k: "n", label: "Itens", sql: sql`(select count(*)::int from items i where i.type_id = item_types.id)`, f: "num" }],
    uses: [[E.items, E.items.typeId, "Há itens com este tipo. Mude o tipo deles ou marque como inativo."]],
    order: () => asc(E.itemTypes.name),
  },
  grupos: {
    mod: "itens", table: t(E.itemGroups), title: "Grupos de itens", sub: "Organizam os itens por família. Um grupo pode ficar dentro de outro (ex.: Toalha › Algodão) e ter o prefixo do código automático dos itens.", one: "grupo",
    fields: [{ k: "code", label: "Código", max: 20 }, { k: "name", label: "Nome", req: true },
      { k: "parentId", label: "Grupo pai", t: "group", full: true, hint: "Deixe vazio para um grupo principal. Para um subgrupo, pesquise o grupo de cima.", opts: groupPaths },
      { k: "codePrefix", label: "Prefixo do código", max: 20, hint: "Ex.: 003.001. ou MP-CH-. Itens novos do grupo recebem prefixo + número." },
      { k: "prefixDigits", label: "Dígitos do número", t: "int", def: 3, hint: "3 gera 001, 002…" }, { k: "nextNumber", label: "Próximo número", t: "int", def: 1 },
      { k: "description", label: "Descrição", t: "textarea", full: true }],
    cols: [{ k: "code", label: "Código", f: "code" }, { k: "name", label: "Nome", f: "desc" }, { k: "parentId", label: "Grupo pai", f: "opt" }, { k: "codePrefix", label: "Prefixo", f: "code" }, { k: "nextNumber", label: "Próximo", f: "num" }],
    counts: [{ k: "n", label: "Itens", sql: sql`(select count(*)::int from items i where i.group_id = item_groups.id)`, f: "num" }],
    uses: [[E.items, E.items.groupId, "Existem itens neste grupo. Mova-os para outro grupo antes de excluir."], [E.itemGroups, E.itemGroups.parentId, "Este grupo tem subgrupos. Mova ou exclua os subgrupos antes."]],
    // subgrupos logo abaixo do grupo pai
    order: () => [asc(sql`coalesce((select p.name from item_groups p where p.id = item_groups.parent_id), item_groups.name)`), asc(sql`item_groups.parent_id is not null`), asc(E.itemGroups.name)],
    check: async (tx, v, id) => {
      const parent = v.parentId as string | null;
      if (!parent) return null;
      if (parent === id) return "Um grupo não pode ser pai dele mesmo.";
      // sobe a partir do pai escolhido: se encontrar o próprio grupo, viraria um ciclo
      const all = await tx.select({ id: E.itemGroups.id, p: E.itemGroups.parentId }).from(E.itemGroups);
      const up = new Map(all.map((g) => [g.id, g.p]));
      for (let cur: string | null | undefined = parent, n = 0; cur && n < 50; cur = up.get(cur), n++) if (cur === id) return "O grupo pai escolhido está dentro deste grupo.";
      return null;
    },
  },
  "perfis-cliente": {
    mod: "comercial", table: t(E.partnerProfiles), title: "Perfis de cliente", sub: "Classifique os clientes (ex.: Frotista, Revenda, Construtora) para filtrar e analisar as vendas.", one: "perfil",
    fields: [{ k: "name", label: "Nome", req: true }, { k: "color", label: "Cor", t: "color", def: "#1E3A5F" }, { k: "description", label: "Descrição", t: "textarea", full: true }, { k: "active", label: "Perfil ativo", t: "check", def: true }],
    cols: [{ k: "name", label: "Perfil", f: "color" }, { k: "description", label: "Descrição", f: "desc" }, { k: "active", label: "Situação", f: "active" }],
    counts: [{ k: "n", label: "Clientes", sql: sql`(select count(*)::int from partners p where p.profile_id = partner_profiles.id)`, f: "num" }],
    uses: [[E.partners, E.partners.profileId, "Há clientes com este perfil. Troque o perfil deles ou marque como inativo."]],
    order: () => asc(E.partnerProfiles.name),
  },
  vendedores: {
    mod: "comercial", table: t(E.salespeople), title: "Vendedores", sub: "Vendedores internos e representantes. Aparecem no cadastro do cliente e no pedido de venda.", one: "vendedor",
    fields: [{ k: "name", label: "Nome", req: true, full: true }, { k: "email", label: "E-mail" }, { k: "phone", label: "Telefone" },
      { k: "commissionPct", label: "Comissão (%)", t: "num", def: 0 }, { k: "active", label: "Vendedor ativo", t: "check", def: true }],
    cols: [{ k: "name", label: "Vendedor", f: "desc" }, { k: "email", label: "E-mail" }, { k: "phone", label: "Telefone" }, { k: "commissionPct", label: "Comissão (%)", f: "num" }, { k: "active", label: "Situação", f: "active" }],
    counts: [{ k: "c", label: "Clientes", sql: sql`(select count(*)::int from partners p where p.salesperson_id = salespeople.id)`, f: "num" },
      { k: "o", label: "Pedidos", sql: sql`(select count(*)::int from sales_orders o where o.salesperson_id = salespeople.id)`, f: "num" }],
    uses: [[E.salesOrders, E.salesOrders.salespersonId, "Há pedidos com este vendedor. Marque como inativo em vez de excluir."], [E.partners, E.partners.salespersonId, "Há clientes ligados a este vendedor. Troque o vendedor deles ou marque como inativo."]],
    order: () => asc(E.salespeople.name),
  },
  "etapas-venda": {
    mod: "comercial", table: t(E.salesStages), title: "Etapas do pedido de venda", sub: "Situações por onde o pedido passa. As quatro do sistema (Proposta, Aprovado, Faturado e Cancelado) não podem ser excluídas, mas você pode mudar o nome e a cor e criar outras, como “Em negociação” ou “Entregue”.", one: "etapa", fem: true, autoPos: true,
    fields: [{ k: "name", label: "Nome da etapa", req: true }, { k: "position", label: "Ordem", t: "int", req: true },
      { k: "kind", label: "Comportamento", t: "select", req: true, full: true, def: "APROVADO", opts: SO_KINDS, hint: "Define as regras: em Aprovado o pedido vai para a produção; em Faturado ele fica travado. Ex.: “Entregue” se comporta como Faturado." },
      { k: "color", label: "Cor", t: "color", full: true, def: "#1E3A5F" }, { k: "active", label: "Etapa ativa", t: "check", def: true }],
    cols: [{ k: "position", label: "Ordem", f: "num" }, { k: "name", label: "Etapa", f: "color" }, { k: "kind", label: "Comportamento", f: "opt" }, { k: "active", label: "Situação", f: "active" }],
    counts: [{ k: "system", label: "Do sistema", sql: sql`sales_stages.system`, f: "active" }, { k: "n", label: "Pedidos", sql: sql`(select count(*)::int from sales_orders o where o.stage_id = sales_stages.id)`, f: "num" }],
    uses: [[E.salesOrders, E.salesOrders.stageId, "Há pedidos nesta etapa. Mude a etapa deles antes de excluir, ou marque como inativa."]],
    order: () => asc(E.salesStages.position),
    check: async (tx, v, id) => {
      if (!id) return null;
      const [cur] = await tx.select().from(E.salesStages).where(eq(E.salesStages.id, id)).limit(1);
      if (cur?.system && v.kind !== cur.kind) return "O comportamento das etapas do sistema não pode ser trocado. Crie uma etapa nova.";
      if (cur?.system && v.active === false) return "As etapas do sistema não podem ser inativadas.";
      if (cur && !cur.system && v.kind !== cur.kind) {
        const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.salesOrders).where(eq(E.salesOrders.stageId, id));
        if (c) return "Há pedidos nesta etapa: o comportamento não pode ser trocado.";
      }
      return null;
    },
    guard: async (tx, id) => {
      const [cur] = await tx.select({ system: E.salesStages.system }).from(E.salesStages).where(eq(E.salesStages.id, id)).limit(1);
      return cur?.system ? "Esta etapa é do sistema e não pode ser excluída. Você pode mudar o nome e a cor." : null;
    },
  },
  "locais-entrega": {
    mod: "comercial", table: t(E.deliveryPlaces), title: "Locais de entrega e montagem", sub: "Endereços usados com frequência (obras, filiais do cliente, transportadoras). Aparecem na pesquisa do local de entrega do pedido e do local da montagem.", one: "local",
    fields: [{ k: "name", label: "Nome", req: true, hint: "Ex.: Obra Residencial Atlântico" }, { k: "partnerId", label: "Cliente", t: "partner", hint: "Opcional: o local aparece primeiro nos pedidos deste cliente.",
      opts: async (tx) => (await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners).where(sql`'Cliente' = any(${E.partners.kinds})`).orderBy(sql`2`)).map((r) => [r.id, r.n]) },
      { k: "address", label: "Endereço", t: "textarea", full: true }, { k: "active", label: "Local ativo", t: "check", def: true }],
    cols: [{ k: "name", label: "Local", f: "desc" }, { k: "address", label: "Endereço" }, { k: "partnerId", label: "Cliente", f: "opt" }, { k: "active", label: "Situação", f: "active" }],
    order: () => asc(E.deliveryPlaces.name),
  },
  "campos-pedido": {
    mod: "comercial", table: t(E.customFields), title: "Campos personalizados do pedido", sub: "Campos extras que aparecem na sessão “Campos personalizados” do pedido de venda.", one: "campo", autoPos: true,
    fields: [{ k: "label", label: "Nome do campo", req: true, full: true }, { k: "type", label: "Tipo", t: "select", req: true, def: "texto", opts: [["texto", "Texto"], ["numero", "Número"], ["data", "Data"], ["lista", "Lista de opções"], ["sim_nao", "Sim ou não"]] },
      { k: "position", label: "Ordem", t: "int", req: true }, { k: "options", label: "Opções da lista", t: "list", full: true, hint: "Só para o tipo lista. Separe as opções com ponto e vírgula. Ex.: Retira; Entrega; Transportadora" },
      { k: "required", label: "Preenchimento obrigatório", t: "check", def: false }, { k: "active", label: "Campo ativo", t: "check", def: true }],
    cols: [{ k: "position", label: "Ordem", f: "num" }, { k: "label", label: "Campo", f: "desc" }, { k: "type", label: "Tipo", f: "opt" }, { k: "options", label: "Opções", f: "list" }, { k: "required", label: "Obrigatório", f: "active" }, { k: "active", label: "Situação", f: "active" }],
    order: () => asc(E.customFields.position),
    where: sql`entity = 'sales_order'`,
  },
  formas: {
    mod: "financeiro", table: t(E.paymentMethods), title: "Formas de pagamento", sub: "Usadas nos pedidos de venda e de compra e nas contas a pagar e receber.", one: "forma", fem: true,
    fields: [{ k: "name", label: "Nome", req: true, full: true }, { k: "active", label: "Forma ativa", t: "check", def: true }],
    cols: [{ k: "name", label: "Forma de pagamento", f: "desc" }, { k: "active", label: "Situação", f: "active" }],
    uses: [[E.salesOrders, E.salesOrders.paymentMethodId, "Há pedidos com esta forma. Marque como inativa."], [E.finTitles, E.finTitles.paymentMethodId, "Há lançamentos com esta forma. Marque como inativa."]],
    order: () => asc(E.paymentMethods.name),
  },
  condicoes: {
    mod: "financeiro", table: t(E.paymentTerms), title: "Condições de pagamento", sub: "Prazos das parcelas, em dias. Ex.: 30/60/90 gera três parcelas.", one: "condição", fem: true,
    fields: [{ k: "name", label: "Nome", req: true }, { k: "days", label: "Prazos em dias", t: "days", req: true, def: [30], hint: "Separe com vírgula. 0 é à vista. Ex.: 0, 30, 60" }, { k: "active", label: "Condição ativa", t: "check", def: true }],
    cols: [{ k: "name", label: "Condição", f: "desc" }, { k: "days", label: "Prazos (dias)", f: "days" }, { k: "active", label: "Situação", f: "active" }],
    uses: [[E.salesOrders, E.salesOrders.paymentTermId, "Há pedidos com esta condição. Marque como inativa."]],
    order: () => asc(E.paymentTerms.name),
  },
  bancos: {
    mod: "financeiro", table: t(E.bankAccounts), title: "Contas bancárias", sub: "Contas e caixas onde o dinheiro entra e sai. O extrato de cada conta parte do saldo inicial.", one: "conta", fem: true,
    fields: [{ k: "name", label: "Nome da conta", req: true, full: true, hint: "Ex.: Banco do Brasil · conta movimento" }, { k: "bank", label: "Banco" }, { k: "agency", label: "Agência" }, { k: "account", label: "Conta" },
      { k: "initialBalance", label: "Saldo inicial (R$)", t: "money", def: 0 }, { k: "initialDate", label: "Data do saldo inicial", t: "date" }, { k: "active", label: "Conta ativa", t: "check", def: true }],
    cols: [{ k: "name", label: "Conta", f: "desc" }, { k: "bank", label: "Banco" }, { k: "agency", label: "Agência" }, { k: "account", label: "Conta" }, { k: "initialBalance", label: "Saldo inicial", f: "money" }, { k: "active", label: "Situação", f: "active" }],
    uses: [[E.finTitles, E.finTitles.bankAccountId, "Há lançamentos baixados nesta conta. Marque como inativa."]],
    order: () => asc(E.bankAccounts.name),
  },
  categorias: {
    mod: "financeiro", table: t(E.finCategories), title: "Categorias financeiras", sub: "Classificação das receitas e despesas, usada nos relatórios e no dashboard.", one: "categoria", fem: true,
    fields: [{ k: "name", label: "Nome", req: true }, { k: "kind", label: "Tipo", t: "select", req: true, def: "PAGAR", opts: [["RECEBER", "Receita (contas a receber)"], ["PAGAR", "Despesa (contas a pagar)"]] }, { k: "active", label: "Categoria ativa", t: "check", def: true }],
    cols: [{ k: "name", label: "Categoria", f: "desc" }, { k: "kind", label: "Tipo", f: "opt" }, { k: "active", label: "Situação", f: "active" }],
    uses: [[E.finTitles, E.finTitles.categoryId, "Há lançamentos nesta categoria. Marque como inativa."]],
    order: () => [asc(E.finCategories.kind), asc(E.finCategories.name)],
  },
  situacoes: {
    mod: "financeiro", table: t(E.finSituations), title: "Situações dos lançamentos", sub: "Etiquetas para acompanhar contas em aberto, como “Aguardando aprovação” ou “Agendado”.", one: "situação", fem: true,
    fields: [{ k: "name", label: "Nome", req: true, full: true }, { k: "color", label: "Cor", t: "color", full: true, def: "#6B7785" }, { k: "active", label: "Situação ativa", t: "check", def: true }],
    cols: [{ k: "name", label: "Situação", f: "color" }, { k: "active", label: "Ativa", f: "active" }],
    uses: [[E.finTitles, E.finTitles.situationId, "Há lançamentos com esta situação. Marque como inativa."]],
    order: () => asc(E.finSituations.name),
  },
  responsaveis: {
    mod: "financeiro", table: t(E.finResponsibles), title: "Responsáveis", sub: "Quem responde pelo pagamento ou pela cobrança de cada lançamento.", one: "responsável",
    fields: [{ k: "name", label: "Nome", req: true }, { k: "email", label: "E-mail" }, { k: "active", label: "Ativo", t: "check", def: true }],
    cols: [{ k: "name", label: "Nome", f: "desc" }, { k: "email", label: "E-mail" }, { k: "active", label: "Situação", f: "active" }],
    uses: [[E.finTitles, E.finTitles.responsibleId, "Há lançamentos com este responsável. Marque como inativo."]],
    order: () => asc(E.finResponsibles.name),
  },
  locais: {
    mod: "estoque", table: t(E.stockLocations), title: "Locais de estoque", sub: "Almoxarifados, áreas de produção e expedição onde os itens ficam guardados.", one: "local",
    fields: [{ k: "code", label: "Código", req: true, max: 20 }, { k: "name", label: "Nome", req: true }, { k: "type", label: "Tipo", t: "select", def: "Almoxarifado", opts: ["Almoxarifado", "Produção", "Expedição", "Terceiros", "Quarentena"].map((x) => [x, x] as Opt) },
      { k: "active", label: "Local ativo", t: "check", def: true }, { k: "description", label: "Endereço ou observação", t: "textarea", full: true }],
    cols: [{ k: "code", label: "Código", f: "code" }, { k: "name", label: "Nome", f: "desc" }, { k: "type", label: "Tipo" }, { k: "active", label: "Situação", f: "active" }],
    counts: [{ k: "n", label: "Movimentações", sql: sql`(select count(*)::int from stock_movements m where m.location_id = stock_locations.id or m.dest_location_id = stock_locations.id)`, f: "num" }],
    uses: [[E.stockMovements, E.stockMovements.locationId, "Este local já tem movimentações. Marque como inativo em vez de excluir."]],
    order: () => asc(E.stockLocations.code),
  },
  "etapas-op": {
    mod: "producao", table: t(E.productionStages), title: "Etapas das ordens de produção", sub: "Cada etapa vira uma coluna no quadro de OPs, na ordem definida aqui.", one: "etapa", fem: true, autoPos: true,
    fields: [{ k: "name", label: "Nome da etapa", req: true }, { k: "position", label: "Ordem no quadro", t: "int", req: true },
      { k: "kind", label: "Comportamento", t: "select", full: true, def: "andamento", opts: [["aberta", "Aberta (ainda não iniciada)"], ["andamento", "Em andamento"], ["finalizada", "Finaliza a OP"], ["cancelada", "Cancela a OP (fica fora do quadro)"]] },
      { k: "color", label: "Cor", t: "color", full: true, def: "#1E3A5F" }],
    cols: [{ k: "position", label: "Ordem", f: "num" }, { k: "name", label: "Etapa", f: "color" }, { k: "kind", label: "Comportamento", f: "opt" }],
    counts: [{ k: "n", label: "OPs nesta etapa", sql: sql`(select count(*)::int from production_orders o where o.stage_id = production_stages.id)`, f: "num" }],
    uses: [[E.productionOrders, E.productionOrders.stageId, "Há ordens de produção nesta etapa. Mova-as antes de excluir."]],
    order: () => asc(E.productionStages.position),
  },
  "etapas-montagem": {
    mod: "producao", table: t(E.assemblyStages), title: "Etapas de montagem", sub: "Situação de cada local de montagem. Muda sozinha conforme as peças são marcadas como montadas.", one: "etapa", fem: true, autoPos: true,
    fields: [{ k: "name", label: "Nome da etapa", req: true }, { k: "position", label: "Ordem", t: "int", req: true },
      { k: "kind", label: "Comportamento", t: "select", full: true, def: "andamento", opts: [["aguardando", "Ainda não iniciado"], ["andamento", "Em montagem"], ["pendencia", "Pendência (gera alerta)"], ["concluido", "Concluído"]] },
      { k: "color", label: "Cor", t: "color", full: true, def: "#1E3A5F" }],
    cols: [{ k: "position", label: "Ordem", f: "num" }, { k: "name", label: "Etapa", f: "color" }, { k: "kind", label: "Comportamento", f: "opt" }],
    uses: [[E.assemblyLocations, E.assemblyLocations.stageId, "Há locais de montagem nesta etapa. Mude-os antes de excluir."]],
    order: () => asc(E.assemblyStages.position),
  },
  centros: {
    mod: "producao", table: t(E.workCenters), title: "Centros de trabalho", sub: "Setores ou máquinas por onde a produção passa. O custo por hora entra no custo da OP.", one: "centro",
    fields: [{ k: "code", label: "Código", req: true, max: 20 }, { k: "name", label: "Nome", req: true }, { k: "capacityHours", label: "Capacidade (horas por dia)", t: "num", def: 8 }, { k: "costPerHour", label: "Custo por hora (R$)", t: "money", def: 0 },
      { k: "description", label: "Descrição", t: "textarea", full: true }, { k: "active", label: "Centro ativo", t: "check", def: true }],
    cols: [{ k: "code", label: "Código", f: "code" }, { k: "name", label: "Nome", f: "desc" }, { k: "capacityHours", label: "Capacidade", f: "hours" }, { k: "costPerHour", label: "Custo/hora", f: "money" }, { k: "active", label: "Situação", f: "active" }],
    counts: [{ k: "p", label: "Pessoas", sql: sql`(select count(*)::int from team_members m where m.work_center_id = work_centers.id)`, f: "num" }],
    uses: [[E.productionOrders, E.productionOrders.workCenterId, "Há OPs ligadas a este centro. Marque como inativo."], [E.teamMembers, E.teamMembers.workCenterId, "Há pessoas ligadas a este centro. Marque como inativo."]],
    order: () => asc(E.workCenters.code),
  },
  equipe: {
    mod: "producao", table: t(E.teamMembers), title: "Equipe de produção", sub: "Responsáveis, operadores e montadores atribuídos às OPs, apontamentos e montagens.", one: "pessoa", fem: true,
    fields: [{ k: "name", label: "Nome", req: true, full: true }, { k: "role", label: "Função", req: true },
      { k: "workCenterId", label: "Centro de trabalho", t: "select", opts: async (tx) => (await tx.select({ id: E.workCenters.id, n: E.workCenters.name }).from(E.workCenters).orderBy(asc(E.workCenters.name))).map((r) => [r.id, r.n]) },
      { k: "shift", label: "Turno", t: "select", def: "Comercial", opts: ["Manhã", "Tarde", "Noite", "Comercial"].map((x) => [x, x] as Opt) }, { k: "phone", label: "Telefone" }, { k: "active", label: "Pessoa ativa", t: "check", def: true }],
    cols: [{ k: "name", label: "Nome", f: "desc" }, { k: "role", label: "Função" }, { k: "workCenterId", label: "Centro", f: "opt" }, { k: "shift", label: "Turno" }, { k: "active", label: "Situação", f: "active" }],
    uses: [[E.productionOrders, E.productionOrders.responsibleId, "Esta pessoa é responsável por OPs. Marque como inativa."], [E.timeEntries, E.timeEntries.memberId, "Esta pessoa tem apontamentos. Marque como inativa."]],
    order: () => asc(E.teamMembers.name),
  },
};

export const isSimpleKey = (k: string): k is keyof typeof SIMPLE => Object.prototype.hasOwnProperty.call(SIMPLE, k);
export { eq };
