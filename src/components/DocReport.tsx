import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "./PrintButton";
import { fmtMoney, fmtQty } from "@/lib/format";
import { fmtD } from "@/lib/dates";

export type ReportData = {
  title: string; status?: string; back: { href: string; label: string };
  company: { name: string; line: string; logo?: string | null };
  partnerLabel: string; partner: { name: string; trade?: string | null; doc?: string | null; address?: string; contact?: string };
  dates: [string, string | null][]; payment: string[];
  items: { code: string; name: string; unit: string; qty: number; price: number; discountPct: number; notes?: string | null }[];
  totals: { gross: number; itemsDiscount: number; discount: number; freight: number; total: number };
  installments: { n: string; due: string; value: number }[];
  notes?: string | null; extra?: ReactNode; signs: [string, string];
};

/** Documento para imprimir ou salvar em PDF (pelo “Imprimir” do navegador). */
export function DocReport({ r }: { r: ReportData }) {
  return (
    <>
      <Link className="back no-print" href={r.back.href}>{r.back.label}</Link>
      <div className="ph no-print"><div><h1>{r.title}</h1><p>Use “Imprimir” e escolha “Salvar como PDF” para gerar o arquivo.</p></div><div className="acts"><PrintButton /></div></div>
      <div className="paper">
        <div className="rep">
          <header className="rep-h">
            <div className="rep-co">{r.company.logo && <img className="rep-logo" src={r.company.logo} alt="" />}<div><div className="rep-brand">{r.company.name}</div><small>{r.company.line} · gerado em {fmtD(new Date().toISOString().slice(0, 10))}</small></div></div>
            <div className="rep-t"><h2>{r.title}</h2>{r.status && <span>{r.status}</span>}</div>
          </header>
          <section className="rep-grid">
            <div><h4>{r.partnerLabel}</h4><b>{r.partner.name}</b><br />{r.partner.trade && <>{r.partner.trade}<br /></>}{r.partner.doc}<br />{r.partner.address}<br />{r.partner.contact}</div>
            <div><h4>Datas</h4>{r.dates.map(([l, v]) => <div key={l}>{l}: <b>{fmtD(v)}</b></div>)}</div>
            <div><h4>Pagamento</h4>{r.payment.map((p, i) => <div key={i}>{p}</div>)}</div>
          </section>
          <table className="rep-t2">
            <thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th className="num">Qtd.</th><th className="num">Unitário</th><th className="num">Desc.</th><th className="num">Total</th></tr></thead>
            <tbody>{r.items.map((x, i) => (
              <tr key={i}><td>{x.code}</td><td>{x.name}{x.notes && <div style={{ fontSize: 11.5, color: "#6B7885" }}>{x.notes}</div>}</td><td>{x.unit}</td><td className="num">{fmtQty(x.qty)}</td><td className="num">{fmtMoney(x.price)}</td>
                <td className="num">{x.discountPct ? `${x.discountPct.toLocaleString("pt-BR")}%` : "—"}</td><td className="num">{fmtMoney(x.qty * x.price * (1 - x.discountPct / 100))}</td></tr>))}</tbody>
          </table>
          <section className="rep-foot">
            <div><h4>Parcelas</h4><table className="rep-p"><tbody>{r.installments.length ? r.installments.map((p, i) => <tr key={i}><td>{p.n}</td><td>{fmtD(p.due)}</td><td className="num">{fmtMoney(p.value)}</td></tr>) : <tr><td>—</td></tr>}</tbody></table></div>
            <dl className="rep-tot">
              <div><dt>Soma dos itens</dt><dd>{fmtMoney(r.totals.gross)}</dd></div>
              {r.totals.itemsDiscount > 0 && <div><dt>Descontos nos itens</dt><dd>− {fmtMoney(r.totals.itemsDiscount)}</dd></div>}
              {r.totals.discount > 0 && <div><dt>Desconto geral</dt><dd>− {fmtMoney(r.totals.discount)}</dd></div>}
              {r.totals.freight > 0 && <div><dt>Frete</dt><dd>{fmtMoney(r.totals.freight)}</dd></div>}
              <div className="big"><dt>Total</dt><dd>{fmtMoney(r.totals.total)}</dd></div>
            </dl>
          </section>
          {r.extra}
          {r.notes && <section className="rep-obs"><h4>Observações</h4><div style={{ whiteSpace: "pre-wrap" }}>{r.notes}</div></section>}
          <section className="rep-sign"><div>{r.signs[0]}</div><div>{r.signs[1]}</div></section>
          <div className="rep-by">Gerado no Otimiza+ ERP</div>
        </div>
      </div>
    </>
  );
}
