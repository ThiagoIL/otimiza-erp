"use server";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { nextNumber, ruleMsg, RuleError } from "./common";
import { autoStages } from "./assembly-common";
import { isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";
import type { Tx } from "@/lib/db";

const hdr = z.object({ id: z.string().max(64), name: z.string().trim().min(2).max(160), address: z.string().max(200).optional().nullable(), responsibleId: z.string().max(64).optional().nullable(),
  startDate: z.string().optional().nullable(), dueDate: z.string().optional().nullable(), notes: z.string().max(2000).optional().nullable() });
export async function saveAssemblyAction(input: z.input<typeof hdr>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = hdr.safeParse(input);
  if (!p.success) return { error: "Informe o nome da montagem." };
  const d = p.data;
  const dt = (v?: string | null) => (v && isDate(v) ? v : null);
  await s.tx((tx) => tx.update(E.assemblies).set({ name: d.name, address: d.address?.trim() || null, responsibleId: d.responsibleId || null, startDate: dt(d.startDate), dueDate: dt(d.dueDate), notes: d.notes?.trim() || null }).where(eq(E.assemblies.id, d.id)));
  return { ok: true, message: "Montagem atualizada." };
}

export async function concludeAssemblyAction(id: string, done: boolean): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.update(E.assemblies).set({ completedAt: done ? today() : null }).where(eq(E.assemblies.id, id)));
  return { ok: true, message: done ? "Montagem concluída." : "Montagem reaberta." };
}

