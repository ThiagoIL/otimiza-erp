import Link from "next/link";
import { requireTenantUser } from "@/lib/context";

type Feature = { t: string; d: string };
type Scope = { title: string; lead: string; features: Feature[]; links: { label: string; href: string; d: string }[] };

/** Escopo dos módulos que ainda vão entrar: o que vai ter e como se liga ao que já existe. */
const SCOPES: Record<"compras" | "fiscal" | "financeiro", Scope> = {
  compras: {
    title: "Compras",
    lead: "Comprar o que a produção e o estoque precisam, do pedido ao recebimento, com entrada automática no estoque e a conta a pagar no financeiro.",
    features: [
      { t: "Solicitação de compra", d: "Gerada a partir dos itens abaixo do estoque mínimo e dos materiais que faltam nas ordens de produção, ou criada à mão por qualquer setor." },
      { t: "Cotação com fornecedores", d: "Envio da mesma lista para vários fornecedores e quadro comparativo de preço, prazo e condição de pagamento." },
      { t: "Pedido de compra", d: "Fornecedor, itens, preços, prazo de entrega, forma de pagamento e parcelas. Impressão e envio do pedido ao fornecedor." },
      { t: "Recebimento", d: "Conferência do que chegou contra o pedido (total ou parcial), entrada no estoque no local escolhido e atualização do custo do item." },
      { t: "Acompanhamento", d: "Pedidos em aberto, atrasados e entregas previstas da semana, com alerta na página inicial." },
    ],
    links: [
      { label: "Clientes e fornecedores", href: "/comercial/cadastros?tipo=fornecedor", d: "o fornecedor já é cadastrado no Comercial" },
      { label: "Entrada de estoque", href: "/estoque/movimentar?tipo=ENTRADA", d: "o recebimento vira uma entrada" },
      { label: "Posição de estoque", href: "/estoque?sit=baixo", d: "itens abaixo do mínimo viram sugestão de compra" },
    ],
  },
  fiscal: {
    title: "Fiscal (NF-e)",
    lead: "Emitir e receber notas fiscais eletrônicas sem redigitar: a nota de saída nasce do pedido de venda e a de entrada alimenta compras e estoque.",
    features: [
      { t: "Configuração fiscal da empresa", d: "Certificado digital A1, regime tributário, série e numeração, CFOP e situação tributária padrão por tipo de operação." },
      { t: "NF-e de saída", d: "Gerada a partir do pedido de venda (cliente, itens, NCM, valores, frete e parcelas já preenchidos), transmissão à SEFAZ, DANFE em PDF e XML." },
      { t: "Eventos da nota", d: "Cancelamento, carta de correção e inutilização de numeração." },
      { t: "NF-e de entrada", d: "Importação do XML do fornecedor: confere com o pedido de compra, dá entrada no estoque e gera a conta a pagar." },
      { t: "Relatórios fiscais", d: "Notas emitidas e recebidas por período, e exportação dos XML para a contabilidade." },
    ],
    links: [
      { label: "Pedidos de venda", href: "/comercial", d: "origem da nota de saída" },
      { label: "Itens e grupos", href: "/estoque/itens", d: "o NCM do item já é cadastrado" },
    ],
  },
  financeiro: {
    title: "Financeiro: próximas etapas",
    lead: "As contas a receber já funcionam a partir dos pedidos de venda. Estas são as próximas partes do financeiro.",
    features: [
      { t: "Contas a pagar", d: "Lançadas pelo recebimento de compras e pela nota de entrada, ou à mão para despesas (aluguel, energia, salários), com parcelas e vencimentos." },
      { t: "Contas bancárias e caixa", d: "Saldo de cada conta, baixa de recebimentos e pagamentos indicando a conta, e transferências entre contas." },
      { t: "Fluxo de caixa", d: "Previsto (a receber e a pagar) e realizado, por dia, semana e mês, com saldo projetado." },
      { t: "Conciliação bancária", d: "Importação do extrato (OFX) e conferência automática com os lançamentos." },
      { t: "Plano de contas e resultado", d: "Categorias e centros de custo para o DRE gerencial e a margem por pedido." },
      { t: "Cobrança", d: "Emissão de boleto e Pix com baixa automática (integração com o banco)." },
    ],
    links: [
      { label: "Contas a receber", href: "/financeiro", d: "já disponível" },
      { label: "Dashboard financeiro", href: "/dashboards?painel=financeiro", d: "visão de recebimentos" },
    ],
  },
};

export async function ScopePage({ module }: { module: keyof typeof SCOPES }) {
  await requireTenantUser();
  const sc = SCOPES[module];
  return (
    <>
      <div className="ph"><div><h1>{sc.title} <span className="badge warn">Em escopo</span></h1><p>{sc.lead}</p></div></div>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(260px, 1fr)" }}>
        <section className="panel"><h2>O que este módulo vai fazer</h2><div className="pb">
          <ol className="scope">{sc.features.map((f) => <li key={f.t}><b>{f.t}</b><span>{f.d}</span></li>)}</ol>
        </div></section>
        <div className="stack">
          <section className="panel"><h2>Liga-se com</h2><div className="pb">
            <ul className="feed">{sc.links.map((l) => <li key={l.href}><span><Link href={l.href}>{l.label}</Link><small className="sub">{l.d}</small></span></li>)}</ul>
          </div></section>
          <section className="panel"><h2>Ordem de implantação</h2><div className="pb">
            <ol className="phases">
              <li className="done"><b>Fase 1 · pronta</b>Estoque, produção, montagens, comercial, contas a receber e dashboards.</li>
              <li><b>Fase 2</b>Compras e contas a pagar; ficha técnica do produto para preencher os materiais da OP sozinha.</li>
              <li><b>Fase 3</b>Fiscal: NF-e de saída e de entrada.</li>
              <li><b>Fase 4</b>Fluxo de caixa, conciliação bancária, DRE gerencial e cobrança.</li>
            </ol>
            <p className="muted" style={{ marginBottom: 0 }}>Veja como os módulos se ligam no <Link href="/fluxo">fluxo do sistema</Link>.</p>
          </div></section>
        </div>
      </div>
    </>
  );
}
