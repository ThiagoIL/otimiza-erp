import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { Empty, PageHead } from "@/components/ui";
import { OpBoard } from "@/components/ProductionUI";
import { TvControls } from "@/components/TvMode";
import { opCards } from "./production";

type SP = Record<string, string | undefined>;

/** Quadro das OPs para deixar numa TV da fábrica: tela cheia, atualiza sozinho e não deixa arrastar. */
export async function TvBoardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("dash");
  const sp = await searchParams;
  const c: SQL[] = [eq(E.productionOrders.tenantId, s.tenant.id), sql`(${E.productionStages.kind} not in ('finalizada', 'cancelada') or ${E.productionOrders.completedAt} >= current_date - 2)`];
  if (sp.centro) c.push(eq(E.productionOrders.workCenterId, sp.centro));
  const [{ cards }, L] = await Promise.all([opCards(s, c), s.tx(async (tx) => ({
    stages: await tx.select().from(E.productionStages).where(sql`${E.productionStages.kind} <> 'cancelada'`).orderBy(asc(E.productionStages.position)),
    centers: await tx.select({ id: E.workCenters.id, n: E.workCenters.name }).from(E.workCenters).where(eq(E.workCenters.active, true)).orderBy(asc(E.workCenters.name)),
    fields: await tx.select().from(E.customFields).where(and(eq(E.customFields.entity, "production_order"), eq(E.customFields.active, true))).orderBy(asc(E.customFields.position)),
  }))]);
  const hoje = new Date().toISOString().slice(0, 10);
  const late = cards.filter((o) => o.needDate && o.needDate < hoje && o.progress < 100).length;
  return (
    <div className="tv-page">
      <PageHead title="Quadro da produção" sub={`${cards.length} OPs no quadro${late ? ` · ${late} atrasadas` : ""}. Use “Tela cheia” para deixar na TV; o quadro atualiza sozinho a cada minuto.`} />
      {!L.stages.length ? <div className="panel"><Empty title="Cadastre as etapas da produção">O quadro usa as etapas como colunas.</Empty></div> : (
        <>
          <TvControls centers={L.centers.map((x) => [x.id, x.n])} center={sp.centro ?? ""} late={late} total={cards.length} />
          <OpBoard tv stages={L.stages.map((x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind }))} ops={cards} canEdit={false} storageKey="tv"
            fields={L.fields.map((f) => ({ id: f.id, label: f.label, onCard: f.onCard }))} />
        </>
      )}
    </div>
  );
}
