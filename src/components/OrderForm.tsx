import Link from "next/link";
import type { ProductionOrder } from "@/db/schema";
import { Field, Form, Hidden, Submit } from "./Form";
import { MaterialsEditor } from "./MaterialsEditor";
import { saveOrderAction } from "@/server/production-actions";
import { PRIORITIES, pvNumber, toInput } from "@/lib/format";

type Ref = { id: string; name: string };
export type OrderLookups = {
  items: { id: string; code: string; name: string; unit: string; type: string }[];
  stages: Ref[]; statuses: Ref[]; centers: Ref[]; members: (Ref & { role: string | null })[];
  sales: { id: string; number: number; customer: string }[];
};

export function OrderForm({ order, materials, lk, prefill = {} }: {
  order?: ProductionOrder; materials?: { item: string; qtd: string }[]; lk: OrderLookups;
  prefill?: { item?: string; qtd?: string; pedido?: string; prazo?: string };
}) {
  const fabricados = lk.items.filter((i) => i.type === "PRODUTO_ACABADO" || i.type === "SEMIACABADO");
  const outros = lk.items.filter((i) => i.type !== "PRODUTO_ACABADO" && i.type !== "SEMIACABADO");
  const opt = (i: OrderLookups["items"][number]) => [i.id, `${i.code} — ${i.name}`] as const;
  return (
    <Form action={saveOrderAction}>
      {order && <Hidden name="id" value={order.id} />}
      <Field name="item" label="Produto a fabricar" required full options={[...fabricados.map(opt), ...outros.map(opt)]} emptyOption="Escolha o produto"
        defaultValue={order?.itemId ?? prefill.item} hint={fabricados.length ? undefined : "Cadastre produtos acabados ou semiacabados em Estoque › Itens."} />
      <Field name="quantidade" label="Quantidade" required defaultValue={order ? toInput(order.quantity) : prefill.qtd} placeholder="0" />
      <Field name="prioridade" label="Prioridade" options={PRIORITIES} defaultValue={String(order?.priority ?? 2)} />
      <Field name="pedido" label="Pedido de venda" options={lk.sales.map((s) => [s.id, `${pvNumber(s.number)} — ${s.customer}`] as const)} emptyOption="Sem pedido (produção para estoque)"
        defaultValue={order?.salesOrderId ?? prefill.pedido} full />
      <Field name="etapa" label="Etapa" options={lk.stages.map((s) => [s.id, s.name] as const)} defaultValue={order?.stageId ?? lk.stages[0]?.id} />
      <Field name="situacao" label="Situação" options={lk.statuses.map((s) => [s.id, s.name] as const)} emptyOption="—" defaultValue={order ? order.statusId : undefined} />
      <Field name="centro" label="Centro de trabalho" options={lk.centers.map((c) => [c.id, c.name] as const)} emptyOption="Não definido" defaultValue={order?.workCenterId} />
      <Field name="responsavel" label="Responsável" options={lk.members.map((m) => [m.id, m.role ? `${m.name} (${m.role})` : m.name] as const)} emptyOption="Não definido" defaultValue={order?.responsibleId} />
      <Field name="inicio" label="Início previsto" type="date" defaultValue={order?.startDate} />
      <Field name="prazo" label="Prazo de entrega" type="date" defaultValue={order?.dueDate ?? prefill.prazo} />
      <Field name="observacoes" label="Observações" type="textarea" full defaultValue={order?.notes} maxLength={1000} />
      <MaterialsEditor options={lk.items.map((i) => ({ id: i.id, label: `${i.code} — ${i.name}`, unit: i.unit }))} initial={materials} />
      <div className="full form-foot"><Link className="btn" href={order ? `/producao/${order.id}` : "/producao"}>Cancelar</Link><Submit>{order ? "Salvar alterações" : "Criar ordem de produção"}</Submit></div>
    </Form>
  );
}
