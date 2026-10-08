const TZ = process.env.APP_TIMEZONE ?? "America/Sao_Paulo";
export const ITEM_TYPES = [
  ["MATERIA_PRIMA", "Matéria-prima"], ["SEMIACABADO", "Semiacabado"], ["PRODUTO_ACABADO", "Produto acabado"],
  ["CONSUMO", "Material de consumo"], ["REVENDA", "Revenda"],
] as const;
export const itemTypeLabel = (t: string) => ITEM_TYPES.find(([k]) => k === t)?.[1] ?? t;
export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ }).format(d);
}
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ }).format(d);
}
export function fmtMoney(v: string | number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
}
export function fmtQty(v: string | number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(Number(v ?? 0));
}
/** Valor numérico para preencher um campo de formulário no padrão brasileiro. */
export function toInput(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return n ? String(n).replace(".", ",") : "";
}
export function tenantUrl(slug: string): string {
  const root = process.env.ROOT_DOMAIN ?? "";
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
  return `${secure ? "https" : "http"}://${slug}.${root}`;
}
