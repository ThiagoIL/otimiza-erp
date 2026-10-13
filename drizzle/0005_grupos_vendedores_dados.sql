-- Vendedores: isolamento por empresa, como as demais tabelas de negócio (modelo da 0003).
GRANT SELECT, INSERT, UPDATE, DELETE ON "salespeople" TO erp_app;--> statement-breakpoint
ALTER TABLE "salespeople" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salespeople" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "salespeople" USING ("tenant_id" = current_setting('app.tenant_id', true)) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint

-- Os vendedores eram usuários do sistema: cada usuário já usado como vendedor vira um cadastro de vendedor
-- com o mesmo id, então pedidos e clientes continuam apontando para a mesma pessoa.
INSERT INTO "salespeople" ("id", "tenant_id", "name", "email")
SELECT u."id", u."tenant_id", u."name", u."email" FROM "users" u
WHERE u."tenant_id" IS NOT NULL AND u."id" IN (
  SELECT "salesperson_id" FROM "partners" WHERE "salesperson_id" IS NOT NULL
  UNION SELECT "salesperson_id" FROM "sales_orders" WHERE "salesperson_id" IS NOT NULL)
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "partners" SET "salesperson_id" = NULL WHERE "salesperson_id" IS NOT NULL AND "salesperson_id" NOT IN (SELECT "id" FROM "salespeople");--> statement-breakpoint
UPDATE "sales_orders" SET "salesperson_id" = NULL WHERE "salesperson_id" IS NOT NULL AND "salesperson_id" NOT IN (SELECT "id" FROM "salespeople");--> statement-breakpoint

-- O prefixo do código passa a ficar no próprio grupo (antes era um cadastro à parte ligado ao grupo).
UPDATE "item_groups" g SET "code_prefix" = p."prefix", "prefix_digits" = p."digits", "next_number" = p."next_number"
FROM "code_prefixes" p WHERE p."id" = g."prefix_id" AND g."code_prefix" IS NULL;
