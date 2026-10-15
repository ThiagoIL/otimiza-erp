CREATE TABLE "chat_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_reads_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "delivery_places" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"partner_id" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_places_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"link_label" text,
	CONSTRAINT "messages_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text DEFAULT 'aviso' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"from_name" text,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "production_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"production_order_id" text NOT NULL,
	"component_id" text,
	"assembly_id" text,
	"assembly_part_id" text,
	"item_id" text,
	"description" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"member_id" text,
	"output_id" text,
	"movement_id" text,
	"notes" text,
	"user_id" text,
	"user_name" text,
	CONSTRAINT "production_reports_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sales_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6B7785' NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sales_stages_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"assignee_id" text NOT NULL,
	"assignee_name" text NOT NULL,
	"creator_id" text NOT NULL,
	"creator_name" text NOT NULL,
	"due_date" date,
	"priority" text DEFAULT 'Normal' NOT NULL,
	"link" text,
	"link_label" text,
	"done_at" timestamp with time zone,
	CONSTRAINT "tasks_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "item_bom" ADD COLUMN "supply" text DEFAULT 'ESTOQUE' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_order_components" ADD COLUMN "supply" text DEFAULT 'ESTOQUE' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "stage_id" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "has_assembly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_places" ADD CONSTRAINT "delivery_places_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_places" ADD CONSTRAINT "delivery_places_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_op_fk" FOREIGN KEY ("tenant_id","production_order_id") REFERENCES "public"."production_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_member_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."team_members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_stages" ADD CONSTRAINT "sales_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reads_uq" ON "chat_reads" USING btree ("tenant_id","user_id","channel");--> statement-breakpoint
CREATE INDEX "messages_channel_idx" ON "messages" USING btree ("tenant_id","channel","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("tenant_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "production_reports_date_idx" ON "production_reports" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_stages_system_uq" ON "sales_stages" USING btree ("tenant_id","kind") WHERE "sales_stages"."system";--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("tenant_id","assignee_id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_stage_fk" FOREIGN KEY ("tenant_id","stage_id") REFERENCES "public"."sales_stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;