/** Converte erros do banco em mensagens seguras para o usuário (sem expor detalhes internos). */
export function friendlyDbError(err: unknown, fallback = "Não foi possível salvar. Tente novamente."): string {
  const e = err as { code?: string; message?: string; constraint?: string; cause?: { code?: string; message?: string; constraint?: string } };
  const code = e?.cause?.code ?? e?.code;
  const msg = e?.cause?.message ?? e?.message ?? "";
  const constraint = e?.cause?.constraint ?? e?.constraint ?? "";
  if (code === "P0001" && msg.includes("ERP_RULE:")) {
    const m = msg.split("ERP_RULE:")[1].trim();
    return m.charAt(0).toUpperCase() + m.slice(1) + ".";
  }
  if (code === "23505") {
    if (constraint.includes("email")) return "Já existe um usuário com este e-mail.";
    if (constraint.includes("slug")) return "Este endereço (subdomínio) já está em uso.";
    if (constraint.includes("code")) return "Já existe um item com este código.";
    if (constraint.includes("name")) return "Já existe um registro com este nome.";
    return "Já existe um registro com estes dados.";
  }
  if (code === "23503") return "Este registro está em uso por outros dados e não pode ser alterado assim.";
  if (code === "23514") return "Os dados informados não passaram nas regras de validação.";
  console.error("[db]", code, msg);
  return fallback;
}
