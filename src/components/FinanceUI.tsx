"use client";
import { useEffect, useState } from "react";
import { Sel } from "./SearchPicker";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { cancelTitleAction, deleteBankEntryAction, deleteTitleAction, payTitleAction, reversePaymentAction, saveBankEntryAction, saveTitleAction, transferAction } from "@/server/finance-actions";
import { fmtD, today, addDays } from "@/lib/dates";

type Opt = [string, string];
export type FinOpts = { partners: Opt[]; categories: Opt[]; methods: Opt[]; accounts: Opt[]; situations: Opt[]; responsibles: Opt[] };
export type Title = {
  id?: string; kind: "RECEBER" | "PAGAR"; description: string; document: string; partnerId: string; categoryId: string; issueDate: string; dueDate: string; amount: number;
  paymentMethodId: string; situationId: string; responsibleId: string; notes: string; status?: string; paidAt?: string | null; paidAmount?: number | null; bankAccountId?: string | null;
  originType?: string; originLabel?: string; installment?: string | null;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TitleModal({ t, o, onClose }: { t: Title; o: FinOpts; onClose: () => void }) {
  const [d, setD] = useState(t);
  const [rep, setRep] = useState(1);
  const { run, pending } = useRun();
  const R = d.kind === "RECEBER";
  const locked = !!d.originType && d.originType !== "MANUAL";
  const set = (p: Partial<Title>) => setD({ ...d, ...p });
  return (
    <Modal title={d.id ? (R ? "Conta a receber" : "Conta a pagar") : R ? "Nova conta a receber" : "Nova conta a pagar"} size="wide" onClose={onClose}
      foot={<>
        {d.id && d.status === "ABERTO" && !locked && <button type="button" className="btn btn-danger left" disabled={pending} onClick={() => { if (confirm("Excluir este lançamento?")) run(() => deleteTitleAction(d.id!), onClose); }}><Icon name="trash" size={16} /> Excluir</button>}
        {d.id && d.status === "ABERTO" && <button type="button" className={`btn${locked ? " left" : ""}`} disabled={pending} onClick={() => { if (confirm("Cancelar este lançamento? Ele deixa de contar no fluxo de caixa.")) run(() => cancelTitleAction(d.id!), onClose); }}>Cancelar lançamento</button>}
        {d.id && d.status === "CANCELADO" && <button type="button" className="btn left" disabled={pending} onClick={() => run(() => cancelTitleAction(d.id!, true), onClose)}>Reativar</button>}
        {d.id && d.status === "PAGO" && <button type="button" className="btn left" disabled={pending} onClick={() => { if (confirm("Estornar a baixa? O lançamento volta para em aberto.")) run(() => reversePaymentAction(d.id!), onClose); }}>Estornar {R ? "recebimento" : "pagamento"}</button>}
        <button type="button" className="btn" onClick={onClose}>Fechar</button>
        {d.status !== "CANCELADO" && <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveTitleAction({ id: d.id, kind: d.kind, description: d.description, document: d.document, partnerId: d.partnerId, categoryId: d.categoryId,
          issueDate: d.issueDate, dueDate: d.dueDate, amount: d.amount, paymentMethodId: d.paymentMethodId, situationId: d.situationId, responsibleId: d.responsibleId, notes: d.notes, repeat: rep }), onClose)}>Salvar</button>}
      </>}>
      {locked && <div className="infoline">Gerado automaticamente por {d.originLabel}{d.installment ? ` · parcela ${d.installment}` : ""}. Valor e {R ? "cliente" : "fornecedor"} vêm do documento.</div>}
      {d.status === "PAGO" && <div className="infoline" style={{ borderLeftColor: "var(--ok)" }}>{R ? "Recebido" : "Pago"} em {fmtD(d.paidAt)} · {brl(d.paidAmount ?? d.amount)} · {o.accounts.find(([v]) => v === d.bankAccountId)?.[1] ?? ""}</div>}
      <div className="form">
        <div className="fld full"><label htmlFor="t_d">Descrição <span className="req">*</span></label><input id="t_d" value={d.description} onChange={(e) => set({ description: e.target.value })} autoFocus={!d.id} /></div>
        <div className="fld"><label htmlFor="t_p">{R ? "Cliente" : "Fornecedor"}</label><Sel id="t_p" value={d.partnerId} disabled={locked} onChange={(e) => set({ partnerId: e.target.value })}><option value="">Nenhum</option>{o.partners.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="t_c">Categoria</label><Sel id="t_c" value={d.categoryId} onChange={(e) => set({ categoryId: e.target.value })}><option value="">Sem categoria</option>{o.categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="t_v">Valor (R$) <span className="req">*</span></label><input id="t_v" type="number" step="any" min={0} value={d.amount || ""} disabled={locked} onChange={(e) => set({ amount: Number(e.target.value) || 0 })} /></div>
        <div className="fld"><label htmlFor="t_ve">Vencimento <span className="req">*</span></label><input id="t_ve" type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>
        <div className="fld"><label htmlFor="t_e">Emissão</label><input id="t_e" type="date" value={d.issueDate} disabled={locked} onChange={(e) => set({ issueDate: e.target.value })} /></div>
        <div className="fld"><label htmlFor="t_doc">Documento</label><input id="t_doc" value={d.document} onChange={(e) => set({ document: e.target.value })} placeholder="NF, boleto, contrato…" /></div>
        <div className="fld"><label htmlFor="t_f">Forma de pagamento</label><Sel id="t_f" value={d.paymentMethodId} onChange={(e) => set({ paymentMethodId: e.target.value })}><option value="">—</option>{o.methods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="t_s">Situação</label><Sel id="t_s" value={d.situationId} onChange={(e) => set({ situationId: e.target.value })}><option value="">—</option>{o.situations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="t_r">Responsável</label><Sel id="t_r" value={d.responsibleId} onChange={(e) => set({ responsibleId: e.target.value })}><option value="">—</option>{o.responsibles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        {!d.id && <div className="fld"><label htmlFor="t_rep">Repetir mensalmente</label><input id="t_rep" type="number" min={1} max={60} value={rep} onChange={(e) => setRep(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} /><small>Meses, incluindo este. Útil para aluguel, energia e folha.</small></div>}
        <div className="fld full"><label htmlFor="t_o">Observações</label><textarea id="t_o" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

export function PayModal({ t, o, onClose }: { t: Title; o: FinOpts; onClose: () => void }) {
  const R = t.kind === "RECEBER";
  const [f, setF] = useState({ paidAt: today(), amount: String(t.amount), account: o.accounts[0]?.[0] ?? "", method: t.paymentMethodId });
  const { run, pending } = useRun();
  return (
    <Modal title={R ? "Registrar recebimento" : "Registrar pagamento"} size="narrow" onClose={onClose}
      foot={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={pending || !f.account}
        onClick={() => run(() => payTitleAction({ id: t.id!, paidAt: f.paidAt, paidAmount: Number(f.amount.replace(",", ".")) || 0, bankAccountId: f.account, paymentMethodId: f.method || null }), onClose)}>{R ? "Confirmar recebimento" : "Confirmar pagamento"}</button></>}>
      <p style={{ marginTop: 0 }}><b>{t.description}</b><br /><span className="muted">vence {fmtD(t.dueDate)} · {brl(t.amount)}</span></p>
      <div className="form">
        <div className="fld"><label htmlFor="b_d">Data</label><input id="b_d" type="date" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></div>
        <div className="fld"><label htmlFor="b_v">Valor (R$)</label><input id="b_v" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div className="fld full"><label htmlFor="b_c">Conta</label><Sel id="b_c" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>{o.accounts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld full"><label htmlFor="b_f">Forma</label><Sel id="b_f" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="">—</option>{o.methods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
      </div>
    </Modal>
  );
}

/** Lista de contas: abre a edição ao clicar na linha e a baixa pelo botão. */
export function TitlesTable({ rows, o, R, showPaid, canEdit, openId }: { rows: (Title & { partner: string; category: string; situation: { name: string; color: string } | null; resp: string; late: boolean })[]; o: FinOpts; R: boolean; showPaid: boolean; canEdit: boolean; openId?: string }) {
  const [edit, setEdit] = useState<Title | null>(null);
  const [pay, setPay] = useState<Title | null>(null);
  const router = useRouter(); const path = usePathname();
  useEffect(() => { if (openId) { const t = rows.find((r) => r.id === openId); if (t) setEdit(t); } }, [openId, rows]);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const close = () => { setEdit(null); if (openId) router.replace(path, { scroll: false }); };
  return (
    <>
      <table>
        <thead><tr><th>Vencimento</th><th>Descrição</th><th>{R ? "Cliente" : "Fornecedor"}</th><th>Categoria</th><th>Parcela</th><th className="num">Valor</th><th>Situação</th>{showPaid && <th>{R ? "Recebido em" : "Pago em"}</th>}<th><span className="sr">Ações</span></th></tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.id} className="click" style={t.status === "CANCELADO" ? { opacity: 0.55 } : undefined} onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) setEdit(t); }}>
            <td className={`code${t.late ? " t-bad" : ""}`}>{fmtD(t.dueDate)}</td><td className="desc" style={{ minWidth: 200 }}>{t.description}{t.document && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{t.document}</div>}</td>
            <td>{t.partner || "—"}</td><td style={{ fontSize: 12.5 }}>{t.category || "—"}</td><td>{t.installment ?? ""}</td>
            <td className="num"><b>{brl(t.amount)}</b></td>
            <td>{t.status === "PAGO" ? <span className="badge ok">{R ? "Recebido" : "Pago"}</span> : t.status === "CANCELADO" ? <span className="badge">Cancelado</span> : t.late ? <span className="badge bad">Vencido</span> : <span className="badge warn">Em aberto</span>}
              {/* situação interna e responsável ficam abaixo, para a tabela caber na tela como no protótipo */}
              {(t.situation || t.resp) && <div className="t-sub">{t.situation && <span className="sdot" style={{ background: t.situation.color }} />}{[t.situation?.name, t.resp].filter(Boolean).join(" · ")}</div>}</td>
            {showPaid && <td className="code">{fmtD(t.paidAt)}</td>}
            <td className="acts show">{canEdit && t.status === "ABERTO" && <button type="button" className="btn btn-sm" onClick={() => setPay(t)}>{R ? "Receber" : "Pagar"}</button>}</td>
          </tr>))}</tbody>
        <tfoot><tr><td colSpan={5}>Total</td><td className="num">{brl(total)}</td><td colSpan={showPaid ? 3 : 2} /></tr></tfoot>
      </table>
      {edit && <TitleModal t={edit} o={o} onClose={close} />}
      {pay && <PayModal t={pay} o={o} onClose={() => setPay(null)} />}
    </>
  );
}

export function NewTitleButton({ kind, o }: { kind: "RECEBER" | "PAGAR"; o: FinOpts }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="plus" size={16} /> Novo lançamento</button>
      {open && <TitleModal o={o} onClose={() => setOpen(false)} t={{ kind, description: "", document: "", partnerId: "", categoryId: "", issueDate: today(), dueDate: addDays(today(), 30), amount: 0, paymentMethodId: "", situationId: "", responsibleId: "", notes: "" }} />}
    </>
  );
}

