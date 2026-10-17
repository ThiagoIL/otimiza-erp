"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/** Controles do modo TV: tela cheia (esconde o menu), relógio, filtro de centro e atualização automática. */
export function TvControls({ centers, center, late, total }: { centers: [string, string][]; center: string; late: number; total: number }) {
  const router = useRouter();
  const [tv, setTv] = useState(false);
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 15000);
    const r = setInterval(() => router.refresh(), 60000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [router]);
  useEffect(() => {
    document.documentElement.classList.toggle("tv-mode", tv);
    return () => document.documentElement.classList.remove("tv-mode");
  }, [tv]);
  useEffect(() => {
    const off = () => { if (!document.fullscreenElement) setTv(false); };
    document.addEventListener("fullscreenchange", off);
    return () => document.removeEventListener("fullscreenchange", off);
  }, []);
  const toggle = async () => {
    if (!tv) { setTv(true); try { await document.documentElement.requestFullscreen?.(); } catch { /* o navegador pode recusar */ } }
    else { setTv(false); try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignora */ } }
  };
  return (
    <div className="tv-ctl">
      <button type="button" className="btn btn-primary btn-sm" onClick={toggle}><Icon name="tv" size={15} /> {tv ? "Sair da tela cheia" : "Tela cheia (TV)"}</button>
      <select value={center} aria-label="Centro de trabalho" onChange={(e) => router.push(`/dashboards/quadro${e.target.value ? `?centro=${e.target.value}` : ""}`)} style={{ height: 30, width: "auto" }}>
        <option value="">Todos os centros</option>{centers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <span className="tv-info"><b>{total}</b> OPs{late > 0 && <> · <b className="t-bad">{late}</b> atrasadas</>}</span>
      <span className="tv-clock">{now}</span>
    </div>
  );
}
