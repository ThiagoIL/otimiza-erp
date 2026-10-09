/**
 * Módulos do sistema da empresa. O menu lateral mostra só os módulos; as telas de cada um
 * (inclusive as de configuração, como grupos, locais, etapas e equipe) aparecem nas abas
 * no topo quando se está dentro do módulo.
 */
export type ModuleKey = "estoque" | "producao" | "montagens" | "comercial" | "financeiro" | "compras" | "fiscal";

export type ModuleDef = {
  key: ModuleKey; label: string; href: string; icon: string;
  /** módulo ainda em escopo: a tela mostra o que está planejado */
  soon?: boolean;
  tabs: { href: string; label: string }[];
};

export const MODULES: ModuleDef[] = [
  { key: "comercial", label: "Comercial", href: "/comercial", icon: "cart", tabs: [
    { href: "/comercial", label: "Pedidos de venda" },
    { href: "/comercial/cadastros", label: "Clientes e fornecedores" },
  ] },
  { key: "producao", label: "Produção", href: "/producao", icon: "factory", tabs: [
    { href: "/producao", label: "Ordens de produção" },
    { href: "/producao/etapas", label: "Etapas e situações" },
    { href: "/producao/centros", label: "Centros e equipe" },
  ] },
  { key: "montagens", label: "Montagens", href: "/montagens", icon: "tool", tabs: [
    { href: "/montagens", label: "Obras e montagens" },
    { href: "/montagens/equipe", label: "Equipe" },
  ] },
  { key: "estoque", label: "Estoque", href: "/estoque", icon: "box", tabs: [
    { href: "/estoque", label: "Posição de estoque" },
    { href: "/estoque/movimentacoes", label: "Movimentações" },
    { href: "/estoque/itens", label: "Itens e grupos" },
    { href: "/estoque/locais", label: "Locais de estoque" },
  ] },
  { key: "financeiro", label: "Financeiro", href: "/financeiro", icon: "cash", tabs: [
    { href: "/financeiro", label: "Contas a receber" },
    { href: "/financeiro/escopo", label: "Próximas etapas" },
  ] },
  { key: "compras", label: "Compras", href: "/compras", icon: "bag", soon: true, tabs: [] },
  { key: "fiscal", label: "Fiscal (NF-e)", href: "/fiscal", icon: "doc", soon: true, tabs: [] },
];

export const moduleByKey = (k: ModuleKey) => MODULES.find((m) => m.key === k)!;

/** Aba ativa: a de endereço mais longo que contém a página atual. */
export function activeTab(tabs: { href: string }[], path: string): string | undefined {
  return tabs
    .filter((t) => path === t.href || path.startsWith(t.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