export function PayButton({ t, o }: { t: Title; o: FinOpts }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>{t.kind === "RECEBER" ? "Receber" : "Pagar"}</button>{open && <PayModal t={t} o={o} onClose={() => setOpen(false)} />}</>;
}

export function BankButtons({ accountId, accounts }: { accountId: string; accounts: Opt[] }) {
  const [open, setOpen] = useState<"lanc" | "transf" | null>(null);
  const [f, setF] = useState({ date: today(), description: "", amount: "", sign: "-", to: "" });
  const { run, pending } = useRun();
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen("transf")}><Icon name="swap" size={16} /> Transferir entre contas</button>
      <button type="button" className="btn btn-primary" onClick={() => setOpen("lanc")}><Icon name="plus" size={16} /> Lançamento avulso</button>
      {open && <Modal title={open === "lanc" ? "Lançamento avulso no extrato" : "Transferência entre contas"} size="narrow" onClose={() => setOpen(null)}
        foot={<><button type="button" className="btn" onClick={() => setOpen(null)}>Cancelar</button><button type="button" className="btn btn-primary" disabled={pending}
          onClick={() => {
            const v = Number(f.amount.replace(/\./g, "").replace(",", ".")) || 0;
            if (open === "lanc") run(() => saveBankEntryAction({ bankAccountId: accountId, date: f.date, description: f.description, amount: f.sign === "-" ? -v : v }), () => setOpen(null));
            else run(() => transferAction({ from: accountId, to: f.to, date: f.date, amount: v, description: f.description }), () => setOpen(null));
          }}>Registrar</button></>}>
        <div className="form">
          {open === "lanc" && <div className="fld full"><div className="seg"><button type="button" aria-pressed={f.sign === "-"} onClick={() => setF({ ...f, sign: "-" })}>Saída</button><button type="button" aria-pressed={f.sign === "+"} onClick={() => setF({ ...f, sign: "+" })}>Entrada</button></div></div>}
          {open === "transf" && <div className="fld full"><label htmlFor="tr_to">Conta de destino</label><Sel id="tr_to" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">Selecione…</option>{accounts.filter(([v]) => v !== accountId).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>}
          <div className="fld"><label htmlFor="bk_d">Data</label><input id="bk_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="fld"><label htmlFor="bk_v">Valor (R$)</label><input id="bk_v" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <div className="fld full"><label htmlFor="bk_x">Descrição</label><input id="bk_x" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={open === "lanc" ? "Tarifa bancária, rendimento, ajuste…" : "Transferência entre contas"} /></div>
        </div>
      </Modal>}
    </>
  );
}

export function DeleteEntryButton({ id }: { id: string }) {
  const { run, pending } = useRun();
  return <button type="button" className="mini-btn danger" title="Excluir lançamento" disabled={pending} onClick={() => { if (confirm("Excluir este lançamento do extrato?")) run(() => deleteBankEntryAction(id)); }}><Icon name="trash" size={12} /></button>;
}
