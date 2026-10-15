/** Módulos do sistema e níveis de acesso (usado no servidor e no navegador). */
import type { IconName } from "@/components/Icon";

export const MODULES = [
  ["dash", "Dashboards"], ["comercial", "Comercial"], ["producao", "Produção"], ["itens", "Itens"],
  ["estoque", "Estoque"], ["compras", "Compras"], ["financeiro", "Financeiro"],
] as const;
export type ModuleKey = (typeof MODULES)[number][0] | "admin";
export type Level = "nenhum" | "ver" | "editar";
export const LEVEL_LABEL: Record<Level, string> = { nenhum: "Sem acesso", ver: "Consultar", editar: "Editar" };

export type Access = {
  mods: Record<ModuleKey, Level>;
  /** pode ver custos de produção (custo da OP, custo de mão de obra, custo padrão) */
  costs: boolean;
  isAdmin: boolean;
  profileName: string | null;
  /** usuário só de apontamento: vê apenas a tela de apontar */
  pointer: Pointer | null;
};
export type Pointer = "fabrica" | "montagem" | "ambos";
export const POINTER_LABEL: Record<Pointer, string> = { fabrica: "Fábrica", montagem: "Montagem", ambos: "Fábrica e montagem" };

export const canSee = (a: Access, m: ModuleKey) => m === ("inicio" as ModuleKey) || a.mods[m] !== "nenhum";
export const canEdit = (a: Access, m: ModuleKey) => a.mods[m] === "editar";

// ------------------------------------------------------------------------------------
// Menu
// ------------------------------------------------------------------------------------
export type NavTab = { href: string; label: string };
export type NavItem = { href: string; label: string; tabs?: NavTab[] };
export type NavModule = { id: string; label: string; icon: IconName; href?: string; perm?: ModuleKey; items?: NavItem[] };

