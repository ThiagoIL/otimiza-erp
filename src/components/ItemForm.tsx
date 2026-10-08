import Link from "next/link";
import type { Item } from "@/db/schema";
import { Check, Field, Form, Hidden, Submit } from "./Form";
import { saveItemAction } from "@/server/item-actions";
import { ITEM_TYPES, toInput } from "@/lib/format";

export function ItemForm({ item, groups }: { item?: Item; groups: { id: string; name: string }[] }) {
  return (
    <Form action={saveItemAction}>
      {item && <Hidden name="id" value={item.id} />}
      <Field name="codigo" label="Código" defaultValue={item?.code} required maxLength={30} />
      <Field name="unidade" label="Unidade" defaultValue={item?.unit ?? "UN"} required maxLength={6} hint="Ex.: UN, KG, M, PC, CX" />
      <Field name="descricao" label="Descrição" defaultValue={item?.name} required full maxLength={160} />
      <Field name="tipo" label="Tipo" options={ITEM_TYPES} defaultValue={item?.type ?? "MATERIA_PRIMA"} />
      <Field name="grupo" label="Grupo" options={groups.map((g) => [g.id, g.name] as const)} emptyOption="Sem grupo" defaultValue={item?.groupId} />
      <Field name="estoque_minimo" label="Estoque mínimo" defaultValue={toInput(item?.minStock)} placeholder="0" />
      <Field name="ncm" label="NCM" defaultValue={item?.ncm} placeholder="8 dígitos" maxLength={10} hint="Necessário para emitir NF-e." />
      <Field name="custo" label="Custo padrão (R$)" defaultValue={toInput(item?.cost)} placeholder="0,00" />
      <Field name="preco_venda" label="Preço de venda (R$)" defaultValue={toInput(item?.salePrice)} placeholder="0,00" />
      <Check name="ativo" label="Item ativo" defaultChecked={item ? item.active : true} />
      <div className="full form-foot"><Link className="btn" href="/itens">Cancelar</Link><Submit>{item ? "Salvar alterações" : "Cadastrar item"}</Submit></div>
    </Form>
  );
}
