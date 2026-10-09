import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import {
  items, partners, productionOrderMaterials, productionOrders, productionStages, productionStatuses, salesOrders,
  stockBalances, stockLocations, stockMovements, teamMembers, workCenters,
} from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtDateTime, fmtDay, fmtQty, movementOriginLabel, opNumber, priorityLabel, pvNumber, toInput, today } from "@/lib/format";
import { Check, Field, Form, Hidden, Submit } from "@/components/Form";
import { OrderForm } from "@/components/OrderForm";
import { changeOrderStatusAction, changeStageAction, deleteOrderAction, reportProductionAction, withdrawMaterialsAction } from "@/server/production-actions";
import { orderLookups } from "./data";
import { col } from "@/lib/sql";

export async function ProductionOrderView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string; msg?: string }> }) {
  const s = await requireTenantUser();
  const { id } = await params;
  const sp = await searchParams;
  const tid = s.tenant.id;
  const data = await withTenant(tid, async (tx) => {
    const [row] = await tx.select({
      o: productionOrders, item: items, stage: productionStages.name, isFinal: productionStages.isFinal, center: workCenters.name,
      resp: teamMembers.name, pv: salesOrders.number, customer: partners.name,
    }).from(productionOrders)
      .innerJoin(items, eq(items.id, productionOrders.itemId)).innerJoin(productionStages, eq(productionStages.id, productionOrders.stageId))
      .leftJoin(workCenters, eq(workCenters.id, productionOrders.workCenterId)).leftJoin(teamMembers, eq(teamMembers.id, productionOrders.responsibleId))
      .leftJoin(salesOrders, eq(salesOrders.id, productionOrders.salesOrderId)).leftJoin(partners, eq(partners.id, salesOrders.customerId))
      .where(and(eq(productionOrders.id, id), eq(productionOrders.tenantId, tid))).limit(1);
    if (!row) return null;
    return {
      row,
      mats: await tx.select({
        itemId: productionOrderMaterials.itemId, code: items.code, name: items.name, unit: items.unit, prev: productionOrderMaterials.quantity,
        ret: sql<string>`coalesce((select sum(${col(stockMovements.quantity)}) from ${stockMovements} where ${col(stockMovements.productionOrderId)} = ${id}
          and ${col(stockMovements.itemId)} = ${col(productionOrderMaterials.itemId)} and ${col(stockMovements.origin)} = 'CONSUMO_OP'), 0)`,
        disp: sql<string>`coalesce((select sum(${col(stockBalances.quantity)}) from ${stockBalances} where ${col(stockBalances.itemId)} = ${col(productionOrderMaterials.itemId)}), 0)`,
      }).from(productionOrderMaterials).innerJoin(items, eq(items.id, productionOrderMaterials.itemId)).where(eq(productionOrderMaterials.orderId, id)).orderBy(asc(items.code)),
      moves: await tx.select({ m: stockMovements, code: items.code, unit: items.unit, loc: stockLocations.name }).from(stockMovements)
        .innerJoin(items, eq(items.id, stockMovements.itemId)).innerJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
        .where(eq(stockMovements.productionOrderId, id)).orderBy(desc(stockMovements.createdAt)).limit(100),
      locs: await tx.select({ id: stockLocations.id, name: stockLocations.name, def: stockLocations.isDefault }).from(stockLocations).where(eq(stockLocations.active, true)).orderBy(desc(stockLocations.isDefault), asc(stockLocations.name)),
      statuses: await tx.select({ id: productionStatuses.id, name: productionStatuses.name }).from(productionStatuses).orderBy(asc(productionStatuses.name)),
      lk: await orderLookups(tx, tid),
    };
  });
  if (!data) notFound();
  const { row, mats, moves, locs, statuses, lk } = data;
  const o = row.o;
  const late = !row.isFinal && !!o.dueDate && o.dueDate < today();
  const produced = Number(o.producedQty), total = Number(o.quantity);
  const pending = mats.filter((m) => Number(m.prev) - Number(m.ret) > 0);
  const back = `/producao/${o.id}`;
  // o pedido atual aparece na lista mesmo que já esteja entregue
  if (o.salesOrderId && !lk.sales.some((x) => x.id === o.salesOrderId) && row.pv != null) lk.sales.unshift({ id: o.salesOrderId, number: row.pv, customer: row.customer ?? "" });

  if (sp.editar) {
    return (
      <>
        <div className="ph"><div><Link className="back" href={back}>‹ {opNumber(o.number)}</Link><h1>Editar {opNumber(o.number)}</h1><p>{row.item.name}</p></div></div>
        <section className="panel" style={{ maxWidth: 920 }}><div className="pb">
          <OrderForm order={o} lk={lk} materials={mats.map((m) => ({ item: m.itemId, qtd: toInput(m.prev) }))} />
        </div></section>
      </>
    );
  }

  return (
    <>
      <div className="ph"><div><Link className="back" href="/producao">‹ Ordens de produção</Link>
        <h1>{opNumber(o.number)} · {row.item.name}</h1>
        <p>{fmtQty(o.quantity)} {row.item.unit}{row.pv != null && <> · pedido <Link href={`/comercial/pedidos/${o.salesOrderId}`}>{pvNumber(row.pv)}</Link> de {row.customer}</>}</p></div>
        <div className="acts">
          <Link className="btn" href={`/producao/nova?item=${o.itemId}&copiar=${o.id}`}>Duplicar</Link>
          <Link className="btn btn-primary" href={`${back}?editar=1`}>Editar ordem</Link>
        </div></div>
      {sp.msg && <div className="alert ok" role="status">{sp.msg.slice(0, 200)}</div>}

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, 1fr)" }}>
        <div className="stack">
          <section className="panel"><h2>Resumo</h2><div className="pb">
            <dl className="facts">
              <div><dt>Etapa</dt><dd>{row.isFinal ? <span className="badge ok">{row.stage}</span> : row.stage}</dd></div>
              <div><dt>Produzido</dt><dd><div className="progress"><span style={{ width: `${Math.min(100, (produced / total) * 100)}%` }} /></div>{fmtQty(produced)} de {fmtQty(total)} {row.item.unit}</dd></div>
              <div><dt>Prazo</dt><dd className={late ? "late" : undefined}>{fmtDay(o.dueDate)}{late && " · atrasada"}</dd></div>
              <div><dt>Início</dt><dd>{fmtDay(o.startDate)}</dd></div>
              <div><dt>Centro de trabalho</dt><dd>{row.center ?? "—"}</dd></div>
              <div><dt>Responsável</dt><dd>{row.resp ?? "—"}</dd></div>
              <div><dt>Prioridade</dt><dd>{priorityLabel(o.priority)}</dd></div>
              <div><dt>Criada</dt><dd>{fmtDateTime(o.createdAt)}{o.createdBy ? ` por ${o.createdBy}` : ""}</dd></div>
              {o.finishedAt && <div><dt>Concluída</dt><dd>{fmtDateTime(o.finishedAt)}</dd></div>}
            </dl>
            {o.notes && <p className="note">{o.notes}</p>}
            <div className="inline-forms">
              <Form action={changeStageAction} className="mini-form">
                <Hidden name="id" value={o.id} />
                <Field name="etapa" label="Mudar etapa" options={lk.stages.map((x) => [x.id, x.name] as const)} defaultValue={o.stageId} />
                <Submit variant="default" pending="…">Aplicar</Submit>
              </Form>
              <Form action={changeOrderStatusAction} className="mini-form">
                <Hidden name="id" value={o.id} />
                <Field name="situacao" label="Situação" options={statuses.map((x) => [x.id, x.name] as const)} emptyOption="—" defaultValue={o.statusId} />
                <Submit variant="default" pending="…">Aplicar</Submit>
              </Form>
            </div>
          </div></section>

          <section className="panel"><h2>Materiais da ordem</h2><div className="pb stack">
            {mats.length ? (
              <div className="tbl solo"><table><thead><tr><th>Material</th><th className="num">Previsto</th><th className="num">Retirado</th><th className="num">Falta retirar</th><th className="num">Em estoque</th><th /></tr></thead>
                <tbody>{mats.map((m) => {
                  const falta = Math.max(0, Number(m.prev) - Number(m.ret));
                  const short = falta > Number(m.disp);
                  return (
                    <tr key={m.itemId}>
                      <td>{m.code}<small className="sub">{m.name}</small></td>
                      <td className="num">{fmtQty(m.prev)} {m.unit}</td><td className="num">{fmtQty(m.ret)}</td>
                      <td className="num">{falta ? <b>{fmtQty(falta)}</b> : <span className="badge ok">Completo</span>}</td>
                      <td className={`num${short ? " late" : ""}`}>{fmtQty(m.disp)}</td>
                      <td className="num"><Link className="btn btn-sm" href={`/estoque/movimentar?tipo=SAIDA&op=${o.id}&item=${m.itemId}&voltar=${back}`}>Retirar</Link></td>
                    </tr>
                  );
                })}</tbody></table></div>
            ) : <p className="muted" style={{ margin: 0 }}>Nenhum material previsto. Inclua em <Link href={`${back}?editar=1`}>Editar ordem</Link> ou retire avulso pela <Link href={`/estoque/movimentar?tipo=SAIDA&op=${o.id}&voltar=${back}`}>saída de estoque</Link>.</p>}
            {pending.length > 0 && (
              <Form action={withdrawMaterialsAction} className="mini-form">
                <Hidden name="id" value={o.id} />
                <Field name="local" label="Retirar todos os pendentes do local" options={locs.map((l) => [l.id, l.name] as const)} defaultValue={locs[0]?.id} />
                <Submit pending="Retirando…" confirm={`Dar saída no estoque de ${pending.length} material(is) para a ${opNumber(o.number)}?`}>Retirar pendentes</Submit>
              </Form>
            )}
          </div></section>
        </div>

        <div className="stack">
          <section className="panel"><h2>Apontar produção</h2><div className="pb">
            <Form action={reportProductionAction}>
              <Hidden name="id" value={o.id} />
              <Field name="quantidade" label={`Quantidade produzida (${row.item.unit})`} required defaultValue={toInput(Math.max(0, total - produced))} />
              <Field name="local" label="Entrada no local" options={locs.map((l) => [l.id, l.name] as const)} defaultValue={locs[0]?.id} />
              <Check name="concluir" label="Mover a ordem para a etapa final" defaultChecked={produced === 0} />
              <div className="full form-foot"><Submit pending="Apontando…">Apontar e dar entrada</Submit></div>
            </Form>
          </div></section>
          <section className="panel"><h2>Movimentações da ordem</h2><div className="pb">
            {moves.length ? <ul className="feed">{moves.map(({ m, code, unit, loc }) => (
              <li key={m.id}><span className={`badge ${m.kind === "ENTRADA" ? "ok" : "bad"}`}>{m.kind === "ENTRADA" ? "+" : "−"}{fmtQty(m.quantity)} {unit}</span>
                <span>{code} · {movementOriginLabel(m.origin)}<small className="sub">{loc} · {fmtDateTime(m.createdAt)}{m.userName ? ` · ${m.userName}` : ""}</small></span></li>))}</ul>
              : <p className="muted" style={{ margin: 0 }}>Nenhuma retirada ou apontamento ainda.</p>}
          </div></section>
          {s.user.role === "TENANT_ADMIN" && moves.length === 0 && (
            <section className="panel danger-zone"><h2>Excluir ordem</h2><div className="pb">
              <Form action={deleteOrderAction} className="">
                <Hidden name="id" value={o.id} />
                <p style={{ marginTop: 0 }}>Só é possível excluir ordens que ainda não movimentaram o estoque.</p>
                <Submit variant="danger" pending="Excluindo…" confirm={`Excluir a ${opNumber(o.number)}?`}>Excluir ordem</Submit>
              </Form>
            </div></section>
          )}
        </div>
      </div>
    </>
  );
}
