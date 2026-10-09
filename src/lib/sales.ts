/**
 * Cálculos do pedido de venda e validação de documentos. Funções puras (sem banco) para
 * serem usadas no servidor, na tela e nos testes.
 */

const cents = (n: number) => Math.round(n * 100) / 100;

/** Total da linha: quantidade × preço, menos o desconto percentual da linha. */
export function lineTotal(qty: number, unitPrice: number, discountPct: number): number {
  return cents(qty * unitPrice * (1 - Math.min(100, Math.max(0, discountPct)) / 100));
}

export function orderTotals(lines: { qty: number; price: number; disc: number }[], discount: number, freight: number) {
  const subtotal = cents(lines.reduce((a, l) => a + lineTotal(l.qty, l.price, l.disc), 0));
  const total = cents(Math.max(0, subtotal - discount + freight));
  return { subtotal, total };
}

/**
 * Parcelas do pedido. A diferença de centavos da divisão fica na primeira parcela,
 * para a soma bater exatamente com o total.
 */
export function installments(total: number, count: number, issueDate: string, firstDueDays: number, intervalDays: number) {
  const n = Math.max(1, Math.min(60, Math.trunc(count)));
  const base = Math.floor((total / n) * 100) / 100;
  const first = cents(total - base * (n - 1));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${issueDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + firstDueDays + i * intervalDays);
    return { number: i + 1, dueDate: d.toISOString().slice(0, 10), amount: i === 0 ? first : base };
  });
}

export function isValidCpf(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function isValidCnpj(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((a, x, i) => a + x * Number(d[i]), 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
