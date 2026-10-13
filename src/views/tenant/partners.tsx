import { notFound } from "next/navigation";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import * as E from "@/db/erp";
import { Active, BtnLink, Empty, PageHead, Pager, pageLink, Panel, StatusBadge, UFS } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar, FilterTabs } from "@/components/client";
import { Icon } from "@/components/Icon";
import { PartnerForm } from "@/components/PartnerForm";
import { Contacts, Notes } from "@/components/PartnerPanels";
import { Attachments } from "@/components/Attachments";
import { deletePartnerAction } from "@/server/partner-actions";
import { loadAttachments } from "@/server/common";
import { onlyDigits } from "@/lib/doc";
import { fmtMoney } from "@/lib/format";
import { fmtD, today } from "@/lib/dates";
import { SO_STATUS } from "@/lib/consts";

const PAGE = 60;
type SP = Record<string, string | undefined>;
const TABS = [["", "Todos"], ["Cliente", "Clientes"], ["Fornecedor", "Fornecedores"], ["Transportadora", "Transportadoras"], ["Prestador de serviço", "Prestadores"]] as const;

/** Comercial › Clientes e fornecedores, ou Compras › Fornecedores (mesmo cadastro, já filtrado em fornecedor). */
type Area = "comercial" | "compras";
const BASE: Record<Area, string> = { comercial: "/clientes", compras: "/compras/fornecedores" };

