import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { assemblies, items, productionOrders, productionStages, stockLocations } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import {
  fmtDateTime, fmtDay, fmtDoc, fmtMoney, fmtQty, mtNumber, opNumber, paymentLabel, pvNumber, SALES_STATUS, SALES_STATUS_BADGE,
  salesStatusLabel, toInput, today,
} from "@/lib/format";
import { Field, Form, Hidden, Submit } from "@/components/Form";
import { SalesOrderForm } from "@/components/SalesOrderForm";
import { changeSalesStatusAction, createOrdersFromSalesAction, deleteSalesOrderAction, settleReceivableAction, shipSalesOrderAction } from "@/server/sales-actions";
import { loadSalesOrder, salesLookups } from "./data";
import { installments } from "@/lib/sales";

export async function SalesOrderView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string; msg?: string }> }) {
  const s = await requireTenantUser();
  const { id } = await params;
  const sp = await searchParams;
  const tid = s.tenant.id;
  const data = await withTenant(tid, async (tx) => {
    const so = await loadSalesOrder(tx, tid, id);
    if (!so) return null;
    return {
      so,
      ops: await tx.select({ id: productionOrders.id, number: productionOrders.number, itemId: productionOrders.itemId, item: items.name, qty: productionOrders.quantity, produced: productionOrders.producedQty, stage: productionStages.name, isFinal: productionStages.isFinal })
        .from(productionOrders).innerJoin(items, eq(items.id, productionOrders.itemId)).innerJoin(productionStages, eq(productionStages.id, productionOrders.stageId))
        .where(eq(productionOrders.salesOrderId, id)).orderBy(asc(productionOrders.number)),
      mts: await tx.select({ id: assemblies.id, number: assemblies.number, name: assemblies.name }).from(assemblies).where(eq(assemblies.salesOrderId, id)),
      locs: await tx.select({ id: stockLocations.id, name: stockLocations.name }).from(stockLocations).where(eq(stockLocations.active, true)).orderBy(desc(stockLocations.isDefault), asc(stockLocations.name)),
      lk: sp.editar ? await salesLookups(tx) : null,
    };
  });
  if (!data) notFound();
  const { so, ops, mts, locs, lk } = data;
  const { o, c, lines, parts } = so;
  const editable = o.status === "ORCAMENTO" || o.status === "APROVADO";
  const back = `/comercial/pedidos/${o.id}`;

  if (sp.editar && lk && editable) {
    if (!lk.customers.some((x) => x.id === c.id)) lk.customers.unshift({ id: c.id, name: c.name });
    return (
      <>
        <div className="ph"><div><Link className="back" href={back}>‹ {pvNumber(o.number)}</Link><h1>Editar {pvNumber(o.number)}</h1><p>As parcelas são recalculadas ao salvar.</p></div></div>
        <section className="panel" style={{ maxWidth: 1000 }}><div className="pb">
          <SalesOrderForm order={o} lk={lk} lines={lines.map(({ l }) => ({ item: l.itemId, qtd: toInput(l.quantity), preco: toInput(l.unitPrice), desc: toInput(l.discountPct) }))} />
        </div></section>
      </>
    );
  }

  const fabricados = lines.filter(({ type }) => type === "PRODUTO_ACABADO" || type === "SEMIACABADO");
  const semOp = fabricados.filter(({ l }) => !ops.some((op) => op.itemId === l.itemId));
  const hoje = today();
  const recebido = parts.filter((p) => p.paidAt).reduce((a, p) => a + Number(p.amount), 0);
  return (
    <>
      <div className="ph"><div><Link className="back" href="/comercial">‹ Pedidos de venda</Link>
        <h1>{pvNumber(o.number)} · {c.name}</h1>
        <p><span className={`badge ${SALES_STATUS_BADGE[o.status]}`}>{salesStatusLabel(o.status)}</span> · emitido em {fmtDay(o.issueDate)} · entrega {fmtDay(o.deliveryDate)}</p></div>
        <div className="acts">
          <Link className="btn" href={`${back}/imprimir`} target="_blank">Relatório do pedido</Link>
          {editable && <Link className="btn btn-primary" href={`${back}?editar=1`}>Editar pedido</Link>}
        </div></div>
      {sp.msg && <div className="alert ok" role="status">{sp.msg.slice(0, 200)}</div>}

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 1fr)" }}>
        <div className="stack">
          <section className="panel"><h2>Itens</h2>
            <div className="tbl solo" style={{ border: 0 }}><table><thead><tr><th>Item</th><th className="num">Qtd.</th><th className="num">Preço</th><th className="num">Desc.</th><th className="num">Total</th><th>Produção</th></tr></thead>
              <tbody>{lines.map(({ l, code, name, unit, type }) => {
                const op = ops.find((x) => x.itemId === l.itemId);
                const fab = type === "PRODUTO_ACABADO" || type === "SEMIACABADO";
                return (
                  <tr key={l.id}>
                    <td>{code}<small className="sub">{name}</small></td>
                    <td className="num">{fmtQty(l.quantity)} {unit}</td><td className="num">{fmtMoney(l.unitPrice)}</td>
                    <td className="num">{Number(l.discountPct) ? `${fmtQty(l.discountPct)}%` : "—"}</td><td className="num">{fmtMoney(l.total)}</td>
                    <td>{op ? <Link href={`/producao/${op.id}`}>{opNumber(op.number)}</Link>
                      : fab && o.status !== "CANCELADO" ? <Link className="btn btn-sm" href={`/producao/nova?pedido=${o.id}&item=${l.itemId}&qtd=${l.quantity}`}>Criar OP</Link>
                        : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}</tbody></table></div>
            <div className="pb"><dl className="totals right">
              <div><dt>Subtotal</dt><dd>{fmtMoney(o.subtotal)}</dd></div>
              {Number(o.discount) > 0 && <div><dt>Desconto</dt><dd>− {fmtMoney(o.discount)}</dd></div>}
              {Number(o.freight) > 0 && <div><dt>Frete</dt><dd>{fmtMoney(o.freight)}</dd></div>}
              <div className="grand"><dt>Total</dt><dd>{fmtMoney(o.total)}</dd></div>
            </dl></div>
          </section>

          <section className="panel"><h2>Produção</h2><div className="pb stack">
            {ops.length ? <div className="tbl solo"><table><thead><tr><th>OP</th><th>Produto</th><th>Etapa</th><th>Produzido</th></tr></thead>
              <tbody>{ops.map((op) => (
                <tr key={op.id}><td><Link className="row-link" href={`/producao/${op.id}`}>{opNumber(op.number)}</Link></td><td>{op.item}</td>
                  <td>{op.isFinal ? <span className="badge ok">{op.stage}</span> : op.stage}</td>
                  <td style={{ minWidth: 120 }}><div className="progress"><span style={{ width: `${Math.min(100, (Number(op.produced) / Number(op.qty)) * 100)}%` }} /></div><small className="sub">{fmtQty(op.produced)} de {fmtQty(op.qty)}</small></td></tr>))}</tbody></table></div>
              : <p className="muted" style={{ margin: 0 }}>{fabricados.length ? "Nenhuma ordem de produção criada para este pedido." : "Este pedido não tem itens fabricados (produto acabado ou semiacabado)."}</p>}
            {semOp.length > 0 && o.status !== "CANCELADO" && o.status !== "ENTREGUE" && (
              <Form action={createOrdersFromSalesAction} className="">
                <Hidden name="id" value={o.id} />
                <Submit pending="Gerando…">Gerar {semOp.length === 1 ? "ordem de produção" : `${semOp.length} ordens de produção`}</Submit>
                <small className="muted" style={{ display: "block", marginTop: 6 }}>Cria uma OP por item fabricado, com a quantidade e o prazo de entrega do pedido. Depois inclua os materiais em cada OP.</small>
              </Form>
            )}
            {mts.length > 0 && <p style={{ margin: 0 }}>Montagem: {mts.map((m) => <Link key={m.id} href={`/montagens/${m.id}`}>{mtNumber(m.number)} {m.name}</Link>)}</p>}
            {mts.length === 0 && o.status !== "CANCELADO" && <p style={{ margin: 0 }}><Link href={`/montagens/nova?pedido=${o.id}`}>Criar montagem para este pedido</Link></p>}
          </div></section>
        </div>

        <div className="stack">
          <section className="panel"><h2>Cliente</h2><div className="pb">
            <p style={{ margin: 0 }}><Link href={`/comercial/cadastros/${c.id}`}><b>{c.name}</b></Link><br />{fmtDoc(c.document)}{c.phone && <><br />{c.phone}</>}{c.email && <><br />{c.email}</>}
              {c.city && <><br />{[c.street, c.number].filter(Boolean).join(", ")}{c.street ? " · " : ""}{c.city}/{c.state}</>}</p>
            {o.sellerName && <p className="muted" style={{ marginBottom: 0 }}>Vendedor: {o.sellerName}</p>}
          </div></section>

          <section className="panel"><h2>Financeiro</h2><div className="pb stack">
            <p style={{ margin: 0 }}>{paymentLabel(o.paymentMethod)} · {o.installments === 1 ? "parcela única" : `${o.installments} parcelas`} · recebido {fmtMoney(recebido)} de {fmtMoney(o.total)}</p>
            {parts.length ? <div className="tbl solo"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th /></tr></thead>
              <tbody>{parts.map((p) => (
                <tr key={p.id}><td>{p.installment}/{p.installmentsTotal}</td>
                  <td className={!p.paidAt && p.dueDate < hoje ? "late" : undefined}>{fmtDay(p.dueDate)}</td><td className="num">{fmtMoney(p.amount)}</td>
                  <td className="num">{p.paidAt ? <span className="badge ok">Recebida {fmtDay(p.paidAt)}</span>
                    : <Form action={settleReceivableAction} className="inline-form"><Hidden name="id" value={p.id} /><Submit variant="default" pending="…">Receber</Submit></Form>}</td></tr>))}</tbody></table></div>
              : o.status === "ORCAMENTO" && Number(o.total) > 0 ? <>
                <p className="muted" style={{ margin: 0 }}>Prévia: as parcelas entram em contas a receber quando o pedido for aprovado.</p>
                <div className="tbl solo"><table><tbody>{installments(Number(o.total), o.installments, o.issueDate, o.firstDueDays, o.intervalDays).map((p) => (
                  <tr key={p.number}><td>{p.number}/{o.installments}</td><td>{fmtDay(p.dueDate)}</td><td className="num">{fmtMoney(p.amount)}</td></tr>))}</tbody></table></div></>
              : <p className="muted" style={{ margin: 0 }}>Sem parcelas.</p>}
          </div></section>

          {o.status !== "ENTREGUE" && o.status !== "CANCELADO" && o.status !== "ORCAMENTO" && (
            <section className="panel"><h2>Expedição</h2><div className="pb">
              <Form action={shipSalesOrderAction} className="mini-form">
                <Hidden name="id" value={o.id} />
                <Field name="local" label="Baixar os itens do local" options={locs.map((l) => [l.id, l.name] as const)} defaultValue={locs[0]?.id} />
                <Submit pending="Expedindo…" confirm={`Dar saída no estoque dos itens do ${pvNumber(o.number)} e marcar como entregue?`}>Expedir pedido</Submit>
              </Form>
            </div></section>
          )}

          <section className="panel"><h2>Situação do pedido</h2><div className="pb">
            <Form action={changeSalesStatusAction} className="mini-form">
              <Hidden name="id" value={o.id} />
              <Field name="situacao" label="Mudar para" options={SALES_STATUS} defaultValue={o.status} />
              <Submit variant="default" pending="…">Aplicar</Submit>
            </Form>
            <small className="muted">Criado {fmtDateTime(o.createdAt)}{o.createdBy ? ` por ${o.createdBy}` : ""}.</small>
          </div></section>

          {s.user.role === "TENANT_ADMIN" && (o.status === "ORCAMENTO" || o.status === "CANCELADO") && (
            <section className="panel danger-zone"><h2>Excluir pedido</h2><div className="pb">
              <Form action={deleteSalesOrderAction} className="">
                <Hidden name="id" value={o.id} />
                <Submit variant="danger" pending="Excluindo…" confirm={`Excluir o ${pvNumber(o.number)}?`}>Excluir pedido</Submit>
              </Form>
            </div></section>
          )}
        </div>
      </div>
    </>
  );
}
