import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import * as E from "@/db/erp";
import type { Tx } from "@/lib/db";
import { RuleError } from "./common";

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Copia a estrutura do item para a OP, já multiplicada pela quantidade e com a perda. */
export async function copyBom(tx: Tx, tenantId: string, opId: string, itemId: string, qty: number) {
  const bom = await tx.select().from(E.itemBom).where(eq(E.itemBom.itemId, itemId)).orderBy(asc(E.itemBom.position));
  if (bom.length) await tx.insert(E.productionOrderComponents).values(bom.map((b, i) => ({
    tenantId, productionOrderId: opId, itemId: b.componentId, qtyRequired: String(r4(Number(b.qty) * qty * (1 + Number(b.lossPct) / 100))), supply: b.supply, fromBom: true, position: i,
  })));
  return bom.length;
}

export async function firstStage(tx: Tx) {
  const [st] = await tx.select().from(E.productionStages).where(ne(E.productionStages.kind, "cancelada")).orderBy(sql`case when ${E.productionStages.kind} = 'aberta' then 0 else 1 end`, asc(E.productionStages.position)).limit(1);
  if (!st) throw new RuleError("Cadastre as etapas das OPs em Produção › Configurações.");
  return st;
}

/** Atualiza a situação de produção do pedido de venda conforme as OPs dele. */
export async function syncOrderProduction(tx: Tx, salesOrderId: string | null) {
  if (!salesOrderId) return;
  const ops = await tx.select({ kind: E.productionStages.kind }).from(E.productionOrders).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId)).where(eq(E.productionOrders.salesOrderId, salesOrderId));
  const live = ops.filter((o) => o.kind !== "cancelada");
  const st = !live.length ? "PENDENTE" : live.every((o) => o.kind === "finalizada") ? "PRODUZIDO" : "EM_PRODUCAO";
  await tx.update(E.salesOrders).set({ productionStatus: st }).where(and(eq(E.salesOrders.id, salesOrderId), ne(E.salesOrders.status, "CANCELADO")));
}


// ------------------------------------------------------------------------------------
// Campos personalizados da medição e da OP
// ------------------------------------------------------------------------------------
const normL = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Campos ativos de uma entidade (measurement, production_order…). */
export async function fieldsOf(tx: Tx, entity: string) {
  return tx.select().from(E.customFields).where(and(eq(E.customFields.entity, entity), eq(E.customFields.active, true))).orderBy(asc(E.customFields.position));
}

/** Mantém só os campos que existem; com check, confere os obrigatórios. */
export async function cleanCustom(tx: Tx, entity: string, custom: Record<string, string>, check: boolean, what = "") {
  const cf = await fieldsOf(tx, entity);
  const miss = check && cf.find((f) => f.required && !(custom[f.id] ?? "").trim());
  if (miss) throw new RuleError(`Preencha o campo “${miss.label}”${what ? " " + what : ""}.`);
  return Object.fromEntries(cf.filter((f) => custom[f.id] != null && String(custom[f.id]).trim() !== "").map((f) => [f.id, String(custom[f.id]).trim()]));
}

/** Copia os valores da medição para os campos da OP com o mesmo nome (ex.: Tipo, Pintura, Linha). */
export async function measureToOpMapper(tx: Tx) {
  const [mf, of] = await Promise.all([fieldsOf(tx, "measurement"), fieldsOf(tx, "production_order")]);
  const pairs = mf.map((m) => [m.id, of.find((o) => normL(o.label) === normL(m.label))?.id] as const).filter((x): x is readonly [string, string] => !!x[1]);
  return (c: Record<string, string>) => Object.fromEntries(pairs.filter(([m]) => c[m]).map(([m, o]) => [o, c[m]]));
}

/** Campo de peso da medição (o primeiro cujo nome começa com “Peso”), em kg por unidade. */
export async function weightFieldId(tx: Tx): Promise<string | null> {
  const mf = await fieldsOf(tx, "measurement");
  return mf.find((f) => normL(f.label).startsWith("peso"))?.id ?? null;
}

const toNum = (v: unknown) => { const s = String(v ?? "").trim(); if (!s) return 0; const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(n) ? n : 0; };

/**
 * Peso por unidade de cada OP: média ponderada do peso das linhas da medição ligadas à OP;
 * sem medição, o peso líquido (ou bruto) do cadastro do item.
 */
export async function opUnitWeights(tx: Tx): Promise<Map<string, number>> {
  const wf = await weightFieldId(tx);
  const out = new Map<string, number>();
  const ops = await tx.select({ id: E.productionOrders.id, w: sql<string | null>`coalesce(${E.items.netWeight}, ${E.items.grossWeight})::text` })
    .from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId));
  for (const o of ops) out.set(o.id, toNum(o.w));
  if (wf) {
    const lines = await tx.select({ op: E.measurementItems.productionOrderId, q: E.measurementItems.qty, c: E.measurementItems.custom }).from(E.measurementItems).where(sql`${E.measurementItems.productionOrderId} is not null`);
    const acc = new Map<string, { q: number; w: number }>();
    for (const l of lines) { const a = acc.get(l.op!) ?? { q: 0, w: 0 }; a.q += Number(l.q); a.w += Number(l.q) * toNum(l.c[wf]); acc.set(l.op!, a); }
    for (const [op, a] of acc) if (a.w > 0 && a.q > 0) out.set(op, a.w / a.q);
  }
  return out;
}
export { toNum as customNum };
