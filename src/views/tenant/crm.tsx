import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import * as E from "@/db/erp";
import { BtnLink, Empty, Kpi, PageHead, StatusBadge } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar } from "@/components/client";
import { Icon } from "@/components/Icon";
import { CrmBoard, type Deal } from "@/components/CrmBoard";
import { Activities, DealEditButton } from "@/components/CrmDeal";
import { Attachments } from "@/components/Attachments";
import { deleteDealAction, proposalFromDealAction } from "@/server/crm-actions";
import { loadAttachments } from "@/server/common";
import { fmtMoney } from "@/lib/format";
import { addDays, fmtD, today } from "@/lib/dates";
import { CRM_SOURCES, SO_STATUS } from "@/lib/consts";

type SP = Record<string, string | undefined>;

async function lookups(s: PageCtx) {
  const [stages, clients] = await s.tx(async (tx) => [
    await tx.select().from(E.crmStages).orderBy(asc(E.crmStages.position)),
    await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners).where(sql`'Cliente' = any(${E.partners.kinds}) and ${E.partners.active}`).orderBy(sql`2`),
  ] as const);
  const owners = await db.select({ id: users.id, n: users.name }).from(users).where(and(eq(users.tenantId, s.tenant.id), eq(users.status, "ACTIVE"))).orderBy(asc(users.name));
  return {
    stages: stages.map((x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind })),
    clients: clients.map((c) => [c.id, c.n] as [string, string]), owners: owners.map((u) => [u.id, u.n] as [string, string]),
    ownerName: new Map(owners.map((u) => [u.id, u.n])),
  };
}

