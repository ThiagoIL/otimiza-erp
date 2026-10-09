"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveOrderToStage } from "@/server/production-actions";

export type KanbanCard = {
  id: string; number: string; item: string; qty: string; produced: number; total: number;
  status?: { name: string; color: string } | null; due?: string | null; late: boolean;
  center?: string | null; responsible?: string | null; customer?: string | null; priority: number;
};
export type KanbanColumn = { id: string; name: string; color: string; isFinal: boolean; cards: KanbanCard[] };

/** Quadro de ordens por etapa. Arraste o cartão para outra coluna ou use as setas do cartão. */
export function KanbanBoard({ columns: initial }: { columns: KanbanColumn[] }) {
  const [cols, setCols] = useState(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  // quando o servidor manda dados novos, o quadro passa a mostrá-los
  const [src, setSrc] = useState(initial);
  if (src !== initial) { setSrc(initial); setCols(initial); }

  function move(cardId: string, to: string) {
    const from = cols.find((c) => c.cards.some((k) => k.id === cardId));
    if (!from || from.id === to) return;
    const card = from.cards.find((k) => k.id === cardId)!;
    const before = cols;
    setCols((cs) => cs.map((c) => c.id === from.id ? { ...c, cards: c.cards.filter((k) => k.id !== cardId) } : c.id === to ? { ...c, cards: [card, ...c.cards] } : c));
    setError(null);
    start(async () => {
      const r = await moveOrderToStage(cardId, to);
      if (r.error) { setCols(before); setError(r.error); }
      else router.refresh();
    });
  }

  return (
    <>
      {error && <div className="alert bad" role="alert">{error}</div>}
      <div className="kanban">
        {cols.map((c, ci) => (
          <section key={c.id} className={`kcol${over === c.id ? " over" : ""}`} aria-label={`Etapa ${c.name}`}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(c.id); } }}
            onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); if (drag) move(drag, c.id); setDrag(null); }}>
            <header className="kcol-h" style={{ borderTopColor: c.color }}><b>{c.name}</b><span className="kcount">{c.cards.length}</span></header>
            <div className="kcol-b">
              {c.cards.length === 0 && <p className="kempty">Arraste uma ordem para cá</p>}
              {c.cards.map((k) => (
                <article key={k.id} className={`kcard${drag === k.id ? " dragging" : ""}`} draggable
                  onDragStart={(e) => { setDrag(k.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k.id); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}>
                  <div className="kcard-top">
                    <Link href={`/producao/${k.id}`} className="kno">{k.number}</Link>
                    {k.priority === 1 && <span className="badge bad">Alta</span>}
                    {k.status && <span className="badge dot" style={{ ["--dot" as string]: k.status.color }}>{k.status.name}</span>}
                  </div>
                  <Link href={`/producao/${k.id}`} className="ktitle">{k.item}</Link>
                  <div className="kmeta">{k.qty}{k.customer && <> · {k.customer}</>}</div>
                  {k.total > 0 && <div className="progress" aria-label={`Produzido ${Math.round((k.produced / k.total) * 100)}%`}><span style={{ width: `${Math.min(100, (k.produced / k.total) * 100)}%` }} /></div>}
                  <div className="kfoot">
                    <span className={k.late ? "late" : undefined}>{k.due ? `Prazo ${k.due}` : "Sem prazo"}</span>
                    <span>{k.responsible ?? k.center ?? ""}</span>
                  </div>
                  <div className="kmove">
                    {ci > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(k.id, cols[ci - 1].id)} aria-label={`Mover ${k.number} para ${cols[ci - 1].name}`}>‹</button>}
                    <span className="grow" />
                    {ci < cols.length - 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(k.id, cols[ci + 1].id)} aria-label={`Mover ${k.number} para ${cols[ci + 1].name}`}>›</button>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
