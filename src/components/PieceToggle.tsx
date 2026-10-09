"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { togglePieceAction } from "@/server/assembly-actions";

/** Caixa de marcar da peça: marca como montada na hora, sem recarregar a página inteira. */
export function PieceToggle({ id, done, label }: { id: string; done: boolean; label: string }) {
  const [on, setOn] = useState(done);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className={`piece-chk${pending ? " busy" : ""}`}>
      <input type="checkbox" checked={on} disabled={pending} aria-label={`${label}: montada`}
        onChange={(e) => {
          const v = e.target.checked;
          setOn(v);
          const fd = new FormData();
          fd.set("id", id); fd.set("feito", v ? "1" : "0");
          start(async () => {
            const r = await togglePieceAction({}, fd);
            if (r.error) { setOn(!v); alert(r.error); } else router.refresh();
          });
        }} />
    </label>
  );
}
