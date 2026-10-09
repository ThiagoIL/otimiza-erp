import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant, type Tx } from "@/lib/db";
import { assemblies, assemblyAreas, assemblyPieces, partners, salesOrders, teamMembers, type Assembly } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { ASSEMBLY_STATUS, ASSEMBLY_STATUS_BADGE, assemblyStatusLabel, fmtDay, fmtPct, fmtQty, mtNumber, pvNumber, today } from "@/lib/format";
import { progress } from "@/lib/assembly";
import { Field, Form, Hidden, Submit } from "@/components/Form";
import { PieceToggle } from "@/components/PieceToggle";
import { addPiecesAction, deleteAreaAction, deleteAssemblyAction, deletePieceAction, saveAreaAction, saveAssemblyAction } from "@/server/assembly-actions";

type Lk = { customers: { id: string; name: string }[]; sales: { id: string; number: number; customer: string }[] };

async function lookups(tx: Tx): Promise<Lk> {
  return {
    customers: await tx.select({ id: partners.id, name: partners.name }).from(partners).where(and(eq(partners.isCustomer, true), eq(partners.active, true))).orderBy(asc(partners.name)),
    sales: await tx.select({ id: salesOrders.id, number: salesOrders.number, customer: partners.name }).from(salesOrders).innerJoin(partners, eq(partners.id, salesOrders.customerId))
      .where(sql`${salesOrders.status} <> 'CANCELADO'`).orderBy(desc(salesOrders.number)).limit(300),
  };
}

function AssemblyForm({ a, lk, pedido }: { a?: Assembly; lk: Lk; pedido?: string }) {
  return (
    <Form action={saveAssemblyAction}>
      {a && <Hidden name="id" value={a.id} />}
      <Field name="nome" label="Obra ou projeto" required full defaultValue={a?.name} placeholder="Ex.: Residencial Jardins · Bloco A, ou Casa da Ana" maxLength={120} />
      <Field name="cliente" label="Cliente" options={lk.customers.map((c) => [c.id, c.name] as const)} emptyOption="Escolha (ou use o do pedido)" defaultValue={a?.customerId} />
      <Field name="pedido" label="Pedido de venda" options={lk.sales.map((x) => [x.id, `${pvNumber(x.number)} — ${x.customer}`] as const)} emptyOption="Nenhum" defaultValue={a?.salesOrderId ?? pedido} />
      <Field name="endereco" label="Endereço da obra" full defaultValue={a?.address} maxLength={200} />
      <Field name="inicio" label="Início" type="date" defaultValue={a?.startDate} />
      <Field name="prazo" label="Prazo de conclusão" type="date" defaultValue={a?.dueDate} />
      <Field name="situacao" label="Situação" options={ASSEMBLY_STATUS} defaultValue={a?.status ?? "PLANEJADA"} />
      <Field name="observacoes" label="Observações" type="textarea" full defaultValue={a?.notes} maxLength={1000} />
      <div className="full form-foot">{!a && <Link className="btn" href="/montagens">Cancelar</Link>}<Submit>{a ? "Salvar" : "Criar montagem"}</Submit></div>
    </Form>
  );
}

