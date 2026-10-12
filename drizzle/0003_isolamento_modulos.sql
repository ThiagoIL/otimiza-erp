-- Otimiza+ ERP — isolamento por empresa (Row Level Security) das tabelas dos módulos.
-- Mesmo modelo da 0001: a aplicação acessa essas tabelas com o papel erp_app dentro de withTenant().
GRANT SELECT, INSERT, UPDATE, DELETE ON "access_profiles", "company_settings", "units", "item_types", "code_prefixes", "item_bom", "item_routing", "item_suppliers", "partner_profiles", "partners", "partner_contacts", "partner_notes", "attachments", "crm_stages", "crm_deals", "crm_activities", "custom_fields", "payment_methods", "payment_terms", "bank_accounts", "fin_categories", "fin_situations", "fin_responsibles", "sales_orders", "sales_order_items", "invoices", "invoice_items", "stock_locations", "stock_movements", "inventories", "inventory_items", "stock_closings", "stock_closing_items", "production_stages", "assembly_stages", "work_centers", "team_members", "production_orders", "production_order_components", "production_outputs", "time_entries", "assemblies", "assembly_locations", "assembly_parts", "purchase_requests", "purchase_request_items", "quotations", "quotation_items", "quotation_suppliers", "quotation_prices", "purchase_orders", "purchase_order_items", "fin_titles", "bank_entries", "sequences" TO erp_app;--> statement-breakpoint
ALTER TABLE "access_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "access_profiles" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "company_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "company_settings" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "units" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "item_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_types" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "item_types" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "code_prefixes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "code_prefixes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "code_prefixes" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "item_bom" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_bom" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "item_bom" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "item_routing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_routing" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "item_routing" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "item_suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_suppliers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "item_suppliers" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "partner_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partner_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "partner_profiles" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partners" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "partners" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "partner_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partner_contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "partner_contacts" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "partner_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partner_notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "partner_notes" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attachments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attachments" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "crm_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crm_stages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "crm_stages" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "crm_deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crm_deals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "crm_deals" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "crm_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crm_activities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "crm_activities" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "custom_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_fields" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "custom_fields" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "payment_methods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_methods" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payment_methods" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "payment_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_terms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payment_terms" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bank_accounts" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "fin_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fin_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fin_categories" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "fin_situations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fin_situations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fin_situations" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "fin_responsibles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fin_responsibles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fin_responsibles" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_orders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales_orders" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "sales_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_order_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales_order_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoices" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "stock_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_locations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_locations" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_movements" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "inventories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventories" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "stock_closings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_closings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_closings" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "stock_closing_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_closing_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_closing_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "production_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_stages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "production_stages" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "assembly_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assembly_stages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "assembly_stages" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "work_centers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_centers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "work_centers" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "team_members" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "production_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_orders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "production_orders" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "production_order_components" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_order_components" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "production_order_components" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "production_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_outputs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "production_outputs" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "time_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "time_entries" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "assemblies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assemblies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "assemblies" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "assembly_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assembly_locations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "assembly_locations" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "assembly_parts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assembly_parts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "assembly_parts" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "purchase_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "purchase_requests" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "purchase_request_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_request_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "purchase_request_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "quotations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quotations" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "quotation_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotation_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quotation_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "quotation_suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotation_suppliers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quotation_suppliers" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "quotation_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotation_prices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quotation_prices" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_orders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "purchase_orders" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "purchase_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_order_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "purchase_order_items" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "fin_titles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fin_titles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fin_titles" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "bank_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bank_entries" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sequences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sequences" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
-- perfil de acesso do usuário: some se o perfil for excluído
ALTER TABLE "users" ADD CONSTRAINT "users_profile_fk" FOREIGN KEY ("profile_id") REFERENCES "access_profiles"("id") ON DELETE SET NULL;
