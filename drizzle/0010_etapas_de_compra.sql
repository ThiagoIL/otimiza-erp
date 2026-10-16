CREATE TABLE "purchase_stages" (
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
	CONSTRAINT "purchase_stages_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "custom_fields" ADD COLUMN "on_card" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "stage_id" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "work" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "custom" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_stages" ADD CONSTRAINT "purchase_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_stages_system_uq" ON "purchase_stages" USING btree ("tenant_id","kind") WHERE "purchase_stages"."system";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_stage_fk" FOREIGN KEY ("tenant_id","stage_id") REFERENCES "public"."purchase_stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE no action ON UPDATE no action;