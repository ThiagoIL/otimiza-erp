/**
 * Otimiza+ ERP — modelo de dados (Drizzle ORM / PostgreSQL)
 *
 * Isolamento entre clientes (multitenant):
 *  - Toda tabela de negócio tem tenant_id e é protegida por Row Level Security (RLS).
 *    O acesso a ela só funciona dentro de withTenant() (src/lib/db.ts), que informa ao banco
 *    qual é a empresa da requisição. Fora disso o banco não devolve nem aceita nenhuma linha.
 *  - Regras críticas de usuários (conta master, último administrador etc.) também estão em
 *    gatilhos no banco (migração 0001_regras_de_seguranca), além de validadas no código.
 *
 * Depois de alterar este arquivo, gere a migração com: npm run db:generate
 */
import { sql } from "drizzle-orm";
import {
  boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createId } from "../lib/ids";

export const roleEnum = pgEnum("role", ["SUPER_ADMIN", "TENANT_ADMIN", "TENANT_USER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INACTIVE"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["ACTIVE", "SUSPENDED"]);
export const sessionAreaEnum = pgEnum("session_area", ["ADMIN", "TENANT"]);
export const itemTypeEnum = pgEnum("item_type", ["MATERIA_PRIMA", "SEMIACABADO", "PRODUTO_ACABADO", "CONSUMO", "REVENDA"]);
export const movementKindEnum = pgEnum("movement_kind", ["ENTRADA", "SAIDA"]);
export const movementOriginEnum = pgEnum("movement_origin", ["MANUAL", "CONSUMO_OP", "PRODUCAO_OP", "PEDIDO_VENDA", "AJUSTE"]);
export const salesStatusEnum = pgEnum("sales_status", ["ORCAMENTO", "APROVADO", "EM_PRODUCAO", "PRONTO", "ENTREGUE", "CANCELADO"]);
export const assemblyStatusEnum = pgEnum("assembly_status", ["PLANEJADA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]);
export const personTypeEnum = pgEnum("person_type", ["PJ", "PF"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id = () => text("id").primaryKey().$defaultFn(createId);

export const tenants = pgTable("tenants", {
  id: id(),
  slug: text("slug").notNull().unique(), // subdomínio: slug.ROOT_DOMAIN
  name: text("name").notNull(),
  document: text("document"), // CNPJ
  status: tenantStatusEnum("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const users = pgTable("users", {
  id: id(),
  tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "restrict" }), // nulo = usuário do sistema
  name: text("name").notNull(),
  email: text("email").notNull(), // sempre em minúsculas
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  status: userStatusEnum("status").notNull().default("ACTIVE"),
  isMaster: boolean("is_master").notNull().default(false), // conta master protegida
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  lastLoginAt: ts("last_login_at"),
  passwordChangedAt: ts("password_changed_at").notNull().defaultNow(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("users_tenant_email_uq").on(t.tenantId, t.email).where(sql`${t.tenantId} is not null`),
  uniqueIndex("users_system_email_uq").on(t.email).where(sql`${t.tenantId} is null`),
  index("users_tenant_idx").on(t.tenantId),
]);

export const sessions = pgTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(), // SHA-256 do token; o token só existe no cookie
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id"),
  area: sessionAreaEnum("area").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: ts("reset_at").notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  tenantId: text("tenant_id"),
  userId: text("user_id"),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  data: jsonb("data"),
  ip: text("ip"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("audit_tenant_created_idx").on(t.tenantId, t.createdAt), index("audit_created_idx").on(t.createdAt)]);

// ---------- Estoque: itens e grupos ----------

export const itemGroups = pgTable("item_groups", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("item_groups_tenant_name_uq").on(t.tenantId, t.name)]);

export const items = pgTable("items", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("UN"),
  type: itemTypeEnum("type").notNull().default("MATERIA_PRIMA"),
  groupId: text("group_id").references(() => itemGroups.id, { onDelete: "set null" }),
  minStock: numeric("min_stock", { precision: 14, scale: 4 }).notNull().default("0"),
  cost: numeric("cost", { precision: 14, scale: 4 }).notNull().default("0"),
  salePrice: numeric("sale_price", { precision: 14, scale: 2 }).notNull().default("0"),
  ncm: text("ncm"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("items_tenant_code_uq").on(t.tenantId, t.code), index("items_tenant_name_idx").on(t.tenantId, t.name)]);

// ---------- Estoque: locais, saldos e movimentações ----------

export const stockLocations = pgTable("stock_locations", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("stock_locations_tenant_name_uq").on(t.tenantId, t.name)]);

/** Saldo atual de cada item em cada local. Atualizado na mesma transação de cada movimentação. */
export const stockBalances = pgTable("stock_balances", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => stockLocations.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull().default("0"),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("stock_balances_item_location_uq").on(t.tenantId, t.itemId, t.locationId)]);

// ---------- Comercial: clientes/fornecedores e pedidos de venda ----------

export const partners = pgTable("partners", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  personType: personTypeEnum("person_type").notNull().default("PJ"),
  name: text("name").notNull(), // razão social ou nome
  tradeName: text("trade_name"), // nome fantasia
  document: text("document"), // CNPJ ou CPF, só dígitos
  stateRegistration: text("state_registration"),
  isCustomer: boolean("is_customer").notNull().default(false),
  isSupplier: boolean("is_supplier").notNull().default(false),
  isCarrier: boolean("is_carrier").notNull().default(false),
  email: text("email"),
  phone: text("phone"),
  contact: text("contact"),
  zip: text("zip"),
  street: text("street"),
  number: text("number"),
  district: text("district"),
  city: text("city"),
  state: text("state"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("partners_tenant_name_idx").on(t.tenantId, t.name)]);

export const salesOrders = pgTable("sales_orders", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  customerId: text("customer_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  status: salesStatusEnum("status").notNull().default("ORCAMENTO"),
  issueDate: date("issue_date").notNull(),
  deliveryDate: date("delivery_date"),
  paymentMethod: text("payment_method").notNull(),
  installments: integer("installments").notNull().default(1),
  firstDueDays: integer("first_due_days").notNull().default(0),
  intervalDays: integer("interval_days").notNull().default(30),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 14, scale: 2 }).notNull().default("0"), // desconto geral do pedido, em R$
  freight: numeric("freight", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  sellerName: text("seller_name"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("sales_orders_tenant_number_uq").on(t.tenantId, t.number), index("sales_orders_customer_idx").on(t.tenantId, t.customerId)]);

export const salesOrderItems = pgTable("sales_order_items", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
  line: integer("line").notNull(),
  itemId: text("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
}, (t) => [index("sales_order_items_order_idx").on(t.orderId)]);

/** Parcelas a receber, geradas pelo pedido de venda. */
export const receivables = pgTable("receivables", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  salesOrderId: text("sales_order_id").references(() => salesOrders.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  installment: integer("installment").notNull(),
  installmentsTotal: integer("installments_total").notNull(),
  dueDate: date("due_date").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  paidAt: date("paid_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("receivables_tenant_due_idx").on(t.tenantId, t.dueDate), index("receivables_order_idx").on(t.salesOrderId)]);

// ---------- Produção ----------

/** Etapas do fluxo de produção (colunas do kanban). */
export const productionStages = pgTable("production_stages", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  color: text("color").notNull().default("#5F6B78"),
  isFinal: boolean("is_final").notNull().default(false), // ordens nesta etapa contam como concluídas
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("production_stages_tenant_name_uq").on(t.tenantId, t.name)]);

/** Situação da ordem, independente da etapa (normal, aguardando material, parada...). */
export const productionStatuses = pgTable("production_statuses", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#5F6B78"),
  isAlert: boolean("is_alert").notNull().default(false), // aparece nos alertas da página inicial
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("production_statuses_tenant_name_uq").on(t.tenantId, t.name)]);

export const workCenters = pgTable("work_centers", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("work_centers_tenant_name_uq").on(t.tenantId, t.name)]);

/** Pessoas da produção e da montagem (responsáveis, operadores, montadores, auxiliares). */
export const teamMembers = pgTable("team_members", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"), // função: Líder, Operador, Montador, Auxiliar...
  workCenterId: text("work_center_id").references(() => workCenters.id, { onDelete: "set null" }),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("team_members_tenant_name_idx").on(t.tenantId, t.name)]);

