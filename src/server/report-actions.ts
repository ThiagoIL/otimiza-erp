"use server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { accessOf } from "@/lib/access";
import { tenantUserForAction, SESSION_EXPIRED } from "@/lib/context";
import { withTenant, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { avgCosts, closedUntil, insertMovements, ruleMsg, RuleError } from "./common";
import { autoStages } from "./assembly-common";
import { opCosts } from "./production-costs";
import { isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";

/**
 * Apontamento de finalização: o que ficou pronto.
 *  - Fábrica: produto final da OP (soma no produzido e dá entrada no estoque) ou peça/estrutura fabricada da OP (avança a OP).
 *  - Montagem: peça montada (avança a montagem).
 * Pode apontar quem edita a Produção ou o usuário só de apontamento (fábrica, montagem ou os dois).
 */
type Kind = "FABRICA" | "MONTAGEM";
async function ctx(kind?: Kind) {
  const s = await tenantUserForAction();
  if (!s) return null;
  const access = await accessOf(s);
  const prod = access.mods.producao === "editar";
  const ok = (k: Kind) => prod || access.pointer === "ambos" || (k === "FABRICA" ? access.pointer === "fabrica" : access.pointer === "montagem");
  if (kind ? !ok(kind) : !(prod || access.pointer)) return null;
  return { ...s, access, prod, ok, tx: <T>(fn: (tx: Tx) => Promise<T>) => withTenant(s.tenant.id, fn) };
}
const NO = { error: "Você não pode apontar aqui, ou a sua sessão expirou." };
const n = (v: unknown) => Number(v ?? 0);
const like = (q: string) => `%${q.trim()}%`;

// ------------------------------------------------------------------ o que pode ser apontado
export type Target = { id: string; title: string; sub: string; due: string | null; progress: number };
/** OPs abertas (fábrica) ou montagens em andamento (montagem), com busca. */
export async function reportTargetsAction(kind: Kind, q: string): Promise<{ rows: Target[] } | { error: string }> {
  const s = await ctx(kind);
  if (!s) return NO;
  const qq = String(q ?? "").slice(0, 80).trim();
  const num = Number(qq.replace(/\D/g, "")) || 0;
  return s.tx(async (tx) => {
    if (kind === "FABRICA") {
      const c: SQL[] = [sql`${E.productionStages.kind} not in ('finalizada', 'cancelada')`];
      if (qq) c.push(or(ilike(E.items.name, like(qq)), ilike(E.items.code, like(qq)), ilike(E.partners.name, like(qq)), ilike(E.partners.tradeName, like(qq)), ...(num ? [eq(E.productionOrders.number, num)] : []))!);
      const rows = await tx.select({ o: E.productionOrders, it: E.items.name, unit: E.items.unit, st: E.productionStages.name, cli: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})` })
        .from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId))
        .leftJoin(E.partners, eq(E.partners.id, E.productionOrders.partnerId)).where(and(...c)).orderBy(asc(sql`coalesce(${E.productionOrders.needDate}, '9999-12-31')`), desc(E.productionOrders.number)).limit(40);
      return { rows: rows.map((r) => ({ id: r.o.id, title: `OP ${r.o.number} · ${r.it}`, sub: [`${n(r.o.qtyProduced).toLocaleString("pt-BR")} de ${n(r.o.qty).toLocaleString("pt-BR")} ${r.unit}`, r.cli ?? "Estoque", r.st].join(" · "),
        due: r.o.needDate, progress: Math.min(100, Math.round((n(r.o.qtyProduced) / Math.max(1e-9, n(r.o.qty))) * 100)) })) };
    }
    const c: SQL[] = [sql`${E.assemblies.completedAt} is null`];
    if (qq) c.push(or(ilike(E.assemblies.name, like(qq)), ilike(E.assemblies.address, like(qq)), ilike(E.partners.name, like(qq)), ilike(E.partners.tradeName, like(qq)), ...(num ? [eq(E.assemblies.number, num)] : []))!);
    const rows = await tx.select({ a: E.assemblies, cli: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})`,
      tot: sql<string>`(select coalesce(sum(qty),0)::text from assembly_parts p where p.assembly_id = "assemblies"."id")`,
      done: sql<string>`(select coalesce(sum(least(qty_done, qty)),0)::text from assembly_parts p where p.assembly_id = "assemblies"."id")` })
      .from(E.assemblies).leftJoin(E.partners, eq(E.partners.id, E.assemblies.partnerId)).where(and(...c)).orderBy(asc(sql`coalesce(${E.assemblies.dueDate}, '9999-12-31')`)).limit(40);
    return { rows: rows.map((r) => ({ id: r.a.id, title: `Montagem ${r.a.number} · ${r.a.name}`, sub: [r.cli, r.a.address].filter(Boolean).join(" · ") || "—", due: r.a.dueDate,
      progress: n(r.tot) ? Math.round((n(r.done) / n(r.tot)) * 100) : 0 })) };
  });
}

export type Line = { key: string; label: string; code: string | null; kind: string; unit: string; required: number; done: number };
/** Linhas que podem ser apontadas numa OP (produto final + peças fabricadas) ou numa montagem (peças por local). */
export async function reportLinesAction(kind: Kind, id: string): Promise<{ title: string; lines: Line[] } | { error: string }> {
  const s = await ctx(kind);
  if (!s) return NO;
  return s.tx(async (tx) => {
    if (kind === "FABRICA") {
      const [op] = await tx.select({ o: E.productionOrders, i: E.items }).from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).where(eq(E.productionOrders.id, id)).limit(1);
      if (!op) return { error: "OP não encontrada." };
      const comps = await tx.select({ c: E.productionOrderComponents, i: E.items }).from(E.productionOrderComponents).leftJoin(E.items, eq(E.items.id, E.productionOrderComponents.itemId))
        .where(and(eq(E.productionOrderComponents.productionOrderId, id), eq(E.productionOrderComponents.supply, "FABRICADO"))).orderBy(asc(E.productionOrderComponents.position));
      return {
        title: `OP ${op.o.number} · ${op.i.name}`,
        lines: [
          { key: "final", label: op.i.name, code: op.i.code, kind: "Produto final", unit: op.i.unit, required: n(op.o.qty), done: n(op.o.qtyProduced) },
          ...comps.map(({ c, i }) => ({ key: c.id, label: i?.name ?? c.description ?? "—", code: i?.code ?? null, kind: "Peça / estrutura", unit: i?.unit ?? "", required: n(c.qtyRequired), done: n(c.qtyDone) })),
        ],
      };
    }
    const [a] = await tx.select().from(E.assemblies).where(eq(E.assemblies.id, id)).limit(1);
    if (!a) return { error: "Montagem não encontrada." };
    const parts = await tx.select({ p: E.assemblyParts, i: E.items, loc: E.assemblyLocations.name }).from(E.assemblyParts).leftJoin(E.items, eq(E.items.id, E.assemblyParts.itemId))
      .innerJoin(E.assemblyLocations, eq(E.assemblyLocations.id, E.assemblyParts.locationId)).where(eq(E.assemblyParts.assemblyId, id)).orderBy(asc(E.assemblyLocations.position), asc(E.assemblyParts.createdAt));
    return {
      title: `Montagem ${a.number} · ${a.name}`,
      lines: parts.map(({ p, i, loc }) => ({ key: p.id, label: i?.name ?? p.description ?? "—", code: i?.code ?? null, kind: loc, unit: i?.unit ?? "", required: n(p.qty), done: n(p.qtyDone) })),
    };
  });
}

