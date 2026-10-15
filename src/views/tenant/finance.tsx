import { and, asc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { Sel } from "@/components/SearchPicker";
import { page, type PageCtx } from "@/lib/access";
import * as E from "@/db/erp";
import { Empty, Kpi, PageHead, Panel } from "@/components/ui";
import { FilterBar, FilterTabs } from "@/components/client";
import { Icon } from "@/components/Icon";
import { BankButtons, DeleteEntryButton, NewTitleButton, PayButton, TitlesTable, type FinOpts } from "@/components/FinanceUI";
import { accountBalances, lookupsFin, weeklyFlow } from "@/server/finance-queries";
import { fmtMoney } from "@/lib/format";
import { addDays, fmtD, fmtDM, isDate, today } from "@/lib/dates";
import { VBars } from "@/components/Charts";

type SP = Record<string, string | undefined>;

async function finOpts(s: PageCtx, kind?: "RECEBER" | "PAGAR"): Promise<FinOpts & { raw: Awaited<ReturnType<typeof lookupsFin>> }> {
  const d = await s.tx(async (tx) => ({
    ...(await lookupsFin(tx)),
    partners: await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners)
      .where(kind ? sql`${kind === "RECEBER" ? "Cliente" : "Fornecedor"} = any(${E.partners.kinds}) or ${kind === "PAGAR" ? sql`'Prestador de serviço' = any(${E.partners.kinds}) or 'Transportadora' = any(${E.partners.kinds})` : sql`false`}` : sql`true`).orderBy(sql`2`),
  }));
  return {
    raw: d, partners: d.partners.map((p) => [p.id, p.n]), categories: d.categories.filter((c) => !kind || c.kind === kind).map((c) => [c.id, c.name]),
    methods: d.methods.map((m) => [m.id, m.n]), accounts: d.accounts.filter((a) => a.active).map((a) => [a.id, a.name]),
    situations: d.situations.filter((x) => x.active).map((x) => [x.id, x.name]), responsibles: d.responsibles.filter((x) => x.active).map((x) => [x.id, x.name]),
  };
}

