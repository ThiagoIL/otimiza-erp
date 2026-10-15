import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { HomeAlerts, type Alert } from "@/components/HomeUI";
import { balances, balanceOf } from "@/server/common";
import { addDays, diffDays, fmtD, today } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import type { ModuleKey } from "@/lib/modules";

// ------------------------------------------------------------------ Fluxo do sistema
const LANES: [string, string][] = [["Comercial", "#1E3A5F"], ["Produção", "#C94D0B"], ["Itens e estoque", "#2B6A8F"], ["Compras", "#4F5D73"], ["Financeiro", "#2E7D4F"]];
// [raia, coluna, nome, endereço, módulo]
const NODES: [number, number, string, string, ModuleKey | null][] = [
  [0, 0, "Clientes", "/clientes", "comercial"], [0, 1, "Pedidos de venda", "/pedidos", "comercial"], [0, 3, "Faturamento", "/faturamento", "comercial"],
  [1, 1, "Pedidos a produzir", "/producao/pedidos", "producao"], [1, 2, "Ordens de produção", "/ops", "producao"], [1, 3, "Montagens", "/montagens", "producao"],
  [2, 1, "Itens", "/itens", "itens"], [2, 2, "Estoque", "/estoque", "estoque"],
  [3, 1, "Solicitação de compra", "/compras/solicitacoes", "compras"], [3, 2, "Pedido de compra", "/compras/pedidos", "compras"],
  [4, 1, "Contas a pagar", "/financeiro/pagar", "financeiro"], [4, 2, "Fluxo de caixa", "/financeiro/fluxo", "financeiro"], [4, 3, "Contas a receber", "/financeiro/receber", "financeiro"],
];
/** Fluxo entre os módulos: raias por área, caixas clicáveis e setas mostrando o caminho do pedido e das compras. */
function FlowSvg({ can }: { can: (m: ModuleKey) => boolean }) {
  const W = 1180, LH = 96, NW = 200, NH = 52;
  const X = (c: number) => 200 + c * 250, CX = (c: number) => X(c) + NW / 2, R = (c: number) => X(c) + NW;
  const NT = (l: number) => l * LH + 22, NB = (l: number) => NT(l) + NH, CY = (l: number) => NT(l) + NH / 2;
  const mid = (l: number) => (l + 1) * LH + 11; // corredor entre a raia l e a de baixo
  const A = (l: number, d: string, both = false) => <path d={d} fill="none" stroke={LANES[l][1]} strokeWidth={2} markerEnd={`url(#fa${l})`} markerStart={both ? `url(#fa${l})` : undefined} />;
  return (
    <div className="flow" style={{ background: `linear-gradient(${LANES.map(([, c], l) => `color-mix(in srgb, ${c} ${l % 2 ? 5 : 9}%, var(--surface)) ${l * LH}px ${(l + 1) * LH}px`).join(", ")})` }}>
      <svg viewBox={`0 0 ${W} ${LANES.length * LH}`} role="img" aria-label="Fluxo entre os módulos do sistema">
        <defs>{LANES.map(([, c], l) => <marker key={l} id={`fa${l}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={c} /></marker>)}</defs>
        {LANES.map(([n, c], l) => <g key={n}><rect x={0} y={l * LH} width={W} height={LH} style={{ fill: `color-mix(in srgb, ${c} ${l % 2 ? 5 : 9}%, var(--surface))` }} /><rect x={0} y={l * LH} width={5} height={LH} fill={c} /><text x={22} y={CY(l) + 5} className="fl-lane" fill={c}>{n}</text></g>)}
        {/* comercial: cliente → pedido → (faturamento quando sai) */}
        {A(0, `M${R(0)} ${CY(0)}H${X(1) - 3}`)}
        {A(0, `M${R(1)} ${CY(0)}H${X(3) - 3}`)}
        {A(0, `M${CX(1)} ${NB(0)}V${NT(1) - 3}`)}
        {/* produção: fila → OP → montagem → faturamento */}
        {A(1, `M${R(1)} ${CY(1)}H${X(2) - 3}`)}{A(1, `M${R(2)} ${CY(1)}H${X(3) - 3}`)}
        {A(1, `M${CX(3)} ${NT(1)}V${NB(0) + 3}`)}
        {/* estoque: itens → estoque; OP retira e devolve produção ao estoque */}
        {A(2, `M${R(1)} ${CY(2)}H${X(2) - 3}`)}{A(2, `M${CX(2)} ${NB(1) + 3}V${NT(2) - 3}`, true)}
        {A(2, `M${CX(2) - 40} ${NB(2)}V${mid(2)}H${CX(1)}V${NT(3) - 3}`)}
        {/* compras: solicitação → pedido de compra → entra no estoque e gera contas a pagar */}
        {A(3, `M${R(1)} ${CY(3)}H${X(2) - 3}`)}{A(3, `M${CX(2) + 40} ${NT(3)}V${NB(2) + 3}`)}
        {A(3, `M${CX(2)} ${NB(3)}V${mid(3)}H${CX(1)}V${NT(4) - 3}`)}
        {/* financeiro: pagar e receber alimentam o fluxo de caixa */}
        {A(4, `M${R(1)} ${CY(4)}H${X(2) - 3}`)}{A(4, `M${X(3)} ${CY(4)}H${R(2) + 3}`)}
        {A(0, `M${R(3)} ${CY(0)}H${R(3) + 18}V${CY(4)}H${R(3) + 3}`)}
        {NODES.map(([l, c, t, href, mod]) => {
          const ok = !mod || can(mod);
          const body = <><rect x={X(c)} y={NT(l)} width={NW} height={NH} rx={10} fill={LANES[l][1]} fillOpacity={ok ? 1 : 0.35} /><text x={CX(c)} y={CY(l) + 5} textAnchor="middle" className="fl-n">{t}</text></>;
          return ok ? <a key={t} href={href} className="node" aria-label={`Abrir ${t}`}>{body}</a> : <g key={t}>{body}</g>;
        })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ Alertas
async function buildAlerts(s: Awaited<ReturnType<typeof page>>): Promise<Alert[]> {
  const hoje = today();
  const can = (m: ModuleKey) => s.access.mods[m] !== "nenhum";
  return s.tx(async (tx) => {
    const A: (Alert & { k: number })[] = [];
    if (can("producao")) {
      const late = await tx.select({ id: E.productionOrders.id, n: E.productionOrders.number, need: E.productionOrders.needDate, it: E.items.name, st: E.productionStages.name })
        .from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId))
        .where(sql`${E.productionOrders.needDate} < ${hoje} and ${E.productionStages.kind} not in ('finalizada','cancelada')`);
      for (const o of late) { const d = diffDays(o.need!, hoje); A.push({ mod: "producao", sev: 2, icon: "factory", t: `OP ${o.n} atrasada há ${d} ${d === 1 ? "dia" : "dias"}`, s: `${o.it} · ${o.st}`, href: `/ops/${o.id}`, k: d }); }
      const [{ q }] = await tx.select({ q: sql<number>`count(*)::int` }).from(E.salesOrders).where(and(eq(E.salesOrders.status, "APROVADO"), eq(E.salesOrders.productionStatus, "PENDENTE")));
      if (q) A.push({ mod: "producao", sev: 1, icon: "factory", t: `${q} ${q === 1 ? "pedido aprovado aguarda" : "pedidos aprovados aguardam"} a produção`, s: "Decida se gera OP ou se não precisa de produção", href: "/producao/pedidos", k: q });
      const asm = await tx.select({ id: E.assemblies.id, n: E.assemblies.number, name: E.assemblies.name, due: E.assemblies.dueDate }).from(E.assemblies).where(sql`${E.assemblies.completedAt} is null and ${E.assemblies.dueDate} < ${hoje}`);
      for (const a of asm) A.push({ mod: "producao", sev: 2, icon: "truck", t: `Montagem ${a.n} passou da previsão`, s: `${a.name} · previsão ${fmtD(a.due)}`, href: `/montagens/${a.id}`, k: diffDays(a.due!, hoje) });
      const pend = await tx.execute<{ id: string; name: string; c: number }>(sql`select a.id, a.name, count(*)::int c from assembly_locations l join assembly_stages st on st.id = l.stage_id join assemblies a on a.id = l.assembly_id where st.kind = 'pendencia' and a.completed_at is null group by a.id, a.name`);
      for (const p of pend.rows) A.push({ mod: "producao", sev: 1, icon: "truck", t: `${p.c} ${p.c === 1 ? "local com pendência" : "locais com pendência"}`, s: p.name, href: `/montagens/${p.id}`, k: p.c });
      const [{ ap }] = await tx.select({ ap: sql<number>`count(*)::int` }).from(E.timeEntries).where(sql`${E.timeEntries.end} is null and ${E.timeEntries.date} < ${hoje}`);
      if (ap) A.push({ mod: "producao", sev: 1, icon: "clock", t: `${ap} ${ap === 1 ? "apontamento ficou aberto" : "apontamentos ficaram abertos"} de dias anteriores`, s: "Encerre com o horário real de saída", href: "/apontamentos/horas", k: ap });
    }
    if (can("estoque") || can("itens")) {
      const items = await tx.select({ id: E.items.id, name: E.items.name, min: E.items.minStock, unit: E.items.unit }).from(E.items).where(sql`${E.items.active} and ${E.items.minStock} > 0`);
      const bal = await balances(tx, { itemIds: items.map((i) => i.id) });
      for (const i of items) { const q = balanceOf(bal, i.id); if (q < Number(i.min)) A.push({ mod: "estoque", sev: 1, icon: "box", t: i.name, s: `Abaixo do mínimo: ${q.toLocaleString("pt-BR")} de ${Number(i.min).toLocaleString("pt-BR")} ${i.unit}`, href: "/estoque?sit=abaixo", k: 1 - q / Number(i.min) }); }
      const falta = await tx.execute<{ n: string; c: number }>(sql`
        with nec as (
          select c.item_id, sum(greatest(c.qty_required - coalesce((select sum(m.qty) from stock_movements m where m.production_order_id = o.id and m.item_id = c.item_id and m.type = 'SAIDA'), 0), 0)) q
          from production_order_components c join production_orders o on o.id = c.production_order_id join production_stages st on st.id = o.stage_id
          where c.item_id is not null and st.kind not in ('finalizada','cancelada') group by c.item_id),
        sal as (select item_id, sum(case type when 'SAIDA' then -qty else qty end) q from stock_movements where type <> 'TRANSFERENCIA' group by item_id)
        select string_agg(i.name, ', ' order by i.name) n, count(*)::int c from nec join items i on i.id = nec.item_id left join sal on sal.item_id = nec.item_id where nec.q > 0 and coalesce(sal.q, 0) < nec.q`);
      const f = falta.rows[0];
      if (f?.c) A.push({ mod: "estoque", sev: 2, icon: "box", t: `${f.c} ${f.c === 1 ? "material falta" : "materiais faltam"} para as OPs abertas`, s: `${(f.n ?? "").slice(0, 90)} · gere a sugestão de compra`, href: "/compras/solicitacoes", k: f.c });
      const [{ inv }] = await tx.select({ inv: sql<number>`count(*)::int` }).from(E.inventories).where(sql`${E.inventories.status} = 'ABERTO' and ${E.inventories.date} < ${addDays(hoje, -3)}`);
      if (inv) A.push({ mod: "estoque", sev: 1, icon: "adjust", t: `${inv} ${inv === 1 ? "inventário aberto" : "inventários abertos"} há mais de 3 dias`, s: "Conclua a contagem para ajustar o estoque", href: "/estoque/inventarios?st=ABERTO", k: inv });
    }
    if (can("comercial")) {
      const venc = await tx.select({ id: E.salesOrders.id, n: E.salesOrders.number, d: E.salesOrders.deliveryDate, c: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.salesOrders)
        .innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId)).where(sql`${E.salesOrders.status} = 'APROVADO' and ${E.salesOrders.deliveryDate} < ${hoje}`);
      for (const o of venc) A.push({ mod: "comercial", sev: 2, icon: "partner", t: `Pedido ${o.n} com entrega vencida`, s: `${o.c} · entrega em ${fmtD(o.d)}`, href: `/pedidos/${o.id}`, k: diffDays(o.d!, hoje) });
      const pront = await tx.select({ id: E.salesOrders.id, n: E.salesOrders.number, c: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})`, ps: E.salesOrders.productionStatus }).from(E.salesOrders)
        .innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId)).where(sql`${E.salesOrders.status} = 'APROVADO' and ${E.salesOrders.productionStatus} in ('PRODUZIDO','NAO_NECESSITA')`);
      for (const o of pront) A.push({ mod: "comercial", sev: 0, icon: "check", t: `Pedido ${o.n} pronto para faturar`, s: `${o.c}${o.ps === "NAO_NECESSITA" ? " · sem produção" : " · produção concluída"}`, href: `/faturamento/novo?pedido=${o.id}`, k: 0 });
      const [{ pr }] = await tx.select({ pr: sql<number>`count(*)::int` }).from(E.salesOrders).where(sql`${E.salesOrders.status} = 'PROPOSTA' and ${E.salesOrders.issueDate} < ${addDays(hoje, -15)}`);
      if (pr) A.push({ mod: "comercial", sev: 1, icon: "doc", t: `${pr} ${pr === 1 ? "proposta sem resposta" : "propostas sem resposta"} há mais de 15 dias`, s: "Faça o acompanhamento com o cliente", href: "/pedidos?st=PROPOSTA", k: pr });
    }
    if (can("compras")) {
      const pc = await tx.select({ id: E.purchaseOrders.id, n: E.purchaseOrders.number, d: E.purchaseOrders.deliveryDate, f: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.purchaseOrders)
        .innerJoin(E.partners, eq(E.partners.id, E.purchaseOrders.partnerId)).where(sql`${E.purchaseOrders.status} in ('ENVIADO','RECEBIDO_PARCIAL') and ${E.purchaseOrders.deliveryDate} < ${hoje}`);
      for (const c of pc) A.push({ mod: "compras", sev: 1, icon: "cart", t: `Pedido de compra ${c.n} atrasado`, s: `${c.f} · previsto ${fmtD(c.d)}`, href: `/compras/pedidos/${c.id}`, k: diffDays(c.d!, hoje) });
      const [{ sa }] = await tx.select({ sa: sql<number>`count(*)::int` }).from(E.purchaseRequests).where(eq(E.purchaseRequests.status, "ABERTA"));
      if (sa) A.push({ mod: "compras", sev: 1, icon: "cart", t: `${sa} ${sa === 1 ? "solicitação de compra aguarda" : "solicitações de compra aguardam"} aprovação`, s: "Aprove para cotar com os fornecedores", href: "/compras/solicitacoes?st=ABERTA", k: sa });
      const [{ ap }] = await tx.select({ ap: sql<number>`count(*)::int` }).from(E.purchaseRequests).where(eq(E.purchaseRequests.status, "APROVADA"));
      if (ap) A.push({ mod: "compras", sev: 0, icon: "list", t: `${ap} ${ap === 1 ? "solicitação aprovada" : "solicitações aprovadas"} para cotar`, s: "Monte a cotação com os fornecedores", href: "/compras/cotacoes", k: ap });
    }
    if (can("financeiro")) {
      const [f] = await tx.select({
        rn: sql<number>`count(*) filter (where kind = 'RECEBER' and status = 'ABERTO' and due_date < ${hoje})::int`, rv: sql<string>`coalesce(sum(amount) filter (where kind = 'RECEBER' and status = 'ABERTO' and due_date < ${hoje}), 0)::text`,
        pn: sql<number>`count(*) filter (where kind = 'PAGAR' and status = 'ABERTO' and due_date < ${hoje})::int`, pv: sql<string>`coalesce(sum(amount) filter (where kind = 'PAGAR' and status = 'ABERTO' and due_date < ${hoje}), 0)::text`,
        sn: sql<number>`count(*) filter (where kind = 'PAGAR' and status = 'ABERTO' and due_date between ${hoje} and ${addDays(hoje, 7)})::int`, sv: sql<string>`coalesce(sum(amount) filter (where kind = 'PAGAR' and status = 'ABERTO' and due_date between ${hoje} and ${addDays(hoje, 7)}), 0)::text`,
      }).from(E.finTitles);
      if (f.rn) A.push({ mod: "financeiro", sev: 2, icon: "money", t: `${f.rn} ${f.rn === 1 ? "conta a receber vencida" : "contas a receber vencidas"}`, s: `${fmtMoney(f.rv)} em atraso`, href: "/financeiro/receber?st=vencido", k: f.rn });
      if (f.pn) A.push({ mod: "financeiro", sev: 2, icon: "money", t: `${f.pn} ${f.pn === 1 ? "conta a pagar vencida" : "contas a pagar vencidas"}`, s: fmtMoney(f.pv), href: "/financeiro/pagar?st=vencido", k: f.pn });
      if (f.sn) A.push({ mod: "financeiro", sev: 1, icon: "money", t: `${f.sn} ${f.sn === 1 ? "pagamento vence" : "pagamentos vencem"} nos próximos 7 dias`, s: fmtMoney(f.sv), href: "/financeiro/pagar", k: 0 });
    }
    return A.sort((a, b) => b.sev - a.sev || b.k - a.k).map(({ k: _k, ...a }) => a);
  });
}

export async function TenantHome() {
  const s = await page(null);
  if (s.access.pointer) redirect("/apontar");
  const alerts = await buildAlerts(s);
  const can = (m: ModuleKey) => s.access.mods[m] !== "nenhum";
  const mods = ([["producao", "Produção"], ["estoque", "Estoque"], ["comercial", "Comercial"], ["compras", "Compras"], ["financeiro", "Financeiro"]] as [ModuleKey, string][]).filter(([k]) => can(k) || (k === "estoque" && can("itens")));
  const d = new Date();
  const dataTxt = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: process.env.APP_TIMEZONE ?? "America/Sao_Paulo" });
  return (
    <>
      <div className="hello"><h1>Olá, {s.user.name.split(" ")[0]}.</h1><p>{dataTxt[0].toUpperCase() + dataTxt.slice(1)}.</p></div>
      <HomeAlerts alerts={alerts} mods={mods} />
      <section className="panel"><h2>Fluxo do sistema</h2><FlowSvg can={can} /></section>
    </>
  );
}
