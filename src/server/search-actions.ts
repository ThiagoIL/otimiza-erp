"use server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import * as E from "@/db/erp";
import { act, NO_ACCESS } from "@/lib/access";

/**
 * Pesquisas usadas pelas janelas de seleção (cliente, fornecedor, grupo, ordem de produção).
 * Para cadastros que podem crescer muito, a escolha é sempre por pesquisa, nunca por lista suspensa.
 */
const PAGE = 30;
const input = z.object({ q: z.string().max(120).default(""), filter: z.string().max(60).default(""), page: z.number().int().min(1).max(10000).default(1) });
type In = z.input<typeof input>;
export type SearchRow = { id: string; label: string; cells: string[]; data?: Record<string, string> };
export type SearchResult = { rows: SearchRow[]; total: number } | { error: string };

const like = (q: string) => `%${q.trim()}%`;

/** Clientes, fornecedores e transportadoras. filter = tipo do cadastro ("Cliente", "Fornecedor"…). */
export async function searchPartnersAction(raw: In): Promise<SearchResult> {
  const s = await act(["comercial", "compras", "financeiro", "estoque", "producao"]);
  if (!s) return { error: NO_ACCESS.error };
  const d = input.parse(raw);
  return s.tx(async (tx) => {
    const c: SQL[] = [eq(E.partners.active, true)];
    if (d.q.trim()) {
      const digits = d.q.replace(/\D/g, "");
      c.push(or(ilike(E.partners.name, like(d.q)), ilike(E.partners.tradeName, like(d.q)), ilike(E.partners.city, like(d.q)),
        ...(digits.length >= 3 ? [sql`regexp_replace(coalesce(${E.partners.document}, ''), '\\D', '', 'g') like ${"%" + digits + "%"}`] : []))!);
    }
    if (d.filter) c.push(sql`${d.filter} = any(${E.partners.kinds})`);
    const where = and(...c);
    const rows = await tx.select().from(E.partners).where(where).orderBy(asc(sql`coalesce(${E.partners.tradeName}, ${E.partners.name})`)).limit(PAGE).offset((d.page - 1) * PAGE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(E.partners).where(where);
    return {
      total,
      rows: rows.map((p) => {
        const place = [p.street && `${p.street}${p.number ? ", " + p.number : ""}`, p.city && `${p.city}${p.uf ? "/" + p.uf : ""}`].filter(Boolean).join(" · ");
        return {
          id: p.id, label: p.tradeName || p.name,
          cells: [p.tradeName || p.name, p.tradeName ? p.name : "", p.document ?? "—", p.city ? `${p.city}${p.uf ? "/" + p.uf : ""}` : "—", p.phone || p.mobile1 || "—"],
          data: { place, salespersonId: p.salespersonId ?? "" },
        };
      }),
    };
  });
}

/** Grupos de itens, com o caminho completo (Pai › Filho) e o próximo código automático. */
export async function searchGroupsAction(raw: In): Promise<SearchResult> {
  const s = await act(["itens", "estoque", "compras", "comercial", "producao"]);
  if (!s) return { error: NO_ACCESS.error };
  const d = input.parse(raw);
  return s.tx(async (tx) => {
    const all = await tx.select({ id: E.itemGroups.id, name: E.itemGroups.name, code: E.itemGroups.code, parentId: E.itemGroups.parentId, prefix: E.itemGroups.codePrefix,
      digits: E.itemGroups.prefixDigits, n: E.itemGroups.nextNumber, items: sql<number>`(select count(*)::int from items i where i.group_id = "item_groups"."id")` }).from(E.itemGroups);
    const byId = new Map(all.map((g) => [g.id, g]));
    const pathOf = (id: string): string => { const seen = new Set<string>(); const parts: string[] = []; let g = byId.get(id);
      while (g && !seen.has(g.id)) { seen.add(g.id); parts.unshift(g.name); g = g.parentId ? byId.get(g.parentId) : undefined; } return parts.join(" › "); };
    const q = d.q.trim().toLowerCase();
    const list = all.map((g) => ({ g, path: pathOf(g.id) }))
      .filter(({ g, path }) => !q || path.toLowerCase().includes(q) || (g.code ?? "").toLowerCase().includes(q) || (g.prefix ?? "").toLowerCase().includes(q))
      .filter(({ g }) => !d.filter || g.id !== d.filter) // filter = grupo a excluir (o próprio, ao escolher o pai)
      .sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
    const page = list.slice((d.page - 1) * PAGE, d.page * PAGE);
    return {
      total: list.length,
      rows: page.map(({ g, path }) => {
        const next = g.prefix ? g.prefix + String(g.n).padStart(g.digits, "0") : "";
        return { id: g.id, label: path, cells: [g.code ?? "—", path, g.prefix ? `${g.prefix}${"0".repeat(Math.max(1, g.digits - 1))}1` : "—", String(g.items)], data: { next } };
      }),
    };
  });
}

/** Ordens de produção. filter "abertas" = só as que ainda não terminaram (padrão). */
export async function searchOrdersAction(raw: In): Promise<SearchResult> {
  const s = await act(["producao", "estoque"]);
  if (!s) return { error: NO_ACCESS.error };
  const d = input.parse(raw);
  return s.tx(async (tx) => {
    const c: SQL[] = [];
    if (d.filter !== "todas") c.push(sql`${E.productionStages.kind} not in ('finalizada', 'cancelada')`);
    if (d.q.trim()) {
      const n = Number(d.q.replace(/\D/g, ""));
      c.push(or(ilike(E.items.name, like(d.q)), ilike(E.items.code, like(d.q)), ilike(E.partners.name, like(d.q)), ilike(E.partners.tradeName, like(d.q)), ...(n ? [eq(E.productionOrders.number, n)] : []))!);
    }
    const where = c.length ? and(...c) : undefined;
    const base = () => tx.select({ o: E.productionOrders, it: E.items.name, code: E.items.code, unit: E.items.unit, st: E.productionStages.name,
      cli: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.productionOrders)
      .innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId))
      .leftJoin(E.partners, eq(E.partners.id, E.productionOrders.partnerId));
    const rows = await base().where(where).orderBy(desc(E.productionOrders.number)).limit(PAGE).offset((d.page - 1) * PAGE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(E.productionOrders)
      .innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId))
      .leftJoin(E.partners, eq(E.partners.id, E.productionOrders.partnerId)).where(where);
    const br = (v: string | null) => (v ? v.split("-").reverse().join("/") : "—");
    return {
      total,
      rows: rows.map((r) => ({
        id: r.o.id, label: `OP ${r.o.number} · ${r.it}`,
        cells: [`OP ${r.o.number}`, r.it, `${Number(r.o.qty).toLocaleString("pt-BR")} ${r.unit}`, r.cli ?? "Estoque", r.st, br(r.o.needDate)],
      })),
    };
  });
}
