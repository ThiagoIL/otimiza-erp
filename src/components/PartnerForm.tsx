"use client";
import Link from "next/link";
import { useContext, useState } from "react";
import type { Partner } from "@/db/erp";
import { Field, Form, FormState, Hidden, Submit } from "./Form";
import { savePartnerAction } from "@/server/partner-actions";
import { IND_IE, PARTNER_KINDS, REGIMES } from "@/lib/consts";
import { maskCep, maskDoc, maskPhone } from "@/lib/doc";
import { UFS } from "./ui";

type Opt = readonly [string, string];

function Masked({ name, label, value, mask, full, hint, placeholder }: { name: string; label: string; value?: string | null; mask: (v: string) => string; full?: boolean; hint?: string; placeholder?: string }) {
  const st = useContext(FormState);
  const [v, setV] = useState(st.values?.[name] ?? value ?? "");
  const err = st.fields?.[name];
  return (
    <div className={`fld${full ? " full" : ""}${err ? " err" : ""}`}>
      <label htmlFor={`f_${name}`}>{label}</label>
      <input id={`f_${name}`} name={name} value={v} onChange={(e) => setV(mask(e.target.value))} inputMode="numeric" autoComplete="off" placeholder={placeholder} aria-invalid={!!err} />
      {err ? <small className="err">{err}</small> : hint ? <small>{hint}</small> : null}
    </div>
  );
}

function Kinds({ initial }: { initial: string[] }) {
  const st = useContext(FormState);
  const cur = st.values?.tipos != null ? st.values.tipos.split("|") : initial;
  const err = st.fields?.tipos;
  return (
    <div className={`fld full${err ? " err" : ""}`}>
      <span className="flabel">Tipo de cadastro <span className="req">*</span></span>
      <div className="checks" role="group" aria-label="Tipo de cadastro">
        {PARTNER_KINDS.map((k) => <label key={k} className="chkbox"><input type="checkbox" name="tipos" value={k} defaultChecked={cur.includes(k)} /> {k}</label>)}
      </div>
      {err ? <small className="err">{err}</small> : <small>Pode marcar mais de um.</small>}
    </div>
  );
}

/** Cadastro de cliente/fornecedor: informações principais e sessões de endereço e dados fiscais. */
export function PartnerForm({ p, profiles, sellers, canEdit, defaultKind }: { p?: Partner; profiles: Opt[]; sellers: Opt[]; canEdit: boolean; defaultKind?: string }) {
  const [pf, setPf] = useState(p?.personType === "PF");
  const [active, setActive] = useState(p ? p.active : true);
  return (
    <Form action={savePartnerAction} className="sheet">
      {p && <Hidden name="id" value={p.id} />}
      <nav className="sec-nav" aria-label="Sessões do cadastro">
        <a href="#endereco">Endereço</a><a href="#fiscal">Dados fiscais</a><a href="#anotacoes">Anotações</a><a href="#contatos">Contatos</a><a href="#anexos">Anexos</a>
      </nav>
      <div className="sheet-top">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
          <label className="switch"><input type="checkbox" name="ativo" checked={active} onChange={(e) => setActive(e.target.checked)} /><span className="tr" />{active ? "Cadastro ativo" : "Cadastro inativo"}</label>
        </div>
        <div className="form f4">
          <Kinds initial={p?.kinds ?? [defaultKind ?? "Cliente"]} />
          <div className="fld">
            <span className="flabel">Pessoa</span>
            <div className="seg" role="group" aria-label="Pessoa">
              <button type="button" aria-pressed={!pf} onClick={() => setPf(false)}>Jurídica</button>
              <button type="button" aria-pressed={pf} onClick={() => setPf(true)}>Física</button>
            </div>
            <Hidden name="pessoa" value={pf ? "PF" : "PJ"} />
          </div>
          <Masked name="documento" label={pf ? "CPF" : "CNPJ"} value={p?.document} mask={maskDoc} placeholder={pf ? "000.000.000-00" : "00.000.000/0000-00"} />
          <Field name="perfil" label="Perfil do cliente" options={profiles} emptyOption="Sem perfil" defaultValue={p?.profileId} />
          <Field name="vendedor" label="Vendedor responsável" options={sellers} emptyOption="Nenhum" defaultValue={p?.salespersonId} />
          <Field name="nome" label={pf ? "Nome completo" : "Razão social"} required defaultValue={p?.name} maxLength={200} full />
          <Field name="fantasia" label={pf ? "Apelido" : "Nome fantasia"} defaultValue={p?.tradeName} maxLength={200} />
          <Field name="email" label="E-mail" type="email" defaultValue={p?.email} />
          <Field name="site" label="Site" defaultValue={p?.website} />
          <Masked name="telefone" label="Telefone" value={p?.phone} mask={maskPhone} placeholder="(00) 0000-0000" />
          <Masked name="celular1" label="Celular 1" value={p?.mobile1} mask={maskPhone} placeholder="(00) 00000-0000" />
          <Masked name="celular2" label="Celular 2" value={p?.mobile2} mask={maskPhone} placeholder="(00) 00000-0000" />
          <Field name="limite" label="Limite de crédito (R$)" defaultValue={p?.creditLimit ? String(Number(p.creditLimit)).replace(".", ",") : ""} />
        </div>
      </div>

      <section className="panel sec-panel" id="endereco"><h2>Endereço</h2><div className="pb"><div className="form f4">
        <Masked name="cep" label="CEP" value={p?.zip} mask={maskCep} placeholder="00000-000" />
        <Field name="logradouro" label="Logradouro" defaultValue={p?.street} full />
        <Field name="numero" label="Número" defaultValue={p?.number} maxLength={20} />
        <Field name="complemento" label="Complemento" defaultValue={p?.complement} />
        <Field name="bairro" label="Bairro" defaultValue={p?.district} />
        <Field name="cidade" label="Cidade" defaultValue={p?.city} />
        <Field name="uf" label="UF" options={UFS.map((u) => [u, u] as const)} emptyOption="—" defaultValue={p?.uf} />
        <Field name="cod_mun" label="Código IBGE do município" defaultValue={p?.cityCode} maxLength={7} hint="7 dígitos, usado na nota fiscal." />
      </div></div></section>

      <section className="panel sec-panel" id="fiscal"><h2>Dados fiscais</h2><div className="pb"><div className="form f4">
        <Field name="ind_ie" label="Indicador da IE" options={IND_IE} emptyOption="Não informado" defaultValue={p?.stateRegIndicator} />
        <Field name="ie" label="Inscrição estadual" defaultValue={p?.stateReg} maxLength={30} />
        <Field name="im" label="Inscrição municipal" defaultValue={p?.cityReg} maxLength={30} />
        <Field name="suframa" label="Inscrição SUFRAMA" defaultValue={p?.suframa} maxLength={20} />
        <Field name="regime" label="Regime tributário" options={REGIMES.map((r) => [r, r] as const)} emptyOption="Não informado" defaultValue={p?.taxRegime} />
        <div className="fld"><span className="flabel">&nbsp;</span><label className="chk" style={{ height: 36 }}><input type="checkbox" name="consumidor_final" defaultChecked={p?.finalConsumer} /> Consumidor final</label></div>
      </div></div></section>

      {canEdit && (
        <div className="sticky-foot">
          <Link className="btn" href="/clientes">Voltar</Link>
          <Submit>{p ? "Salvar alterações" : "Cadastrar"}</Submit>
        </div>
      )}
    </Form>
  );
}