export const productionOrders = pgTable("production_orders", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  itemId: text("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
  producedQty: numeric("produced_qty", { precision: 14, scale: 4 }).notNull().default("0"),
  stageId: text("stage_id").notNull().references(() => productionStages.id, { onDelete: "restrict" }),
  statusId: text("status_id").references(() => productionStatuses.id, { onDelete: "set null" }),
  workCenterId: text("work_center_id").references(() => workCenters.id, { onDelete: "set null" }),
  responsibleId: text("responsible_id").references(() => teamMembers.id, { onDelete: "set null" }),
  salesOrderId: text("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),
  priority: integer("priority").notNull().default(2), // 1 alta, 2 normal, 3 baixa
  startDate: date("start_date"),
  dueDate: date("due_date"),
  finishedAt: ts("finished_at"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("production_orders_tenant_number_uq").on(t.tenantId, t.number), index("production_orders_stage_idx").on(t.tenantId, t.stageId)]);

/** Materiais previstos para a ordem; o que já saiu do estoque vem das movimentações ligadas a ela. */
export const productionOrderMaterials = pgTable("production_order_materials", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
}, (t) => [uniqueIndex("production_order_materials_uq").on(t.orderId, t.itemId)]);

export const stockMovements = pgTable("stock_movements", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kind: movementKindEnum("kind").notNull(),
  origin: movementOriginEnum("origin").notNull().default("MANUAL"),
  itemId: text("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  locationId: text("location_id").notNull().references(() => stockLocations.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(), // sempre positiva; o tipo diz se entra ou sai
  unitCost: numeric("unit_cost", { precision: 14, scale: 4 }),
  balanceAfter: numeric("balance_after", { precision: 14, scale: 4 }).notNull(),
  productionOrderId: text("production_order_id").references(() => productionOrders.id, { onDelete: "set null" }),
  salesOrderId: text("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),
  partnerId: text("partner_id").references(() => partners.id, { onDelete: "set null" }),
  document: text("document"), // NF, requisição...
  notes: text("notes"),
  userId: text("user_id"),
  userName: text("user_name"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  index("stock_movements_tenant_created_idx").on(t.tenantId, t.createdAt),
  index("stock_movements_item_idx").on(t.tenantId, t.itemId),
  index("stock_movements_op_idx").on(t.productionOrderId),
]);

// ---------- Montagens: obra/cliente → ambientes (ou andar → apartamento) → peças ----------

export const assemblies = pgTable("assemblies", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  name: text("name").notNull(), // obra ou projeto
  customerId: text("customer_id").references(() => partners.id, { onDelete: "set null" }),
  salesOrderId: text("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),
  address: text("address"),
  status: assemblyStatusEnum("status").notNull().default("PLANEJADA"),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("assemblies_tenant_number_uq").on(t.tenantId, t.number)]);

/** Ambiente, andar ou apartamento. parent_id permite níveis: obra → andar → apartamento. */
export const assemblyAreas = pgTable("assembly_areas", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  assemblyId: text("assembly_id").notNull().references(() => assemblies.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): AnyPgColumn => assemblyAreas.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  assemblerId: text("assembler_id").references(() => teamMembers.id, { onDelete: "set null" }),
  helperId: text("helper_id").references(() => teamMembers.id, { onDelete: "set null" }),
  dueDate: date("due_date"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("assembly_areas_assembly_idx").on(t.assemblyId)]);

export const assemblyPieces = pgTable("assembly_pieces", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  areaId: text("area_id").notNull().references(() => assemblyAreas.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull().default("1"),
  doneAt: ts("done_at"),
  doneBy: text("done_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("assembly_pieces_area_idx").on(t.areaId)]);

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type SalesOrder = typeof salesOrders.$inferSelect;
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type Assembly = typeof assemblies.$inferSelect;