// ------------------------------------------------------------------ apontar
const schema = z.object({
  kind: z.enum(["FABRICA", "MONTAGEM"]), targetId: z.string().max(64), line: z.string().max(64), qty: z.number().positive("Informe a quantidade.").max(1e9),
  date: z.string().refine(isDate, "Data inválida."), memberId: z.string().max(64).optional().nullable(), notes: z.string().max(500).optional().nullable(),
  locationId: z.string().max(64).optional().nullable(),
});
export async function saveReportAction(input: z.input<typeof schema>): Promise<ActionState> {
  const p = schema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o apontamento." };
  const d = p.data;
  const s = await ctx(d.kind);
  if (!s) return NO;
  const fq = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  try {
    const msg = await s.tx(async (tx) => {
      const base = { tenantId: s.tenant.id, kind: d.kind, date: d.date, qty: String(d.qty), memberId: d.memberId || null, notes: d.notes?.trim() || null, userId: s.user.id, userName: s.user.name };
      if (d.kind === "MONTAGEM") {
        const [pt] = await tx.select({ p: E.assemblyParts, a: E.assemblies, i: E.items }).from(E.assemblyParts).innerJoin(E.assemblies, eq(E.assemblies.id, E.assemblyParts.assemblyId))
          .leftJoin(E.items, eq(E.items.id, E.assemblyParts.itemId)).where(and(eq(E.assemblyParts.id, d.line), eq(E.assemblyParts.assemblyId, d.targetId))).limit(1).for("update", { of: E.assemblyParts });
        if (!pt) throw new RuleError("Peça da montagem não encontrada.");
        const left = n(pt.p.qty) - n(pt.p.qtyDone);
        if (d.qty > left + 1e-9) throw new RuleError(left > 0 ? `Faltam só ${fq(left)} desta peça.` : "Esta peça já está toda montada.");
        await tx.update(E.assemblyParts).set({ qtyDone: sql`${E.assemblyParts.qtyDone} + ${d.qty}` }).where(eq(E.assemblyParts.id, pt.p.id));
        await autoStages(tx, pt.a.id);
        const label = pt.i?.name ?? pt.p.description ?? "Peça";
        await tx.insert(E.productionReports).values({ ...base, productionOrderId: pt.a.productionOrderId, assemblyId: pt.a.id, assemblyPartId: pt.p.id, itemId: pt.p.itemId, description: label });
        return `${fq(d.qty)} × ${label} montado na montagem ${pt.a.number}.`;
      }
      const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, d.targetId)).limit(1).for("update");
      if (!op) throw new RuleError("OP não encontrada.");
      if (d.line === "final") {
        const left = n(op.qty) - n(op.qtyProduced);
        if (d.qty > left + 1e-9) throw new RuleError(left > 0 ? `A OP pede ${fq(n(op.qty))} e já tem ${fq(n(op.qtyProduced))} prontas. Faltam ${fq(left)}.` : "A OP já está toda produzida.");
        const [it] = await tx.select().from(E.items).where(eq(E.items.id, op.itemId));
        // entra no estoque: local escolhido, o padrão do item ou a expedição
        let loc = d.locationId || it.defaultLocationId;
        if (!loc) loc = (await tx.select({ id: E.stockLocations.id }).from(E.stockLocations).where(eq(E.stockLocations.active, true)).orderBy(sql`case when ${E.stockLocations.type} = 'Expedição' then 0 else 1 end`, asc(E.stockLocations.code)).limit(1))[0]?.id;
        if (!loc) throw new RuleError("Cadastre um local de estoque para dar entrada no produto.");
        const [out] = await tx.insert(E.productionOutputs).values({ tenantId: s.tenant.id, productionOrderId: op.id, date: d.date, qty: String(d.qty), locationId: loc, notes: d.notes?.trim() || "Apontamento de finalização", userName: s.user.name }).returning({ id: E.productionOutputs.id });
        await tx.update(E.productionOrders).set({ qtyProduced: sql`${E.productionOrders.qtyProduced} + ${d.qty}` }).where(eq(E.productionOrders.id, op.id));
        const c = await opCosts(tx, op);
        const unit = c.real.total > 0 && n(op.qty) > 0 ? c.real.total / n(op.qty) : (await avgCosts(tx, [op.itemId])).get(op.itemId) ?? 0;
        const [mv] = await insertMovements(tx, s.tenant.id, [{ date: d.date, type: "PRODUCAO", itemId: op.itemId, locationId: loc, qty: String(d.qty), unitCost: String(Math.round(unit * 10000) / 10000),
          document: `OP ${op.number}`, notes: "Apontamento de finalização", productionOrderId: op.id, userName: s.user.name }]);
        await tx.insert(E.productionReports).values({ ...base, productionOrderId: op.id, itemId: op.itemId, description: it.name, outputId: out.id, movementId: mv?.id ?? null });
        return `${fq(d.qty)} × ${it.name} pronto na OP ${op.number} e lançado no estoque.`;
      }
      const [cp] = await tx.select({ c: E.productionOrderComponents, i: E.items }).from(E.productionOrderComponents).leftJoin(E.items, eq(E.items.id, E.productionOrderComponents.itemId))
        .where(and(eq(E.productionOrderComponents.id, d.line), eq(E.productionOrderComponents.productionOrderId, op.id))).limit(1);
      if (!cp) throw new RuleError("Peça da OP não encontrada.");
      const left = n(cp.c.qtyRequired) - n(cp.c.qtyDone);
      if (d.qty > left + 1e-9) throw new RuleError(left > 0 ? `Faltam só ${fq(left)} desta peça.` : "Esta peça já está toda pronta.");
      await tx.update(E.productionOrderComponents).set({ qtyDone: sql`${E.productionOrderComponents.qtyDone} + ${d.qty}` }).where(eq(E.productionOrderComponents.id, cp.c.id));
      const label = cp.i?.name ?? cp.c.description ?? "Peça";
      await tx.insert(E.productionReports).values({ ...base, productionOrderId: op.id, componentId: cp.c.id, itemId: cp.c.itemId, description: label });
      return `${fq(d.qty)} × ${label} pronto na OP ${op.number}.`;
    });
    return { ok: true, message: msg };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

