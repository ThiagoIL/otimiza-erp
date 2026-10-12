CREATE TABLE "access_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "access_profiles_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "assemblies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"production_order_id" text NOT NULL,
	"qty" numeric(14, 4) DEFAULT '1' NOT NULL,
	"partner_id" text,
	"address" text,
	"responsible_id" text,
	"start_date" date,
	"due_date" date,
	"completed_at" date,
	"notes" text,
	CONSTRAINT "assemblies_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "assembly_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assembly_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"type" text,
	"stage_id" text,
	"installer_id" text,
	"helper_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "assembly_locations_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "assembly_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assembly_id" text NOT NULL,
	"location_id" text NOT NULL,
	"item_id" text,
	"description" text,
	"qty" numeric(14, 4) DEFAULT '1' NOT NULL,
	"qty_done" numeric(14, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "assembly_parts_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "assembly_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"color" text DEFAULT '#1E3A5F' NOT NULL,
	"kind" text DEFAULT 'andamento' NOT NULL,
	CONSTRAINT "assembly_stages_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" text NOT NULL,
	"user_name" text,
	CONSTRAINT "attachments_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"bank" text,
	"agency" text,
	"account" text,
	"initial_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"initial_date" date,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "bank_accounts_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "bank_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bank_account_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"notes" text,
	CONSTRAINT "bank_entries_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "code_prefixes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prefix" text NOT NULL,
	"description" text,
	"digits" integer DEFAULT 3 NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "code_prefixes_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legal_name" text,
	"trade_name" text,
	"document" text,
	"state_reg" text,
	"city_reg" text,
	"tax_regime" text,
	"phone" text,
	"email" text,
	"website" text,
	"zip" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"city_code" text,
	"uf" text,
	"defaults_version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "company_settings_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deal_id" text,
	"partner_id" text,
	"type" text DEFAULT 'Ligação' NOT NULL,
	"subject" text NOT NULL,
	"due_date" date,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"owner_name" text,
	"notes" text,
	CONSTRAINT "crm_activities_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"partner_id" text,
	"lead_name" text,
	"lead_company" text,
	"lead_phone" text,
	"lead_email" text,
	"stage_id" text NOT NULL,
	"value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"expected_close" date,
	"owner_id" text,
	"source" text,
	"notes" text,
	"lost_reason" text,
	"sales_order_id" text,
	"closed_at" date,
	CONSTRAINT "crm_deals_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"color" text DEFAULT '#1E3A5F' NOT NULL,
	"kind" text DEFAULT 'aberta' NOT NULL,
	CONSTRAINT "crm_stages_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity" text DEFAULT 'sales_order' NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'texto' NOT NULL,
	"options" text[] DEFAULT '{}' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "custom_fields_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fin_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "fin_categories_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fin_responsibles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "fin_responsibles_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fin_situations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6B7785' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "fin_situations_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fin_titles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"document" text,
	"partner_id" text,
	"category_id" text,
	"issue_date" date,
	"due_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'ABERTO' NOT NULL,
	"paid_at" date,
	"paid_amount" numeric(14, 2),
	"payment_method_id" text,
	"bank_account_id" text,
	"situation_id" text,
	"responsible_id" text,
	"installment" text,
	"origin_type" text DEFAULT 'MANUAL' NOT NULL,
	"origin_id" text,
	"origin_number" text,
	"notes" text,
	CONSTRAINT "fin_titles_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "inventories" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"date" date NOT NULL,
	"location_id" text NOT NULL,
	"group_id" text,
	"description" text,
	"status" text DEFAULT 'ABERTO' NOT NULL,
	"closed_at" timestamp with time zone,
	"user_name" text,
	CONSTRAINT "inventories_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inventory_id" text NOT NULL,
	"item_id" text NOT NULL,
	"system_qty" numeric(14, 4) DEFAULT '0' NOT NULL,
	"counted_qty" numeric(14, 4),
	"unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "inventory_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"price" numeric(14, 4) DEFAULT '0' NOT NULL,
	"discount_pct" numeric(7, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "invoice_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"series" text DEFAULT '1' NOT NULL,
	"issue_date" date NOT NULL,
	"partner_id" text NOT NULL,
	"sales_order_id" text,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'EMITIDA' NOT NULL,
	"stock_out" boolean DEFAULT true NOT NULL,
	"location_id" text,
	"notes" text,
	CONSTRAINT "invoices_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "item_bom" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_id" text NOT NULL,
	"component_id" text NOT NULL,
	"qty" numeric(14, 4) DEFAULT '1' NOT NULL,
	"loss_pct" numeric(7, 2) DEFAULT '0' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_bom_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "item_routing" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_id" text NOT NULL,
	"work_center_id" text NOT NULL,
	"hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_routing_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "item_suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"supplier_code" text,
	"last_price" numeric(14, 4) DEFAULT '0' NOT NULL,
	"lead_days" integer,
	CONSTRAINT "item_suppliers_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "item_types" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"kind" "item_type" DEFAULT 'MATERIA_PRIMA' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "item_types_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "partner_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"partner_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"mobile" text,
	"notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "partner_contacts_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "partner_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"partner_id" text NOT NULL,
	"body" text NOT NULL,
	"user_name" text,
	CONSTRAINT "partner_notes_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "partner_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#1E3A5F' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "partner_profiles_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kinds" text[] DEFAULT '{}' NOT NULL,
	"person_type" text DEFAULT 'PJ' NOT NULL,
	"document" text,
	"name" text NOT NULL,
	"trade_name" text,
	"profile_id" text,
	"salesperson_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"email" text,
	"phone" text,
	"mobile1" text,
	"mobile2" text,
	"website" text,
	"zip" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"city_code" text,
	"uf" text,
	"state_reg" text,
	"state_reg_indicator" text,
	"city_reg" text,
	"suframa" text,
	"tax_regime" text,
	"final_consumer" boolean DEFAULT false NOT NULL,
	"credit_limit" numeric(14, 2),
	CONSTRAINT "partners_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "payment_methods_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "payment_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"days" integer[] DEFAULT '{0}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "payment_terms_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "production_order_components" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"production_order_id" text NOT NULL,
	"item_id" text,
	"description" text,
	"qty_required" numeric(14, 4) DEFAULT '0' NOT NULL,
	"qty_done" numeric(14, 4) DEFAULT '0' NOT NULL,
	"from_bom" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "po_components_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"item_id" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"qty_produced" numeric(14, 4) DEFAULT '0' NOT NULL,
	"sales_order_id" text,
	"partner_id" text,
	"stage_id" text NOT NULL,
	"work_center_id" text,
	"responsible_id" text,
	"priority" text DEFAULT 'Normal' NOT NULL,
	"start_date" date,
	"need_date" date,
	"completed_at" date,
	"notes" text,
	CONSTRAINT "production_orders_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "production_outputs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"production_order_id" text NOT NULL,
	"date" date NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"location_id" text,
	"notes" text,
	"user_name" text,
	CONSTRAINT "production_outputs_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "production_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"color" text DEFAULT '#1E3A5F' NOT NULL,
	"kind" text DEFAULT 'andamento' NOT NULL,
	CONSTRAINT "production_stages_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"price" numeric(14, 4) DEFAULT '0' NOT NULL,
	"discount_pct" numeric(7, 2) DEFAULT '0' NOT NULL,
	"received_qty" numeric(14, 4) DEFAULT '0' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "purchase_order_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'RASCUNHO' NOT NULL,
	"partner_id" text NOT NULL,
	"issue_date" date NOT NULL,
	"delivery_date" date,
	"buyer" text,
	"payment_method_id" text,
	"payment_term_id" text,
	"installments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"freight" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"quotation_id" text,
	CONSTRAINT "purchase_orders_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"notes" text,
	CONSTRAINT "purchase_request_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"requester" text,
	"department" text,
	"need_date" date,
	"status" text DEFAULT 'ABERTA' NOT NULL,
	"production_order_id" text,
	"notes" text,
	CONSTRAINT "purchase_requests_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quotation_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quotation_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "quotation_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quotation_id" text NOT NULL,
	"quotation_item_id" text NOT NULL,
	"quotation_supplier_id" text NOT NULL,
	"unit_price" numeric(14, 4),
	"selected" boolean DEFAULT false NOT NULL,
	CONSTRAINT "quotation_prices_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "quotation_suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quotation_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"freight" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_terms" text,
	"delivery_days" integer,
	"notes" text,
	CONSTRAINT "quotation_suppliers_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"date" date NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'ABERTA' NOT NULL,
	"notes" text,
	"request_ids" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "quotations_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"price" numeric(14, 4) DEFAULT '0' NOT NULL,
	"discount_pct" numeric(7, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sales_order_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'PROPOSTA' NOT NULL,
	"production_status" text,
	"partner_id" text NOT NULL,
	"salesperson_id" text,
	"salesperson_name" text,
	"issue_date" date NOT NULL,
	"delivery_date" date,
	"delivery_place" text,
	"payment_method_id" text,
	"payment_term_id" text,
	"installments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"freight" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"internal_notes" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"crm_deal_id" text,
	"approved_at" date,
	CONSTRAINT "sales_orders_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"tenant_id" text NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sequences_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "stock_closing_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closing_id" text NOT NULL,
	"item_id" text NOT NULL,
	"location_id" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"avg_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"value" numeric(14, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "stock_closing_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "stock_closings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closing_date" date NOT NULL,
	"total_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"user_name" text,
	"reopened_at" timestamp with time zone,
	CONSTRAINT "stock_closings_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Almoxarifado' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "stock_locations_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"item_id" text NOT NULL,
	"location_id" text NOT NULL,
	"dest_location_id" text,
	"qty" numeric(14, 4) NOT NULL,
	"unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"document" text,
	"notes" text,
	"partner_id" text,
	"production_order_id" text,
	"purchase_order_id" text,
	"invoice_id" text,
	"inventory_id" text,
	"user_name" text,
	CONSTRAINT "stock_movements_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"work_center_id" text,
	"shift" text,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "team_members_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"production_order_id" text NOT NULL,
	"stage_id" text,
	"work_center_id" text,
	"member_id" text NOT NULL,
	"date" date NOT NULL,
	"start" text NOT NULL,
	"end" text,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	CONSTRAINT "time_entries_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "units_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "work_centers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"capacity_hours" numeric(8, 2) DEFAULT '8' NOT NULL,
	"cost_per_hour" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "work_centers_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_group_id_item_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "prefix_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "complement" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "type_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "max_stock" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "default_location_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "stock_address" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "default_supplier_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "lead_days" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "min_purchase_qty" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cest" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "origin" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "gtin" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "net_weight" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "gross_weight" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_tenant_id_id_uq" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "access_profiles" ADD CONSTRAINT "access_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_op_fk" FOREIGN KEY ("tenant_id","production_order_id") REFERENCES "public"."production_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_resp_fk" FOREIGN KEY ("tenant_id","responsible_id") REFERENCES "public"."team_members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_locations" ADD CONSTRAINT "assembly_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_locations" ADD CONSTRAINT "assembly_locations_asm_fk" FOREIGN KEY ("tenant_id","assembly_id") REFERENCES "public"."assemblies"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_parts" ADD CONSTRAINT "assembly_parts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_parts" ADD CONSTRAINT "assembly_parts_asm_fk" FOREIGN KEY ("tenant_id","assembly_id") REFERENCES "public"."assemblies"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_parts" ADD CONSTRAINT "assembly_parts_loc_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."assembly_locations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_parts" ADD CONSTRAINT "assembly_parts_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_stages" ADD CONSTRAINT "assembly_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_bank_fk" FOREIGN KEY ("tenant_id","bank_account_id") REFERENCES "public"."bank_accounts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_prefixes" ADD CONSTRAINT "code_prefixes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_fk" FOREIGN KEY ("tenant_id","deal_id") REFERENCES "public"."crm_deals"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_fk" FOREIGN KEY ("tenant_id","stage_id") REFERENCES "public"."crm_stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_categories" ADD CONSTRAINT "fin_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_responsibles" ADD CONSTRAINT "fin_responsibles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_situations" ADD CONSTRAINT "fin_situations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_titles" ADD CONSTRAINT "fin_titles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_titles" ADD CONSTRAINT "fin_titles_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_titles" ADD CONSTRAINT "fin_titles_cat_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."fin_categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_titles" ADD CONSTRAINT "fin_titles_pm_fk" FOREIGN KEY ("tenant_id","payment_method_id") REFERENCES "public"."payment_methods"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_titles" ADD CONSTRAINT "fin_titles_bank_fk" FOREIGN KEY ("tenant_id","bank_account_id") REFERENCES "public"."bank_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_titles" ADD CONSTRAINT "fin_titles_sit_fk" FOREIGN KEY ("tenant_id","situation_id") REFERENCES "public"."fin_situations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_titles" ADD CONSTRAINT "fin_titles_resp_fk" FOREIGN KEY ("tenant_id","responsible_id") REFERENCES "public"."fin_responsibles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_loc_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."stock_locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_inv_fk" FOREIGN KEY ("tenant_id","inventory_id") REFERENCES "public"."inventories"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_fk" FOREIGN KEY ("tenant_id","sales_order_id") REFERENCES "public"."sales_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_bom" ADD CONSTRAINT "item_bom_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_bom" ADD CONSTRAINT "item_bom_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_bom" ADD CONSTRAINT "item_bom_comp_fk" FOREIGN KEY ("tenant_id","component_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_routing" ADD CONSTRAINT "item_routing_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_routing" ADD CONSTRAINT "item_routing_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_routing" ADD CONSTRAINT "item_routing_wc_fk" FOREIGN KEY ("tenant_id","work_center_id") REFERENCES "public"."work_centers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_types" ADD CONSTRAINT "item_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_notes" ADD CONSTRAINT "partner_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_notes" ADD CONSTRAINT "partner_notes_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_profile_fk" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "public"."partner_profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_components" ADD CONSTRAINT "production_order_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_components" ADD CONSTRAINT "po_components_op_fk" FOREIGN KEY ("tenant_id","production_order_id") REFERENCES "public"."production_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_components" ADD CONSTRAINT "po_components_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_stage_fk" FOREIGN KEY ("tenant_id","stage_id") REFERENCES "public"."production_stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_order_fk" FOREIGN KEY ("tenant_id","sales_order_id") REFERENCES "public"."sales_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_wc_fk" FOREIGN KEY ("tenant_id","work_center_id") REFERENCES "public"."work_centers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_resp_fk" FOREIGN KEY ("tenant_id","responsible_id") REFERENCES "public"."team_members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_outputs" ADD CONSTRAINT "production_outputs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_outputs" ADD CONSTRAINT "production_outputs_op_fk" FOREIGN KEY ("tenant_id","production_order_id") REFERENCES "public"."production_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."purchase_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_req_fk" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."purchase_requests"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_q_fk" FOREIGN KEY ("tenant_id","quotation_id") REFERENCES "public"."quotations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_prices" ADD CONSTRAINT "quotation_prices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_prices" ADD CONSTRAINT "quotation_prices_q_fk" FOREIGN KEY ("tenant_id","quotation_id") REFERENCES "public"."quotations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_prices" ADD CONSTRAINT "quotation_prices_item_fk" FOREIGN KEY ("tenant_id","quotation_item_id") REFERENCES "public"."quotation_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_prices" ADD CONSTRAINT "quotation_prices_sup_fk" FOREIGN KEY ("tenant_id","quotation_supplier_id") REFERENCES "public"."quotation_suppliers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_suppliers" ADD CONSTRAINT "quotation_suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_suppliers" ADD CONSTRAINT "quotation_suppliers_q_fk" FOREIGN KEY ("tenant_id","quotation_id") REFERENCES "public"."quotations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_suppliers" ADD CONSTRAINT "quotation_suppliers_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."sales_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_pm_fk" FOREIGN KEY ("tenant_id","payment_method_id") REFERENCES "public"."payment_methods"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_pt_fk" FOREIGN KEY ("tenant_id","payment_term_id") REFERENCES "public"."payment_terms"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_closing_items" ADD CONSTRAINT "stock_closing_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_closing_items" ADD CONSTRAINT "stock_closing_items_closing_fk" FOREIGN KEY ("tenant_id","closing_id") REFERENCES "public"."stock_closings"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_closings" ADD CONSTRAINT "stock_closings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_loc_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."stock_locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_dest_fk" FOREIGN KEY ("tenant_id","dest_location_id") REFERENCES "public"."stock_locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_wc_fk" FOREIGN KEY ("tenant_id","work_center_id") REFERENCES "public"."work_centers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_op_fk" FOREIGN KEY ("tenant_id","production_order_id") REFERENCES "public"."production_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_member_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."team_members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_profiles_name_uq" ON "access_profiles" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "assemblies_number_uq" ON "assemblies" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("tenant_id","entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_prefixes_prefix_uq" ON "code_prefixes" USING btree ("tenant_id","prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "company_settings_tenant_uq" ON "company_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_deals_number_uq" ON "crm_deals" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_categories_name_uq" ON "fin_categories" USING btree ("tenant_id","kind","name");--> statement-breakpoint
CREATE INDEX "fin_titles_due_idx" ON "fin_titles" USING btree ("tenant_id","kind","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_uq" ON "inventory_items" USING btree ("tenant_id","inventory_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("tenant_id","series","number");--> statement-breakpoint
CREATE INDEX "item_bom_item_idx" ON "item_bom" USING btree ("tenant_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_suppliers_uq" ON "item_suppliers" USING btree ("tenant_id","item_id","partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_types_name_uq" ON "item_types" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_profiles_name_uq" ON "partner_profiles" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "partners_name_idx" ON "partners" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "partners_doc_idx" ON "partners" USING btree ("tenant_id","document");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_name_uq" ON "payment_methods" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_terms_name_uq" ON "payment_terms" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_number_uq" ON "production_orders" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_number_uq" ON "purchase_orders" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_requests_number_uq" ON "purchase_requests" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_prices_uq" ON "quotation_prices" USING btree ("tenant_id","quotation_item_id","quotation_supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_uq" ON "quotations" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_number_uq" ON "sales_orders" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "sales_orders_issue_idx" ON "sales_orders" USING btree ("tenant_id","issue_date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_locations_code_uq" ON "stock_locations" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("tenant_id","item_id");--> statement-breakpoint
CREATE INDEX "stock_movements_date_idx" ON "stock_movements" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "stock_movements_op_idx" ON "stock_movements" USING btree ("tenant_id","production_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_code_uq" ON "units" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "work_centers_code_uq" ON "work_centers" USING btree ("tenant_id","code");--> statement-breakpoint
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_prefix_fk" FOREIGN KEY ("tenant_id","prefix_id") REFERENCES "public"."code_prefixes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_type_fk" FOREIGN KEY ("tenant_id","type_id") REFERENCES "public"."item_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;
