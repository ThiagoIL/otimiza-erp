/**
 * Descobre a área do sistema a partir do domínio acessado. Sem dependências: roda também no middleware.
 *   admin.ROOT_DOMAIN     -> painel do administrador do sistema
 *   <empresa>.ROOT_DOMAIN -> sistema da empresa cliente
 *   ROOT_DOMAIN (ou www)  -> página inicial
 */
export type HostInfo =
  | { area: "admin" }
  | { area: "tenant"; slug: string }
  | { area: "root" }
  | { area: "unknown" };

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** Subdomínios que nenhuma empresa pode usar. */
export const RESERVED_SLUGS = new Set([
  "admin", "www", "app", "api", "status", "mail", "email", "smtp", "ftp", "static", "assets", "cdn",
  "suporte", "support", "ajuda", "help", "docs", "blog", "login", "auth", "painel", "dashboard",
  "dev", "staging", "teste", "test", "root", "sistema", "otimiza",
]);

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/\.$/, "");
}

export function parseHost(rawHost: string | null | undefined, rootDomain: string, adminSub = "admin"): HostInfo {
  const host = normalizeHost(rawHost);
  const root = normalizeHost(rootDomain);
  if (!host || !root) return { area: "unknown" };
  if (host === root || host === `www.${root}`) return { area: "root" };
  if (!host.endsWith(`.${root}`)) return { area: "unknown" };
  const sub = host.slice(0, -(root.length + 1));
  if (sub === adminSub) return { area: "admin" };
  if (sub.includes(".") || !SLUG_RE.test(sub) || RESERVED_SLUGS.has(sub)) return { area: "unknown" };
  return { area: "tenant", slug: sub };
}

export function validateSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use de 1 a 32 letras minúsculas, números ou hífen, sem começar ou terminar com hífen.";
  if (RESERVED_SLUGS.has(slug)) return "Este endereço é reservado pelo sistema. Escolha outro.";
  return null;
}