/** Desfaz um apontamento: devolve a quantidade na OP ou na montagem e estorna a entrada no estoque. */
export async function deleteReportAction(id: string): Promise<ActionState> {
  const s = await ctx();
  if (!s) return NO;
  try {
    await s.tx(async (tx) => {
      const [r] = await tx.select().from(E.productionReports).where(eq(E.productionReports.id, id)).limit(1);
      if (!r) throw new RuleError("Apontamento não encontrado.");
      if (!s.ok(r.kind as Kind) || (!s.prod && (r.userId !== s.user.id || r.date !== today()))) throw new RuleError("Você só pode desfazer os seus apontamentos de hoje.");
      if (r.assemblyPartId) {
        await tx.update(E.assemblyParts).set({ qtyDone: sql`greatest(0, ${E.assemblyParts.qtyDone} - ${r.qty})` }).where(eq(E.assemblyParts.id, r.assemblyPartId));
        if (r.assemblyId) await autoStages(tx, r.assemblyId);
      } else if (r.componentId) {
        await tx.update(E.productionOrderComponents).set({ qtyDone: sql`greatest(0, ${E.productionOrderComponents.qtyDone} - ${r.qty})` }).where(eq(E.productionOrderComponents.id, r.componentId));
      } else {
        const lock = await closedUntil(tx);
        if (lock && r.date <= lock) throw new RuleError("O estoque desta data já foi fechado. Reabra o fechamento para desfazer.");
        const [{ sent }] = await tx.select({ sent: sql<number>`coalesce(sum(${E.assemblies.qty}), 0)::float` }).from(E.assemblies).where(eq(E.assemblies.productionOrderId, r.productionOrderId));
        const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, r.productionOrderId)).for("update");
        if (op && n(op.qtyProduced) - n(r.qty) < sent - 1e-9) throw new RuleError("Parte desta produção já foi enviada para montagem. Ajuste a montagem antes.");
        if (r.movementId) await tx.delete(E.stockMovements).where(eq(E.stockMovements.id, r.movementId));
        if (r.outputId) await tx.delete(E.productionOutputs).where(eq(E.productionOutputs.id, r.outputId));
        await tx.update(E.productionOrders).set({ qtyProduced: sql`greatest(0, ${E.productionOrders.qtyProduced} - ${r.qty})` }).where(eq(E.productionOrders.id, r.productionOrderId));
      }
      await tx.delete(E.productionReports).where(eq(E.productionReports.id, id));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "apontamento.desfeito", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "apontamento", entityId: id });
  return { ok: true, message: "Apontamento desfeito." };
}

