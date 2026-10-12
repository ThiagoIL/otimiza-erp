/** Datas de negócio em texto AAAA-MM-DD, no fuso da aplicação. Funciona no servidor e no navegador. */
const TZ = (typeof process !== "undefined" && process.env?.APP_TIMEZONE) || "America/Sao_Paulo";

export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDays(iso: string, n: number): string {
  const t = new Date(iso + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export function addMonths(iso: string, n: number): string {
  const t = new Date(iso + "T12:00:00Z");
  t.setUTCMonth(t.getUTCMonth() + n);
  return t.toISOString().slice(0, 10);
}
export const diffDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
/** dd/mm/aa */
export const fmtD = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—");
export const fmtDM = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export type Inst = { n: number; due: string; value: number };
export const r2 = (v: number) => Math.round((+v || 0) * 100) / 100;
/** Divide o total em parcelas pelos prazos (dias) a partir da data base. A última parcela absorve o arredondamento. */
export function installments(total: number, days: number[], base: string): Inst[] {
  const ds = days.length ? days : [0];
  const v = Math.floor((total / ds.length) * 100) / 100;
  return ds.map((d, i) => ({ n: i + 1, due: addDays(base, d), value: i < ds.length - 1 ? v : r2(total - v * (ds.length - 1)) }));
}

/** Totais de um documento com itens (pedido de venda ou de compra). */
export function docTotals(items: { qty: number | string; price: number | string; discountPct?: number | string | null }[], discount = 0, freight = 0) {
  let gross = 0, disc = 0;
  for (const x of items) { const b = (+x.qty || 0) * (+x.price || 0); gross += b; disc += (b * (+(x.discountPct ?? 0) || 0)) / 100; }
  const sub = gross - disc;
  return { gross: r2(gross), itemsDiscount: r2(disc), sub: r2(sub), total: r2(sub - (+discount || 0) + (+freight || 0)) };
}
