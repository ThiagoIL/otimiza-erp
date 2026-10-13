"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { toast } from "./Toast";

/**
 * Barra de filtros que aplica sozinha: muda a URL (?filtros) ao alterar qualquer campo.
 * A página (servidor) lê os filtros da URL, então dá para salvar ou compartilhar o link filtrado.
 */
export function FilterBar({ children, more, moreActive = 0, right, tabs, solo }: {
  children: ReactNode; more?: ReactNode; moreActive?: number; right?: ReactNode; tabs?: ReactNode; solo?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(moreActive > 0);
  const [, start] = useTransition();
  const apply = () => {
    const f = ref.current; if (!f) return;
    const q = new URLSearchParams();
    for (const [k, v] of new FormData(f).entries()) if (typeof v === "string" && v.trim() !== "") q.append(k, v.trim());
    start(() => router.replace(`${path}${q.size ? `?${q}` : ""}`, { scroll: false }));
  };
  const onInput = (e: React.FormEvent) => {
    const t = e.target as HTMLInputElement;
    if (t.type === "search" || t.type === "text") { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(apply, 380); }
  };
  const onChange = (e: React.FormEvent) => {
    const t = e.target as HTMLInputElement;
    if (t.type !== "search" && t.type !== "text") apply();
  };
  const clear = () => { ref.current?.reset(); ref.current?.querySelectorAll("input,select").forEach((el) => { const i = el as HTMLInputElement; if (i.type === "checkbox") i.checked = false; else i.value = ""; }); apply(); };
  return (
    <form ref={ref} role="search" onInput={onInput} onChange={onChange} onSubmit={(e) => { e.preventDefault(); apply(); }} style={{ display: "contents" }}>
      {/* como no protótipo: abas de situação e filtros na mesma barra (quebra linha se não couber) */}
      <div className={`bar${solo ? " solo" : ""}`}>
        {tabs}
        {children}
        {more && (
          <button type="button" className="btn btn-sm filter-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name="filter" size={14} /> Mais filtros {moreActive > 0 && <span className="f-dot">{moreActive}</span>}
          </button>
        )}
        <span className="grow" />{right}
      </div>
      {more && open && (
        <div className="bar more-f">
          {more}
          <span className="grow" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={clear}>Limpar filtros</button>
        </div>
      )}
    </form>
  );
}

/** Abas de situação dentro da barra de filtros (mudam um parâmetro da URL). */
export function FilterTabs({ name, value, options }: { name: string; value: string; options: { v: string; label: string; n?: number }[] }) {
  const [cur, setCur] = useState(value);
  useEffect(() => setCur(value), [value]);
  return (
    <div className="tabs" role="group" aria-label="Situação">
      <input type="hidden" name={name} value={cur} />
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={cur === o.v}
          onClick={(e) => { setCur(o.v); const f = (e.currentTarget as HTMLElement).closest("form"); const h = f?.querySelector(`input[name="${name}"]`) as HTMLInputElement | null; if (h) { h.value = o.v; h.dispatchEvent(new Event("change", { bubbles: true })); } }}>
          {o.label}{o.n != null && <b className="tn">{o.n}</b>}
        </button>
      ))}
    </div>
  );
}

/** Linha de tabela que abre um registro ao clicar (botões e links internos continuam funcionando). */
export function ClickRow({ href, children, className = "", style }: { href: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const router = useRouter();
  return (
    <tr className={`click ${className}`} style={style}
      onClick={(e) => { if ((e.target as HTMLElement).closest("a,button,input,select,label,form")) return; router.push(href); }}>
      {children}
    </tr>
  );
}

export function Modal({ title, onClose, children, foot, size = "" }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; size?: "" | "wide" | "xl" | "narrow" }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true">
        <div className="modal-h"><h2>{title}</h2><button type="button" className="btn btn-ghost btn-icon" aria-label="Fechar" onClick={onClose}><Icon name="x" /></button></div>
        <div className="modal-b">{children}</div>
        {foot && <div className="modal-f">{foot}</div>}
      </div>
    </div>
  );
}

type Res = { ok?: boolean; error?: string; message?: string; redirectTo?: string } | void;
/**
 * Botão que chama uma ação do servidor (com confirmação opcional), mostra o aviso e atualiza a página.
 */
export function ActionButton({ action, children, confirm: ask, className = "btn", title, disabled }: {
  action: () => Promise<Res>; children: ReactNode; confirm?: string; className?: string; title?: string; disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className={className} title={title} aria-label={title} disabled={pending || disabled} aria-busy={pending}
      onClick={() => {
        if (ask && !window.confirm(ask)) return;
        start(async () => {
          const r = await action();
          if (r?.error) { toast(r.error, true); return; }
          if (r?.message) toast(r.message);
          if (r?.redirectTo) router.push(r.redirectTo);
          router.refresh();
        });
      }}>
      {children}
    </button>
  );
}

/** Executa uma ação JSON do servidor tratando aviso, erro e navegação. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>, after?: () => void) => start(async () => {
    const r = await fn();
    if (r?.error) { toast(r.error, true); return; }
    if (r?.message) toast(r.message);
    after?.();
    if (r?.redirectTo) router.push(r.redirectTo);
    router.refresh();
  });
  return { run, pending };
}
