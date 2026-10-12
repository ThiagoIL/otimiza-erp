import { page } from "@/lib/access";
import { SIMPLE, type Opt } from "@/server/simple-registry";
import { SimpleCrud } from "@/components/SimpleCrud";
import { saveSimpleAction, deleteSimpleAction } from "@/server/simple-actions";
import type { ReactNode } from "react";

/** Página de um cadastro simples: lista com busca e edição em janela, como no protótipo. */
export async function SimplePage({ k, title, sub, note }: { k: string; title?: string; sub?: string; note?: ReactNode }) {
  const E = SIMPLE[k];
  const s = await page(E.mod);
  const { rows, opts } = await s.tx(async (tx) => {
    const sel: Record<string, unknown> = { id: E.table.id };
    const cols = E.table as unknown as Record<string, unknown>;
    for (const f of E.fields) sel[f.k] = cols[f.k];
    for (const c of E.counts ?? []) sel[c.k] = c.sql;
    let q = tx.select(sel as never).from(E.table).$dynamic();
    if (E.where) q = q.where(E.where);
    const order = E.order(undefined as never);
    const rows = await q.orderBy(...(Array.isArray(order) ? order : [order]) as never[]) as Record<string, unknown>[];
    const opts: Record<string, Opt[]> = {};
    for (const f of E.fields) if (f.opts) opts[f.k] = typeof f.opts === "function" ? await f.opts(tx) : f.opts;
    return { rows, opts };
  });
  const fields = E.fields.map(({ opts: _o, ...f }) => ({ ...f, options: opts[f.k] }));
  const cols = [...E.cols, ...(E.counts ?? []).map((c) => ({ k: c.k, label: c.label, f: c.f }))];
  const nextPos = E.autoPos ? Math.max(0, ...rows.map((r) => Number(r.position) || 0)) + 1 : undefined;
  return (
    <>
      <SimpleCrud title={title ?? E.title} sub={sub ?? E.sub} k={k} one={E.one} fem={!!E.fem} fields={fields} cols={cols} rows={JSON.parse(JSON.stringify(rows))}
        canEdit={s.edit} nextPos={nextPos} save={saveSimpleAction.bind(null, k)} remove={deleteSimpleAction.bind(null, k)} />
      {note}
    </>
  );
}