/** Últimos apontamentos de quem está apontando (para conferir e desfazer). */
export type MyReport = { id: string; kind: string; label: string; target: string; qty: number; date: string; at: string };
export async function myReportsAction(): Promise<{ rows: MyReport[] } | { error: string }> {
  const s = await ctx();
  if (!s) return NO;
  const rows = await s.tx((tx) => tx.select({ r: E.productionReports, op: E.productionOrders.number, an: E.assemblies.number }).from(E.productionReports)
    .innerJoin(E.productionOrders, eq(E.productionOrders.id, E.productionReports.productionOrderId)).leftJoin(E.assemblies, eq(E.assemblies.id, E.productionReports.assemblyId))
    .where(and(eq(E.productionReports.userId, s.user.id), eq(E.productionReports.date, today()))).orderBy(desc(E.productionReports.createdAt)).limit(30));
  return { rows: rows.map(({ r, op, an }) => ({ id: r.id, kind: r.kind, label: r.description, target: r.assemblyId ? `Montagem ${an}` : `OP ${op}`, qty: n(r.qty), date: r.date, at: r.createdAt.toISOString() })) };
}

/** Equipe e locais para a tela de apontar. */
export async function reportLookupsAction(): Promise<{ team: [string, string][]; locations: [string, string][]; kinds: Kind[] } | { error: string }> {
  const s = await ctx();
  if (!s) return NO;
  const d = await s.tx(async (tx) => ({
    team: await tx.select({ id: E.teamMembers.id, n: E.teamMembers.name }).from(E.teamMembers).where(eq(E.teamMembers.active, true)).orderBy(asc(E.teamMembers.name)),
    locs: await tx.select({ id: E.stockLocations.id, c: E.stockLocations.code, n: E.stockLocations.name }).from(E.stockLocations).where(eq(E.stockLocations.active, true)).orderBy(asc(E.stockLocations.code)),
  }));
  return { team: d.team.map((t) => [t.id, t.n]), locations: d.locs.map((l) => [l.id, `${l.c} · ${l.n}`]), kinds: (["FABRICA", "MONTAGEM"] as Kind[]).filter((k) => s.ok(k)) };
}
