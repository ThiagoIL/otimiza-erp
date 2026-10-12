"use client";
import Link from "next/link";
import { useState } from "react";
import type { Item } from "@/db/erp";
import { Field, Form, Submit, Hidden } from "./Form";
import { saveItemAction } from "@/server/item-actions";
import { toInput } from "@/lib/format";

type Opt = readonly [string, string];
export type GroupOpt = { id: string; name: string; next: string | null };
export type TypeOpt = { id: string; name: string; kind: string };

const ORIGENS: Opt[] = [["0", "0 · Nacional"], ["1", "1 · Estrangeira, importação direta"], ["2", "2 · Estrangeira, mercado interno"], ["3", "3 · Nacional, conteúdo importado > 40%"], ["5", "5 · Nacional, conteúdo importado ≤ 40%"], ["8", "8 · Nacional, conteúdo importado > 70%"]];

/** Cadastro do item em sessões: topo (situação, grupo, tipo, código e descrição), estoque, compras, custo e fiscal. */
export function ItemForm({ item, groups, types, units, locations, suppliers, canEdit, extra }: {
  item?: Item; groups: GroupOpt[]; types: TypeOpt[]; units: Opt[]; locations: Opt[]; suppliers: Opt[]; canEdit: boolean;
  extra?: { avgCost: string; balance: string };
}) {
  const [groupId, setGroupId] = useState(item?.groupId ?? "");
  const [mode, setMode] = useState<"auto" | "manual">(item ? "manual" : "auto");
  const [active, setActive] = useState(item ? item.active : true);
  const g = groups.find((x) => x.id === groupId);
  const autoOk = !!g?.next;
  const effMode = !item && mode === "auto" && autoOk ? "auto" : "manual";

  return (
    <Form action={saveItemAction} className="sheet">
      {item && <Hidden name="id" value={item.id} />}
      <Hidden name="modo_codigo" value={effMode} />
      <nav className="sec-nav" aria-label="Sessões do cadastro">
        <a href="#estoque">Estoque</a><a href="#compras">Compras</a><a href="#custo">Custo e preço</a><a href="#fiscal">Fiscal</a>{item && <a href="#estrutura">Estrutura</a>}<a href="#obs">Observações</a>
      </nav>
      <div className="sheet-top">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
          <label className="switch"><input type="checkbox" name="ativo" checked={active} onChange={(e) => setActive(e.target.checked)} /><span className="tr" />{active ? "Item ativo" : "Item inativo"}</label>
          {!active && <span className="muted" style={{ fontSize: 12.5 }}>Itens inativos não aparecem na pesquisa de pedidos, compras e OPs.</span>}
        </div>
        <div className="form f4">
          <div className="fld span2">
            <label htmlFor="f_grupo">Grupo</label>
            <select id="f_grupo" name="grupo" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Sem grupo</option>{groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <Field name="tipo" label="Tipo" required options={types.map((t) => [t.id, t.name] as const)} emptyOption="Selecione…" defaultValue={item?.typeId ?? types.find((t) => t.kind === "MATERIA_PRIMA")?.id} />
          <Field name="unidade" label="Unidade" required options={units} defaultValue={item?.unit ?? "UN"} />
          <div className="fld span2">
            <label htmlFor="f_codigo">Código <span className="req" aria-hidden="true">*</span></label>
            {!item && (
              <div className="radio-row" style={{ minHeight: 0, marginBottom: 6 }}>
                <label><input type="radio" name="_modo" checked={mode === "auto"} onChange={() => setMode("auto")} /> Automático pelo grupo</label>
                <label><input type="radio" name="_modo" checked={mode === "manual"} onChange={() => setMode("manual")} /> Digitar</label>
              </div>
            )}
            {effMode === "auto"
              ? <><input id="f_codigo" value={g!.next!} disabled readOnly /><small>Próximo código livre do prefixo do grupo. Ele é confirmado ao salvar.</small></>
              : <><input id="f_codigo" name="codigo" defaultValue={item?.code ?? ""} maxLength={40} autoComplete="off" />
                {!item && mode === "auto" && <small>{groupId ? "Este grupo não tem prefixo de código. Digite o código ou ligue um prefixo ao grupo em Itens › Grupos." : "Escolha o grupo para gerar o código automático."}</small>}</>}
          </div>
          <Field name="descricao" label="Descrição" required full defaultValue={item?.name} maxLength={200} />
          <Field name="complemento" label="Descrição complementar" full defaultValue={item?.complement} maxLength={200} hint="Marca, especificação ou detalhe que ajuda a encontrar o item." />
        </div>
      </div>

      <section className="panel sec-panel" id="estoque"><h2>Estoque</h2><div className="pb"><div className="form f4">
        <Field name="estoque_minimo" label="Estoque mínimo" defaultValue={toInput(item?.minStock)} placeholder="0" />
        <Field name="estoque_maximo" label="Estoque máximo" defaultValue={toInput(item?.maxStock)} placeholder="0" />
        <Field name="local_padrao" label="Local padrão" options={locations} emptyOption="Nenhum" defaultValue={item?.defaultLocationId} />
        <Field name="endereco" label="Endereço no estoque" defaultValue={item?.stockAddress} placeholder="Ex.: Rua B, prateleira 3" />
        {extra && <div className="full saldo-box"><span>Saldo atual<br /><b>{extra.balance}</b></span><span>Custo médio<br /><b>{extra.avgCost}</b></span></div>}
      </div></div></section>

      <section className="panel sec-panel" id="compras"><h2>Compras</h2><div className="pb"><div className="form f4">
        <Field name="fornecedor_padrao" label="Fornecedor habitual" options={suppliers} emptyOption="Nenhum" defaultValue={item?.defaultSupplierId} />
        <Field name="prazo_entrega" label="Prazo de entrega (dias)" defaultValue={item?.leadDays ?? ""} />
        <Field name="lote_minimo" label="Lote mínimo de compra" defaultValue={toInput(item?.minPurchaseQty)} placeholder="0" />
      </div>{item && <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>Os demais fornecedores do item ficam na lista abaixo do cadastro.</p>}</div></section>

      <section className="panel sec-panel" id="custo"><h2>Custo e preço</h2><div className="pb"><div className="form f4">
        <Field name="custo" label="Custo padrão (R$)" defaultValue={toInput(item?.cost)} placeholder="0,00" hint="Usado enquanto não houver entradas com custo." />
        <Field name="preco_venda" label="Preço de venda (R$)" defaultValue={toInput(item?.salePrice)} placeholder="0,00" hint="Sugerido nos pedidos de venda." />
      </div></div></section>

      <section className="panel sec-panel" id="fiscal"><h2>Fiscal</h2><div className="pb"><div className="form f4">
        <Field name="ncm" label="NCM" defaultValue={item?.ncm} placeholder="8 dígitos" maxLength={10} />
        <Field name="cest" label="CEST" defaultValue={item?.cest} placeholder="7 dígitos" maxLength={9} />
        <Field name="origem" label="Origem da mercadoria" options={ORIGENS} defaultValue={item?.origin ?? "0"} />
        <Field name="gtin" label="GTIN / código de barras" defaultValue={item?.gtin} maxLength={14} />
        <Field name="peso_liquido" label="Peso líquido (kg)" defaultValue={toInput(item?.netWeight)} />
        <Field name="peso_bruto" label="Peso bruto (kg)" defaultValue={toInput(item?.grossWeight)} />
      </div></div></section>

      <section className="panel sec-panel" id="obs"><h2>Observações</h2><div className="pb"><div className="form">
        <Field name="observacoes" label="Observações internas" type="textarea" full defaultValue={item?.notes} maxLength={2000} />
      </div></div></section>

      {canEdit && (
        <div className="sticky-foot">
          <Link className="btn" href="/itens">Voltar</Link>
          <Submit>{item ? "Salvar alterações" : "Cadastrar item"}</Submit>
        </div>
      )}
    </Form>
  );
}