export async function deleteAssemblyAction(id: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.assemblies).where(eq(E.assemblies.id, id)));
  await audit({ action: "montagem.excluida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "montagem", entityId: id });
  return { ok: true, redirectTo: "/montagens?msg=Montagem%20exclu%C3%ADda." };
}

const locSchema = z.object({ id: z.string().max(64).optional(), assemblyId: z.string().max(64), parentId: z.string().max(64).optional().nullable(), name: z.string().trim().min(1, "Informe o nome do local.").max(120),
  type: z.string().max(40).optional().nullable(), stageId: z.string().max(64).optional().nullable(), installerId: z.string().max(64).optional().nullable(), helperId: z.string().max(64).optional().nullable() });
export async function saveLocationAction(input: z.input<typeof locSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = locSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o local." };
  const { id, assemblyId, ...v } = p.data;
  const vals = { ...v, parentId: v.parentId || null, type: v.type || null, stageId: v.stageId || null, installerId: v.installerId || null, helperId: v.helperId || null };
  try {
    await s.tx(async (tx) => {
      if (id) {
        if (vals.parentId) {
          // impede colocar um local dentro dele mesmo ou de um filho
          const all = await tx.select({ id: E.assemblyLocations.id, p: E.assemblyLocations.parentId }).from(E.assemblyLocations).where(eq(E.assemblyLocations.assemblyId, assemblyId));
          let cur: string | null = vals.parentId;
          while (cur) { if (cur === id) throw new RuleError("Um local não pode ficar dentro dele mesmo."); cur = all.find((x) => x.id === cur)?.p ?? null; }
        }
        await tx.update(E.assemblyLocations).set(vals).where(eq(E.assemblyLocations.id, id));
      } else {
        await tx.insert(E.assemblyLocations).values({ ...vals, assemblyId, tenantId: s.tenant.id });
      }
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, message: id ? "Local atualizado." : "Local adicionado." };
}

export async function deleteLocationAction(id: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  await s.tx(async (tx) => {
    const [l] = await tx.select().from(E.assemblyLocations).where(eq(E.assemblyLocations.id, id));
    if (!l) return;
    const all = await tx.select({ id: E.assemblyLocations.id, p: E.assemblyLocations.parentId }).from(E.assemblyLocations).where(eq(E.assemblyLocations.assemblyId, l.assemblyId));
    const out = new Set([id]); let ch = true;
    while (ch) { ch = false; for (const x of all) if (x.p && out.has(x.p) && !out.has(x.id)) { out.add(x.id); ch = true; } }
    await tx.delete(E.assemblyLocations).where(inArray(E.assemblyLocations.id, [...out]));
  });
  return { ok: true, message: "Local excluído." };
}

export async function setLocationStageAction(id: string, stageId: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.update(E.assemblyLocations).set({ stageId: stageId || null }).where(eq(E.assemblyLocations.id, id)));
  return { ok: true };
}

const partSchema = z.object({ id: z.string().max(64).optional(), assemblyId: z.string().max(64), locationId: z.string().max(64), itemId: z.string().max(64).optional().nullable(), description: z.string().max(200).optional().nullable(), qty: z.number().positive().max(1e9), qtyDone: z.number().min(0).max(1e9).default(0) });
export async function savePartAction(input: z.input<typeof partSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = partSchema.safeParse(input);
  if (!p.success) return { error: "Informe a peça e a quantidade." };
  const d = p.data;
  if (!d.itemId && !d.description?.trim()) return { error: "Escolha um item ou descreva a peça." };
  await s.tx(async (tx) => {
    const v = { itemId: d.itemId || null, description: d.itemId ? null : d.description!.trim(), qty: String(d.qty), qtyDone: String(Math.min(d.qtyDone, d.qty)) };
    if (d.id) await tx.update(E.assemblyParts).set(v).where(eq(E.assemblyParts.id, d.id));
    else await tx.insert(E.assemblyParts).values({ ...v, assemblyId: d.assemblyId, locationId: d.locationId, tenantId: s.tenant.id });
    await autoStages(tx, d.assemblyId);
  });
  return { ok: true, message: d.id ? "Peça atualizada." : "Peça adicionada." };
}

export async function setPartDoneAction(id: string, qtyDone: number): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  if (!Number.isFinite(qtyDone) || qtyDone < 0) return { error: "Quantidade inválida." };
  await s.tx(async (tx) => {
    const [p] = await tx.update(E.assemblyParts).set({ qtyDone: sql`least(${qtyDone}, ${E.assemblyParts.qty})` }).where(eq(E.assemblyParts.id, id)).returning({ a: E.assemblyParts.assemblyId });
    if (p) await autoStages(tx, p.a);
  });
  return { ok: true };
}

export async function deletePartAction(id: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  await s.tx(async (tx) => {
    const [p] = await tx.delete(E.assemblyParts).where(eq(E.assemblyParts.id, id)).returning({ a: E.assemblyParts.assemblyId });
    if (p) await autoStages(tx, p.a);
  });
  return { ok: true, message: "Peça removida." };
}

// ------------------------------------------------------------------ romaneio (o que sai da fábrica para a montagem)
const shipSchema = z.object({
  assemblyId: z.string().max(64), date: z.string().refine(isDate, "Data inválida."), vehicle: z.string().max(80).optional().nullable(), driver: z.string().max(80).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(), lines: z.array(z.object({ partId: z.string().max(64), qty: z.number().positive().max(1e9) })).min(1, "Marque pelo menos uma peça.").max(3000),
});
export async function createShipmentAction(input: z.input<typeof shipSchema>): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const p = shipSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o romaneio." };
  const d = p.data;
  try {
    const r = await s.tx(async (tx) => {
      const [a] = await tx.select().from(E.assemblies).where(eq(E.assemblies.id, d.assemblyId)).limit(1).for("update");
      if (!a) throw new RuleError("Montagem não encontrada.");
      const parts = await tx.select({ p: E.assemblyParts, shipped: sql<string>`(select coalesce(sum(x.qty),0)::text from shipment_items x where x.part_id = "assembly_parts"."id")` })
        .from(E.assemblyParts).where(eq(E.assemblyParts.assemblyId, a.id));
      for (const l of d.lines) {
        const pt = parts.find((x) => x.p.id === l.partId);
        if (!pt) throw new RuleError("Peça não encontrada nesta montagem.");
        const free = Number(pt.p.qty) - Number(pt.shipped);
        if (l.qty > free + 1e-9) throw new RuleError(`Uma das peças só tem ${free.toLocaleString("pt-BR")} a enviar.`);
      }
      const number = await nextNumber(tx, s.tenant.id, "shipment", E.shipments, E.shipments.number);
      const [sh] = await tx.insert(E.shipments).values({ tenantId: s.tenant.id, number, assemblyId: a.id, date: d.date, vehicle: d.vehicle?.trim() || null, driver: d.driver?.trim() || null, notes: d.notes?.trim() || null, userName: s.user.name })
        .returning({ id: E.shipments.id });
      await tx.insert(E.shipmentItems).values(d.lines.map((l) => ({ tenantId: s.tenant.id, shipmentId: sh.id, partId: l.partId, qty: String(l.qty) })));
      return { id: sh.id, number };
    });
    return { ok: true, message: `Romaneio ${r.number} gerado.`, redirectTo: `/montagens/${d.assemblyId}/romaneio/${r.id}` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function deleteShipmentAction(id: string): Promise<ActionState> {
  const s = await act("producao");
  if (!s) return NO_ACCESS;
  const r = await s.tx((tx) => tx.delete(E.shipments).where(eq(E.shipments.id, id)).returning({ a: E.shipments.assemblyId, n: E.shipments.number }));
  if (!r.length) return { error: "Romaneio não encontrado." };
  return { ok: true, message: `Romaneio ${r[0].n} excluído.`, redirectTo: `/montagens/${r[0].a}#romaneios` };
}
