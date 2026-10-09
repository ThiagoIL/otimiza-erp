import Link from "next/link";

/**
 * Fluxo do sistema: como um pedido percorre os módulos. Cada caixa leva à tela correspondente.
 * Caixas tracejadas são módulos ainda em escopo.
 */
type Node = { id: string; x: number; y: number; title: string; mod: string; href: string; soon?: boolean };

const W = 170, H = 52;
const C = [20, 240, 460, 680];
const R = [34, 144, 254, 364];

const NODES: Node[] = [
  { id: "cli", x: C[0], y: R[0], title: "Clientes e fornecedores", mod: "Comercial", href: "/comercial/cadastros" },
  { id: "pv", x: C[1], y: R[0], title: "Pedido de venda", mod: "Comercial", href: "/comercial" },
  { id: "cr", x: C[2], y: R[0], title: "Contas a receber", mod: "Financeiro", href: "/financeiro" },
  { id: "nfe", x: C[3], y: R[0], title: "Nota fiscal (NF-e)", mod: "Fiscal · em breve", href: "/fiscal", soon: true },
  { id: "op", x: C[1], y: R[1], title: "Ordem de produção", mod: "Produção", href: "/producao" },
  { id: "kb", x: C[2], y: R[1], title: "Etapas (kanban)", mod: "Produção", href: "/producao" },
  { id: "ap", x: C[3], y: R[1], title: "Apontamento", mod: "Produção", href: "/producao?ver=lista" },
  { id: "it", x: C[0], y: R[2], title: "Itens e grupos", mod: "Estoque", href: "/estoque/itens" },
  { id: "rt", x: C[1], y: R[2], title: "Retirada de material", mod: "Estoque", href: "/estoque/movimentar?tipo=SAIDA" },
  { id: "pos", x: C[2], y: R[2], title: "Posição de estoque", mod: "Estoque", href: "/estoque" },
  { id: "exp", x: C[3], y: R[2], title: "Expedição", mod: "Comercial · estoque", href: "/comercial?situacao=PRONTO" },
  { id: "cp", x: C[0], y: R[3], title: "Compras", mod: "Compras · em breve", href: "/compras", soon: true },
  { id: "pag", x: C[1], y: R[3], title: "Contas a pagar", mod: "Financeiro · em breve", href: "/financeiro/escopo", soon: true },
  { id: "mt", x: C[3], y: R[3], title: "Montagem na obra", mod: "Montagens", href: "/montagens" },
];

const n = (id: string) => NODES.find((x) => x.id === id)!;
const right = (id: string) => [n(id).x + W, n(id).y + H / 2] as const;
const left = (id: string) => [n(id).x, n(id).y + H / 2] as const;
const top = (id: string) => [n(id).x + W / 2, n(id).y] as const;
const bottom = (id: string) => [n(id).x + W / 2, n(id).y + H] as const;

/** Setas: [caminho SVG, rótulo opcional e onde escrevê-lo, se é de módulo em escopo]. */
type Edge = { d: string; label?: string; lx?: number; ly?: number; mid?: boolean; soon?: boolean };
const h = (a: string, b: string): string => { const [x1, y] = right(a); const [x2] = left(b); return `M${x1} ${y} H${x2 - 2}`; };
const v = (a: string, b: string): string => { const [x, y1] = bottom(a); const [, y2] = top(b); return `M${x} ${y1} V${y2 - 2}`; };

const EDGES: Edge[] = [
  { d: h("cli", "pv") },
  { d: h("pv", "cr"), label: "parcelas", lx: (C[1] + W + C[2]) / 2, ly: R[0] + H / 2 - 7, mid: true },
  // faturamento: a nota nasce do pedido
  { d: `M${top("pv")[0] + 40} ${top("pv")[1]} V12 H${top("nfe")[0]} V${R[0] - 2}`, label: "faturamento", lx: C[2] + W / 2, ly: 26, mid: true, soon: true },
  { d: v("pv", "op"), label: "gera OP", lx: C[1] + W / 2 + 8, ly: R[0] + H + 32 },
  { d: h("op", "kb") },
  { d: h("kb", "ap") },
  // itens: base do pedido e dos materiais da ordem
  { d: `M${top("it")[0]} ${top("it")[1]} V${R[1] + H / 2} H${C[1] - 2}`, label: "materiais", lx: C[0] + W / 2 + 8, ly: R[1] + H / 2 + 26 },
  { d: v("op", "rt"), label: "retira para a OP", lx: C[1] + W / 2 + 8, ly: R[1] + H + 32 },
  { d: h("rt", "pos"), label: "saída", lx: (C[1] + W + C[2]) / 2, ly: R[2] + H / 2 - 7, mid: true },
  // apontamento dá entrada no produto fabricado
  { d: `M${bottom("ap")[0]} ${bottom("ap")[1]} V${R[1] + H + 26} H${C[2] + W / 2} V${R[2] - 2}`, label: "entrada do produto", lx: C[2] + W / 2 + 8, ly: R[1] + H + 20 },
  { d: h("pos", "exp"), label: "baixa", lx: (C[2] + W + C[3]) / 2, ly: R[2] + H / 2 - 7, mid: true },
  { d: v("exp", "mt") },
  { d: `M${top("cp")[0]} ${top("cp")[1]} V${R[2] + H + 24} H${C[2] + W / 2} V${R[2] + H + 2}`, label: "entrada", lx: C[1] + W / 2, ly: R[2] + H + 18, soon: true },
  { d: h("cp", "pag"), soon: true },
];

export function FlowDiagram() {
  return (
    <div className="flow">
      <svg viewBox="0 0 870 432" role="img" aria-labelledby="flow-t">
        <title id="flow-t">Fluxo do sistema: cadastros, pedido de venda, produção, estoque, expedição, montagem e financeiro</title>
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="flow-head" />
          </marker>
        </defs>
        {EDGES.map((e, i) => (
          <g key={i}>
            <path d={e.d} className={`flow-edge${e.soon ? " soon" : ""}`} markerEnd="url(#flow-arrow)" />
            {e.label && <text x={e.lx} y={e.ly} className="flow-lbl" textAnchor={e.mid ? "middle" : "start"}>{e.label}</text>}
          </g>
        ))}
        {NODES.map((nd) => (
          <Link key={nd.id} href={nd.href} className={`flow-node${nd.soon ? " soon" : ""}`}>
            <rect x={nd.x} y={nd.y} width={W} height={H} rx="8" />
            <text x={nd.x + 12} y={nd.y + 22} className="flow-t">{nd.title}</text>
            <text x={nd.x + 12} y={nd.y + 39} className="flow-m">{nd.mod}</text>
          </Link>
        ))}
      </svg>
    </div>
  );
}