export async function AssemblyNew({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const lk = await withTenant(s.tenant.id, lookups);
  return (
    <>
      <div className="ph"><div><Link className="back" href="/montagens">‹ Obras e montagens</Link><h1>Nova montagem</h1><p>Depois de criar, inclua os ambientes (ou andares e apartamentos), quem monta cada um e as peças.</p></div></div>
      <section className="panel" style={{ maxWidth: 860 }}><div className="pb"><AssemblyForm lk={lk} pedido={sp.pedido} /></div></section>
    </>
  );
}

export async function AssemblyView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const s = await requireTenantUser();
  const { id } = await params;
  const sp = await searchParams;
  const tid = s.tenant.id;
  const data = await withTenant(tid, async (tx) => {
    const [row] = await tx.select({ a: assemblies, customer: partners.name, pv: salesOrders.number }).from(assemblies)
      .leftJoin(partners, eq(partners.id, assemblies.customerId)).leftJoin(salesOrders, eq(salesOrders.id, assemblies.salesOrderId))
      .where(and(eq(assemblies.id, id), eq(assemblies.tenantId, tid))).limit(1);
    if (!row) return null;
    return {
      row,
      areas: await tx.select().from(assemblyAreas).where(eq(assemblyAreas.assemblyId, id)).orderBy(asc(assemblyAreas.createdAt)),
      pieces: await tx.select({ p: assemblyPieces }).from(assemblyPieces).innerJoin(assemblyAreas, eq(assemblyAreas.id, assemblyPieces.areaId))
        .where(eq(assemblyAreas.assemblyId, id)).orderBy(asc(assemblyPieces.createdAt)),
      team: await tx.select({ id: teamMembers.id, name: teamMembers.name, role: teamMembers.role }).from(teamMembers).where(eq(teamMembers.active, true)).orderBy(asc(teamMembers.name)),
      lk: await lookups(tx),
    };
  });
  if (!data) notFound();
  const { row, areas, pieces, team, lk } = data;
  const a = row.a;
  const name = (pid: string | null) => team.find((t) => t.id === pid)?.name;
  const teamOpts = team.map((t) => [t.id, t.role ? `${t.name} (${t.role})` : t.name] as const);
  const tops = areas.filter((x) => !x.parentId);
  const kids = (pid: string) => areas.filter((x) => x.parentId === pid);
  const piecesOf = (aid: string) => pieces.filter(({ p }) => p.areaId === aid).map(({ p }) => p);
  // progresso de um ambiente inclui as peças dos subníveis
  const count = (aid: string): [number, number] => {
    const own = piecesOf(aid);
    return kids(aid).reduce<[number, number]>((acc, k) => { const [d, t] = count(k.id); return [acc[0] + d, acc[1] + t]; }, [own.filter((p) => p.doneAt).length, own.length]);
  };
  const totalDone = pieces.filter(({ p }) => p.doneAt).length;
  const hoje = today();
  const admin = s.user.role === "TENANT_ADMIN";
  if (a.customerId && !lk.customers.some((c) => c.id === a.customerId)) lk.customers.unshift({ id: a.customerId, name: row.customer ?? "" });

  const areaForm = (ar?: (typeof areas)[number], parent?: string) => (
    <Form action={saveAreaAction}>
      <Hidden name="montagem" value={a.id} />
      {ar && <Hidden name="id" value={ar.id} />}
      <Field name="nome" label={ar ? "Nome" : parent ? "Novo item dentro deste" : "Novo ambiente, andar ou bloco"} required defaultValue={ar?.name} placeholder={parent ? "Ex.: Apto 101, Banheiro" : "Ex.: Sala, Cozinha, 1º andar"} maxLength={80} />
      {parent ? <Hidden name="pai" value={parent} /> : (
        <Field name="pai" label="Dentro de" options={tops.filter((t) => t.id !== ar?.id).map((t) => [t.id, t.name] as const)} emptyOption="Nível principal" defaultValue={ar?.parentId} />
      )}
      <Field name="montador" label="Montador" options={teamOpts} emptyOption="A definir" defaultValue={ar?.assemblerId} />
      <Field name="auxiliar" label="Auxiliar" options={teamOpts} emptyOption="A definir" defaultValue={ar?.helperId} />
      <Field name="prazo" label="Prazo" type="date" defaultValue={ar?.dueDate} />
      <div className="fld" style={{ alignSelf: "end" }}><Submit pending="Salvando…">{ar ? "Salvar" : "Incluir"}</Submit></div>
    </Form>
  );

  const AreaCard = ({ ar, level }: { ar: (typeof areas)[number]; level: number }) => {
    const [d, t] = count(ar.id);
    const own = piecesOf(ar.id);
    const late = ar.dueDate && ar.dueDate < hoje && d < t;
    return (
      <section className={`area${level ? " sub" : ""}`} aria-label={ar.name}>
        <header className="area-h">
          <div><b>{ar.name}</b>
            <small className="sub">{kids(ar.id).length && !ar.assemblerId
              ? `${kids(ar.id).length} ${kids(ar.id).length === 1 ? "item dentro" : "itens dentro"}`
              : <>Montador: {name(ar.assemblerId) ?? <em>a definir</em>} · Auxiliar: {name(ar.helperId) ?? <em>a definir</em>}</>}
              {ar.dueDate && <> · <span className={late ? "late" : undefined}>prazo {fmtDay(ar.dueDate)}</span></>}</small></div>
          <div className="area-pr"><span>{t ? `${d}/${t} · ${fmtPct(progress(d, t))}` : "sem peças"}</span><div className="progress"><span style={{ width: `${progress(d, t) * 100}%` }} /></div></div>
        </header>
        {own.length > 0 && (
          <ul className="pieces">{own.map((p) => (
            <li key={p.id} className={p.doneAt ? "done" : undefined}>
              <PieceToggle id={p.id} done={!!p.doneAt} label={p.description} />
              <span className="pc-d">{Number(p.quantity) !== 1 && <b>{fmtQty(p.quantity)}× </b>}{p.description}</span>
              {p.doneAt && <small className="muted">{p.doneBy}</small>}
              <Form action={deletePieceAction} className="inline-form"><Hidden name="id" value={p.id} /><Submit variant="default" pending="…" confirm={`Remover a peça ${p.description}?`}>✕</Submit></Form>
            </li>))}</ul>
        )}
        {kids(ar.id).map((k) => <AreaCard key={k.id} ar={k} level={level + 1} />)}
        <div className="area-acts">
          <details><summary className="btn btn-sm">+ Peças</summary><div className="row-edit-box">
            <Form action={addPiecesAction}>
              <Hidden name="ambiente" value={ar.id} />
              <Field name="pecas" label="Peças (uma por linha)" type="textarea" full placeholder={"2x Porta de correr\nTampo de granito\n4x Prateleira"} maxLength={20000} hint="Use “3x” no começo da linha para informar a quantidade." />
              <div className="full form-foot"><Submit pending="Incluindo…">Incluir peças</Submit></div>
            </Form>
          </div></details>
          {level === 0 && <details><summary className="btn btn-sm">+ Dentro deste</summary><div className="row-edit-box">{areaForm(undefined, ar.id)}</div></details>}
          <details><summary className="btn btn-sm">Editar</summary><div className="row-edit-box">
            {areaForm(ar)}
            <Form action={deleteAreaAction} className="inline-form"><Hidden name="id" value={ar.id} /><Submit variant="danger" pending="…" confirm={`Excluir “${ar.name}” e todas as peças dele?`}>Excluir</Submit></Form>
          </div></details>
        </div>
      </section>
    );
  };

  const late = a.dueDate && a.dueDate < hoje && (a.status === "PLANEJADA" || a.status === "EM_ANDAMENTO");
  return (
    <>
      <div className="ph"><div><Link className="back" href="/montagens">‹ Obras e montagens</Link>
        <h1>{mtNumber(a.number)} · {a.name}</h1>
        <p><span className={`badge ${ASSEMBLY_STATUS_BADGE[a.status]}`}>{assemblyStatusLabel(a.status)}</span> · {row.customer ?? "sem cliente"}
          {row.pv != null && <> · <Link href={`/comercial/pedidos/${a.salesOrderId}`}>{pvNumber(row.pv)}</Link></>}
          {a.address && <> · {a.address}</>}</p></div></div>
      {sp.msg && <div className="alert ok" role="status">{sp.msg.slice(0, 200)}</div>}
      <div className="kpis">
        <div className="kpi"><b>{fmtPct(progress(totalDone, pieces.length))}</b><span>Montado ({totalDone} de {pieces.length} peças)</span></div>
        <div className="kpi"><b>{tops.length}</b><span>{tops.some((t) => kids(t.id).length) ? "Andares / blocos" : "Ambientes"}</span></div>
        <div className="kpi"><b>{areas.filter((x) => !x.assemblerId && !kids(x.id).length).length}</b><span>Sem montador definido</span></div>
        <div className={`kpi${late ? " kpi-bad" : ""}`}><b>{fmtDay(a.dueDate)}</b><span>Prazo{late ? " · atrasada" : ""}</span></div>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)" }}>
        <div className="stack">
          {tops.length ? tops.map((ar) => <AreaCard key={ar.id} ar={ar} level={0} />)
            : <div className="tbl solo"><div className="empty"><strong>Nenhum ambiente ainda</strong>Inclua os ambientes (sala, cozinha…) ou os andares da obra ao lado.</div></div>}
        </div>
        <div className="stack">
          <section className="panel"><h2>Incluir ambiente ou nível</h2><div className="pb">{areaForm()}
            <small className="muted">Móveis planejados: inclua cada ambiente. Obras: inclua o andar e, dentro dele, os apartamentos.</small></div></section>
          <section className="panel"><h2>Dados da montagem</h2><div className="pb"><AssemblyForm a={a} lk={lk} /></div></section>
          {admin && (
            <section className="panel danger-zone"><h2>Excluir montagem</h2><div className="pb">
              <Form action={deleteAssemblyAction} className=""><Hidden name="id" value={a.id} />
                <p style={{ marginTop: 0 }}>Exclui também os ambientes e as peças.</p>
                <Submit variant="danger" pending="Excluindo…" confirm={`Excluir a ${mtNumber(a.number)}?`}>Excluir montagem</Submit></Form>
            </div></section>
          )}
        </div>
      </div>
    </>
  );
}
