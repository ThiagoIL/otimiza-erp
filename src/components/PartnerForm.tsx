import Link from "next/link";
import type { Partner } from "@/db/schema";
import { Check, Field, FieldError, Form, Hidden, Submit } from "./Form";
import { savePartnerAction } from "@/server/sales-actions";
import { fmtDoc } from "@/lib/format";

/** Tipos do cadastro: pode marcar mais de um (ex.: cliente e fornecedor ao mesmo tempo). */
function KindChecks({ p, preset }: { p?: Partner; preset?: string }) {
  return (
    <fieldset className="fld full kinds">
      <legend>Tipo de cadastro <span className="req" aria-hidden="true">*</span> <small>marque um ou mais</small></legend>
      <div className="kinds-row">
        <Check inline name="cliente" label="Cliente" defaultChecked={p ? p.isCustomer : preset !== "fornecedor" && preset !== "transportadora"} />
        <Check inline name="fornecedor" label="Fornecedor" defaultChecked={p ? p.isSupplier : preset === "fornecedor"} />
        <Check inline name="transportadora" label="Transportadora" defaultChecked={p ? p.isCarrier : preset === "transportadora"} />
      </div>
      <FieldError name="cliente" />
    </fieldset>
  );
}

export function PartnerForm({ partner: p, preset }: { partner?: Partner; preset?: string }) {
  return (
    <Form action={savePartnerAction}>
      {p && <Hidden name="id" value={p.id} />}
      <KindChecks p={p} preset={preset} />
      <Field name="pessoa" label="Pessoa" options={[["PJ", "Jurídica (CNPJ)"], ["PF", "Física (CPF)"]]} defaultValue={p?.personType ?? "PJ"} />
      <Field name="documento" label="CNPJ / CPF" defaultValue={p?.document ? fmtDoc(p.document) : ""} maxLength={20} />
      <Field name="nome" label="Razão social / nome" required full defaultValue={p?.name} maxLength={160} />
      <Field name="fantasia" label="Nome fantasia" defaultValue={p?.tradeName} maxLength={120} />
      <Field name="ie" label="Inscrição estadual" defaultValue={p?.stateRegistration} maxLength={20} />
      <Field name="email" label="E-mail" type="email" defaultValue={p?.email} />
      <Field name="telefone" label="Telefone" defaultValue={p?.phone} maxLength={30} />
      <Field name="contato" label="Pessoa de contato" defaultValue={p?.contact} maxLength={80} />
      <Field name="cep" label="CEP" defaultValue={p?.zip} maxLength={10} />
      <Field name="endereco" label="Endereço" defaultValue={p?.street} full maxLength={160} />
      <Field name="numero" label="Número" defaultValue={p?.number} maxLength={20} />
      <Field name="bairro" label="Bairro" defaultValue={p?.district} maxLength={80} />
      <Field name="cidade" label="Cidade" defaultValue={p?.city} maxLength={80} />
      <Field name="uf" label="UF" defaultValue={p?.state} maxLength={2} />
      <Field name="observacoes" label="Observações" type="textarea" full defaultValue={p?.notes} maxLength={1000} />
      {p && <Check name="ativo" label="Cadastro ativo" defaultChecked={p.active} />}
      <div className="full form-foot"><Link className="btn" href="/comercial/cadastros">Cancelar</Link><Submit>{p ? "Salvar alterações" : "Cadastrar"}</Submit></div>
    </Form>
  );
}