export async function PartnersList({ searchParams, area = "comercial" }: { searchParams: Promise<SP>; area?: Area }) {
  const s = await page(area);
  const sp = { ...(await searchParams) };
  if (area === "compras" && sp.tipo === undefined) sp.tipo = "Fornecedor";
  const base0 = BASE[area];
  const pg = Math.max(1, Number(sp.p) || 1);
  const conds: SQL[] = [eq(E.partners.tenantId, s.tenant.id)];
  const like = (v: string) => `%${v.trim()}%`;
  if (sp.q) conds.push(or(ilike(E.partners.name, like(sp.q)), ilike(E.partners.tradeName, like(sp.q)))!);
  if (sp.doc) { const d = onlyDigits(sp.doc); if (d) conds.push(sql`regexp_replace(coalesce(${E.partners.document}, ''), '\\D', '', 'g') like ${"%" + d + "%"}`); }
  if (sp.cidade) conds.push(ilike(E.partners.city, like(sp.cidade)));
  if (sp.uf) conds.push(eq(E.partners.uf, sp.uf));
  if (sp.perfil) conds.push(eq(E.partners.profileId, sp.perfil));
  if (sp.vend) conds.push(eq(E.partners.salespersonId, sp.vend));
  if (sp.sit === "inativos") conds.push(eq(E.partners.active, false)); else if (sp.sit !== "todos") conds.push(eq(E.partners.active, true));
  if (sp.contato) conds.push(or(ilike(E.partners.email, like(sp.contato)), ilike(E.partners.phone, like(sp.contato)), ilike(E.partners.mobile1, like(sp.contato)), ilike(E.partners.mobile2, like(sp.contato)))!);
  const base = and(...conds);
  const where = sp.tipo ? and(base, sql`${sp.tipo} = any(${E.partners.kinds})`) : base;
  const d = await s.tx(async (tx) => {
    const rows = await tx.select({ p: E.partners, perf: E.partnerProfiles.name, cor: E.partnerProfiles.color }).from(E.partners)
      .leftJoin(E.partnerProfiles, eq(E.partnerProfiles.id, E.partners.profileId)).where(where).orderBy(asc(E.partners.name)).limit(PAGE).offset((pg - 1) * PAGE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(E.partners).where(where);
    const counts = await tx.select({ k: sql<string>`unnest(${E.partners.kinds})`, n: sql<number>`count(*)::int` }).from(E.partners).where(base).groupBy(sql`1`);
    const [{ all }] = await tx.select({ all: sql<number>`count(*)::int` }).from(E.partners).where(base);
    const profiles = await tx.select({ id: E.partnerProfiles.id, n: E.partnerProfiles.name }).from(E.partnerProfiles).orderBy(asc(E.partnerProfiles.name));
    return { rows, total, counts, all, profiles };
  });
  const sellers = await s.tx((tx) => tx.select({ id: E.salespeople.id, n: E.salespeople.name }).from(E.salespeople).orderBy(asc(E.salespeople.name)));
  const cnt = (k: string) => (k ? d.counts.find((c) => c.k === k)?.n ?? 0 : d.all);
  const moreActive = ["vend", "contato"].filter((k) => sp[k]).length;
  return (
    <>
      <PageHead title={area === "compras" ? "Fornecedores" : "Clientes e fornecedores"}
        sub={area === "compras" ? "É o mesmo cadastro de clientes do Comercial, já filtrado nos fornecedores. Um cadastro pode ser cliente e fornecedor ao mesmo tempo." : "Um cadastro único. Marque todos os papéis que a empresa ou pessoa tem com a fábrica."}
        actions={s.edit && <BtnLink href={`${base0}/novo${sp.tipo ? `?tipo=${encodeURIComponent(sp.tipo)}` : ""}`} primary icon="plus">{area === "compras" ? "Novo fornecedor" : "Novo cadastro"}</BtnLink>} />
      <FilterBar moreActive={moreActive} right={<span className="count">{d.total} cadastros</span>}
        tabs={<FilterTabs name="tipo" value={sp.tipo ?? ""} options={TABS.map(([v, l]) => ({ v, label: l, n: cnt(v) }))} />}
        more={<>
          <select name="vend" defaultValue={sp.vend ?? ""} aria-label="Vendedor"><option value="">Todos os vendedores</option>{sellers.map((u) => <option key={u.id} value={u.id}>{u.n}</option>)}</select>
          <label className="fl">E-mail ou telefone <input type="text" name="contato" defaultValue={sp.contato ?? ""} /></label>
        </>}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Nome ou nome fantasia" aria-label="Nome" /></div>
        <input type="text" name="doc" defaultValue={sp.doc ?? ""} placeholder="CNPJ ou CPF" aria-label="CNPJ ou CPF" style={{ width: 170 }} />
        <input type="text" name="cidade" defaultValue={sp.cidade ?? ""} placeholder="Cidade" aria-label="Cidade" style={{ width: 150 }} />
        <select name="uf" defaultValue={sp.uf ?? ""} aria-label="UF"><option value="">Todas as UFs</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
        <select name="perfil" defaultValue={sp.perfil ?? ""} aria-label="Perfil"><option value="">Todos os perfis</option>{d.profiles.map((p) => <option key={p.id} value={p.id}>{p.n}</option>)}</select>
        <select name="sit" defaultValue={sp.sit ?? ""} aria-label="Situação"><option value="">Ativos</option><option value="inativos">Inativos</option><option value="todos">Ativos e inativos</option></select>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table>
            <thead><tr><th>Nome</th><th>Tipo</th><th>CNPJ/CPF</th><th>Cidade</th><th>Telefone</th><th>E-mail</th><th>Situação</th></tr></thead>
            <tbody>{d.rows.map(({ p, perf, cor }) => (
              <ClickRow key={p.id} href={`${base0}/${p.id}`} style={!p.active ? { opacity: 0.6 } : undefined}>
                <td className="desc">{p.tradeName || p.name}{p.tradeName && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{p.name}</div>}</td>
                <td><span className="badges">{p.kinds.map((k) => <span key={k} className="badge">{k}</span>)}</span>
                  {perf && <div className="t-sub"><span className="sdot" style={{ background: cor ?? "#6B7785" }} />{perf}</div>}</td>
                <td className="code">{p.document || "—"}</td><td>{p.city ? `${p.city}/${p.uf ?? ""}` : "—"}</td>
                <td>{p.phone || p.mobile1 || "—"}</td><td>{p.email || "—"}</td><td><Active on={p.active} /></td>
              </ClickRow>))}</tbody>
          </table>
        ) : <Empty title="Nenhum cadastro neste filtro">Ajuste a busca ou os filtros.</Empty>}
        <Pager page={pg} pages={Math.max(1, Math.ceil(d.total / PAGE))} qs={pageLink(sp)} />
      </div>
    </>
  );
}

