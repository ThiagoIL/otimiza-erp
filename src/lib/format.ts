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

/** Data do banco (coluna date, "AAAA-MM-DD") no formato brasileiro. */
export function fmtDay(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}
/** Hoje no fuso da empresa, no formato "AAAA-MM-DD". */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function fmtPct(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(v);
}

export const MOVEMENT_ORIGINS = [
  ["MANUAL", "Manual"], ["CONSUMO_OP", "Retirada para OP"], ["PRODUCAO_OP", "Produção de OP"],
  ["PEDIDO_VENDA", "Expedição de pedido"], ["AJUSTE", "Ajuste de inventário"],
] as const;
export const movementOriginLabel = (o: string) => MOVEMENT_ORIGINS.find(([k]) => k === o)?.[1] ?? o;

export const SALES_STATUS = [
  ["ORCAMENTO", "Orçamento"], ["APROVADO", "Aprovado"], ["EM_PRODUCAO", "Em produção"],
  ["PRONTO", "Pronto para entrega"], ["ENTREGUE", "Entregue"], ["CANCELADO", "Cancelado"],
] as const;
export const salesStatusLabel = (s: string) => SALES_STATUS.find(([k]) => k === s)?.[1] ?? s;
export const SALES_STATUS_BADGE: Record<string, string> = {
  ORCAMENTO: "", APROVADO: "brand", EM_PRODUCAO: "warn", PRONTO: "ok", ENTREGUE: "ok", CANCELADO: "bad",
};

export const PAYMENT_METHODS = [
  ["PIX", "Pix"], ["BOLETO", "Boleto"], ["CARTAO_CREDITO", "Cartão de crédito"], ["CARTAO_DEBITO", "Cartão de débito"],
  ["TRANSFERENCIA", "Transferência"], ["DINHEIRO", "Dinheiro"], ["CHEQUE", "Cheque"],
] as const;
export const paymentLabel = (p: string) => PAYMENT_METHODS.find(([k]) => k === p)?.[1] ?? p;

export const ASSEMBLY_STATUS = [
  ["PLANEJADA", "Planejada"], ["EM_ANDAMENTO", "Em andamento"], ["CONCLUIDA", "Concluída"], ["CANCELADA", "Cancelada"],
] as const;
export const assemblyStatusLabel = (s: string) => ASSEMBLY_STATUS.find(([k]) => k === s)?.[1] ?? s;
export const ASSEMBLY_STATUS_BADGE: Record<string, string> = { PLANEJADA: "", EM_ANDAMENTO: "warn", CONCLUIDA: "ok", CANCELADA: "bad" };

export const PRIORITIES = [["1", "Alta"], ["2", "Normal"], ["3", "Baixa"]] as const;
export const priorityLabel = (p: number) => PRIORITIES.find(([k]) => k === String(p))?.[1] ?? String(p);

export const opNumber = (n: number) => `OP ${String(n).padStart(5, "0")}`;
export const pvNumber = (n: number) => `PV ${String(n).padStart(5, "0")}`;
export const mtNumber = (n: number) => `MT ${String(n).padStart(4, "0")}`;

/** CNPJ (14 dígitos) ou CPF (11 dígitos) formatado. */
export function fmtDoc(d: string | null | undefined): string {
  if (!d) return "—";
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** Meses ("AAAA-MM") a partir de hoje: negativos para trás, positivos para frente. */
export function monthKeys(from: number, to: number): { key: string; label: string }[] {
  const [y, m] = today().split("-").map(Number);
  const out = [];
  for (let i = from; i <= to; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    out.push({ key: d.toISOString().slice(0, 7), label: `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}` });
  }
  return out;
}
/** Valor em reais abreviado para rótulos de gráfico (R$ 12,5 mil). */
export function fmtMoneyShort(v: number): string {
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtMoney(v);
}
