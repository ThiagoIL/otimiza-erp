import { asc, desc, eq, sql } from "drizzle-orm";
import type { ReactNode } from "react";
import { withTenant } from "@/lib/db";
import { assemblyAreas, productionOrders, productionStages, productionStatuses, teamMembers, workCenters } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { Check, Field, Form, Hidden, Submit } from "@/components/Form";
import type { Action } from "@/lib/action";
import {
  deleteCenterAction, deleteMemberAction, deleteStageAction, deleteStatusAction,
  saveCenterAction, saveMemberAction, saveStageAction, saveStatusAction,
} from "@/server/production-actions";
import { ensureSetup } from "@/server/stock";
import { col } from "@/lib/sql";

/** Linha da tabela que abre um formulário de edição no próprio lugar. */
function EditRow({ admin, del, id, name, children }: { admin: boolean; del: Action; id: string; name: string; children: ReactNode }) {
  return (
    <details className="row-edit"><summary className="btn btn-sm">Editar</summary>
      <div className="row-edit-box">
        {children}
        {admin && <Form action={del} className="inline-form"><Hidden name="id" value={id} /><Submit variant="danger" pending="…" confirm={`Excluir ${name}?`}>Excluir</Submit></Form>}
      </div>
    </details>
  );
}

const Swatch = ({ color }: { color: string }) => <span className="swatch" style={{ background: color }} aria-hidden="true" />;

export async function ProductionStagesSettings() {
  const s = await requireTenantUser();
  const tid = s.tenant.id;
  const [stages, statuses] = await withTenant(tid, async (tx) => {
    await ensureSetup(tx, tid);
    return [
      await tx.select({ st: productionStages, n: sql<number>`(select count(*)::int from ${productionOrders} where ${col(productionOrders.stageId)} = ${col(productionStages.id)} and ${col(productionOrders.finishedAt)} is null)` })
        .from(productionStages).orderBy(asc(productionStages.position), asc(productionStages.name)),
      await tx.select().from(productionStatuses).orderBy(desc(productionStatuses.isDefault), asc(productionStatuses.name)),
    ] as const;
  });
  const admin = s.user.role === "TENANT_ADMIN";
  return (
    <>
      <div className="ph"><div><h1>Etapas e situações</h1><p><b>Etapas</b> são as colunas do kanban, na ordem em que a produção acontece. <b>Situações</b> marcam como a ordem está (normal, parada, aguardando material) sem mudar a etapa.</p></div></div>
      <div className="grid2">
        <section className="panel"><h2>Etapas da produção</h2><div className="pb stack">
          <div className="tbl solo"><table><thead><tr><th className="num">Ordem</th><th>Etapa</th><th className="num">Ordens abertas</th><th /></tr></thead>
            <tbody>{stages.map(({ st, n }) => (
              <tr key={st.id}><td className="num muted">{st.position}</td>
                <td><Swatch color={st.color} /> {st.name}{st.isFinal && <> <span className="badge ok">Final</span></>}</td>
                <td className="num">{n}</td>
                <td className="num"><EditRow admin={admin} del={deleteStageAction} id={st.id} name={`a etapa ${st.name}`}>
                  <Form action={saveStageAction}>
                    <Hidden name="id" value={st.id} />
                    <Field name="nome" label="Nome" defaultValue={st.name} required />
                    <Field name="ordem" label="Posição" type="number" defaultValue={st.position} />
                    <Field name="cor" label="Cor" type="color" defaultValue={st.color} />
                    <Check name="final" label="Etapa final (conclui a ordem)" defaultChecked={st.isFinal} />
                    <div className="full form-foot"><Submit>Salvar</Submit></div>
                  </Form>
                </EditRow></td></tr>))}</tbody></table></div>
          <Form action={saveStageAction}>
            <Field name="nome" label="Nova etapa" placeholder="Ex.: Corte" required />
            <Field name="ordem" label="Posição" type="number" defaultValue={(stages.at(-1)?.st.position ?? 0) + 1} />
            <Field name="cor" label="Cor" type="color" defaultValue="#2557A0" />
            <Check name="final" label="Etapa final" />
            <div className="full form-foot"><Submit pending="Criando…">Adicionar etapa</Submit></div>
          </Form>
        </div></section>

        <section className="panel"><h2>Situações da ordem</h2><div className="pb stack">
          <div className="tbl solo"><table><thead><tr><th>Situação</th><th>Uso</th><th /></tr></thead>
            <tbody>{statuses.map((st) => (
              <tr key={st.id}>
                <td><Swatch color={st.color} /> {st.name}</td>
                <td>{st.isDefault && <span className="badge brand">Padrão</span>} {st.isAlert && <span className="badge warn">Gera alerta</span>}</td>
                <td className="num"><EditRow admin={admin} del={deleteStatusAction} id={st.id} name={`a situação ${st.name}`}>
                  <Form action={saveStatusAction}>
                    <Hidden name="id" value={st.id} />
                    <Field name="nome" label="Nome" defaultValue={st.name} required />
                    <Field name="cor" label="Cor" type="color" defaultValue={st.color} />
                    <Check name="alerta" label="Mostrar nos alertas da página inicial" defaultChecked={st.isAlert} />
                    <Check name="padrao" label="Situação padrão das novas ordens" defaultChecked={st.isDefault} />
                    <div className="full form-foot"><Submit>Salvar</Submit></div>
                  </Form>
                </EditRow></td></tr>))}</tbody></table></div>
          <Form action={saveStatusAction}>
            <Field name="nome" label="Nova situação" placeholder="Ex.: Retrabalho" required />
            <Field name="cor" label="Cor" type="color" defaultValue="#8F6200" />
            <Check name="alerta" label="Mostrar nos alertas" />
            <div className="full form-foot"><Submit pending="Criando…">Adicionar situação</Submit></div>
          </Form>
        </div></section>
      </div>
    </>
  );
}

