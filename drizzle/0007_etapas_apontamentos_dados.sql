-- Etapas do pedido de venda: as quatro do sistema para cada empresa, e os pedidos existentes ligados à etapa da situação.
INSERT INTO "sales_stages" ("id", "tenant_id", "name", "color", "position", "kind", "system")
SELECT 'ss' || substr(md5(t."id" || s.kind), 1, 22), t."id", s.name, s.color, s.pos, s.kind, true
FROM "tenants" t
CROSS JOIN (VALUES ('Proposta', '#6B7785', 1, 'PROPOSTA'), ('Aprovado', '#E0601A', 2, 'APROVADO'),
  ('Faturado', '#2E7D4F', 3, 'FATURADO'), ('Cancelado', '#B3261E', 4, 'CANCELADO')) AS s(name, color, pos, kind)
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "sales_orders" o SET "stage_id" = s."id" FROM "sales_stages" s
WHERE s."tenant_id" = o."tenant_id" AND s."system" AND s."kind" = o."status" AND o."stage_id" IS NULL;--> statement-breakpoint

-- Estrutura: semiacabados e produtos acabados são fabricados; o resto é retirado do estoque.
UPDATE "item_bom" b SET "supply" = 'FABRICADO' FROM "items" i
WHERE i."tenant_id" = b."tenant_id" AND i."id" = b."component_id" AND i."type" IN ('SEMIACABADO', 'PRODUTO_ACABADO');--> statement-breakpoint
UPDATE "production_order_components" c SET "supply" = 'FABRICADO' FROM "items" i
WHERE i."tenant_id" = c."tenant_id" AND i."id" = c."item_id" AND i."type" IN ('SEMIACABADO', 'PRODUTO_ACABADO');--> statement-breakpoint

-- Isolamento por empresa das tabelas novas (modelo da 0003).
GRANT SELECT, INSERT, UPDATE, DELETE ON "sales_stages", "delivery_places", "production_reports", "messages", "chat_reads", "tasks", "notifications" TO erp_app;--> statement-breakpoint
ALTER TABLE "sales_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_stages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales_stages" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "delivery_places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_places" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "delivery_places" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "production_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "production_reports" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "messages" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "chat_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_reads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "chat_reads" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tasks" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notifications" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
