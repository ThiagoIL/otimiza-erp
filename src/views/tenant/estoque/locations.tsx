import Link from "next/link";
import { asc, desc, sql } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { items, stockBalances, stockLocations } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtMoney } from "@/lib/format";
import { Check, Field, Form, Hidden, Submit } from "@/components/Form";
import { deleteLocationAction, saveLocationAction } from "@/server/stock-actions";
import { ensureSetup } from "@/server/stock";
import { col } from "@/lib/sql";

export async function StockLocations() {
  const s = await requireTenantUser();
  const tid = s.tenant.id;
  const rows = await withTenant(tid, async (tx) => {
    await ensureSetup(tx, tid);
    return tx.select({
      l: stockLocations,
      itens: sql<number>`(select count(*)::int from ${stockBalances} where ${col(stockBalances.locationId)} = ${col(stockLocations.id)} and ${col(stockBalances.quantity)} > 0)`,
      valor: sql<string>`(select coalesce(sum(${col(stockBalances.quantity)} * ${col(items.cost)}), 0) from ${stockBalances} join ${items} on ${col(items.id)} = ${col(stockBalances.itemId)} where ${col(stockBalances.locationId)} = ${col(stockLocations.id)})`,
    }).from(stockLocations).orderBy(desc(stockLocations.isDefault), asc(stockLocations.name));
  });
  const admin = s.user.role === "TENANT_ADMIN";
  return (
    <>
      <div className="ph"><div><h1>Locais de estoque</h1><p>Almoxarifados, depósitos e áreas onde os itens ficam guardados. O local padrão já vem escolhido nas entradas e saídas.</p></div></div>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)" }}>
        <div className="tbl solo">
          <table><thead><tr><th>Local</th><th className="num">Itens com saldo</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
            <tbody>{rows.map(({ l, itens, valor }) => (
              <tr key={l.id}>
                <td><Link className="row-link" href={`/estoque?local=${l.id}`}>{l.name}</Link>{l.isDefault && <> <span className="badge brand">Padrão</span></>}{l.description && <small className="sub">{l.description}</small>}</td>
                <td className="num">{itens}</td><td className="num">{fmtMoney(valor)}</td>
                <td>{l.active ? <span className="badge ok">Ativo</span> : <span className="badge">Inativo</span>}</td>
                <td className="num">
                  <details className="row-edit"><summary className="btn btn-sm">Editar</summary>
                    <div className="row-edit-box">
                      <Form action={saveLocationAction}>
                        <Hidden name="id" value={l.id} />
                        <Field name="nome" label="Nome" defaultValue={l.name} required full />
                        <Field name="descricao" label="Descrição" defaultValue={l.description} full />
                        <Check name="padrao" label="Local padrão" defaultChecked={l.isDefault} />
                        <Check name="ativo" label="Ativo" defaultChecked={l.active} />
                        <div className="full form-foot"><Submit>Salvar</Submit></div>
                      </Form>
                      {admin && <Form action={deleteLocationAction} className="inline-form"><Hidden name="id" value={l.id} /><Submit variant="danger" pending="…" confirm={`Excluir o local ${l.name}?`}>Excluir local</Submit></Form>}
                    </div>
                  </details>
                </td>
              </tr>))}</tbody></table>
        </div>
        <section className="panel"><h2>Novo local</h2><div className="pb">
          <Form action={saveLocationAction}>
            <Field name="nome" label="Nome" placeholder="Ex.: Depósito de chapas" required full />
            <Field name="descricao" label="Descrição" full />
            <Check name="padrao" label="Usar como local padrão" />
            <div className="full form-foot"><Submit pending="Criando…">Adicionar local</Submit></div>
          </Form>
        </div></section>
      </div>
    </>
  );
}