export const TENANT_NAV: NavModule[] = [
  { id: "inicio", label: "Início", icon: "home", href: "/" },
  { id: "dash", label: "Dashboards", icon: "chart", href: "/dashboards", perm: "dash" },
  { id: "comunicacao", label: "Comunicação e avisos", icon: "chat", href: "/comunicacao" },
  {
    id: "comercial", label: "Comercial", icon: "partner", perm: "comercial", items: [
      { href: "/pedidos", label: "Pedidos de venda" },
      { href: "/faturamento", label: "Faturamento" },
      { href: "/clientes", label: "Clientes e fornecedores" },
      { href: "/comercial/configuracoes", label: "Configurações", tabs: [
        { href: "/comercial/configuracoes", label: "Campos personalizados" },
        { href: "/comercial/configuracoes/etapas", label: "Etapas do pedido" },
        { href: "/comercial/configuracoes/locais", label: "Locais de entrega" },
        { href: "/comercial/configuracoes/perfis", label: "Perfis de cliente" },
        { href: "/comercial/configuracoes/vendedores", label: "Vendedores" },
      ] },
    ],
  },
  {
    id: "producao", label: "Produção", icon: "factory", perm: "producao", items: [
      { href: "/producao/pedidos", label: "Pedidos a produzir" },
      { href: "/ops", label: "Ordens de produção" },
      { href: "/apontar", label: "Apontar" },
      { href: "/apontamentos", label: "Apontamentos", tabs: [
        { href: "/apontamentos", label: "Finalizações" },
        { href: "/apontamentos/horas", label: "Horas trabalhadas" },
      ] },
      { href: "/montagens", label: "Montagens" },
      { href: "/producao/configuracoes", label: "Configurações", tabs: [
        { href: "/producao/configuracoes", label: "Etapas das OPs" },
        { href: "/producao/configuracoes/montagem", label: "Etapas de montagem" },
        { href: "/producao/configuracoes/centros", label: "Centros de trabalho" },
        { href: "/producao/configuracoes/equipe", label: "Equipe" },
      ] },
    ],
  },
  {
    id: "itens", label: "Itens", icon: "layers", perm: "itens", items: [
      { href: "/itens", label: "Itens" },
      { href: "/itens/grupos", label: "Grupos" },
      { href: "/itens/tipos", label: "Tipos" },
      { href: "/itens/unidades", label: "Unidades de medida" },
    ],
  },
  {
    id: "estoque", label: "Estoque", icon: "box", perm: "estoque", items: [
      { href: "/estoque", label: "Posição de estoque" },
      { href: "/estoque/movimentacoes", label: "Movimentações" },
      { href: "/estoque/inventarios", label: "Inventário" },
      { href: "/estoque/fechamentos", label: "Fechamento de estoque" },
      { href: "/estoque/locais", label: "Locais de estoque" },
    ],
  },
  {
    id: "compras", label: "Compras", icon: "cart", perm: "compras", items: [
      { href: "/compras/solicitacoes", label: "Solicitações de compra" },
      { href: "/compras/cotacoes", label: "Cotações" },
      { href: "/compras/pedidos", label: "Pedidos de compra" },
      { href: "/compras/fornecedores", label: "Fornecedores" },
    ],
  },
  {
    id: "financeiro", label: "Financeiro", icon: "money", perm: "financeiro", items: [
      { href: "/financeiro/receber", label: "Contas a receber" },
      { href: "/financeiro/pagar", label: "Contas a pagar" },
      { href: "/financeiro/fluxo", label: "Fluxo de caixa" },
      { href: "/financeiro/extrato", label: "Extrato" },
      { href: "/financeiro/relatorios", label: "Relatórios" },
      { href: "/financeiro/configuracoes", label: "Configurações", tabs: [
        { href: "/financeiro/configuracoes", label: "Formas de pagamento" },
        { href: "/financeiro/configuracoes/condicoes", label: "Condições de pagamento" },
        { href: "/financeiro/configuracoes/bancos", label: "Contas bancárias" },
        { href: "/financeiro/configuracoes/categorias", label: "Categorias" },
        { href: "/financeiro/configuracoes/situacoes", label: "Situações" },
        { href: "/financeiro/configuracoes/responsaveis", label: "Responsáveis" },
      ] },
    ],
  },
  {
    id: "admin", label: "Administração", icon: "shield", perm: "admin", items: [
      { href: "/usuarios", label: "Usuários" },
      { href: "/perfis", label: "Perfis de acesso" },
      { href: "/empresa", label: "Empresa" },
    ],
  },
];

/** Menu do usuário só de apontamento. */
export const POINTER_NAV: NavModule[] = [
  { id: "apontar", label: "Apontar", icon: "check", href: "/apontar" },
  { id: "comunicacao", label: "Comunicação e avisos", icon: "chat", href: "/comunicacao" },
];

export const ADMIN_NAV: NavModule[] = [
  { id: "painel", label: "Painel", icon: "home", href: "/" },
  { id: "empresas", label: "Empresas", icon: "factory", href: "/empresas" },
  { id: "administradores", label: "Administradores", icon: "users", href: "/administradores" },
  { id: "auditoria", label: "Auditoria", icon: "doc", href: "/auditoria" },
];

/** Encontra o módulo, o item e a aba do menu para um caminho (o prefixo mais longo vence). */
export function matchNav(nav: NavModule[], path: string) {
  let best: { mod: NavModule; item?: NavItem; tab?: NavTab; len: number } | null = null;
  const hit = (href: string) => href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  for (const mod of nav) {
    if (mod.href && hit(mod.href) && (!best || mod.href.length > best.len)) best = { mod, len: mod.href.length };
    for (const item of mod.items ?? []) {
      if (hit(item.href) && (!best || item.href.length > best.len)) best = { mod, item, len: item.href.length };
      for (const tab of item.tabs ?? []) if (hit(tab.href) && (!best || tab.href.length > best.len)) best = { mod, item, tab, len: tab.href.length };
    }
  }
  return best;
}
