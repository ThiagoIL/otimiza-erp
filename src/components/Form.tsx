"use client";
import { createContext, Fragment, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { Action, ActionState } from "@/lib/action";

const Ctx = createContext<ActionState>({});

/** Formulário ligado a uma ação do servidor, com mensagens de erro e sucesso acessíveis. */
export function Form({ action, children, className = "form" }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, {});
  const router = useRouter();
  const n = useRef(0); const last = useRef<ActionState | null>(null);
  if (last.current !== state) { last.current = state; n.current++; }
  // depois de salvar, recarrega os dados da página (listas, contadores) mantendo a mensagem
  useEffect(() => {
    if (state.redirectTo) { router.push(state.redirectTo); router.refresh(); }
    else if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} className={className} noValidate>
      <Ctx.Provider value={state}>
        {(state.error || state.message || state.secret) && (
          <div className="full" aria-live="polite">
            {state.error && <div className="alert bad" role="alert">{state.error}</div>}
            {state.message && <div className="alert ok" role="status">{state.message}</div>}
            {state.secret && (
              <div className="alert info">
                Senha provisória. Ela aparece só agora: copie e envie à pessoa por um canal seguro.<br />
                <span className="secret">{state.secret}</span><br />
                <small>No primeiro acesso o sistema pede para trocar.</small>
              </div>
            )}
          </div>
        )}
        <Fragment key={n.current}>{children}</Fragment>
      </Ctx.Provider>
    </form>
  );
}

type Opt = readonly [string, string];
export function Field(props: {
  name: string; label: string; type?: string; defaultValue?: string | number | null; required?: boolean; hint?: string;
  options?: readonly Opt[]; full?: boolean; autoComplete?: string; placeholder?: string; maxLength?: number; emptyOption?: string;
}) {
  const st = useContext(Ctx);
  const { name, label, type = "text", required, hint, options, full, emptyOption } = props;
  const err = st.fields?.[name];
  const isPw = type === "password";
  const dv = isPw ? undefined : (st.values?.[name] ?? (props.defaultValue == null ? "" : String(props.defaultValue)));
  const id = `f_${name}`;
  const desc = err ? `${id}_err` : hint ? `${id}_hint` : undefined;
  return (
    <div className={`fld${full ? " full" : ""}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>
      {options ? (
        <select id={id} name={name} defaultValue={dv} aria-invalid={!!err} aria-describedby={desc} required={required}>
          {emptyOption !== undefined && <option value="">{emptyOption}</option>}
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea id={id} name={name} defaultValue={dv} rows={3} aria-invalid={!!err} aria-describedby={desc} maxLength={props.maxLength} />
      ) : (
        <input id={id} name={name} type={type} defaultValue={dv} aria-invalid={!!err} aria-describedby={desc} required={required}
          autoComplete={props.autoComplete ?? (isPw ? "new-password" : "off")} placeholder={props.placeholder} maxLength={props.maxLength ?? 200} />
      )}
      {err ? <small id={`${id}_err`} className="err">{err}</small> : hint ? <small id={`${id}_hint`}>{hint}</small> : null}
    </div>
  );
}

export function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  const st = useContext(Ctx);
  const v = st.values ? st.values[name] : undefined;
  const checked = st.values ? v === "on" : defaultChecked;
  return <div className="fld full"><label className="chk"><input type="checkbox" name={name} defaultChecked={checked} /> {label}</label></div>;
}

export function Submit({ children, variant = "primary", pending = "Salvando…", block, confirm }: {
  children: ReactNode; variant?: "primary" | "danger" | "default"; pending?: string; block?: boolean; confirm?: string;
}) {
  const { pending: p } = useFormStatus();
  const cls = `btn${variant === "primary" ? " btn-primary" : variant === "danger" ? " btn-danger" : ""}${block ? " btn-block" : ""}`;
  return (
    <button type="submit" className={cls} disabled={p} aria-busy={p}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      {p ? pending : children}
    </button>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
