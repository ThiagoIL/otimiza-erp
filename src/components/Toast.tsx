"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type T = { id: number; msg: string; bad?: boolean };
let push: ((t: Omit<T, "id">) => void) | null = null;
let seq = 0;

/** Mostra um aviso rápido no canto da tela. */
export function toast(msg: string, bad?: boolean) {
  push?.({ msg, bad });
}

export function Toaster() {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = ++seq;
      setList((l) => [...l, { ...t, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.bad ? 6000 : 3600);
    };
    return () => { push = null; };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={`toast${t.bad ? " bad" : ""}`}>{t.msg}</div>)}
    </div>
  );
}

/** Lê ?msg= (ou ?erro=) da URL depois de uma ação, mostra o aviso e limpa o endereço. */
export function Flash() {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const msg = sp.get("msg");
  const err = sp.get("erro");
  useEffect(() => {
    if (!msg && !err) return;
    toast((msg ?? err)!, !!err);
    const q = new URLSearchParams(sp.toString());
    q.delete("msg"); q.delete("erro");
    const s = q.toString();
    router.replace(path + (s ? `?${s}` : ""), { scroll: false });
  }, [msg, err, sp, path, router]);
  return null;
}
