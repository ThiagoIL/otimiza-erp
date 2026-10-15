"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { deleteProfileAction, saveProfileAction, setUserProfileAction } from "@/server/admin-tenant-actions";
import { LEVEL_LABEL, MODULES, type Level } from "@/lib/modules";

export type Profile = { id?: string; name: string; description: string; permissions: Record<string, string | boolean>; users: number };
const lv = (v: unknown) => v === "editar" ? <span className="pm pm-e">Edita</span> : v === "ver" ? <span className="pm pm-v">Consulta</span> : <span className="pm pm-n">—</span>;

export function ProfilesTable({ rows }: { rows: Profile[] }) {
  const [edit, setEdit] = useState<Profile | null>(null);
  const blank: Profile = { name: "", description: "", users: 0, permissions: { ...Object.fromEntries(MODULES.map(([k]) => [k, k === "dash" ? "ver" : "nenhum"])), custos: false } };
  return (
    <>
      <div className="bar"><span className="grow" /><span className="count">{rows.length} perfis</span><button type="button" className="btn btn-primary" onClick={() => setEdit(blank)}><Icon name="plus" size={16} /> Novo perfil</button></div>
      <div className="tbl">
        {rows.length ? (
          <table className="pmx"><thead><tr><th>Perfil</th>{MODULES.map(([, l]) => <th key={l}>{l}</th>)}<th>Custos de produção</th><th className="num">Usuários</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} className="click" onClick={() => setEdit(p)}>
                <td className="desc" style={{ minWidth: 200 }}>{p.name}<div className="muted" style={{ fontSize: 12, fontWeight: 400, whiteSpace: "normal" }}>{p.description}</div></td>
                {MODULES.map(([k]) => <td key={k}>{lv(p.permissions[k])}</td>)}
                <td>{p.permissions.custos ? <span className="pm pm-e">Vê</span> : <span className="pm pm-n">Não vê</span>}</td>
                <td className="num">{p.users}</td>
              </tr>))}</tbody></table>
        ) : <div className="empty"><strong>Nenhum perfil cadastrado</strong>Sem perfil, o usuário comum edita todos os módulos (menos Administração) e não vê custos de produção.</div>}
      </div>
      {edit && <ProfileModal p={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ProfileModal({ p, onClose }: { p: Profile; onClose: () => void }) {
  const [d, setD] = useState(p);
  const { run, pending } = useRun();
  const setPerm = (k: string, v: Level | boolean) => setD({ ...d, permissions: { ...d.permissions, [k]: v } });
  return (
    <Modal title={d.id ? "Editar perfil" : "Novo perfil"} size="wide" onClose={onClose}
      foot={<>
        {d.id && <button type="button" className="btn btn-danger left" disabled={pending} onClick={() => { if (confirm("Excluir este perfil?")) run(() => deleteProfileAction(d.id!), onClose); }}><Icon name="trash" size={16} /> Excluir</button>}
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending || d.name.trim().length < 2} onClick={() => run(() => saveProfileAction({ id: d.id, name: d.name, description: d.description, permissions: d.permissions as Record<string, Level | boolean> }), onClose)}>Salvar perfil</button>
      </>}>
      <div className="form">
        <div className="fld"><label htmlFor="pf_n">Nome do perfil <span className="req">*</span></label><input id="pf_n" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></div>
        <div className="fld"><label htmlFor="pf_d">Descrição</label><input id="pf_d" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
      </div>
      <div className="form" style={{ marginTop: 8 }}>
        <div className="fld full"><label htmlFor="pf_ap">Usuário só de apontamento</label>
          <select id="pf_ap" value={String(d.permissions.apontador ?? "")} onChange={(e) => setPerm("apontador", e.target.value as Level)}>
            <option value="">Não: usa os módulos abaixo</option><option value="fabrica">Sim: apontamento da fábrica</option><option value="montagem">Sim: apontamento da montagem</option><option value="ambos">Sim: fábrica e montagem</option>
          </select>
          <small>O usuário de apontamento entra direto numa tela simples (boa para celular ou tablet) e só aponta o que ficou pronto. Também recebe avisos e tarefas.</small></div>
      </div>
      {!d.permissions.apontador && <>
      <h3 className="sec">Permissões por módulo</h3>
      <div className="tbl solo"><table className="pmx">
        <thead><tr><th>Módulo</th>{(Object.keys(LEVEL_LABEL) as Level[]).map((l) => <th key={l} style={{ textAlign: "center" }}>{LEVEL_LABEL[l]}</th>)}</tr></thead>
        <tbody>{MODULES.map(([k, l]) => (
          <tr key={k}><td><b>{l}</b></td>{(Object.keys(LEVEL_LABEL) as Level[]).map((v) => <td key={v} style={{ textAlign: "center" }}><input type="radio" name={`pm_${k}`} checked={(d.permissions[k] ?? "nenhum") === v} onChange={() => setPerm(k, v)} aria-label={`${l}: ${LEVEL_LABEL[v]}`} /></td>)}</tr>))}</tbody>
      </table></div>
      <label className="chk" style={{ marginTop: 14 }}><input type="checkbox" checked={d.permissions.custos === true} onChange={(e) => setPerm("custos", e.target.checked)} /> Pode ver custos de produção (custo da OP, custo de mão de obra e custo padrão da estrutura)</label>
      </>}
      <p className="muted" style={{ fontSize: 12.5 }}>O Início fica sempre visível. A Administração (usuários, perfis e dados da empresa) é exclusiva dos administradores da empresa.</p>
    </Modal>
  );
}

export function UserProfileSelect({ userId, value, profiles, disabled }: { userId: string; value: string | null; profiles: [string, string][]; disabled?: boolean }) {
  const [v, setV] = useState(value ?? "");
  const { run, pending } = useRun();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select value={v} disabled={disabled || pending} onChange={(e) => setV(e.target.value)} aria-label="Perfil de acesso" style={{ maxWidth: 320 }}>
        <option value="">Sem perfil (edita todos os módulos, sem custos)</option>{profiles.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
      </select>
      {!disabled && <button type="button" className="btn btn-primary" disabled={pending || v === (value ?? "")} onClick={() => run(() => setUserProfileAction(userId, v || null))}>Aplicar perfil</button>}
    </div>
  );
}
