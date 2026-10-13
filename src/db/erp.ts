/**
 * Otimiza+ ERP — tabelas dos módulos de negócio (comercial, produção, estoque, compras, financeiro).
 *
 * Padrões:
 *  - toda tabela tem tenant_id + Row Level Security (migração 0003) e UNIQUE (tenant_id, id);
 *  - as chaves estrangeiras entre tabelas de negócio são compostas (tenant_id, x_id), então um
 *    registro nunca aponta para dados de outra empresa, mesmo que um id vaze;
 *  - datas de negócio (emissão, vencimento…) são `date` em texto AAAA-MM-DD;
 *  - valores em numeric: dinheiro (14,2), quantidades e custos unitários (14,4).
 */
import {
  boolean, date, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex,
  type AnyPgColumn, type PgColumn,
} from "drizzle-orm/pg-core";
import { createId } from "../lib/ids";
import { itemTypeEnum, tenants } from "./schema";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const day = (name: string) => date(name, { mode: "string" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 14, scale: 4 });

/** Colunas comuns a toda tabela de empresa. */
const base = () => ({
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

type Ref = { tenantId: AnyPgColumn; id: AnyPgColumn };
/** Chave estrangeira composta (tenant_id, coluna) → (tenant_id, id) da tabela referenciada. */
function fk(name: string, tenant: PgColumn, col: PgColumn, ref: () => Ref, cascade = false) {
  const r = ref();
  const f = foreignKey({ name, columns: [tenant, col], foreignColumns: [r.tenantId, r.id] });
  return cascade ? f.onDelete("cascade") : f;
}
const tid = (name: string, t: { tenantId: PgColumn; id: PgColumn }) => unique(name).on(t.tenantId, t.id);

// =====================================================================================
// Numeração sequencial de documentos (pedidos, OPs, notas…) por empresa
// =====================================================================================
export const sequences = pgTable("sequences", {
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: integer("value").notNull().default(0),
}, (t) => [primaryKey({ name: "sequences_pk", columns: [t.tenantId, t.key] })]);

// =====================================================================================
// Administração
// =====================================================================================
export const accessProfiles = pgTable("access_profiles", {
  ...base(),
  name: text("name").notNull(),
  description: text("description"),
  /** { comercial: "editar" | "ver" | "nenhum", …, custos: true } */
  permissions: jsonb("permissions").$type<Record<string, string | boolean>>().notNull().default({}),
}, (t) => [tid("access_profiles_tid_uq", t), uniqueIndex("access_profiles_name_uq").on(t.tenantId, t.name)]);

export const companySettings = pgTable("company_settings", {
  ...base(),
  legalName: text("legal_name"),
  tradeName: text("trade_name"),
  document: text("document"),
  stateReg: text("state_reg"),
  cityReg: text("city_reg"),
  taxRegime: text("tax_regime"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  zip: text("zip"),
  street: text("street"),
  number: text("number"),
  complement: text("complement"),
  district: text("district"),
  city: text("city"),
  cityCode: text("city_code"),
  uf: text("uf"),
  /** versão dos cadastros padrão já criados para a empresa */
  defaultsVersion: integer("defaults_version").notNull().default(0),
}, (t) => [tid("company_settings_tid_uq", t), uniqueIndex("company_settings_tenant_uq").on(t.tenantId)]);

// =====================================================================================
// Itens
// =====================================================================================
export const units = pgTable("units", {
  ...base(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  decimals: integer("decimals").notNull().default(0),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("units_tid_uq", t), uniqueIndex("units_code_uq").on(t.tenantId, t.code)]);

export const itemTypes = pgTable("item_types", {
  ...base(),
  name: text("name").notNull(),
  /** comportamento no sistema: fabricável, comprado, consumo… */
  kind: itemTypeEnum("kind").notNull().default("MATERIA_PRIMA"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("item_types_tid_uq", t), uniqueIndex("item_types_name_uq").on(t.tenantId, t.name)]);

export const codePrefixes = pgTable("code_prefixes", {
  ...base(),
  prefix: text("prefix").notNull(),
  description: text("description"),
  digits: integer("digits").notNull().default(3),
  nextNumber: integer("next_number").notNull().default(1),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("code_prefixes_tid_uq", t), uniqueIndex("code_prefixes_prefix_uq").on(t.tenantId, t.prefix)]);

export const itemGroups = pgTable("item_groups", {
  ...base(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  /** grupo pai (ex.: Toalha › Algodão); vazio = grupo principal */
  parentId: text("parent_id"),
  /** prefixo do código automático dos itens do grupo (ex.: 003.) + dígitos do número sequencial */
  codePrefix: text("code_prefix"),
  prefixDigits: integer("prefix_digits").notNull().default(3),
  nextNumber: integer("next_number").notNull().default(1),
  /** legado: prefixo cadastrado à parte (antes de o prefixo ficar no próprio grupo) */
  prefixId: text("prefix_id"),
}, (t) => [
  uniqueIndex("item_groups_tenant_name_uq").on(t.tenantId, t.name),
  unique("item_groups_tenant_id_id_uq").on(t.tenantId, t.id),
  fk("item_groups_prefix_fk", t.tenantId, t.prefixId, () => codePrefixes),
  fk("item_groups_parent_fk", t.tenantId, t.parentId, (): Ref => itemGroups),
]);

export const items = pgTable("items", {
  ...base(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  complement: text("complement"),
  unit: text("unit").notNull().default("UN"),
  /** comportamento herdado do tipo (fabricável, matéria-prima…) */
  type: itemTypeEnum("type").notNull().default("MATERIA_PRIMA"),
  typeId: text("type_id"),
  groupId: text("group_id"),
  active: boolean("active").notNull().default(true),
  // estoque
  minStock: qty("min_stock").notNull().default("0"),
  maxStock: qty("max_stock").notNull().default("0"),
  defaultLocationId: text("default_location_id"),
  stockAddress: text("stock_address"),
  // compras
  defaultSupplierId: text("default_supplier_id"),
  leadDays: integer("lead_days"),
  minPurchaseQty: qty("min_purchase_qty").notNull().default("0"),
  // custo e preço
  cost: qty("cost").notNull().default("0"),
  salePrice: money("sale_price").notNull().default("0"),
  // fiscal
  ncm: text("ncm"),
  cest: text("cest"),
  origin: text("origin").notNull().default("0"),
  gtin: text("gtin"),
  netWeight: qty("net_weight"),
  grossWeight: qty("gross_weight"),
  notes: text("notes"),
}, (t) => [
  uniqueIndex("items_tenant_code_uq").on(t.tenantId, t.code),
  index("items_tenant_name_idx").on(t.tenantId, t.name),
  unique("items_tenant_id_id_uq").on(t.tenantId, t.id),
  foreignKey({ name: "items_group_same_tenant_fk", columns: [t.tenantId, t.groupId], foreignColumns: [itemGroups.tenantId, itemGroups.id] }),
  fk("items_type_fk", t.tenantId, t.typeId, () => itemTypes),
]);

const itemFk = (name: string, t: PgColumn, c: PgColumn, cascade = false) => fk(name, t, c, () => items, cascade);

export const itemBom = pgTable("item_bom", {
  ...base(),
  itemId: text("item_id").notNull(),
  componentId: text("component_id").notNull(),
  qty: qty("qty").notNull().default("1"),
  lossPct: numeric("loss_pct", { precision: 7, scale: 2 }).notNull().default("0"),
  position: integer("position").notNull().default(0),
}, (t) => [
  tid("item_bom_tid_uq", t), index("item_bom_item_idx").on(t.tenantId, t.itemId),
  itemFk("item_bom_item_fk", t.tenantId, t.itemId, true), itemFk("item_bom_comp_fk", t.tenantId, t.componentId),
]);

export const itemSuppliers = pgTable("item_suppliers", {
  ...base(),
  itemId: text("item_id").notNull(),
  partnerId: text("partner_id").notNull(),
  supplierCode: text("supplier_code"),
  lastPrice: qty("last_price").notNull().default("0"),
  leadDays: integer("lead_days"),
}, (t) => [
  tid("item_suppliers_tid_uq", t), uniqueIndex("item_suppliers_uq").on(t.tenantId, t.itemId, t.partnerId),
  itemFk("item_suppliers_item_fk", t.tenantId, t.itemId, true),
  fk("item_suppliers_partner_fk", t.tenantId, t.partnerId, () => partners, true),
]);

export const itemRouting = pgTable("item_routing", {
  ...base(),
  itemId: text("item_id").notNull(),
  workCenterId: text("work_center_id").notNull(),
  hours: numeric("hours", { precision: 10, scale: 2 }).notNull().default("0"),
  position: integer("position").notNull().default(0),
}, (t) => [
  tid("item_routing_tid_uq", t),
  itemFk("item_routing_item_fk", t.tenantId, t.itemId, true),
  fk("item_routing_wc_fk", t.tenantId, t.workCenterId, () => workCenters),
]);

// =====================================================================================
// Clientes, fornecedores e CRM
// =====================================================================================
export const partnerProfiles = pgTable("partner_profiles", {
  ...base(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#1E3A5F"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("partner_profiles_tid_uq", t), uniqueIndex("partner_profiles_name_uq").on(t.tenantId, t.name)]);

/** Vendedores (internos ou representantes), usados no cliente e no pedido de venda. */
export const salespeople = pgTable("salespeople", {
  ...base(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("salespeople_tid_uq", t), uniqueIndex("salespeople_name_uq").on(t.tenantId, t.name)]);

export const partners = pgTable("partners", {
  ...base(),
  kinds: text("kinds").array().notNull().default([]), // Cliente, Fornecedor, Transportadora, Prestador de serviço
  personType: text("person_type").notNull().default("PJ"), // PJ | PF
  document: text("document"),
  name: text("name").notNull(),
  tradeName: text("trade_name"),
  profileId: text("profile_id"),
  salespersonId: text("salesperson_id"), // vendedor responsável (salespeople)
  active: boolean("active").notNull().default(true),
  email: text("email"),
  phone: text("phone"),
  mobile1: text("mobile1"),
  mobile2: text("mobile2"),
  website: text("website"),
  // endereço
  zip: text("zip"),
  street: text("street"),
  number: text("number"),
  complement: text("complement"),
  district: text("district"),
  city: text("city"),
  cityCode: text("city_code"),
  uf: text("uf"),
  // dados fiscais
  stateReg: text("state_reg"),
  stateRegIndicator: text("state_reg_indicator"), // 1 contribuinte, 2 isento, 9 não contribuinte
  cityReg: text("city_reg"),
  suframa: text("suframa"),
  taxRegime: text("tax_regime"),
  finalConsumer: boolean("final_consumer").notNull().default(false),
  creditLimit: money("credit_limit"),
}, (t) => [
  tid("partners_tid_uq", t),
  index("partners_name_idx").on(t.tenantId, t.name),
  index("partners_doc_idx").on(t.tenantId, t.document),
  fk("partners_profile_fk", t.tenantId, t.profileId, () => partnerProfiles),
]);

export const partnerContacts = pgTable("partner_contacts", {
  ...base(),
  partnerId: text("partner_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  notes: text("notes"),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (t) => [tid("partner_contacts_tid_uq", t), fk("partner_contacts_partner_fk", t.tenantId, t.partnerId, () => partners, true)]);

export const partnerNotes = pgTable("partner_notes", {
  ...base(),
  partnerId: text("partner_id").notNull(),
  body: text("body").notNull(),
  userName: text("user_name"),
}, (t) => [tid("partner_notes_tid_uq", t), fk("partner_notes_partner_fk", t.tenantId, t.partnerId, () => partners, true)]);

/** Arquivos anexados a qualquer registro (clientes, pedidos, OPs…). Guardados no próprio banco. */
export const attachments = pgTable("attachments", {
  ...base(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: text("data").notNull(), // base64
  userName: text("user_name"),
}, (t) => [tid("attachments_tid_uq", t), index("attachments_entity_idx").on(t.tenantId, t.entity, t.entityId)]);

export const crmStages = pgTable("crm_stages", {
  ...base(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(1),
  color: text("color").notNull().default("#1E3A5F"),
  kind: text("kind").notNull().default("aberta"), // aberta | ganha | perdida
}, (t) => [tid("crm_stages_tid_uq", t)]);

export const crmDeals = pgTable("crm_deals", {
  ...base(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  partnerId: text("partner_id"),
  leadName: text("lead_name"),
  leadCompany: text("lead_company"),
  leadPhone: text("lead_phone"),
  leadEmail: text("lead_email"),
  stageId: text("stage_id").notNull(),
  value: money("value").notNull().default("0"),
  expectedClose: day("expected_close"),
  ownerId: text("owner_id"),
  source: text("source"),
  notes: text("notes"),
  lostReason: text("lost_reason"),
  salesOrderId: text("sales_order_id"),
  closedAt: day("closed_at"),
}, (t) => [
  tid("crm_deals_tid_uq", t),
  uniqueIndex("crm_deals_number_uq").on(t.tenantId, t.number),
  fk("crm_deals_partner_fk", t.tenantId, t.partnerId, () => partners),
  fk("crm_deals_stage_fk", t.tenantId, t.stageId, () => crmStages),
]);

export const crmActivities = pgTable("crm_activities", {
  ...base(),
  dealId: text("deal_id"),
  partnerId: text("partner_id"),
  type: text("type").notNull().default("Ligação"),
  subject: text("subject").notNull(),
  dueDate: day("due_date"),
  done: boolean("done").notNull().default(false),
  doneAt: ts("done_at"),
  ownerName: text("owner_name"),
  notes: text("notes"),
}, (t) => [
  tid("crm_activities_tid_uq", t),
  fk("crm_activities_deal_fk", t.tenantId, t.dealId, () => crmDeals, true),
  fk("crm_activities_partner_fk", t.tenantId, t.partnerId, () => partners, true),
]);

export const customFields = pgTable("custom_fields", {
  ...base(),
  entity: text("entity").notNull().default("sales_order"),
  label: text("label").notNull(),
  type: text("type").notNull().default("texto"), // texto | numero | data | lista | sim_nao
  options: text("options").array().notNull().default([]),
  required: boolean("required").notNull().default(false),
  position: integer("position").notNull().default(1),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("custom_fields_tid_uq", t)]);

// =====================================================================================
// Financeiro (cadastros usados também por vendas e compras)
// =====================================================================================
export const paymentMethods = pgTable("payment_methods", {
  ...base(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("payment_methods_tid_uq", t), uniqueIndex("payment_methods_name_uq").on(t.tenantId, t.name)]);

export const paymentTerms = pgTable("payment_terms", {
  ...base(),
  name: text("name").notNull(),
  days: integer("days").array().notNull().default([0]),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("payment_terms_tid_uq", t), uniqueIndex("payment_terms_name_uq").on(t.tenantId, t.name)]);

export const bankAccounts = pgTable("bank_accounts", {
  ...base(),
  name: text("name").notNull(),
  bank: text("bank"),
  agency: text("agency"),
  account: text("account"),
  initialBalance: money("initial_balance").notNull().default("0"),
  initialDate: day("initial_date"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("bank_accounts_tid_uq", t)]);

export const finCategories = pgTable("fin_categories", {
  ...base(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // RECEBER | PAGAR
  active: boolean("active").notNull().default(true),
}, (t) => [tid("fin_categories_tid_uq", t), uniqueIndex("fin_categories_name_uq").on(t.tenantId, t.kind, t.name)]);

/** Situações auxiliares dos lançamentos em aberto (ex.: Aguardando aprovação, Agendado). */
export const finSituations = pgTable("fin_situations", {
  ...base(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6B7785"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("fin_situations_tid_uq", t)]);

/** Responsáveis pelo pagamento ou pela cobrança. */
export const finResponsibles = pgTable("fin_responsibles", {
  ...base(),
  name: text("name").notNull(),
  email: text("email"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("fin_responsibles_tid_uq", t)]);

export type Installment = { n: number; due: string; value: number };

// =====================================================================================
// Comercial: pedidos de venda e faturamento
// =====================================================================================
export const salesOrders = pgTable("sales_orders", {
  ...base(),
  number: integer("number").notNull(),
  /** PROPOSTA | APROVADO | FATURADO | CANCELADO */
  status: text("status").notNull().default("PROPOSTA"),
  /** decidido pela produção: PENDENTE | EM_PRODUCAO | PRODUZIDO | NAO_NECESSITA */
  productionStatus: text("production_status"),
  partnerId: text("partner_id").notNull(),
  salespersonId: text("salesperson_id"),
  salespersonName: text("salesperson_name"),
  issueDate: day("issue_date").notNull(),
  deliveryDate: day("delivery_date"),
  deliveryPlace: text("delivery_place"),
  paymentMethodId: text("payment_method_id"),
  paymentTermId: text("payment_term_id"),
  installments: jsonb("installments").$type<Installment[]>().notNull().default([]),
  discount: money("discount").notNull().default("0"),
  freight: money("freight").notNull().default("0"),
  total: money("total").notNull().default("0"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  custom: jsonb("custom").$type<Record<string, string>>().notNull().default({}),
  crmDealId: text("crm_deal_id"),
  approvedAt: day("approved_at"),
}, (t) => [
  tid("sales_orders_tid_uq", t),
  uniqueIndex("sales_orders_number_uq").on(t.tenantId, t.number),
  index("sales_orders_issue_idx").on(t.tenantId, t.issueDate),
  fk("sales_orders_partner_fk", t.tenantId, t.partnerId, () => partners),
  fk("sales_orders_pm_fk", t.tenantId, t.paymentMethodId, () => paymentMethods),
  fk("sales_orders_pt_fk", t.tenantId, t.paymentTermId, () => paymentTerms),
]);

export const salesOrderItems = pgTable("sales_order_items", {
  ...base(),
  orderId: text("order_id").notNull(),
  itemId: text("item_id").notNull(),
  qty: qty("qty").notNull(),
  price: qty("price").notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 7, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  position: integer("position").notNull().default(0),
}, (t) => [tid("sales_order_items_tid_uq", t), fk("sales_order_items_order_fk", t.tenantId, t.orderId, () => salesOrders, true), itemFk("sales_order_items_item_fk", t.tenantId, t.itemId)]);

export const invoices = pgTable("invoices", {
  ...base(),
  number: integer("number").notNull(),
  series: text("series").notNull().default("1"),
  issueDate: day("issue_date").notNull(),
  partnerId: text("partner_id").notNull(),
  salesOrderId: text("sales_order_id"),
  total: money("total").notNull().default("0"),
  status: text("status").notNull().default("EMITIDA"), // EMITIDA | CANCELADA
  stockOut: boolean("stock_out").notNull().default(true),
  locationId: text("location_id"),
  notes: text("notes"),
}, (t) => [
  tid("invoices_tid_uq", t),
  uniqueIndex("invoices_number_uq").on(t.tenantId, t.series, t.number),
  fk("invoices_partner_fk", t.tenantId, t.partnerId, () => partners),
  fk("invoices_order_fk", t.tenantId, t.salesOrderId, () => salesOrders),
]);

export const invoiceItems = pgTable("invoice_items", {
  ...base(),
  invoiceId: text("invoice_id").notNull(),
  itemId: text("item_id").notNull(),
  qty: qty("qty").notNull(),
  price: qty("price").notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 7, scale: 2 }).notNull().default("0"),
}, (t) => [tid("invoice_items_tid_uq", t), fk("invoice_items_invoice_fk", t.tenantId, t.invoiceId, () => invoices, true), itemFk("invoice_items_item_fk", t.tenantId, t.itemId)]);

// =====================================================================================
// Estoque
// =====================================================================================
export const stockLocations = pgTable("stock_locations", {
  ...base(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("Almoxarifado"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("stock_locations_tid_uq", t), uniqueIndex("stock_locations_code_uq").on(t.tenantId, t.code)]);

export const stockMovements = pgTable("stock_movements", {
  ...base(),
  date: day("date").notNull(),
  /** ENTRADA | SAIDA | TRANSFERENCIA | AJUSTE | PRODUCAO */
  type: text("type").notNull(),
  itemId: text("item_id").notNull(),
  locationId: text("location_id").notNull(),
  destLocationId: text("dest_location_id"),
  /** positivo, exceto no AJUSTE (diferença com sinal) */
  qty: qty("qty").notNull(),
  unitCost: qty("unit_cost").notNull().default("0"),
  document: text("document"),
  notes: text("notes"),
  partnerId: text("partner_id"),
  productionOrderId: text("production_order_id"),
  purchaseOrderId: text("purchase_order_id"),
  invoiceId: text("invoice_id"),
  inventoryId: text("inventory_id"),
  userName: text("user_name"),
}, (t) => [
  tid("stock_movements_tid_uq", t),
  index("stock_movements_item_idx").on(t.tenantId, t.itemId),
  index("stock_movements_date_idx").on(t.tenantId, t.date),
  index("stock_movements_op_idx").on(t.tenantId, t.productionOrderId),
  fk("stock_movements_loc_fk", t.tenantId, t.locationId, () => stockLocations),
  fk("stock_movements_dest_fk", t.tenantId, t.destLocationId, () => stockLocations), itemFk("stock_movements_item_fk", t.tenantId, t.itemId),
]);

export const inventories = pgTable("inventories", {
  ...base(),
  number: integer("number").notNull(),
  date: day("date").notNull(),
  locationId: text("location_id").notNull(),
  groupId: text("group_id"),
  description: text("description"),
  status: text("status").notNull().default("ABERTO"), // ABERTO | CONCLUIDO | CANCELADO
  closedAt: ts("closed_at"),
  userName: text("user_name"),
}, (t) => [tid("inventories_tid_uq", t), fk("inventories_loc_fk", t.tenantId, t.locationId, () => stockLocations)]);

export const inventoryItems = pgTable("inventory_items", {
  ...base(),
  inventoryId: text("inventory_id").notNull(),
  itemId: text("item_id").notNull(),
  systemQty: qty("system_qty").notNull().default("0"),
  countedQty: qty("counted_qty"),
  unitCost: qty("unit_cost").notNull().default("0"),
}, (t) => [
  tid("inventory_items_tid_uq", t),
  uniqueIndex("inventory_items_uq").on(t.tenantId, t.inventoryId, t.itemId),
  fk("inventory_items_inv_fk", t.tenantId, t.inventoryId, () => inventories, true), itemFk("inventory_items_item_fk", t.tenantId, t.itemId),
]);

export const stockClosings = pgTable("stock_closings", {
  ...base(),
  closingDate: day("closing_date").notNull(),
  totalValue: money("total_value").notNull().default("0"),
  itemCount: integer("item_count").notNull().default(0),
  notes: text("notes"),
  userName: text("user_name"),
  reopenedAt: ts("reopened_at"),
}, (t) => [tid("stock_closings_tid_uq", t)]);

export const stockClosingItems = pgTable("stock_closing_items", {
  ...base(),
  closingId: text("closing_id").notNull(),
  itemId: text("item_id").notNull(),
  locationId: text("location_id").notNull(),
  qty: qty("qty").notNull(),
  avgCost: qty("avg_cost").notNull().default("0"),
  value: money("value").notNull().default("0"),
}, (t) => [tid("stock_closing_items_tid_uq", t), fk("stock_closing_items_closing_fk", t.tenantId, t.closingId, () => stockClosings, true)]);

// =====================================================================================
// Produção
// =====================================================================================
export const productionStages = pgTable("production_stages", {
  ...base(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(1),
  color: text("color").notNull().default("#1E3A5F"),
  kind: text("kind").notNull().default("andamento"), // aberta | andamento | finalizada | cancelada
}, (t) => [tid("production_stages_tid_uq", t)]);

export const assemblyStages = pgTable("assembly_stages", {
  ...base(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(1),
  color: text("color").notNull().default("#1E3A5F"),
  kind: text("kind").notNull().default("andamento"), // aguardando | andamento | pendencia | concluido
}, (t) => [tid("assembly_stages_tid_uq", t)]);

export const workCenters = pgTable("work_centers", {
  ...base(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  capacityHours: numeric("capacity_hours", { precision: 8, scale: 2 }).notNull().default("8"),
  costPerHour: money("cost_per_hour").notNull().default("0"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("work_centers_tid_uq", t), uniqueIndex("work_centers_code_uq").on(t.tenantId, t.code)]);

export const teamMembers = pgTable("team_members", {
  ...base(),
  name: text("name").notNull(),
  role: text("role"),
  workCenterId: text("work_center_id"),
  shift: text("shift"),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
}, (t) => [tid("team_members_tid_uq", t), fk("team_members_wc_fk", t.tenantId, t.workCenterId, () => workCenters)]);

export const productionOrders = pgTable("production_orders", {
  ...base(),
  number: integer("number").notNull(),
  itemId: text("item_id").notNull(),
  qty: qty("qty").notNull(),
  qtyProduced: qty("qty_produced").notNull().default("0"),
  salesOrderId: text("sales_order_id"),
  partnerId: text("partner_id"),
  stageId: text("stage_id").notNull(),
  workCenterId: text("work_center_id"),
  responsibleId: text("responsible_id"),
  priority: text("priority").notNull().default("Normal"),
  startDate: day("start_date"),
  needDate: day("need_date"),
  completedAt: day("completed_at"),
  notes: text("notes"),
}, (t) => [
  tid("production_orders_tid_uq", t),
  uniqueIndex("production_orders_number_uq").on(t.tenantId, t.number),
  fk("production_orders_stage_fk", t.tenantId, t.stageId, () => productionStages),
  fk("production_orders_order_fk", t.tenantId, t.salesOrderId, () => salesOrders),
  fk("production_orders_partner_fk", t.tenantId, t.partnerId, () => partners),
  fk("production_orders_wc_fk", t.tenantId, t.workCenterId, () => workCenters),
  fk("production_orders_resp_fk", t.tenantId, t.responsibleId, () => teamMembers), itemFk("production_orders_item_fk", t.tenantId, t.itemId),
]);

/** Estrutura da OP: copiada do cadastro do item na criação; a produção aponta o que já fez e pode incluir itens. */
export const productionOrderComponents = pgTable("production_order_components", {
  ...base(),
  productionOrderId: text("production_order_id").notNull(),
  itemId: text("item_id"),
  description: text("description"),
  qtyRequired: qty("qty_required").notNull().default("0"),
  qtyDone: qty("qty_done").notNull().default("0"),
  fromBom: boolean("from_bom").notNull().default(true),
  position: integer("position").notNull().default(0),
}, (t) => [tid("po_components_tid_uq", t), fk("po_components_op_fk", t.tenantId, t.productionOrderId, () => productionOrders, true), itemFk("po_components_item_fk", t.tenantId, t.itemId)]);

/** Quantidade produzida apontada na OP (pode dar entrada no estoque). */
export const productionOutputs = pgTable("production_outputs", {
  ...base(),
  productionOrderId: text("production_order_id").notNull(),
  date: day("date").notNull(),
  qty: qty("qty").notNull(),
  locationId: text("location_id"),
  notes: text("notes"),
  userName: text("user_name"),
}, (t) => [tid("production_outputs_tid_uq", t), fk("production_outputs_op_fk", t.tenantId, t.productionOrderId, () => productionOrders, true)]);

export const timeEntries = pgTable("time_entries", {
  ...base(),
  productionOrderId: text("production_order_id").notNull(),
  stageId: text("stage_id"),
  workCenterId: text("work_center_id"),
  memberId: text("member_id").notNull(),
  date: day("date").notNull(),
  start: text("start").notNull(),
  end: text("end"),
  breakMinutes: integer("break_minutes").notNull().default(0),
  hours: numeric("hours", { precision: 8, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
}, (t) => [
  tid("time_entries_tid_uq", t),
  fk("time_entries_op_fk", t.tenantId, t.productionOrderId, () => productionOrders, true),
  fk("time_entries_member_fk", t.tenantId, t.memberId, () => teamMembers),
]);

export const assemblies = pgTable("assemblies", {
  ...base(),
  number: integer("number").notNull(),
  name: text("name").notNull(),
  productionOrderId: text("production_order_id").notNull(),
  qty: qty("qty").notNull().default("1"),
  partnerId: text("partner_id"),
  address: text("address"),
  responsibleId: text("responsible_id"),
  startDate: day("start_date"),
  dueDate: day("due_date"),
  completedAt: day("completed_at"),
  notes: text("notes"),
}, (t) => [
  tid("assemblies_tid_uq", t),
  uniqueIndex("assemblies_number_uq").on(t.tenantId, t.number),
  fk("assemblies_op_fk", t.tenantId, t.productionOrderId, () => productionOrders),
  fk("assemblies_partner_fk", t.tenantId, t.partnerId, () => partners),
  fk("assemblies_resp_fk", t.tenantId, t.responsibleId, () => teamMembers),
]);

export const assemblyLocations = pgTable("assembly_locations", {
  ...base(),
  assemblyId: text("assembly_id").notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  type: text("type"),
  stageId: text("stage_id"),
  installerId: text("installer_id"),
  helperId: text("helper_id"),
  position: integer("position").notNull().default(0),
}, (t) => [tid("assembly_locations_tid_uq", t), fk("assembly_locations_asm_fk", t.tenantId, t.assemblyId, () => assemblies, true)]);

export const assemblyParts = pgTable("assembly_parts", {
  ...base(),
  assemblyId: text("assembly_id").notNull(),
  locationId: text("location_id").notNull(),
  itemId: text("item_id"),
  description: text("description"),
  qty: qty("qty").notNull().default("1"),
  qtyDone: qty("qty_done").notNull().default("0"),
}, (t) => [
  tid("assembly_parts_tid_uq", t),
  fk("assembly_parts_asm_fk", t.tenantId, t.assemblyId, () => assemblies, true),
  fk("assembly_parts_loc_fk", t.tenantId, t.locationId, () => assemblyLocations, true), itemFk("assembly_parts_item_fk", t.tenantId, t.itemId),
]);

// =====================================================================================
// Compras: solicitação → cotação → pedido de compra → recebimento
// =====================================================================================
export const purchaseRequests = pgTable("purchase_requests", {
  ...base(),
  number: integer("number").notNull(),
  requester: text("requester"),
  department: text("department"),
  needDate: day("need_date"),
  /** ABERTA | APROVADA | EM_COTACAO | ATENDIDA | CANCELADA */
  status: text("status").notNull().default("ABERTA"),
  productionOrderId: text("production_order_id"),
  notes: text("notes"),
}, (t) => [tid("purchase_requests_tid_uq", t), uniqueIndex("purchase_requests_number_uq").on(t.tenantId, t.number)]);

export const purchaseRequestItems = pgTable("purchase_request_items", {
  ...base(),
  requestId: text("request_id").notNull(),
  itemId: text("item_id").notNull(),
  qty: qty("qty").notNull(),
  notes: text("notes"),
}, (t) => [tid("purchase_request_items_tid_uq", t), fk("purchase_request_items_req_fk", t.tenantId, t.requestId, () => purchaseRequests, true), itemFk("purchase_request_items_item_fk", t.tenantId, t.itemId)]);

export const quotations = pgTable("quotations", {
  ...base(),
  number: integer("number").notNull(),
  date: day("date").notNull(),
  dueDate: day("due_date"),
  status: text("status").notNull().default("ABERTA"), // ABERTA | CONCLUIDA | CANCELADA
  notes: text("notes"),
  requestIds: text("request_ids").array().notNull().default([]),
}, (t) => [tid("quotations_tid_uq", t), uniqueIndex("quotations_number_uq").on(t.tenantId, t.number)]);

export const quotationItems = pgTable("quotation_items", {
  ...base(),
  quotationId: text("quotation_id").notNull(),
  itemId: text("item_id").notNull(),
  qty: qty("qty").notNull(),
  position: integer("position").notNull().default(0),
}, (t) => [tid("quotation_items_tid_uq", t), fk("quotation_items_q_fk", t.tenantId, t.quotationId, () => quotations, true), itemFk("quotation_items_item_fk", t.tenantId, t.itemId)]);

export const quotationSuppliers = pgTable("quotation_suppliers", {
  ...base(),
  quotationId: text("quotation_id").notNull(),
  partnerId: text("partner_id").notNull(),
  freight: money("freight").notNull().default("0"),
  paymentTerms: text("payment_terms"),
  deliveryDays: integer("delivery_days"),
  notes: text("notes"),
}, (t) => [
  tid("quotation_suppliers_tid_uq", t),
  fk("quotation_suppliers_q_fk", t.tenantId, t.quotationId, () => quotations, true),
  fk("quotation_suppliers_partner_fk", t.tenantId, t.partnerId, () => partners),
]);

export const quotationPrices = pgTable("quotation_prices", {
  ...base(),
  quotationId: text("quotation_id").notNull(),
  quotationItemId: text("quotation_item_id").notNull(),
  quotationSupplierId: text("quotation_supplier_id").notNull(),
  unitPrice: qty("unit_price"),
  selected: boolean("selected").notNull().default(false),
}, (t) => [
  tid("quotation_prices_tid_uq", t),
  uniqueIndex("quotation_prices_uq").on(t.tenantId, t.quotationItemId, t.quotationSupplierId),
  fk("quotation_prices_q_fk", t.tenantId, t.quotationId, () => quotations, true),
  fk("quotation_prices_item_fk", t.tenantId, t.quotationItemId, () => quotationItems, true),
  fk("quotation_prices_sup_fk", t.tenantId, t.quotationSupplierId, () => quotationSuppliers, true),
]);

export const purchaseOrders = pgTable("purchase_orders", {
  ...base(),
  number: integer("number").notNull(),
  /** RASCUNHO | ENVIADO | RECEBIDO_PARCIAL | RECEBIDO | CANCELADO */
  status: text("status").notNull().default("RASCUNHO"),
  partnerId: text("partner_id").notNull(),
  issueDate: day("issue_date").notNull(),
  deliveryDate: day("delivery_date"),
  buyer: text("buyer"),
  paymentMethodId: text("payment_method_id"),
  paymentTermId: text("payment_term_id"),
  installments: jsonb("installments").$type<Installment[]>().notNull().default([]),
  discount: money("discount").notNull().default("0"),
  freight: money("freight").notNull().default("0"),
  total: money("total").notNull().default("0"),
  notes: text("notes"),
  quotationId: text("quotation_id"),
}, (t) => [
  tid("purchase_orders_tid_uq", t),
  uniqueIndex("purchase_orders_number_uq").on(t.tenantId, t.number),
  fk("purchase_orders_partner_fk", t.tenantId, t.partnerId, () => partners),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  ...base(),
  orderId: text("order_id").notNull(),
  itemId: text("item_id").notNull(),
  qty: qty("qty").notNull(),
  price: qty("price").notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 7, scale: 2 }).notNull().default("0"),
  receivedQty: qty("received_qty").notNull().default("0"),
  position: integer("position").notNull().default(0),
}, (t) => [tid("purchase_order_items_tid_uq", t), fk("purchase_order_items_order_fk", t.tenantId, t.orderId, () => purchaseOrders, true), itemFk("purchase_order_items_item_fk", t.tenantId, t.itemId)]);

// =====================================================================================
// Financeiro: lançamentos e extrato
// =====================================================================================
export const finTitles = pgTable("fin_titles", {
  ...base(),
  kind: text("kind").notNull(), // RECEBER | PAGAR
  description: text("description").notNull(),
  document: text("document"),
  partnerId: text("partner_id"),
  categoryId: text("category_id"),
  issueDate: day("issue_date"),
  dueDate: day("due_date").notNull(),
  amount: money("amount").notNull(),
  status: text("status").notNull().default("ABERTO"), // ABERTO | PAGO | CANCELADO
  paidAt: day("paid_at"),
  paidAmount: money("paid_amount"),
  paymentMethodId: text("payment_method_id"),
  bankAccountId: text("bank_account_id"),
  situationId: text("situation_id"),
  responsibleId: text("responsible_id"),
  installment: text("installment"),
  originType: text("origin_type").notNull().default("MANUAL"), // MANUAL | NF | PC
  originId: text("origin_id"),
  originNumber: text("origin_number"),
  notes: text("notes"),
}, (t) => [
  tid("fin_titles_tid_uq", t),
  index("fin_titles_due_idx").on(t.tenantId, t.kind, t.dueDate),
  fk("fin_titles_partner_fk", t.tenantId, t.partnerId, () => partners),
  fk("fin_titles_cat_fk", t.tenantId, t.categoryId, () => finCategories),
  fk("fin_titles_pm_fk", t.tenantId, t.paymentMethodId, () => paymentMethods),
  fk("fin_titles_bank_fk", t.tenantId, t.bankAccountId, () => bankAccounts),
  fk("fin_titles_sit_fk", t.tenantId, t.situationId, () => finSituations),
  fk("fin_titles_resp_fk", t.tenantId, t.responsibleId, () => finResponsibles),
]);

/** Lançamentos avulsos no extrato da conta (tarifas, transferências entre contas, ajustes). */
export const bankEntries = pgTable("bank_entries", {
  ...base(),
  bankAccountId: text("bank_account_id").notNull(),
  date: day("date").notNull(),
  description: text("description").notNull(),
  amount: money("amount").notNull(), // com sinal: + entrada, − saída
  notes: text("notes"),
}, (t) => [tid("bank_entries_tid_uq", t), fk("bank_entries_bank_fk", t.tenantId, t.bankAccountId, () => bankAccounts, true)]);

/** Tabelas de negócio com isolamento por empresa (usada na migração de RLS e nos testes). */
export const TENANT_TABLES = [
  "access_profiles", "company_settings", "salespeople", "units", "item_types", "code_prefixes", "item_bom", "item_routing", "item_suppliers",
  "partner_profiles", "partners", "partner_contacts", "partner_notes", "attachments", "crm_stages", "crm_deals", "crm_activities",
  "custom_fields", "payment_methods", "payment_terms", "bank_accounts", "fin_categories", "fin_situations", "fin_responsibles",
  "sales_orders", "sales_order_items", "invoices", "invoice_items", "stock_locations", "stock_movements", "inventories",
  "inventory_items", "stock_closings", "stock_closing_items", "production_stages", "assembly_stages", "work_centers",
  "team_members", "production_orders", "production_order_components", "production_outputs", "time_entries", "assemblies",
  "assembly_locations", "assembly_parts", "purchase_requests", "purchase_request_items", "quotations", "quotation_items",
  "quotation_suppliers", "quotation_prices", "purchase_orders", "purchase_order_items", "fin_titles", "bank_entries", "sequences",
] as const;

export type Item = typeof items.$inferSelect;
export type Partner = typeof partners.$inferSelect;
