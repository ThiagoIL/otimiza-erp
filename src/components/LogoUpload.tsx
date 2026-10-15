"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { toast } from "./Toast";

/** Logo da empresa: escolher a imagem, ver como fica e remover. Fica no menu e no topo dos documentos impressos. */
export function LogoUpload({ src }: { src: string | null }) {
  const router = useRouter();
  const inp = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const send = async (f: File) => {
    if (f.size > 1024 * 1024) { toast("A imagem passa de 1 MB. Use uma versão menor.", true); return; }
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/logo", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Não foi possível enviar." }));
    setBusy(false);
    if (r.error) { toast(r.error, true); return; }
    toast("Logo atualizada."); router.refresh();
  };
  const remove = async () => {
    if (!confirm("Remover a logo da empresa?")) return;
    setBusy(true);
    const r = await fetch("/api/logo", { method: "DELETE" }).then((x) => x.json()).catch(() => ({ error: "Não foi possível remover." }));
    setBusy(false);
    if (r.error) { toast(r.error, true); return; }
    toast("Logo removida."); router.refresh();
  };
  return (
    <div className="logo-up">
      <div className="logo-prev">{src ? <img src={src} alt="Logo da empresa" /> : <span className="muted">Sem logo</span>}</div>
      <div className="logo-acts">
        <input ref={inp} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send(f); }} />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => inp.current?.click()}><Icon name="in" size={16} /> {busy ? "Enviando…" : src ? "Trocar logo" : "Enviar logo"}</button>
        {src && <button type="button" className="btn" disabled={busy} onClick={remove}><Icon name="trash" size={16} /> Remover</button>}
        <small className="muted">PNG, JPG ou WebP até 1 MB. Prefira fundo transparente e formato horizontal. Aparece no menu lateral e no topo das propostas, pedidos e relatórios impressos.</small>
      </div>
    </div>
  );
}
