import "server-only";
import type { ModuleKey } from "@/lib/modules";

/** Registros que aceitam anexos e o módulo que controla o acesso a eles. */
export const ATTACH_ENTITIES: Record<string, ModuleKey[]> = {
  partner: ["comercial", "compras"],
  sales_order: ["comercial"],
  production_order: ["producao"],
  purchase_order: ["compras"],
  purchase_request: ["compras"],
  quotation: ["compras"],
  fin_title: ["financeiro"],
  item: ["itens"],
  crm_deal: ["comercial"],
};
export const MAX_ATTACH_BYTES = 8 * 1024 * 1024;
