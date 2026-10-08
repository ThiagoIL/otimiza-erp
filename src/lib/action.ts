/** Resposta padrão das ações de formulário. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** senha provisória para exibir uma única vez */
  secret?: string;
  fields?: Record<string, string>;
  /** valores digitados, devolvidos para o formulário não perder o que foi preenchido (nunca senhas) */
  values?: Record<string, string>;
  /** para onde o navegador deve ir depois da ação */
  redirectTo?: string;
};
export type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;
