import "server-only";
import { asc, eq } from "drizzle-orm";
import * as E from "@/db/erp";
import type { Tx } from "@/lib/db";

/** Ajusta a etapa dos locais conforme as peças montadas (como no protótipo). */
export async function autoStages(tx: Tx, assemblyId: string) {
  const stages = await tx.select().from(E.assemblyStages).orderBy(asc(E.assemblyStages.position));
  const conc = stages.find((s) => s.kind === "concluido"), and_ = stages.find((s) => s.kind === "andamento"), ag = stages.find((s) => s.kind === "aguardando");
  const locs = await tx.select().from(E.assemblyLocations).where(eq(E.assemblyLocations.assemblyId, assemblyId));
  const parts = await tx.select().from(E.assemblyParts).where(eq(E.assemblyParts.assemblyId, assemblyId));
  for (const l of locs) {
    const ps = parts.filter((p) => p.locationId === l.id);
    if (!ps.length) continue;
    const t = ps.reduce((a, p) => a + Number(p.qty), 0), m = ps.reduce((a, p) => a + Math.min(Number(p.qtyDone), Number(p.qty)), 0);
    const cur = stages.find((s) => s.id === l.stageId);
    let next = l.stageId;
    if (t && m >= t && conc) next = conc.id;
    else if (m > 0 && m < t && (!cur || cur.kind === "aguardando" || cur.kind === "concluido") && and_) next = and_.id;
    else if (m === 0 && cur?.kind === "concluido" && ag) next = ag.id;
    if (next !== l.stageId) await tx.update(E.assemblyLocations).set({ stageId: next }).where(eq(E.assemblyLocations.id, l.id));
  }
}

