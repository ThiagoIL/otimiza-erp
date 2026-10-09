"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab, moduleByKey, type ModuleKey } from "@/lib/modules";

/** Abas do módulo atual: reúne as telas do módulo e as de configuração dele. */
export function ModuleTabs({ module }: { module: ModuleKey }) {
  const path = usePathname() ?? "/";
  const m = moduleByKey(module);
  if (m.tabs.length < 2) return null;
  const active = activeTab(m.tabs, path);
  return (
    <nav className="mtabs" aria-label={`Telas de ${m.label}`}>
      <span className="mtabs-mod">{m.label}</span>
      {m.tabs.map((t) => (
        <Link key={t.href + t.label} href={t.href} aria-current={t.href === active ? "page" : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