/** Centros de trabalho e pessoas (produção e montagem). */
export async function ProductionTeamSettings({ montagem }: { montagem?: boolean } = {}) {
  const s = await requireTenantUser();
  const tid = s.tenant.id;
  const [centers, members] = await withTenant(tid, async (tx) => [
    await tx.select({ c: workCenters, n: sql<number>`(select count(*)::int from ${productionOrders} where ${col(productionOrders.workCenterId)} = ${col(workCenters.id)} and ${col(productionOrders.finishedAt)} is null)` })
      .from(workCenters).orderBy(asc(workCenters.name)),
    await tx.select({
      m: teamMembers, center: workCenters.name,
      ops: sql<number>`(select count(*)::int from ${productionOrders} where ${col(productionOrders.responsibleId)} = ${col(teamMembers.id)} and ${col(productionOrders.finishedAt)} is null)`,
      amb: sql<number>`(select count(*)::int from ${assemblyAreas} where ${col(assemblyAreas.assemblerId)} = ${col(teamMembers.id)} or ${col(assemblyAreas.helperId)} = ${col(teamMembers.id)})`,
    }).from(teamMembers).leftJoin(workCenters, eq(workCenters.id, teamMembers.workCenterId)).orderBy(asc(teamMembers.name)),
  ] as const);
  const admin = s.user.role === "TENANT_ADMIN";
  const centerOpts = centers.map(({ c }) => [c.id, c.name] as const);
  const memberForm = (m?: (typeof members)[number]["m"]) => (
    <Form action={saveMemberAction}>
      {m && <Hidden name="id" value={m.id} />}
      <Field name="nome" label={m ? "Nome" : "Nova pessoa"} defaultValue={m?.name} required full />
      <Field name="funcao" label="Função" defaultValue={m?.role} placeholder={montagem ? "Montador, Auxiliar…" : "Líder, Operador, Montador…"} />
      <Field name="centro" label="Centro de trabalho" options={centerOpts} emptyOption="Nenhum" defaultValue={m?.workCenterId} />
      <Field name="telefone" label="Telefone" defaultValue={m?.phone} />
      {m && <Check name="ativo" label="Ativo" defaultChecked={m.active} />}
      <div className="full form-foot"><Submit pending="Salvando…">{m ? "Salvar" : "Adicionar pessoa"}</Submit></div>
    </Form>
  );
  return (
    <>
      <div className="ph"><div><h1>{montagem ? "Equipe" : "Centros de trabalho e equipe"}</h1>
        <p>{montagem ? "Montadores e auxiliares das obras. É a mesma equipe usada na produção." : "Setores ou máquinas onde as ordens são feitas, e as pessoas da produção e da montagem (responsáveis, operadores, montadores e auxiliares)."}</p></div></div>
      <div className="grid2" style={{ gridTemplateColumns: montagem ? "1fr" : undefined }}>
        <section className="panel"><h2>Equipe</h2><div className="pb stack">
          {members.length ? <div className="tbl solo"><table><thead><tr><th>Nome</th><th>Função</th><th>Centro</th><th className="num">OPs</th><th className="num">Ambientes</th><th /></tr></thead>
            <tbody>{members.map(({ m, center, ops, amb }) => (
              <tr key={m.id}><td>{m.name}{!m.active && <> <span className="badge">Inativo</span></>}{m.phone && <small className="sub">{m.phone}</small>}</td>
                <td>{m.role ?? "—"}</td><td>{center ?? "—"}</td><td className="num">{ops}</td><td className="num">{amb}</td>
                <td className="num"><EditRow admin={admin} del={deleteMemberAction} id={m.id} name={m.name}>{memberForm(m)}</EditRow></td></tr>))}</tbody></table></div>
            : <p className="muted" style={{ margin: 0 }}>Nenhuma pessoa cadastrada.</p>}
          {memberForm()}
        </div></section>
        {!montagem && (
          <section className="panel"><h2>Centros de trabalho</h2><div className="pb stack">
            {centers.length ? <div className="tbl solo"><table><thead><tr><th>Centro</th><th className="num">OPs abertas</th><th /></tr></thead>
              <tbody>{centers.map(({ c, n }) => (
                <tr key={c.id}><td>{c.name}{!c.active && <> <span className="badge">Inativo</span></>}{c.description && <small className="sub">{c.description}</small>}</td><td className="num">{n}</td>
                  <td className="num"><EditRow admin={admin} del={deleteCenterAction} id={c.id} name={`o centro ${c.name}`}>
                    <Form action={saveCenterAction}>
                      <Hidden name="id" value={c.id} />
                      <Field name="nome" label="Nome" defaultValue={c.name} required full />
                      <Field name="descricao" label="Descrição" defaultValue={c.description} full />
                      <Check name="ativo" label="Ativo" defaultChecked={c.active} />
                      <div className="full form-foot"><Submit>Salvar</Submit></div>
                    </Form>
                  </EditRow></td></tr>))}</tbody></table></div>
              : <p className="muted" style={{ margin: 0 }}>Nenhum centro cadastrado.</p>}
            <Form action={saveCenterAction}>
              <Field name="nome" label="Novo centro" placeholder="Ex.: Solda, Pintura, Marcenaria" required full />
              <Field name="descricao" label="Descrição" full />
              <div className="full form-foot"><Submit pending="Criando…">Adicionar centro</Submit></div>
            </Form>
          </div></section>
        )}
      </div>
    </>
  );
}
