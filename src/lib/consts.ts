/** Listas fixas do sistema (servidor e navegador). */
export const PARTNER_KINDS = ["Cliente", "Fornecedor", "Transportadora", "Prestador de serviço"] as const;
export const IND_IE: [string, string][] = [["1", "Contribuinte do ICMS"], ["2", "Contribuinte isento"], ["9", "Não contribuinte"]];
export const REGIMES = ["Simples Nacional", "MEI", "Lucro Presumido", "Lucro Real"];
export const SO_STATUS: Record<string, { label: string; color: string }> = {
  PROPOSTA: { label: "Proposta", color: "#6B7785" },
  APROVADO: { label: "Aprovado", color: "#E0601A" },
  FATURADO: { label: "Faturado", color: "#2E7D4F" },
  CANCELADO: { label: "Cancelado", color: "#B3261E" },
};
export const PROD_STATUS: Record<string, { label: string; color: string }> = {
  PENDENTE: { label: "Aguardando produção", color: "#C77700" },
  EM_PRODUCAO: { label: "Em produção", color: "#1E3A5F" },
  PRODUZIDO: { label: "Produzido", color: "#2E7D4F" },
  NAO_NECESSITA: { label: "Sem produção", color: "#6B7785" },
};
export const PO_STATUS: Record<string, { label: string; color: string }> = {
  RASCUNHO: { label: "Rascunho", color: "#6B7785" },
  ENVIADO: { label: "Enviado", color: "#E0601A" },
  RECEBIDO_PARCIAL: { label: "Recebido parcial", color: "#7A4FA0" },
  RECEBIDO: { label: "Recebido", color: "#2E7D4F" },
  CANCELADO: { label: "Cancelado", color: "#B3261E" },
};
export const PR_STATUS: Record<string, { label: string; color: string }> = {
  ABERTA: { label: "Aberta", color: "#6B7785" },
  APROVADA: { label: "Aprovada", color: "#E0601A" },
  EM_COTACAO: { label: "Em cotação", color: "#7A4FA0" },
  ATENDIDA: { label: "Atendida", color: "#2E7D4F" },
  CANCELADA: { label: "Cancelada", color: "#B3261E" },
};
export const QT_STATUS: Record<string, { label: string; color: string }> = {
  ABERTA: { label: "Em aberto", color: "#E0601A" },
  CONCLUIDA: { label: "Concluída", color: "#2E7D4F" },
  CANCELADA: { label: "Cancelada", color: "#B3261E" },
};
export const MV_TYPES: Record<string, { label: string; cls: string }> = {
  ENTRADA: { label: "Entrada", cls: "mv-in" },
  SAIDA: { label: "Saída", cls: "mv-out" },
  TRANSFERENCIA: { label: "Transferência", cls: "mv-tr" },
  AJUSTE: { label: "Ajuste de inventário", cls: "mv-tr" },
  PRODUCAO: { label: "Entrada de produção", cls: "mv-in" },
};
export const PRIORITIES: Record<string, string> = { Baixa: "#8C9AA6", Normal: "transparent", Alta: "#E0601A", Urgente: "#B3261E" };
export const CRM_ACTIVITY_TYPES = ["Ligação", "WhatsApp", "E-mail", "Reunião", "Visita", "Tarefa"];
export const CRM_SOURCES = ["Indicação", "Site", "Redes sociais", "Feira ou evento", "Telefone", "Cliente antigo", "Representante", "Outro"];