export async function TitlesPage({ kind, searchParams }: { kind: "RECEBER" | "PAGAR"; searchParams: Promise<SP> }) {
  const s = await page("financeiro");
  const sp = await searchParams;
  const R = kind === "RECEBER";
  const st = sp.st ?? (sp.id ? "todas" : "aberto");
  const hoje = today();
  const o = await finOpts(s, kind);
  const c: SQL[] = [eq(E.finTitles.kind, kind)];
  if (st === "aberto") c.push(eq(E.finTitles.status, "ABERTO"));
  else if (st === "vencido") c.push(sql`${E.finTitles.status} = 'ABERTO' and ${E.finTitles.dueDate} < ${hoje}`);
  else if (st === "pago") c.push(eq(E.finTitles.status, "PAGO"));
  else if (st === "cancelado") c.push(eq(E.finTitles.status, "CANCELADO"));
  if (sp.q) { const q = `%${sp.q.trim()}%`; c.push(or(ilike(E.finTitles.description, q), ilike(E.finTitles.document, q), ilike(E.partners.name, q), ilike(E.partners.tradeName, q))!); }
  if (sp.parc) c.push(eq(E.finTitles.partnerId, sp.parc));
  if (sp.cat) c.push(eq(E.finTitles.categoryId, sp.cat));
  if (sp.de && isDate(sp.de)) c.push(gte(E.finTitles.dueDate, sp.de));
  if (sp.ate && isDate(sp.ate)) c.push(lte(E.finTitles.dueDate, sp.ate));
  if (sp.sit) c.push(eq(E.finTitles.situationId, sp.sit));
  if (sp.resp) c.push(eq(E.finTitles.responsibleId, sp.resp));
  if (sp.forma) c.push(eq(E.finTitles.paymentMethodId, sp.forma));
  if (sp.conta) c.push(eq(E.finTitles.bankAccountId, sp.conta));
  if (sp.origem) c.push(eq(E.finTitles.originType, sp.origem));
  if (sp.pg_de && isDate(sp.pg_de)) c.push(gte(E.finTitles.paidAt, sp.pg_de));
  if (sp.pg_ate && isDate(sp.pg_ate)) c.push(lte(E.finTitles.paidAt, sp.pg_ate));
  if (sp.id) c.length = 1, c.push(eq(E.finTitles.id, sp.id));
  const d = await s.tx(async (tx) => {
    const rows = await tx.select({ t: E.finTitles, p: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.finTitles).leftJoin(E.partners, eq(E.partners.id, E.finTitles.partnerId))
      .where(and(...c)).orderBy(st === "pago" ? sql`${E.finTitles.paidAt} desc` : asc(E.finTitles.dueDate)).limit(1000);
    const mesIni = hoje.slice(0, 8) + "01";
    const [k] = await tx.select({
      aberto: sql<string>`coalesce(sum(amount) filter (where status = 'ABERTO'), 0)::text`,
      vencido: sql<string>`coalesce(sum(amount) filter (where status = 'ABERTO' and due_date < ${hoje}), 0)::text`,
      d30: sql<string>`coalesce(sum(amount) filter (where status = 'ABERTO' and due_date between ${hoje} and ${addDays(hoje, 30)}), 0)::text`,
      mes: sql<string>`coalesce(sum(coalesce(paid_amount, amount)) filter (where status = 'PAGO' and paid_at >= ${mesIni}), 0)::text`,
    }).from(E.finTitles).where(eq(E.finTitles.kind, kind));
    return { rows, k };
  });
  const sit = new Map(o.raw.situations.map((x) => [x.id, x]));
  const cat = new Map(o.raw.categories.map((x) => [x.id, x.name]));
  const resp = new Map(o.raw.responsibles.map((x) => [x.id, x.name]));
  const showPaid = st === "pago" || st === "todas";
  const moreActive = ["sit", "resp", "forma", "conta", "origem", "pg_de", "pg_ate"].filter((x) => sp[x]).length;
  return (
    <>
      <PageHead title={R ? "Contas a receber" : "Contas a pagar"} sub={R ? "Parcelas geradas no faturamento dos pedidos e lançamentos avulsos. Registre o recebimento quando o dinheiro entrar." : "Parcelas geradas no recebimento das compras e despesas da empresa. Registre o pagamento quando sair da conta."}
        actions={<><a className="btn" href={`/api/export/${R ? "fin-receber" : "fin-pagar"}?${new URLSearchParams(Object.entries({ ...sp, st }).filter(([, v]) => v) as [string, string][])}`}><Icon name="download" size={16} /> Exportar CSV</a>{s.edit && <NewTitleButton kind={kind} o={o} />}</>} />
      <div className="kpis k4 money">
        <Kpi value={fmtMoney(d.k.aberto)} label="Em aberto" />
        <Kpi value={fmtMoney(d.k.vencido)} label="Vencido" alert={Number(d.k.vencido) > 0} />
        <Kpi value={fmtMoney(d.k.d30)} label="Vence em 30 dias" />
        <Kpi value={fmtMoney(d.k.mes)} label={R ? "Recebido no mês" : "Pago no mês"} />
      </div>
      <FilterBar moreActive={moreActive} right={<span className="count">{d.rows.length} lançamentos</span>}
        tabs={<FilterTabs name="st" value={st === "aberto" ? "" : st} options={[{ v: "", label: "Em aberto" }, { v: "vencido", label: "Vencidas" }, { v: "pago", label: R ? "Recebidas" : "Pagas" }, { v: "cancelado", label: "Canceladas" }, { v: "todas", label: "Todas" }]} />}
        more={<>
          <Sel name="sit" defaultValue={sp.sit ?? ""} aria-label="Situação"><option value="">Qualquer situação</option>{o.situations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
          <Sel name="resp" defaultValue={sp.resp ?? ""} aria-label="Responsável"><option value="">Qualquer responsável</option>{o.responsibles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
          <Sel name="forma" defaultValue={sp.forma ?? ""} aria-label="Forma"><option value="">Qualquer forma</option>{o.methods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
          <Sel name="conta" defaultValue={sp.conta ?? ""} aria-label="Conta"><option value="">Qualquer conta</option>{o.accounts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
          <select name="origem" defaultValue={sp.origem ?? ""} aria-label="Origem"><option value="">Qualquer origem</option><option value="MANUAL">Lançamento manual</option><option value={R ? "NF" : "PC"}>{R ? "Nota fiscal" : "Pedido de compra"}</option></select>
          <label className="fl">{R ? "Recebido" : "Pago"} de <input type="date" name="pg_de" defaultValue={sp.pg_de ?? ""} /></label>
          <label className="fl">até <input type="date" name="pg_ate" defaultValue={sp.pg_ate ?? ""} /></label>
        </>}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={`Descrição, documento ou ${R ? "cliente" : "fornecedor"}`} aria-label="Buscar" /></div>
        <Sel name="parc" defaultValue={sp.parc ?? ""} aria-label={R ? "Cliente" : "Fornecedor"} style={{ maxWidth: 220 }}><option value="">{R ? "Todos os clientes" : "Todos os fornecedores"}</option>{o.partners.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
        <Sel name="cat" defaultValue={sp.cat ?? ""} aria-label="Categoria"><option value="">Todas as categorias</option>{o.categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
        <label className="fl">Vence de <input type="date" name="de" defaultValue={sp.de ?? ""} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={sp.ate ?? ""} /></label>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <TitlesTable R={R} showPaid={showPaid} canEdit={s.edit} o={o} openId={sp.id}
            rows={d.rows.map(({ t, p }) => ({ id: t.id, kind: kind, description: t.description, document: t.document ?? "", partnerId: t.partnerId ?? "", categoryId: t.categoryId ?? "", issueDate: t.issueDate ?? "", dueDate: t.dueDate,
              amount: Number(t.amount), paymentMethodId: t.paymentMethodId ?? "", situationId: t.situationId ?? "", responsibleId: t.responsibleId ?? "", notes: t.notes ?? "", status: t.status, paidAt: t.paidAt, paidAmount: t.paidAmount == null ? null : Number(t.paidAmount),
              bankAccountId: t.bankAccountId, originType: t.originType, originLabel: t.originType === "NF" ? `NF ${t.originNumber}` : t.originType === "PC" ? `pedido de compra ${t.originNumber}` : "", installment: t.installment,
              partner: p ?? "", category: t.categoryId ? cat.get(t.categoryId) ?? "" : "", situation: t.situationId && sit.get(t.situationId) ? { name: sit.get(t.situationId)!.name, color: sit.get(t.situationId)!.color } : null,
              resp: t.responsibleId ? resp.get(t.responsibleId) ?? "" : "", late: t.status === "ABERTO" && t.dueDate < hoje }))} />
        ) : <Empty title="Nenhum lançamento neste filtro">Ajuste os filtros ou crie um lançamento.</Empty>}
      </div>
    </>
  );
}

export async function CashFlowPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("financeiro");
  const sp = await searchParams;
  const n = [4, 8, 13, 26].includes(Number(sp.n)) ? Number(sp.n) : 8;
  const hoje = today();
  const o = await finOpts(s);
  const d = await s.tx(async (tx) => ({
    flow: await weeklyFlow(tx, n),
    accs: await accountBalances(tx),
    next: await tx.select({ t: E.finTitles, p: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.finTitles).leftJoin(E.partners, eq(E.partners.id, E.finTitles.partnerId))
      .where(eq(E.finTitles.status, "ABERTO")).orderBy(asc(E.finTitles.dueDate)).limit(12),
  }));
  const ws = d.flow.weeks;
  const e = ws.reduce((a, w) => a + w.e, 0), sa = ws.reduce((a, w) => a + w.s, 0);
  const fim = ws[ws.length - 1]?.saldo ?? d.flow.start;
  const minS = Math.min(...ws.map((w) => w.saldo));
  return (
    <>
      <PageHead title="Fluxo de caixa" sub="Saldo atual das contas mais o que está previsto para entrar e sair, semana a semana. Contas vencidas e não pagas entram na primeira semana."
        actions={<FilterBar solo><FilterTabs name="n" value={n === 8 ? "" : String(n)} options={[{ v: "4", label: "4 semanas" }, { v: "", label: "8 semanas" }, { v: "13", label: "3 meses" }, { v: "26", label: "6 meses" }]} /></FilterBar>} />
      <div className="kpis k5 money">
        <Kpi value={fmtMoney(d.flow.start)} label="Saldo em contas hoje" />
        <Kpi value={fmtMoney(e)} label="Entradas previstas" />
        <Kpi value={fmtMoney(sa)} label="Saídas previstas" />
        <Kpi value={fmtMoney(fim)} label="Saldo no fim do período" alert={fim < 0} />
        <Kpi value={fmtMoney(minS)} label="Menor saldo no período" alert={minS < 0} />
      </div>
      <div className="dgrid">
        <Panel className="span2" title="Entradas e saídas previstas" sub="por semana, R$"><div className="pb"><VBars labels={ws.map((w) => fmtDM(w.ini))} sets={[{ n: "Entradas", c: "#2E7D4F", v: ws.map((w) => w.e) }, { n: "Saídas", c: "#B3261E", v: ws.map((w) => w.s) }]} /></div></Panel>
        <Panel className="span2" title="Semana a semana"><div className="pb">
          <table className="fl-tab"><thead><tr><th>Semana</th><th className="num">Entradas</th><th className="num">Saídas</th><th className="num">Resultado</th><th className="num">Saldo projetado</th></tr></thead>
            <tbody>{ws.map((w, i) => <tr key={i}><td>{i === 0 ? "Até " : ""}{fmtDM(w.ini)} a {fmtDM(w.fim)}{i === 0 && <span className="muted"> (inclui vencidos)</span>}</td><td className="num t-ok">{fmtMoney(w.e)}</td><td className="num t-bad">{fmtMoney(w.s)}</td>
              <td className={`num${w.res < 0 ? " t-bad" : ""}`}>{fmtMoney(w.res)}</td><td className="num"><b className={w.saldo < 0 ? "t-bad" : ""}>{fmtMoney(w.saldo)}</b></td></tr>)}</tbody></table>
        </div></Panel>
        <Panel title="Saldo por conta"><div className="pb"><table className="fl-tab"><tbody>{d.accs.filter((a) => a.active).map((a) => <tr key={a.id}><td><a href={`/financeiro/extrato?conta=${a.id}`}>{a.name}</a></td><td className="num"><b className={a.balance < 0 ? "t-bad" : ""}>{fmtMoney(a.balance)}</b></td></tr>)}</tbody></table></div></Panel>
        <Panel title="Próximos vencimentos">
          <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <tbody>{d.next.map(({ t, p }) => <tr key={t.id}><td className={`code${t.dueDate < hoje ? " t-bad" : ""}`}>{fmtD(t.dueDate)}</td><td><span className={`badge ${t.kind === "RECEBER" ? "ok" : "bad"}`}>{t.kind === "RECEBER" ? "Receber" : "Pagar"}</span></td>
              <td className="ell">{t.description}{p && <div className="muted" style={{ fontSize: 12 }}>{p}</div>}</td><td className="num"><b>{fmtMoney(t.amount)}</b></td>
              <td className="acts show">{s.edit && <PayButton o={o} t={{ id: t.id, kind: t.kind as "RECEBER", description: t.description, document: "", partnerId: "", categoryId: "", issueDate: "", dueDate: t.dueDate, amount: Number(t.amount), paymentMethodId: t.paymentMethodId ?? "", situationId: "", responsibleId: "", notes: "" }} />}</td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    </>
  );
}

export async function StatementPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("financeiro");
  const sp = await searchParams;
  const o = await finOpts(s);
  const accId = sp.conta ?? o.raw.accounts.find((a) => a.active)?.id ?? "";
  const de = sp.de && isDate(sp.de) ? sp.de : today().slice(0, 8) + "01";
  const ate = sp.ate && isDate(sp.ate) ? sp.ate : today();
  const acc = o.raw.accounts.find((a) => a.id === accId);
  const d = acc ? await s.tx(async (tx) => {
    const before = (await accountBalances(tx, addDays(de, -1))).find((a) => a.id === accId)?.balance ?? Number(acc.initialBalance);
    const tits = await tx.select({ t: E.finTitles, p: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})`, c: E.finCategories.name }).from(E.finTitles)
      .leftJoin(E.partners, eq(E.partners.id, E.finTitles.partnerId)).leftJoin(E.finCategories, eq(E.finCategories.id, E.finTitles.categoryId))
      .where(and(eq(E.finTitles.bankAccountId, accId), eq(E.finTitles.status, "PAGO"), gte(E.finTitles.paidAt, de), lte(E.finTitles.paidAt, ate), acc.initialDate ? gte(E.finTitles.paidAt, acc.initialDate) : sql`true`));
    const ents = await tx.select().from(E.bankEntries).where(and(eq(E.bankEntries.bankAccountId, accId), gte(E.bankEntries.date, de), lte(E.bankEntries.date, ate), acc.initialDate ? gte(E.bankEntries.date, acc.initialDate) : sql`true`));
    const lines = [
      ...tits.map(({ t, p, c }) => ({ id: t.id, entry: false, date: t.paidAt!, desc: t.description, who: p ?? "", cat: c ?? "", v: (t.kind === "RECEBER" ? 1 : -1) * Number(t.paidAmount ?? t.amount), href: `/financeiro/${t.kind === "RECEBER" ? "receber" : "pagar"}?id=${t.id}` })),
      ...ents.map((e) => ({ id: e.id, entry: true, date: e.date, desc: e.description, who: "", cat: "Lançamento avulso", v: Number(e.amount), href: "" })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let run = before;
    return { before, lines: lines.map((l) => ({ ...l, bal: (run += l.v) })) };
  }) : null;
  const ent = d ? d.lines.filter((l) => l.v > 0).reduce((a, l) => a + l.v, 0) : 0;
  const sai = d ? d.lines.filter((l) => l.v < 0).reduce((a, l) => a - l.v, 0) : 0;
  return (
    <>
      <PageHead title="Extrato" sub="Movimento de cada conta: recebimentos e pagamentos baixados nela e lançamentos avulsos (tarifas, transferências, ajustes), com o saldo dia a dia."
        actions={<>{acc && <a className="btn" href={`/api/export/fin-extrato?conta=${accId}&de=${de}&ate=${ate}`}><Icon name="download" size={16} /> Exportar CSV</a>}{s.edit && acc && <BankButtons accountId={accId} accounts={o.accounts} />}</>} />
      <FilterBar right={acc && <span className="count">{d?.lines.length ?? 0} lançamentos</span>}>
        <Sel name="conta" defaultValue={accId} aria-label="Conta">{o.raw.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Sel>
        <label className="fl">De <input type="date" name="de" defaultValue={de} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={ate} /></label>
      </FilterBar>
      {acc && d ? (
        <>
          <div className="tbl">
            <table><thead><tr><th>Data</th><th>Descrição</th><th>Cliente ou fornecedor</th><th>Categoria</th><th className="num">Entrada</th><th className="num">Saída</th><th className="num">Saldo</th></tr></thead>
              <tbody>
                <tr><td className="code">{fmtD(addDays(de, -1))}</td><td colSpan={5}><b>Saldo anterior</b></td><td className="num"><b>{fmtMoney(d.before)}</b></td></tr>
                {d.lines.map((l) => (
                  <tr key={l.id}><td className="code">{fmtD(l.date)}</td><td className="desc">{l.href ? <a href={l.href} style={{ color: "inherit" }}>{l.desc}</a> : l.desc}{l.entry && s.edit && <span className="mini-acts"><DeleteEntryButton id={l.id} /></span>}</td><td>{l.who || "—"}</td><td style={{ fontSize: 12.5 }}>{l.cat || "—"}</td>
                    <td className="num t-ok">{l.v > 0 ? fmtMoney(l.v) : ""}</td><td className="num t-bad">{l.v < 0 ? fmtMoney(-l.v) : ""}</td><td className="num"><b className={l.bal < 0 ? "t-bad" : ""}>{fmtMoney(l.bal)}</b></td></tr>))}
              </tbody>
              <tfoot><tr><td colSpan={4}>Totais do período</td><td className="num">{fmtMoney(ent)}</td><td className="num">{fmtMoney(sai)}</td><td className="num">{fmtMoney(d.before + ent - sai)}</td></tr></tfoot></table>
          </div>
        </>
      ) : <div className="panel"><Empty title="Cadastre uma conta bancária">Em Financeiro › Configurações › Contas bancárias.</Empty></div>}
    </>
  );
}

const REPORTS: { k: string; t: string; d: string; period: "venc" | "pago" | "none"; extra?: "conta" | "kind" }[] = [
  { k: "fin-receber", t: "Contas a receber", d: "Lançamentos a receber no período de vencimento, com cliente, categoria, situação e responsável.", period: "venc" },
  { k: "fin-pagar", t: "Contas a pagar", d: "Lançamentos a pagar no período de vencimento, com fornecedor, categoria, situação e responsável.", period: "venc" },
  { k: "fin-recebimentos", t: "Recebimentos realizados", d: "Tudo que foi recebido no período, com a conta e a forma de pagamento.", period: "pago" },
  { k: "fin-pagamentos", t: "Pagamentos realizados", d: "Tudo que foi pago no período, com a conta e a forma de pagamento.", period: "pago" },
  { k: "fin-categorias", t: "Resultado por categoria", d: "Receitas e despesas realizadas no período, somadas por categoria.", period: "pago" },
  { k: "fin-parceiros", t: "Totais por cliente e fornecedor", d: "Valores em aberto, vencidos e realizados por cliente e por fornecedor.", period: "none" },
  { k: "fin-inadimplencia", t: "Inadimplência", d: "Contas a receber vencidas e não pagas, com os dias de atraso.", period: "none" },
  { k: "fin-fluxo", t: "Fluxo de caixa previsto", d: "Entradas, saídas e saldo projetado semana a semana pelas próximas 13 semanas.", period: "none" },
  { k: "fin-extrato", t: "Extrato da conta", d: "Movimento da conta bancária no período, com saldo dia a dia.", period: "pago", extra: "conta" },
];

export async function ReportsPage() {
  const s = await page("financeiro");
  const o = await finOpts(s);
  const ini = today().slice(0, 8) + "01";
  return (
    <>
      <PageHead title="Relatórios financeiros" sub="Escolha o período e baixe em CSV (abre no Excel ou no Google Planilhas)." />
      <div className="report-list">
        {REPORTS.map((r) => (
          <form key={r.k} className="report-card" action={`/api/export/${r.k}`} method="get" target="_blank">
            <h3>{r.t}</h3><p>{r.d}</p>
            {r.period !== "none" && <div className="form">
              <div className="fld"><label>{r.period === "venc" ? "Vencimento de" : "Data de"}</label><input type="date" name="de" defaultValue={ini} /></div>
              <div className="fld"><label>até</label><input type="date" name="ate" defaultValue={today()} /></div>
            </div>}
            {r.extra === "conta" && <div className="fld"><label>Conta</label><Sel name="conta">{o.accounts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>}
            {r.period === "venc" && <div className="fld"><label>Situação</label><select name="st"><option value="">Todas</option><option value="aberto">Em aberto</option><option value="vencido">Vencidas</option><option value="pago">Baixadas</option></select></div>}
            <div className="acts"><button type="submit" className="btn btn-primary"><Icon name="download" size={16} /> Baixar CSV</button></div>
          </form>
        ))}
      </div>
    </>
  );
}
