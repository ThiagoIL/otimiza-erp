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
  boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "../lib/ids";

export const roleEnum = pgEnum("role", ["SUPER_ADMIN", "TENANT_ADMIN", "TENANT_USER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INACTIVE"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["ACTIVE", "SUSPENDED"]);
export const sessionAreaEnum = pgEnum("session_area", ["ADMIN", "TENANT"]);
export const itemTypeEnum = pgEnum("item_type", ["MATERIA_PRIMA", "SEMIACABADO", "PRODUTO_ACABADO", "CONSUMO", "REVENDA"]);

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

// ---------- Estoque: primeiro módulo migrado do protótipo ----------

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

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
