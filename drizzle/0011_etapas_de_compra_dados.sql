-- Etapas do pedido de compra: as quatro do sistema para cada empresa, e os pedidos existentes ligados à etapa da situação.
INSERT INTO "purchase_stages" ("id", "tenant_id", "name", "color", "position", "kind", "system")
SELECT 'ps' || substr(md5(t."id" || s.kind), 1, 22), t."id", s.name, s.color, s.pos, s.kind, true
FROM "tenants" t
CROSS JOIN (VALUES ('Rascunho', '#6B7785', 1, 'RASCUNHO'), ('Enviado ao fornecedor', '#E0601A', 2, 'ENVIADO'),
  ('Recebido', '#2E7D4F', 3, 'RECEBIDO'), ('Cancelado', '#B3261E', 4, 'CANCELADO')) AS s(name, color, pos, kind)
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "purchase_orders" o SET "stage_id" = s."id" FROM "purchase_stages" s
WHERE s."tenant_id" = o."tenant_id" AND s."system" AND o."stage_id" IS NULL
  AND s."kind" = CASE o."status" WHEN 'RECEBIDO_PARCIAL' THEN 'ENVIADO' ELSE o."status" END;--> statement-breakpoint

-- Isolamento por empresa (modelo da 0003).
GRANT SELECT, INSERT, UPDATE, DELETE ON "purchase_stages" TO erp_app;--> statement-breakpoint
ALTER TABLE "purchase_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_stages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "purchase_stages" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
