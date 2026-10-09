import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { productionOrderMaterials, salesOrders } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { OrderForm } from "@/components/OrderForm";
import { ensureSetup } from "@/server/stock";
import { orderLookups } from "./data";
import { toInput } from "@/lib/format";

type SP = { item?: string; qtd?: string; pedido?: string; copiar?: string };

/** Nova ordem. Vindo de um pedido de venda, já chega com produto, quantidade, pedido e prazo. */
export async function ProductionOrderNew({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const tid = s.tenant.id;
  const [lk, prazo] = await withTenant(tid, async (tx) => {
    await ensureSetup(tx, tid);
    const pv = sp.pedido ? (await tx.select({ d: salesOrders.deliveryDate }).from(salesOrders).where(and(eq(salesOrders.id, sp.pedido.slice(0, 64)))).limit(1))[0] : undefined;
    return [await orderLookups(tx, tid), pv?.d ?? undefined] as const;
  });
  // materiais de uma ordem anterior do mesmo produto, para não digitar de novo
  const copy = sp.copiar ? await withTenant(tid, (tx) => tx.select({ item: productionOrderMaterials.itemId, qtd: productionOrderMaterials.quantity })
    .from(productionOrderMaterials).where(eq(productionOrderMaterials.orderId, sp.copiar!.slice(0, 64)))) : [];
  return (
    <>
      <div className="ph"><div><Link className="back" href="/producao">‹ Ordens de produção</Link><h1>Nova ordem de produção</h1>
        <p>{sp.pedido ? "Dados trazidos do pedido de venda. Confira e complete." : "Informe o produto, a quantidade e, se quiser, os materiais que sairão do estoque."}</p></div></div>
      <section className="panel" style={{ maxWidth: 920 }}><div className="pb">
        <OrderForm lk={lk} prefill={{ item: sp.item, qtd: sp.qtd ? toInput(sp.qtd) : undefined, pedido: sp.pedido, prazo }}
          materials={copy.map((m) => ({ item: m.item, qtd: toInput(m.qtd) }))} />
      </div></section>
    </>
  );
}
