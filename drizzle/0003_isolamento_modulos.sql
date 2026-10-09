-- Otimiza+ ERP — isolamento por empresa (Row Level Security) e regras dos módulos de
-- estoque, produção, montagens, comercial e financeiro. Mesmo modelo da migração 0001.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "stock_locations", "stock_balances", "stock_movements", "partners", "sales_orders", "sales_order_items",
  "receivables", "production_stages", "production_statuses", "work_centers", "team_members",
  "production_orders", "production_order_materials", "assemblies", "assembly_areas", "assembly_pieces"
  TO erp_app;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stock_locations', 'stock_balances', 'stock_movements', 'partners', 'sales_orders', 'sales_order_items',
    'receivables', 'production_stages', 'production_statuses', 'work_centers', 'team_members',
    'production_orders', 'production_order_materials', 'assemblies', 'assembly_areas', 'assembly_pieces'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY "tenant_isolation" ON %I
      USING ("tenant_id" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true))$p$, t);
  END LOOP;
END
$$;--> statement-breakpoint

-- Quantidades e valores coerentes ----------------------------------------------------
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_qty_ck" CHECK ("quantity" >= 0);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_qty_ck" CHECK ("quantity" > 0);--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_qty_ck" CHECK ("quantity" > 0 AND "produced_qty" >= 0);--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_priority_ck" CHECK ("priority" BETWEEN 1 AND 3);--> statement-breakpoint
ALTER TABLE "production_order_materials" ADD CONSTRAINT "production_order_materials_qty_ck" CHECK ("quantity" > 0);--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_values_ck" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "discount_pct" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_values_ck" CHECK ("installments" BETWEEN 1 AND 60 AND "discount" >= 0 AND "freight" >= 0 AND "total" >= 0);--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_amount_ck" CHECK ("amount" >= 0);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_kind_ck" CHECK ("is_customer" OR "is_supplier" OR "is_carrier");--> statement-breakpoint
ALTER TABLE "assembly_pieces" ADD CONSTRAINT "assembly_pieces_qty_ck" CHECK ("quantity" > 0);--> statement-breakpoint

-- Referências sempre para registros da mesma empresa ------------------------------------
ALTER TABLE "items" ADD CONSTRAINT "items_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "assembly_areas" ADD CONSTRAINT "assembly_areas_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_same_tenant_fk" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "items" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_same_tenant_fk" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "stock_locations" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_same_tenant_fk" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "items" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_same_tenant_fk" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "stock_locations" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_same_tenant_fk" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "partners" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_order_same_tenant_fk" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "sales_orders" ("tenant_id", "id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_item_same_tenant_fk" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "items" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_same_tenant_fk" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "partners" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_item_same_tenant_fk" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "items" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_stage_same_tenant_fk" FOREIGN KEY ("tenant_id", "stage_id") REFERENCES "production_stages" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "production_order_materials" ADD CONSTRAINT "production_order_materials_order_same_tenant_fk" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "production_orders" ("tenant_id", "id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "production_order_materials" ADD CONSTRAINT "production_order_materials_item_same_tenant_fk" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "items" ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "assembly_areas" ADD CONSTRAINT "assembly_areas_assembly_same_tenant_fk" FOREIGN KEY ("tenant_id", "assembly_id") REFERENCES "assemblies" ("tenant_id", "id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assembly_pieces" ADD CONSTRAINT "assembly_pieces_area_same_tenant_fk" FOREIGN KEY ("tenant_id", "area_id") REFERENCES "assembly_areas" ("tenant_id", "id") ON DELETE CASCADE;
