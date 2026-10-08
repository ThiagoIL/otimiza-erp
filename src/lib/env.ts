import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  ROOT_DOMAIN: z.string().min(1, "ROOT_DOMAIN é obrigatório (ex.: otimizaerp.com.br)"),
  ADMIN_SUBDOMAIN: z.string().regex(/^[a-z0-9-]+$/).default("admin"),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  SESSION_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(120),
  TRUST_PROXY: z.enum(["true", "false"]).default("true"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Configuração inválida: ${msg}`);
}

export const env = {
  ...parsed.data,
  isProd: process.env.NODE_ENV === "production",
  cookieSecure: parsed.data.COOKIE_SECURE ? parsed.data.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
};
