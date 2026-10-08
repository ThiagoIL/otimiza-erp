-- Otimiza+ ERP — regras de segurança aplicadas pelo próprio banco.
-- Mesmo que o código da aplicação tenha um erro, o PostgreSQL recusa a operação.

-- 1) Coerência dos usuários ------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_role_scope_ck" CHECK (
  ("role" = 'SUPER_ADMIN' AND "tenant_id" IS NULL) OR ("role" <> 'SUPER_ADMIN' AND "tenant_id" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_master_is_super_ck" CHECK (NOT "is_master" OR "role" = 'SUPER_ADMIN');--> statement-breakpoint
-- A senha nunca pode ser apagada nem gravada sem hash bcrypt
ALTER TABLE "users" ADD CONSTRAINT "users_password_hash_ck" CHECK ("password_hash" ~ '^\$2[aby]\$[0-9]{2}\$.{53}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_ck" CHECK ("email" = lower("email") AND "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_master_uq" ON "users" ("is_master") WHERE "is_master";--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_ck" CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$');--> statement-breakpoint

-- 2) Proteção da conta master e dos administradores -------------------------------------
CREATE OR REPLACE FUNCTION users_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  restantes integer;
BEGIN
  -- serializa alterações de administradores do mesmo escopo (evita corrida entre duas requisições)
  PERFORM pg_advisory_xact_lock(hashtext('users_guard:' || coalesce(OLD.tenant_id, 'sistema')));

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_master THEN
      RAISE EXCEPTION 'ERP_RULE: a conta master do sistema não pode ser excluída' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'ERP_RULE: um usuário não pode mudar de empresa' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.is_master THEN
      IF NOT NEW.is_master THEN
        RAISE EXCEPTION 'ERP_RULE: a conta master não pode perder a proteção de master' USING ERRCODE = 'P0001';
      END IF;
      IF NEW.role <> 'SUPER_ADMIN' THEN
        RAISE EXCEPTION 'ERP_RULE: a conta master não pode deixar de ser administradora do sistema' USING ERRCODE = 'P0001';
      END IF;
      IF NEW.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'ERP_RULE: a conta master não pode ser desativada' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- sempre deve sobrar ao menos um administrador ativo no sistema e em cada empresa
  IF OLD.status = 'ACTIVE' AND OLD.role IN ('SUPER_ADMIN', 'TENANT_ADMIN')
     AND (TG_OP = 'DELETE' OR NEW.status <> 'ACTIVE' OR NEW.role <> OLD.role) THEN
    SELECT count(*) INTO restantes FROM users
     WHERE id <> OLD.id AND role = OLD.role AND status = 'ACTIVE'
       AND tenant_id IS NOT DISTINCT FROM OLD.tenant_id;
    IF restantes = 0 THEN
      RAISE EXCEPTION 'ERP_RULE: é preciso manter ao menos um administrador ativo' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "users_guard_trg" BEFORE UPDATE OR DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION users_guard();--> statement-breakpoint

-- 3) Isolamento entre clientes com Row Level Security -----------------------------------
-- A aplicação acessa as tabelas de negócio com o papel erp_app, dentro de uma transação
-- que informa a empresa em app.tenant_id (ver withTenant em src/lib/db.ts).
-- Funciona mesmo quando a conexão usa o superusuário postgres (padrão do Easypanel).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT erp_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO erp_app;--> statement-breakpoint
GRANT SELECT ON "tenants" TO erp_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "item_groups", "items" TO erp_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;--> statement-breakpoint

ALTER TABLE "item_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_groups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "item_groups"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "items"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));--> statement-breakpoint

-- Um item só pode apontar para um grupo da mesma empresa
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_tenant_id_id_uq" UNIQUE ("tenant_id", "id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_group_same_tenant_fk" FOREIGN KEY ("tenant_id", "group_id") REFERENCES "item_groups" ("tenant_id", "id");
