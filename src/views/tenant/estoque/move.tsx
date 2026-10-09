import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { items, productionOrders, productionStages, stockBalances, stockLocations } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtQty, opNumber } from "@/lib/format";
import { Field, Form, Hidden, Submit } from "@/components/Form";
import { moveStockAction } from "@/server/stock-actions";
import { ensureSetup } from "@/server/stock";

type SP = { tipo?: string; item?: string; local?: string; op?: string; voltar?: string };

/** Entrada ou saída de estoque. Com ordem de produção, a saída vira retirada de material para a OP. */
export async function StockMove({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const tid = s.tenant.id;
  const tipo = sp.tipo === "SAIDA" ? "SAIDA" : "ENTRADA";
  const [its, locs, ops, bals] = await withTenant(tid, async (tx) => {
    await ensureSetup(tx, tid);
    return [
      await tx.select({ id: items.id, code: items.code, name: items.name, unit: items.unit }).from(items).where(eq(items.active, true)).orderBy(asc(items.code)),
      await tx.select({ id: stockLocations.id, name: stockLocations.name, def: stockLocations.isDefault }).from(stockLocations).where(eq(stockLocations.active, true)).orderBy(desc(stockLocations.isDefault), asc(stockLocations.name)),
      // ordens em aberto (fora da etapa final)
      await tx.select({ id: productionOrders.id, number: productionOrders.number, item: items.name }).from(productionOrders)
        .innerJoin(items, eq(items.id, productionOrders.itemId)).innerJoin(productionStages, eq(productionStages.id, productionOrders.stageId))
        .where(and(eq(productionStages.isFinal, false))).orderBy(desc(productionOrders.number)).limit(300),
      sp.item ? await tx.select({ name: stockLocations.name, q: stockBalances.quantity }).from(stockBalances)
        .innerJoin(stockLocations, eq(stockLocations.id, stockBalances.locationId))
        .where(and(eq(stockBalances.itemId, sp.item.slice(0, 64)), sql`${stockBalances.quantity} > 0`)) : [],
    ] as const;
  });
  const back = sp.voltar && /^\/[a-z0-9/_-]*$/i.test(sp.voltar) ? sp.voltar : undefined;
  const sel = its.find((i) => i.id === sp.item);
  return (
    <>
      <div className="ph"><div><Link className="back" href={back ?? "/estoque"}>‹ {back ? "Voltar" : "Posição de estoque"}</Link>
        <h1>{tipo === "ENTRADA" ? "Entrada de estoque" : "Saída de estoque"}</h1>
        <p>{tipo === "ENTRADA" ? "Compras, devoluções, produção concluída ou acertos de inventário." : "Retirada de material para uma ordem de produção, consumo interno, expedição ou acertos."}</p></div>
        <div className="acts seg" role="group" aria-label="Tipo">
          <Link className={`btn btn-sm${tipo === "ENTRADA" ? " on" : ""}`} href={`?${new URLSearchParams({ ...sp, tipo: "ENTRADA" })}`}>Entrada</Link>
          <Link className={`btn btn-sm${tipo === "SAIDA" ? " on" : ""}`} href={`?${new URLSearchParams({ ...sp, tipo: "SAIDA" })}`}>Saída</Link>
        </div></div>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)" }}>
        <section className="panel"><div className="pb">
          <Form action={moveStockAction}>
            <Hidden name="tipo" value={tipo} />
            {back && <Hidden name="voltar" value={back} />}
            <Field name="item" label="Item" required full options={its.map((i) => [i.id, `${i.code} — ${i.name} (${i.unit})`] as const)} emptyOption="Escolha o item" defaultValue={sp.item} />
            <Field name="local" label="Local de estoque" required options={locs.map((l) => [l.id, l.name] as const)} defaultValue={sp.local ?? locs.find((l) => l.def)?.id ?? locs[0]?.id} />
            <Field name="quantidade" label={`Quantidade${sel ? ` (${sel.unit})` : ""}`} required placeholder="0" />
            <Field name="op" label={tipo === "SAIDA" ? "Para a ordem de produção" : "Produzido pela ordem de produção"} options={ops.map((o) => [o.id, `${opNumber(o.number)} — ${o.item}`] as const)}
              emptyOption="Nenhuma (movimentação avulsa)" defaultValue={sp.op} hint={tipo === "SAIDA" ? "Informe a OP para o material contar como retirado para ela." : "Use para dar entrada no produto fabricado."} />
            {tipo === "ENTRADA" ? <Field name="custo" label="Custo unitário (R$)" placeholder="Usa o custo do item" /> : <Hidden name="custo" value="" />}
            <Field name="documento" label="Documento" placeholder="NF, requisição…" maxLength={60} />
            <Field name="observacao" label="Observação" type="textarea" full maxLength={300} />
            <div className="full form-foot"><Link className="btn" href={back ?? "/estoque"}>Cancelar</Link><Submit pending="Registrando…">{tipo === "ENTRADA" ? "Registrar entrada" : "Registrar saída"}</Submit></div>
          </Form>
        </div></section>
        <aside className="panel"><h2>{sel ? `Saldo de ${sel.code}` : "Saldo do item"}</h2><div className="pb">
          {!sel ? <p className="muted" style={{ margin: 0 }}>Abra esta tela pela linha do item na posição de estoque para ver o saldo por local.</p>
            : bals.length ? <div className="tbl solo"><table><tbody>{bals.map((b) => <tr key={b.name}><td>{b.name}</td><td className="num"><b>{fmtQty(b.q)}</b> {sel.unit}</td></tr>)}</tbody></table></div>
              : <p className="muted" style={{ margin: 0 }}>Sem saldo em nenhum local.</p>}
        </div></aside>
      </div>
    </>
  );
}
