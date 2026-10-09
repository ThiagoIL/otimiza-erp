import type { ReactNode } from "react";
import { requestArea } from "@/lib/context";
import { ModuleTabs } from "./ModuleTabs";
import type { ModuleKey } from "@/lib/modules";

/** Moldura das telas de um módulo: abas do módulo no topo (só no sistema da empresa). */
export async function ModuleFrame({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const info = await requestArea();
  return <>{info.area === "tenant" && <ModuleTabs module={module} />}{children}</>;
}
