CREATE TABLE "measurement_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"measurement_id" text NOT NULL,
	"floor" text,
	"location" text NOT NULL,
	"item_id" text,
	"description" text,
	"qty" numeric(14, 4) DEFAULT '1' NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"measured" boolean DEFAULT false NOT NULL,
	"production_order_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"notes" text,
	CONSTRAINT "measurement_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"partner_id" text,
	"sales_order_id" text,
	"work" text NOT NULL,
	"address" text,
	"date" date NOT NULL,
	"due_date" date,
	"measurer_id" text,
	"status" text DEFAULT 'MEDINDO' NOT NULL,
	"notes" text,
	CONSTRAINT "measurements_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shipment_id" text NOT NULL,
	"part_id" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	CONSTRAINT "shipment_items_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"assembly_id" text NOT NULL,
	"date" date NOT NULL,
	"vehicle" text,
	"driver" text,
	"notes" text,
	"user_name" text,
	CONSTRAINT "shipments_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "assembly_parts" ADD COLUMN "measurement_item_id" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "measurement_id" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "work" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "custom" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "measurement_items" ADD CONSTRAINT "measurement_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_items" ADD CONSTRAINT "measurement_items_m_fk" FOREIGN KEY ("tenant_id","measurement_id") REFERENCES "public"."measurements"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_items" ADD CONSTRAINT "measurement_items_op_fk" FOREIGN KEY ("tenant_id","production_order_id") REFERENCES "public"."production_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_items" ADD CONSTRAINT "measurement_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_order_fk" FOREIGN KEY ("tenant_id","sales_order_id") REFERENCES "public"."sales_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_measurer_fk" FOREIGN KEY ("tenant_id","measurer_id") REFERENCES "public"."team_members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_s_fk" FOREIGN KEY ("tenant_id","shipment_id") REFERENCES "public"."shipments"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_p_fk" FOREIGN KEY ("tenant_id","part_id") REFERENCES "public"."assembly_parts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_asm_fk" FOREIGN KEY ("tenant_id","assembly_id") REFERENCES "public"."assemblies"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "measurement_items_m_idx" ON "measurement_items" USING btree ("tenant_id","measurement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_number_uq" ON "measurements" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_number_uq" ON "shipments" USING btree ("tenant_id","number");--> statement-breakpoint
ALTER TABLE "assembly_parts" ADD CONSTRAINT "assembly_parts_mi_fk" FOREIGN KEY ("tenant_id","measurement_item_id") REFERENCES "public"."measurement_items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_measurement_fk" FOREIGN KEY ("tenant_id","measurement_id") REFERENCES "public"."measurements"("tenant_id","id") ON DELETE no action ON UPDATE no action;;--> statement-breakpoint

-- Isolamento por empresa (modelo da 0003).
GRANT SELECT, INSERT, UPDATE, DELETE ON "measurements" TO erp_app;--> statement-breakpoint
ALTER TABLE "measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "measurements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "measurements" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "measurement_items" TO erp_app;--> statement-breakpoint
ALTER TABLE "measurement_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "measurement_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "measurement_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "shipments" TO erp_app;--> statement-breakpoint
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shipments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "shipments" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "shipment_items" TO erp_app;--> statement-breakpoint
ALTER TABLE "shipment_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shipment_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "shipment_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
