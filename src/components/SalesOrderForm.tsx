import Link from "next/link";
import type { SalesOrder } from "@/db/schema";
import { Field, Form, Hidden, Submit } from "./Form";
import { SalesLinesEditor } from "./SalesLinesEditor";
import { saveSalesOrderAction } from "@/server/sales-actions";
import { PAYMENT_METHODS, toInput, today } from "@/lib/format";

export type SalesLookups = {
  customers: { id: string; name: string }[];
  items: { id: string; code: string; name: string; unit: string; price: string }[];
};

export function SalesOrderForm({ order, lines, lk, customer }: {
  order?: SalesOrder; lines?: { item: string; qtd: string; preco: string; desc: string }[]; lk: SalesLookups; customer?: string;
}) {
  return (
    <Form action={saveSalesOrderAction}>
      {order && <Hidden name="id" value={order.id} />}
      <Field name="cliente" label="Cliente" required full options={lk.customers.map((c) => [c.id, c.name] as const)} emptyOption="Escolha o cliente"
        defaultValue={order?.customerId ?? customer} hint={lk.customers.length ? undefined : "Cadastre clientes em Comercial › Clientes e fornecedores."} />
      <Field name="emissao" label="Data do pedido" type="date" required defaultValue={order?.issueDate ?? today()} />
      <Field name="entrega" label="Previsão de entrega" type="date" defaultValue={order?.deliveryDate} />
      {(!order || order.status === "ORCAMENTO" || order.status === "APROVADO") && (
        <Field name="situacao" label="Situação" options={[["ORCAMENTO", "Orçamento"], ["APROVADO", "Aprovado"]]} defaultValue={order?.status ?? "ORCAMENTO"} />
      )}
      <Field name="vendedor" label="Vendedor" defaultValue={order?.sellerName} maxLength={80} />
      <SalesLinesEditor options={lk.items.map((i) => ({ id: i.id, label: `${i.code} — ${i.name}`, unit: i.unit, price: Number(i.price) }))}
        initial={lines} discount={toInput(order?.discount)} freight={toInput(order?.freight)} />
      <div className="full sub-h">Financeiro</div>
      <Field name="pagamento" label="Forma de pagamento" required options={PAYMENT_METHODS} defaultValue={order?.paymentMethod ?? "BOLETO"} />
      <Field name="parcelas" label="Parcelas" type="number" defaultValue={order?.installments ?? 1} hint="1 = à vista" />
      <Field name="primeira" label="1º vencimento (dias após o pedido)" type="number" defaultValue={order?.firstDueDays ?? 30} />
      <Field name="intervalo" label="Intervalo entre parcelas (dias)" type="number" defaultValue={order?.intervalDays ?? 30} />
      <Field name="observacoes" label="Observações (saem no relatório do pedido)" type="textarea" full defaultValue={order?.notes} maxLength={2000} />
      <div className="full form-foot"><Link className="btn" href={order ? `/comercial/pedidos/${order.id}` : "/comercial"}>Cancelar</Link><Submit>{order ? "Salvar pedido" : "Criar pedido"}</Submit></div>
    </Form>
  );
}