async function options(s: PageCtx) {
  const profiles = await s.tx((tx) => tx.select({ id: E.partnerProfiles.id, n: E.partnerProfiles.name }).from(E.partnerProfiles).where(eq(E.partnerProfiles.active, true)).orderBy(asc(E.partnerProfiles.name)));
  const sellers = await s.tx((tx) => tx.select({ id: E.salespeople.id, n: E.salespeople.name }).from(E.salespeople).where(eq(E.salespeople.active, true)).orderBy(asc(E.salespeople.name)));
  return { profiles: profiles.map((p) => [p.id, p.n] as const), sellers: sellers.map((u) => [u.id, u.n] as const) };
}

export async function PartnerNew({ searchParams, area = "comercial" }: { searchParams: Promise<SP>; area?: Area }) {
  const s = await page(area, { edit: true });
  const sp = await searchParams;
  const base0 = BASE[area];
  const o = await options(s);
  return (
    <>
      <PageHead title={area === "compras" ? "Novo fornecedor" : "Novo cadastro"} back={{ href: base0, label: area === "compras" ? "Fornecedores" : "Clientes e fornecedores" }} />
      <div className="sheet">
        <PartnerForm {...o} canEdit defaultKind={sp.tipo ?? (area === "compras" ? "Fornecedor" : undefined)} base={base0} />
        <div className="lock-note"><Icon name="lock" size={16} /> Anotações, contatos e anexos ficam disponíveis depois de salvar o cadastro.</div>
      </div>
    </>
  );
}

