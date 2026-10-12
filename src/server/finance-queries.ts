import "server-only";
import { asc, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import * as E from "@/db/erp";
import { addDays, today } from "@/lib/dates";

/** Saldo de cada conta até uma data: saldo inicial + recebimentos − pagamentos + lançamentos avulsos. */
export async function accountBalances(tx: Tx, until = today()) {
  const accs = await tx.select().from(E.bankAccounts).orderBy(asc(E.bankAccounts.name));
  const r = await tx.execute<{ id: string; v: string }>(sql`
    select a.id, (a.initial_balance
      + coalesce((select sum(case when t.kind = 'RECEBER' then coalesce(t.paid_amount, t.amount) else -coalesce(t.paid_amount, t.amount) end) from fin_titles t
          where t.bank_account_id = a.id and t.status = 'PAGO' and t.paid_at <= ${until} and (a.initial_date is null or t.paid_at >= a.initial_date)), 0)
      + coalesce((select sum(e.amount) from bank_entries e where e.bank_account_id = a.id and e.date <= ${until} and (a.initial_date is null or e.date >= a.initial_date)), 0))::text v
    from bank_accounts a`);
  const m = new Map(r.rows.map((x) => [x.id, Number(x.v)]));
  return accs.map((a) => ({ ...a, balance: m.get(a.id) ?? Number(a.initialBalance) }));
}

/** Fluxo previsto por semana a partir de hoje (vencidos e não pagos entram na primeira semana). */
export async function weeklyFlow(tx: Tx, weeks: number) {
  const accs = await accountBalances(tx);
  let saldo = accs.filter((a) => a.active).reduce((x, a) => x + a.balance, 0);
  const start = saldo;
  const hoje = today();
  const end = addDays(hoje, weeks * 7 - 1);
  const open = await tx.select({ kind: E.finTitles.kind, due: E.finTitles.dueDate, amount: E.finTitles.amount }).from(E.finTitles).where(sql`${E.finTitles.status} = 'ABERTO' and ${E.finTitles.dueDate} <= ${end}`);
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const ini = addDays(hoje, i * 7), fim = addDays(hoje, i * 7 + 6);
    const tt = open.filter((t) => (i === 0 ? t.due <= fim : t.due >= ini && t.due <= fim));
    const e = tt.filter((t) => t.kind === "RECEBER").reduce((a, t) => a + Number(t.amount), 0);
    const s = tt.filter((t) => t.kind === "PAGAR").reduce((a, t) => a + Number(t.amount), 0);
    saldo += e - s;
    out.push({ ini, fim, e, s, res: e - s, saldo });
  }
  return { start, weeks: out };
}

export async function lookupsFin(tx: Tx) {
  return {
    accounts: await tx.select().from(E.bankAccounts).orderBy(asc(E.bankAccounts.name)),
    methods: await tx.select({ id: E.paymentMethods.id, n: E.paymentMethods.name }).from(E.paymentMethods).orderBy(asc(E.paymentMethods.name)),
    categories: await tx.select().from(E.finCategories).orderBy(asc(E.finCategories.name)),
    situations: await tx.select().from(E.finSituations).orderBy(asc(E.finSituations.name)),
    responsibles: await tx.select().from(E.finResponsibles).orderBy(asc(E.finResponsibles.name)),
  };
}