export async function CrmPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("comercial");
  const sp = await searchParams;
  const mode = sp.modo === "lista" || sp.modo === "atividades" ? sp.modo : "quadro";
  const L = await lookups(s);
  const c: SQL[] = [eq(E.crmDeals.tenantId, s.tenant.id)];
  if (sp.q) { const q = `%${sp.q.trim()}%`; c.push(or(ilike(E.crmDeals.title, q), ilike(E.crmDeals.leadName, q), ilike(E.crmDeals.leadCompany, q), ilike(E.partners.name, q), ilike(E.partners.tradeName, q))!); }
  if (sp.resp) c.push(eq(E.crmDeals.ownerId, sp.resp));
  if (sp.origem) c.push(eq(E.crmDeals.source, sp.origem));
  if (sp.cli) c.push(eq(E.crmDeals.partnerId, sp.cli));
  // oportunidades encerradas há mais de 90 dias saem do quadro (continuam na lista)
  if (mode === "quadro" && !sp.antigas) c.push(sql`(${E.crmDeals.closedAt} is null or ${E.crmDeals.closedAt} >= ${addDays(today(), -90)})`);
  const d = await s.tx(async (tx) => {
    const rows = await tx.select({ d: E.crmDeals, p: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})`,
      pend: sql<number>`(select count(*)::int from crm_activities a where a.deal_id = "crm_deals"."id" and not a.done)` })
      .from(E.crmDeals).leftJoin(E.partners, eq(E.partners.id, E.crmDeals.partnerId)).where(and(...c)).orderBy(asc(E.crmDeals.expectedClose), desc(E.crmDeals.number));
    const acts = mode === "atividades" ? await tx.select({ a: E.crmActivities, deal: E.crmDeals.title, dn: E.crmDeals.number, dealId: E.crmDeals.id }).from(E.crmActivities)
      .leftJoin(E.crmDeals, eq(E.crmDeals.id, E.crmActivities.dealId)).where(eq(E.crmActivities.done, false)).orderBy(asc(E.crmActivities.dueDate)) : [];
    return { rows, acts };
  });
  const deals: Deal[] = d.rows.map(({ d: x, p, pend }) => ({ id: x.id, number: x.number, title: x.title, partnerId: x.partnerId, partner: p, leadName: x.leadName, leadCompany: x.leadCompany, leadPhone: x.leadPhone, leadEmail: x.leadEmail,
    stageId: x.stageId, value: Number(x.value), expectedClose: x.expectedClose, ownerId: x.ownerId, owner: x.ownerId ? L.ownerName.get(x.ownerId) ?? null : null, source: x.source, notes: x.notes, lostReason: x.lostReason, pending: pend }));
  const kind = (id: string) => L.stages.find((x) => x.id === id)?.kind;
  const open = deals.filter((x) => kind(x.stageId) === "aberta");
  const mesIni = today().slice(0, 8) + "01";
  const won = d.rows.filter((r) => kind(r.d.stageId) === "ganha" && (r.d.closedAt ?? "") >= mesIni);
  const closed = d.rows.filter((r) => r.d.closedAt && r.d.closedAt >= addDays(today(), -90));
  const rate = closed.length ? (closed.filter((r) => kind(r.d.stageId) === "ganha").length / closed.length) * 100 : null;
  const hoje = today();
  const link = (m: string) => `/crm?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "modo" && k !== "novo") as [string, string][]), ...(m !== "quadro" ? { modo: m } : {}) })}`;
  return (
    <>
      <PageHead title="CRM" sub="Funil de vendas: oportunidades por etapa, próximas atividades e propostas geradas a partir delas."
        actions={<>
          <div className="tabs" role="group" aria-label="Modo de visualização">
            <Link href={link("quadro")} className="btn btn-ghost btn-sm" aria-current={mode === "quadro" ? "page" : undefined} style={mode === "quadro" ? { background: "var(--surface)", fontWeight: 700 } : undefined}><Icon name="board" size={15} /> Funil</Link>
            <Link href={link("lista")} className="btn btn-ghost btn-sm" style={mode === "lista" ? { background: "var(--surface)", fontWeight: 700 } : undefined}><Icon name="list" size={15} /> Lista</Link>
            <Link href={link("atividades")} className="btn btn-ghost btn-sm" style={mode === "atividades" ? { background: "var(--surface)", fontWeight: 700 } : undefined}><Icon name="clock" size={15} /> Atividades</Link>
          </div>
          {s.edit && <BtnLink href="/crm?novo=1" primary icon="plus">Nova oportunidade</BtnLink>}
        </>} />
      <div className="kpis k4" style={{ marginBottom: 14 }}>
        <Kpi value={open.length} label="Oportunidades abertas" />
        <Kpi value={fmtMoney(open.reduce((a, x) => a + x.value, 0))} label="Valor no funil" />
        <Kpi value={fmtMoney(won.reduce((a, r) => a + Number(r.d.value), 0))} label="Ganho no mês" />
        <Kpi value={rate == null ? "—" : `${rate.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`} label="Taxa de conversão (90 dias)" />
      </div>
      <FilterBar solo={mode === "quadro"} right={<span className="count">{deals.length} oportunidades</span>}>
        {mode !== "quadro" && <input type="hidden" name="modo" value={mode} />}
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Título, cliente ou contato" aria-label="Buscar" /></div>
        <select name="resp" defaultValue={sp.resp ?? ""} aria-label="Responsável"><option value="">Todos os responsáveis</option>{L.owners.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="origem" defaultValue={sp.origem ?? ""} aria-label="Origem"><option value="">Todas as origens</option>{CRM_SOURCES.map((x) => <option key={x}>{x}</option>)}</select>
        <select name="cli" defaultValue={sp.cli ?? ""} aria-label="Cliente" style={{ maxWidth: 220 }}><option value="">Todos os clientes</option>{L.clients.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {mode === "quadro" && <label className="chk"><input type="checkbox" name="antigas" value="1" defaultChecked={!!sp.antigas} /> Incluir encerradas antigas</label>}
      </FilterBar>
      {mode === "quadro" ? (
        L.stages.length ? <CrmBoard stages={L.stages} deals={deals} clients={L.clients} owners={L.owners} canEdit={s.edit} openNew={sp.novo === "1"} newClient={sp.cliente} />
          : <div className="panel"><Empty title="Cadastre as etapas do funil"><BtnLink href="/comercial/configuracoes/crm" primary>Configurar etapas</BtnLink></Empty></div>
      ) : mode === "lista" ? (
        <div className="tbl">
          {deals.length ? (
            <table><thead><tr><th className="num">Nº</th><th>Oportunidade</th><th>Cliente ou contato</th><th>Etapa</th><th className="num">Valor</th><th>Previsão</th><th>Responsável</th><th>Origem</th><th className="num">Pendências</th></tr></thead>
              <tbody>{deals.map((x) => { const st = L.stages.find((y) => y.id === x.stageId); return (
                <ClickRow key={x.id} href={`/crm/${x.id}`}><td className="num"><b>{x.number}</b></td><td className="desc">{x.title}</td><td>{x.partner ?? x.leadCompany ?? x.leadName ?? "—"}</td>
                  <td>{st && <StatusBadge color={st.color} label={st.name} />}</td><td className="num">{fmtMoney(x.value)}</td>
                  <td className={`code${x.expectedClose && x.expectedClose < hoje && st?.kind === "aberta" ? " t-bad" : ""}`}>{fmtD(x.expectedClose)}</td><td>{x.owner ?? "—"}</td><td>{x.source ?? "—"}</td><td className="num">{x.pending || "—"}</td></ClickRow>); })}</tbody></table>
          ) : <Empty title="Nenhuma oportunidade">Crie a primeira oportunidade.</Empty>}
        </div>
      ) : (
        <div className="tbl">
          {d.acts.length ? (
            <table><thead><tr><th>Data</th><th>Tipo</th><th>Atividade</th><th>Oportunidade</th><th>Quem registrou</th></tr></thead>
              <tbody>{d.acts.map(({ a, deal, dn, dealId }) => (
                <ClickRow key={a.id} href={dealId ? `/crm/${dealId}` : "/crm"}><td className={`code${a.dueDate && a.dueDate < hoje ? " t-bad" : ""}`}>{fmtD(a.dueDate)}</td><td>{a.type}</td><td className="desc">{a.subject}</td><td>{deal ? `#${dn} · ${deal}` : "—"}</td><td>{a.ownerName}</td></ClickRow>))}</tbody></table>
          ) : <Empty title="Nenhuma atividade pendente">Tudo em dia.</Empty>}
        </div>
      )}
    </>
  );
}