export async function PartnerEdit({ params, area = "comercial" }: { params: Promise<{ id: string }>; area?: Area }) {
  const s = await page(area);
  const base0 = BASE[area];
  const { id } = await params;
  const o = await options(s);
  const d = await s.tx(async (tx) => {
    const [p] = await tx.select().from(E.partners).where(eq(E.partners.id, id)).limit(1);
    if (!p) return null;
    const contacts = await tx.select().from(E.partnerContacts).where(eq(E.partnerContacts.partnerId, id)).orderBy(desc(E.partnerContacts.isPrimary), asc(E.partnerContacts.name));
    const notes = await tx.select().from(E.partnerNotes).where(eq(E.partnerNotes.partnerId, id)).orderBy(desc(E.partnerNotes.createdAt));
    const files = await loadAttachments(tx, "partner", id);
    const [sum] = await tx.select({
      pedidos: sql<number>`count(*) filter (where ${E.salesOrders.status} in ('APROVADO','FATURADO'))::int`,
      total: sql<string>`coalesce(sum(${E.salesOrders.total}) filter (where ${E.salesOrders.status} in ('APROVADO','FATURADO')), 0)::text`,
      ultima: sql<string | null>`max(${E.salesOrders.issueDate}) filter (where ${E.salesOrders.status} in ('APROVADO','FATURADO'))::text`,
      propostas: sql<number>`count(*) filter (where ${E.salesOrders.status} = 'PROPOSTA')::int`,
    }).from(E.salesOrders).where(eq(E.salesOrders.partnerId, id));
    const [fin] = await tx.select({
      aberto: sql<string>`coalesce(sum(${E.finTitles.amount}) filter (where ${E.finTitles.status} = 'ABERTO' and ${E.finTitles.kind} = 'RECEBER'), 0)::text`,
      vencido: sql<string>`coalesce(sum(${E.finTitles.amount}) filter (where ${E.finTitles.status} = 'ABERTO' and ${E.finTitles.kind} = 'RECEBER' and ${E.finTitles.dueDate} < ${today()}), 0)::text`,
      pagar: sql<string>`coalesce(sum(${E.finTitles.amount}) filter (where ${E.finTitles.status} = 'ABERTO' and ${E.finTitles.kind} = 'PAGAR'), 0)::text`,
    }).from(E.finTitles).where(eq(E.finTitles.partnerId, id));
    const recent = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.partnerId, id)).orderBy(desc(E.salesOrders.number)).limit(6);
    return { p, contacts, notes, files, sum, fin, recent };
  });
  if (!d) notFound();
  const { p } = d;
  const isClient = p.kinds.includes("Cliente");
  return (
    <>
      <PageHead title={p.tradeName || p.name} sub={[p.tradeName ? p.name : null, p.document, p.city ? `${p.city}/${p.uf ?? ""}` : null].filter(Boolean).join(" · ")} back={{ href: base0, label: area === "compras" ? "Fornecedores" : "Clientes e fornecedores" }}
        actions={<>
          {isClient && <BtnLink href={`/pedidos/novo?cliente=${p.id}`} icon="doc">Nova proposta</BtnLink>}
          {s.edit && <ActionButton className="btn btn-danger" confirm="Excluir este cadastro? Cadastros com pedidos, notas ou contas não podem ser excluídos." action={deletePartnerAction.bind(null, p.id, base0)}><Icon name="trash" size={16} /> Excluir</ActionButton>}
        </>} />
      {isClient && (
        <div className="kpis k6" style={{ marginBottom: 16 }}>
          <div className="kpi"><b>{d.sum.pedidos}</b><span>Pedidos fechados</span></div>
          <div className="kpi"><b style={{ fontSize: 20 }}>{fmtMoney(d.sum.total)}</b><span>Total comprado</span></div>
          <div className="kpi"><b style={{ fontSize: 20 }}>{fmtD(d.sum.ultima)}</b><span>Última compra</span></div>
          <div className="kpi"><b>{d.sum.propostas}</b><span>Propostas em aberto</span></div>
          <div className="kpi"><b style={{ fontSize: 20 }}>{fmtMoney(d.fin.aberto)}</b><span>A receber em aberto</span></div>
          <div className={`kpi${Number(d.fin.vencido) > 0 ? " alert" : ""}`}><b style={{ fontSize: 20 }}>{fmtMoney(d.fin.vencido)}</b><span>Vencido</span></div>
        </div>
      )}
      <div className="sheet">
        <PartnerForm p={p} {...o} canEdit={s.edit} base={base0} />
        <Notes partnerId={p.id} canEdit={s.edit} rows={d.notes.map((n) => ({ id: n.id, body: n.body, userName: n.userName, createdAt: n.createdAt.toISOString() }))} />
        <Contacts partnerId={p.id} canEdit={s.edit} rows={d.contacts} />
        <Attachments entity="partner" entityId={p.id} rows={d.files} canEdit={s.edit} />
        {isClient && (
          <Panel title="Histórico comercial">
            {d.recent.length ? (
              <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>
                <table><thead><tr><th className="num">Nº</th><th>Emissão</th><th>Entrega</th><th className="num">Total</th><th>Situação</th></tr></thead>
                  <tbody>{d.recent.map((o2) => (
                    <ClickRow key={o2.id} href={`/pedidos/${o2.id}`}><td className="num"><b>{o2.number}</b></td><td className="code">{fmtD(o2.issueDate)}</td><td className="code">{fmtD(o2.deliveryDate)}</td>
                      <td className="num">{fmtMoney(o2.total)}</td><td><StatusBadge color={SO_STATUS[o2.status]?.color ?? "#6B7785"} label={SO_STATUS[o2.status]?.label ?? o2.status} /></td></ClickRow>))}</tbody></table>
              </div>
            ) : <div className="pb muted" style={{ fontSize: 13 }}>Nenhuma proposta ou pedido ainda.</div>}
          </Panel>
        )}
      </div>
    </>
  );
}
