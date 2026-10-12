"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { ActionButton } from "./client";
import { toast } from "./Toast";
import { deleteAttachmentAction } from "@/server/attachment-actions";

export type AttachRow = { id: string; fileName: string; size: number; userName: string | null; createdAt: string };
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Lista de anexos de um registro com envio de arquivos (até 8 MB cada). */
export function Attachments({ entity, entityId, rows, canEdit, id = "anexos" }: { entity: string; entityId: string; rows: AttachRow[]; canEdit: boolean; id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.set("entity", entity); fd.set("entityId", entityId); fd.set("file", f);
      const r = await fetch("/api/anexos", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Falha no envio." }));
      if (r.error) toast(`${f.name}: ${r.error}`, true); else toast(`${f.name} anexado.`);
    }
    setBusy(false);
    if (ref.current) ref.current.value = "";
    router.refresh();
  };
  return (
    <section className="panel sec-panel" id={id}>
      <h2>Anexos <span className="n">{rows.length}</span>
        {canEdit && <span style={{ marginLeft: "auto" }}>
          <input ref={ref} type="file" multiple hidden onChange={(e) => send(e.target.files)} />
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => ref.current?.click()}><Icon name="clip" size={14} /> {busy ? "Enviando…" : "Anexar arquivos"}</button>
        </span>}
      </h2>
      <div className="pb">
        {rows.length ? (
          <ul className="files">
            {rows.map((a) => (
              <li key={a.id}>
                <Icon name="doc" size={16} />
                <a href={`/api/anexos/${a.id}`} target="_blank" rel="noopener">{a.fileName}</a>
                <span className="meta">{size(a.size)} · {a.userName ?? ""} · {new Date(a.createdAt).toLocaleDateString("pt-BR")}</span>
                {canEdit && <ActionButton className="mini-btn danger" title="Excluir anexo" confirm={`Excluir o anexo ${a.fileName}?`} action={() => deleteAttachmentAction(a.id)}><Icon name="trash" size={13} /></ActionButton>}
              </li>
            ))}
          </ul>
        ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nenhum arquivo anexado. Contratos, documentos, fotos e desenhos ficam guardados aqui.</p>}
      </div>
    </section>
  );
}