export async function CrmDealPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("comercial");
  const { id } = await params;
  const L = await lookups(s);
  const d = await s.tx(async (tx) => {
    const [x] = await tx.select().from(E.crmDeals).where(eq(E.crmDeals.id, id)).limit(1);
    if (!x) return null;
    const [p] = x.partnerId ? await tx.select().from(E.partners).where(eq(E.partners.id, x.partnerId)) : [];
    const acts = await tx.select().from(E.crmActivities).where(eq(E.crmActivities.dealId, id)).orderBy(asc(E.crmActivities.dueDate));
    const [so] = x.salesOrderId ? await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, x.salesOrderId)) : [];
    const files = await loadAttachments(tx, "crm_deal", id);
    return { x, p, acts, so, files };
  });
  if (!d) notFound();
  const { x, p, so } = d;
  const st = L.stages.find((y) => y.id === x.stageId);
  const deal: Deal = { id: x.id, number: x.number, title: x.title, partnerId: x.partnerId, partner: p ? p.tradeName || p.name : null, leadName: x.leadName, leadCompany: x.leadCompany, leadPhone: x.leadPhone, leadEmail: x.leadEmail,
    stageId: x.stageId, value: Number(x.value), expectedClose: x.expectedClose, ownerId: x.ownerId, owner: x.ownerId ? L.ownerName.get(x.ownerId) ?? null : null, source: x.source, notes: x.notes, lostReason: x.lostReason, pending: 0 };
  return (
    <>
      <PageHead title={x.title} sub={`Oportunidade #${x.number}`} back={{ href: "/crm", label: "CRM" }}
        actions={s.edit && <>
          <DealEditButton deal={deal} stages={L.stages} clients={L.clients} owners={L.owners} />
          {so ? <BtnLink href={`/pedidos/${so.id}`} icon="doc">Ver proposta {so.number}</BtnLink>
            : <ActionButton className="btn btn-primary" action={proposalFromDealAction.bind(null, x.id)}><Icon name="doc" size={16} /> Gerar proposta de venda</ActionButton>}
          <ActionButton className="btn btn-danger" confirm="Excluir esta oportunidade e as atividades dela?" action={deleteDealAction.bind(null, x.id)}><Icon name="trash" size={16} /></ActionButton>
        </>}>
        <div className="tl" style={{ marginTop: 6 }}>{st && <StatusBadge color={st.color} label={st.name} />}{so && <StatusBadge color={SO_STATUS[so.status]?.color ?? "#6B7785"} label={`Proposta ${so.number} · ${SO_STATUS[so.status]?.label}`} />}</div>
      </PageHead>
      <div className="sheet">
        <div className="grid2">
          <section className="panel"><h2>Oportunidade</h2><div className="pb">
            <dl className="kv">
              <dt>Valor estimado</dt><dd>{fmtMoney(x.value)}</dd>
              <dt>Previsão de fechamento</dt><dd>{fmtD(x.expectedClose)}</dd>
              <dt>Responsável</dt><dd>{deal.owner ?? "—"}</dd>
              <dt>Origem</dt><dd>{x.source ?? "—"}</dd>
              {x.closedAt && <><dt>Encerrada em</dt><dd>{fmtD(x.closedAt)}</dd></>}
              {x.lostReason && <><dt>Motivo da perda</dt><dd>{x.lostReason}</dd></>}
            </dl>
            {x.notes && <p style={{ whiteSpace: "pre-wrap", margin: "12px 0 0", fontSize: 13.5 }}>{x.notes}</p>}
          </div></section>
          <section className="panel"><h2>{p ? "Cliente" : "Contato"}</h2><div className="pb">
            {p ? <dl className="kv"><dt>Cliente</dt><dd><Link href={`/clientes/${p.id}`}>{p.tradeName || p.name}</Link></dd><dt>CNPJ/CPF</dt><dd>{p.document ?? "—"}</dd><dt>Telefone</dt><dd>{p.phone || p.mobile1 || "—"}</dd><dt>E-mail</dt><dd>{p.email ?? "—"}</dd><dt>Cidade</dt><dd>{p.city ? `${p.city}/${p.uf ?? ""}` : "—"}</dd></dl>
              : <dl className="kv"><dt>Empresa</dt><dd>{x.leadCompany ?? "—"}</dd><dt>Contato</dt><dd>{x.leadName ?? "—"}</dd><dt>Telefone</dt><dd>{x.leadPhone ?? "—"}</dd><dt>E-mail</dt><dd>{x.leadEmail ?? "—"}</dd></dl>}
            {!p && <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>Ao gerar a proposta, o contato é cadastrado como cliente.</p>}
          </div></section>
        </div>
        <Activities dealId={x.id} partnerId={x.partnerId} canEdit={s.edit} rows={d.acts.map((a) => ({ id: a.id, type: a.type, subject: a.subject, dueDate: a.dueDate, done: a.done, ownerName: a.ownerName, notes: a.notes }))} />
        <Attachments entity="crm_deal" entityId={x.id} rows={d.files} canEdit={s.edit} />
      </div>
    </>
  );
}
