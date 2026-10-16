"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { useRun } from "./client";
import { setPurchaseStageAction } from "@/server/purchase-actions";
import { fmtD, today } from "@/lib/dates";

export type POStageCol = { id: string; name: string; color: string; kind: string };
export type POCard = {
  id: string; number: number; supplier: string; client: string | null; work: string | null; stageId: string; delivery: string | null;
  total: number; first: string | null; nItems: number; files: number; received: number; status: string; tags: { label: string; value: string }[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
// cor fixa por valor (ex.: cada tratamento sempre com a mesma cor), como as etiquetas do ClickUp
const TAG_COLORS = ["#1E3A5F", "#7A4FA0", "#1F8A8A", "#C2185B", "#2E7D4F", "#8A6D1F", "#2F6E9A", "#C77700", "#B3261E", "#4A5260"];
const tagColor = (v: string) => TAG_COLORS[[...v].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % TAG_COLORS.length];

/** Quadro dos pedidos de compra por etapa: arraste o cartão para mudar a etapa. */
export function PurchaseBoard({ stages, cards, canEdit }: { stages: POStageCol[]; cards: POCard[]; canEdit: boolean }) {
  const router = useRouter();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { run } = useRun();
  const hoje = today();
  return (
    <div className="kanban po-board">
      {stages.map((st) => {
        const list = cards.filter((c) => c.stageId === st.id);
        const sum = list.reduce((a, c) => a + c.total, 0);
        return (
          <section key={st.id} className={`col${over === st.id ? " over" : ""}`} style={{ ["--c" as string]: st.color }} aria-label={st.name}
            onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOver(st.id); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const c = cards.find((x) => x.id === drag); setDrag(null); if (c && c.stageId !== st.id) run(() => setPurchaseStageAction(c.id, st.id)); }}>
            <div className="col-h"><span className="dot" style={{ background: st.color }} />{st.name}<span className="n">{list.length}</span></div>
            {list.length > 0 && <div className="col-sum">{brl(sum)}</div>}
            <div className="col-b">
              {list.map((c) => {
                const open = st.kind !== "RECEBIDO" && st.kind !== "CANCELADO";
                const late = open && c.delivery && c.delivery < hoje;
                return (
                  <article key={c.id} className="card po-card" draggable={canEdit} tabIndex={0} style={{ ["--c" as string]: st.color }}
                    onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag(null)} onClick={() => router.push(`/compras/pedidos/${c.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") router.push(`/compras/pedidos/${c.id}`); }} aria-label={`Pedido de compra ${c.number}`}>
                    <h3>{String(c.number).padStart(3, "0")} · {c.supplier}</h3>
                    {(c.client || c.work) && <div className="po-who">{c.client && <span><Icon name="partner" size={12} /> {c.client}</span>}{c.work && <span><Icon name="pin" size={12} /> {c.work}</span>}</div>}
                    <div className="meta"><span className="ell">{c.first ?? "Sem itens"}{c.nItems > 1 ? ` +${c.nItems - 1}` : ""}</span></div>
                    {c.tags.length > 0 && <div className="po-tags">{c.tags.map((t) => <span key={t.label} className="po-tag" title={t.label} style={{ ["--t" as string]: tagColor(t.value) }}>{t.value}</span>)}</div>}
                    <div className="po-foot">
                      <span className={`badge${late ? " bad" : ""}`}>{late && <Icon name="alert" size={12} />}<Icon name="clock" size={12} /> {c.delivery ? fmtD(c.delivery) : "sem data"}</span>
                      {c.files > 0 && <span className="po-ic" title="Anexos"><Icon name="clip" size={13} /> {c.files}</span>}
                      {c.status === "RECEBIDO_PARCIAL" && <span className="po-ic" title="Recebido em parte">{Math.round(c.received)}% recebido</span>}
                      <b className="po-val">{brl(c.total)}</b>
                    </div>
                  </article>
                );
              })}
              {!list.length && <div className="col-empty">{canEdit ? "Arraste um pedido para cá" : "Vazio"}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
