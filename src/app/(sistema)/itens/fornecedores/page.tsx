import { asc, sql } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { PageHead, Empty, Active, BtnLink } from "@/components/ui";
import { ClickRow, FilterBar } from "@/components/client";
import { Icon } from "@/components/Icon";
import { fmtD } from "@/lib/dates";

/** Fornecedores vistos pelo lado dos itens: quantos itens cada um fornece e a última compra. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await page("itens");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const rows = await s.tx((tx) => tx.select({
    p: E.partners,
    itens: sql<number>`(select count(distinct x.id)::int from items x where x.default_supplier_id = "partners"."id" or exists (select 1 from item_suppliers s where s.item_id = x.id and s.partner_id = "partners"."id"))`,
    ult: sql<string | null>`(select max(o.issue_date)::text from purchase_orders o where o.partner_id = "partners"."id" and o.status <> 'CANCELADO')`,
  }).from(E.partners).where(sql`'Fornecedor' = any(${E.partners.kinds}) ${q ? sql`and (${E.partners.name} ilike ${"%" + q + "%"} or ${E.partners.tradeName} ilike ${"%" + q + "%"} or ${E.partners.document} ilike ${"%" + q + "%"})` : sql``}`)
    .orderBy(asc(E.partners.name)));
  return (
    <>
      <PageHead title="Fornecedores" sub="Quem fornece os itens. O cadastro completo fica em Comercial › Clientes e fornecedores; aqui você vê quantos itens cada um atende."
        actions={<BtnLink href="/clientes/novo?tipo=Fornecedor" primary icon="plus">Novo fornecedor</BtnLink>} />
      <FilterBar right={<span className="count">{rows.length} fornecedores</span>}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={q} placeholder="Nome ou CNPJ" aria-label="Buscar fornecedor" /></div>
      </FilterBar>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>Fornecedor</th><th>CNPJ/CPF</th><th>Cidade</th><th>Telefone</th><th className="num">Itens fornecidos</th><th>Última compra</th><th>Situação</th></tr></thead>
            <tbody>{rows.map(({ p, itens, ult }) => (
              <ClickRow key={p.id} href={`/clientes/${p.id}`} style={!p.active ? { opacity: 0.6 } : undefined}>
                <td className="desc">{p.tradeName || p.name}{p.tradeName && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{p.name}</div>}</td>
                <td className="code">{p.document || "—"}</td><td>{p.city ? `${p.city}/${p.uf ?? ""}` : "—"}</td><td>{p.phone || p.mobile1 || "—"}</td>
                <td className="num">{itens}</td><td className="code">{fmtD(ult)}</td><td><Active on={p.active} /></td>
              </ClickRow>))}</tbody></table>
        ) : <Empty title="Nenhum fornecedor">Cadastre fornecedores em Clientes e fornecedores.</Empty>}
      </div>
    </>
  );
}
