import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { withTenant } from "@/lib/db";
import { requireTenantUser } from "@/lib/context";
import { fmtDateTime, fmtDay, fmtDoc, fmtMoney, fmtQty, paymentLabel, pvNumber, salesStatusLabel } from "@/lib/format";
import { LogoLockup } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { loadSalesOrder } from "./data";
import { installments } from "@/lib/sales";

export const metadata: Metadata = { title: "Relatório do pedido" };

/** Relatório do pedido de venda para imprimir ou salvar em PDF pelo navegador. */
export async function SalesOrderReport({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireTenantUser();
  const { id } = await params;
  const so = await withTenant(s.tenant.id, (tx) => loadSalesOrder(tx, s.tenant.id, id));
  if (!so) notFound();
  const { o, c, lines, parts } = so;
  const t = s.tenant;
  const quote = o.status === "ORCAMENTO";
  // orçamento ainda não tem parcelas lançadas: mostra as que serão geradas
  const plan = parts.length ? parts.map((p) => ({ n: p.installment, due: p.dueDate, amount: Number(p.amount) }))
    : installments(Number(o.total), o.installments, o.issueDate, o.firstDueDays, o.intervalDays).map((p) => ({ n: p.number, due: p.dueDate, amount: p.amount }));
  return (
    <div className="report-page">
      <div className="report-tools no-print">
        <Link className="btn" href={`/comercial/pedidos/${o.id}`}>‹ Voltar ao pedido</Link>
        <PrintButton />
      </div>
      <article className="report">
        <header className="report-h">
          <div><b className="report-co">{t.name}</b>{t.document && <span>CNPJ {t.document}</span>}</div>
          <div className="report-title"><span>{quote ? "Orçamento" : "Pedido de venda"}</span><b>{pvNumber(o.number)}</b>{!quote && <small>{salesStatusLabel(o.status)}</small>}</div>
        </header>

        <section className="report-grid">
          <div><h3>Cliente</h3>
            <p><b>{c.name}</b>{c.tradeName && <> ({c.tradeName})</>}<br />
              {c.document && <>{c.personType === "PJ" ? "CNPJ" : "CPF"} {fmtDoc(c.document)}{c.stateRegistration && <> · IE {c.stateRegistration}</>}<br /></>}
              {c.street && <>{[c.street, c.number, c.district].filter(Boolean).join(", ")}<br /></>}
              {c.city && <>{c.city}/{c.state}{c.zip && ` · CEP ${c.zip}`}<br /></>}
              {[c.phone, c.email].filter(Boolean).join(" · ")}</p></div>
          <div><h3>Pedido</h3>
            <dl className="report-dl">
              <dt>Emissão</dt><dd>{fmtDay(o.issueDate)}</dd>
              <dt>Entrega prevista</dt><dd>{fmtDay(o.deliveryDate)}</dd>
              {o.sellerName && <><dt>Vendedor</dt><dd>{o.sellerName}</dd></>}
              <dt>Pagamento</dt><dd>{paymentLabel(o.paymentMethod)}{o.installments > 1 ? ` em ${o.installments}x` : " à vista"}</dd>
            </dl></div>
        </section>

        <table className="report-tbl">
          <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Un.</th><th className="num">Qtd.</th><th className="num">Preço unit.</th><th className="num">Desc.</th><th className="num">Total</th></tr></thead>
          <tbody>{lines.map(({ l, code, name, unit }) => (
            <tr key={l.id}><td>{l.line}</td><td>{code}</td><td>{name}</td><td>{unit}</td><td className="num">{fmtQty(l.quantity)}</td>
              <td className="num">{fmtMoney(l.unitPrice)}</td><td className="num">{Number(l.discountPct) ? `${fmtQty(l.discountPct)}%` : "—"}</td><td className="num">{fmtMoney(l.total)}</td></tr>))}</tbody>
        </table>

        <section className="report-grid">
          <div><h3>Condições de pagamento</h3>
            {plan.length ? <table className="report-tbl compact"><thead><tr><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th></tr></thead>
              <tbody>{plan.map((p) => <tr key={p.n}><td>{p.n}/{plan.length}</td><td>{fmtDay(p.due)}</td><td className="num">{fmtMoney(p.amount)}</td></tr>)}</tbody></table>
              : <p>—</p>}</div>
          <div><dl className="report-totals">
            <dt>Subtotal</dt><dd>{fmtMoney(o.subtotal)}</dd>
            <dt>Desconto</dt><dd>{Number(o.discount) ? `− ${fmtMoney(o.discount)}` : "—"}</dd>
            <dt>Frete</dt><dd>{Number(o.freight) ? fmtMoney(o.freight) : "—"}</dd>
            <dt className="g">Total</dt><dd className="g">{fmtMoney(o.total)}</dd>
          </dl></div>
        </section>

        {o.notes && <section><h3>Observações</h3><p className="report-notes">{o.notes}</p></section>}

        <section className="report-sign">
          <div><span />Cliente</div>
          <div><span />{t.name}</div>
        </section>
        <footer className="report-f"><span>Emitido em {fmtDateTime(new Date())}</span><LogoLockup height={12} /></footer>
      </article>
    </div>
  );
}
