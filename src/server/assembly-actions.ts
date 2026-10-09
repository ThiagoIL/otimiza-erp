"use server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@/lib/db";
import { assemblies, assemblyAreas, assemblyPieces, partners, salesOrders, teamMembers } from "@/db/schema";
import { SESSION_EXPIRED, tenantUserForAction } from "@/lib/context";
import { audit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/errors";
import { formObject, keepValues, zDay, zOpt, zodFail, zRef } from "@/lib/forms";
import { mtNumber } from "@/lib/format";
import type { ActionState } from "@/lib/action";
import { nextNumber } from "./stock";
import { parsePieces } from "@/lib/assembly";

class UserError extends Error {}

async function check(tx: Tx, table: typeof partners | typeof salesOrders | typeof teamMembers | typeof assemblyAreas, id: string | null, label: string) {
  if (!id) return;
  const [r] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (!r) throw new UserError(`${label} não encontrado(a). Atualize a página.`);
}

const assemblySchema = z.object({
  id: z.string().max(64).optional(),
  nome: z.string().trim().min(2, "Informe a obra ou o projeto.").max(120),
  cliente: zRef, pedido: zRef, endereco: zOpt(200),
  situacao: z.enum(["PLANEJADA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]).default("PLANEJADA"),
  inicio: zDay("Início"), prazo: zDay("Prazo"), observacoes: zOpt(1000),
});

export async function saveAssemblyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = assemblySchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const tid = s.tenant.id;
  let id = d.id ?? "";
  let number = 0;
  try {
    await withTenant(tid, async (tx) => {
      await check(tx, partners, d.cliente, "Cliente");
      await check(tx, salesOrders, d.pedido, "Pedido de venda");
      let customer = d.cliente;
      if (!customer && d.pedido) customer = (await tx.select({ c: salesOrders.customerId }).from(salesOrders).where(eq(salesOrders.id, d.pedido)))[0]?.c ?? null;
      const values = { name: d.nome, customerId: customer, salesOrderId: d.pedido, address: d.endereco, status: d.situacao, startDate: d.inicio, dueDate: d.prazo, notes: d.observacoes };
      if (id) {
        const r = await tx.update(assemblies).set(values).where(and(eq(assemblies.id, id), eq(assemblies.tenantId, tid))).returning({ number: assemblies.number });
        if (!r.length) throw new UserError("Montagem não encontrada.");
        number = r[0].number;
      } else {
        number = await nextNumber(tx, "assemblies", tid);
        id = (await tx.insert(assemblies).values({ ...values, tenantId: tid, number }).returning({ id: assemblies.id }))[0].id;
      }
    });
  } catch (err) {
    if (err instanceof UserError) return { error: err.message, values: keepValues(raw) };
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  await audit({ action: d.id ? "montagem.alterada" : "montagem.criada", tenantId: tid, userId: s.user.id, userEmail: s.user.email, entity: "montagem", entityId: id, data: { numero: number } });
  return { ok: true, redirectTo: `/montagens/${id}?msg=${encodeURIComponent(`${mtNumber(number)} ${d.id ? "salva" : "criada. Agora inclua os ambientes e as peças."}`)}` };
}

export async function deleteAssemblyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  if (s.user.role !== "TENANT_ADMIN") return { error: "Apenas administradores da empresa podem excluir montagens. Você pode cancelá-la." };
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const r = await withTenant(s.tenant.id, (tx) => tx.delete(assemblies).where(and(eq(assemblies.id, id), eq(assemblies.tenantId, s.tenant.id))).returning({ number: assemblies.number }));
  if (!r.length) return { error: "Montagem não encontrada." };
  await audit({ action: "montagem.excluida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "montagem", entityId: id, data: { numero: r[0].number } });
  return { ok: true, redirectTo: `/montagens?msg=${encodeURIComponent(`${mtNumber(r[0].number)} excluída.`)}` };
}

const areaSchema = z.object({
  id: z.string().max(64).optional(),
  montagem: z.string().min(1).max(64),
  nome: z.string().trim().min(1, "Informe o nome.").max(80),
  pai: zRef, montador: zRef, auxiliar: zRef, prazo: zDay("Prazo"),
});

/** Ambiente, andar ou apartamento. Com "pai", fica dentro de outro (ex.: apartamento dentro do andar). */
export async function saveAreaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = areaSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const tid = s.tenant.id;
  try {
    await withTenant(tid, async (tx) => {
      const [a] = await tx.select({ id: assemblies.id }).from(assemblies).where(and(eq(assemblies.id, d.montagem), eq(assemblies.tenantId, tid)));
      if (!a) throw new UserError("Montagem não encontrada.");
      await check(tx, teamMembers, d.montador, "Montador");
      await check(tx, teamMembers, d.auxiliar, "Auxiliar");
      if (d.pai) {
        if (d.pai === d.id) throw new UserError("Um ambiente não pode ficar dentro dele mesmo.");
        const [parent] = await tx.select({ assemblyId: assemblyAreas.assemblyId, parentId: assemblyAreas.parentId }).from(assemblyAreas).where(eq(assemblyAreas.id, d.pai));
        if (!parent || parent.assemblyId !== d.montagem) throw new UserError("Nível superior não encontrado nesta montagem.");
        if (parent.parentId) throw new UserError("Use no máximo dois níveis (ex.: andar → apartamento).");
        if (d.id) {
          const [kids] = await tx.select({ n: sql<number>`count(*)::int` }).from(assemblyAreas).where(eq(assemblyAreas.parentId, d.id));
          if (kids.n) throw new UserError("Este item já tem subníveis e não pode ficar dentro de outro.");
        }
      }
      const values = { name: d.nome, parentId: d.pai, assemblerId: d.montador, helperId: d.auxiliar, dueDate: d.prazo };
      if (d.id) {
        const r = await tx.update(assemblyAreas).set(values).where(and(eq(assemblyAreas.id, d.id), eq(assemblyAreas.assemblyId, d.montagem))).returning({ id: assemblyAreas.id });
        if (!r.length) throw new UserError("Ambiente não encontrado.");
      } else {
        await tx.insert(assemblyAreas).values({ ...values, tenantId: tid, assemblyId: d.montagem });
      }
    });
  } catch (err) {
    if (err instanceof UserError) return { error: err.message, values: keepValues(raw) };
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  return { ok: true, message: d.id ? "Ambiente salvo." : `“${d.nome}” incluído.`, values: d.id ? undefined : {} };
}

export async function deleteAreaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const r = await withTenant(s.tenant.id, (tx) => tx.delete(assemblyAreas).where(and(eq(assemblyAreas.id, id), eq(assemblyAreas.tenantId, s.tenant.id))).returning({ name: assemblyAreas.name }));
  if (!r.length) return { error: "Ambiente não encontrado." };
  await audit({ action: "montagem.ambiente_excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "ambiente", entityId: id, data: { nome: r[0].name } });
  return { ok: true, message: `“${r[0].name}” excluído.` };
}

export async function addPiecesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const area = String(fd.get("ambiente") ?? "").slice(0, 64);
  const pieces = parsePieces(String(fd.get("pecas") ?? "").slice(0, 20000));
  if (!pieces.length) return { fields: { pecas: "Escreva ao menos uma peça." }, error: "Confira os campos destacados." };
  try {
    await withTenant(s.tenant.id, async (tx) => {
      await check(tx, assemblyAreas, area, "Ambiente");
      await tx.insert(assemblyPieces).values(pieces.map((p) => ({ tenantId: s.tenant.id, areaId: area, description: p.description, quantity: String(p.quantity) })));
    });
  } catch (err) {
    return { error: err instanceof UserError ? err.message : friendlyDbError(err) };
  }
  return { ok: true, message: `${pieces.length} ${pieces.length === 1 ? "peça incluída" : "peças incluídas"}.`, values: {} };
}

/** Marca a peça como montada (ou desfaz). A montagem planejada passa a "em andamento" na primeira peça. */
export async function togglePieceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const done = fd.get("feito") === "1";
  try {
    await withTenant(s.tenant.id, async (tx) => {
      const [p] = await tx.update(assemblyPieces).set({ doneAt: done ? new Date() : null, doneBy: done ? s.user.name : null })
        .where(and(eq(assemblyPieces.id, id), eq(assemblyPieces.tenantId, s.tenant.id))).returning({ areaId: assemblyPieces.areaId });
      if (!p) throw new UserError("Peça não encontrada.");
      if (done) {
        await tx.update(assemblies).set({ status: "EM_ANDAMENTO", startDate: sql`coalesce(${assemblies.startDate}, current_date)` })
          .where(and(eq(assemblies.status, "PLANEJADA"), sql`${assemblies.id} = (select ${assemblyAreas.assemblyId} from ${assemblyAreas} where ${assemblyAreas.id} = ${p.areaId})`));
      }
    });
  } catch (err) {
    return { error: err instanceof UserError ? err.message : friendlyDbError(err) };
  }
  return { ok: true };
}

export async function deletePieceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const id = String(fd.get("id") ?? "").slice(0, 64);
  const r = await withTenant(s.tenant.id, (tx) => tx.delete(assemblyPieces).where(and(eq(assemblyPieces.id, id), eq(assemblyPieces.tenantId, s.tenant.id))).returning({ id: assemblyPieces.id }));
  return r.length ? { ok: true } : { error: "Peça não encontrada." };
}
