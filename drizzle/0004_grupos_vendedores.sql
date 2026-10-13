CREATE TABLE "salespeople" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"commission_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "salespeople_tid_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "code_prefix" text;--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "prefix_digits" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "next_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "salespeople" ADD CONSTRAINT "salespeople_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "salespeople_name_uq" ON "salespeople" USING btree ("tenant_id","name");--> statement-breakpoint
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_parent_fk" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "public"."item_groups"("tenant_id","id") ON DELETE no action ON UPDATE no action;