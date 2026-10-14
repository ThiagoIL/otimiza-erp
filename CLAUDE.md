# Otimiza+ ERP — contexto para o Claude Code

Este arquivo é lido automaticamente pelo Claude Code em qualquer computador. Mantenha-o atualizado ao final de cada
sessão (decisões tomadas e próximos passos), assim o trabalho continua igual em outro PC.

## O que é
ERP multiempresa (multitenant) para indústria, em produção no **Easypanel** (VPS), a partir do GitHub
`ThiagoIL/otimiza-erp`. O design e os fluxos vieram de um protótipo HTML feito no Claude (chat); esta é a versão real,
com banco e login. Idioma da interface: **português do Brasil**, textos simples e diretos.

## Stack
Next.js 15 (App Router, Server Components + Server Actions) · React 19 · TypeScript · PostgreSQL 16 · Drizzle ORM ·
Zod · sem bibliotecas de UI (CSS próprio em `src/app/globals.css`, herdado do protótipo).

## Regras de arquitetura (não quebrar)
- **Isolamento por empresa:** toda tabela de negócio tem `tenant_id`, RLS (migração 0003) e `UNIQUE (tenant_id, id)`;
  as FKs entre tabelas de negócio são **compostas** `(tenant_id, x_id)`. Acesse sempre dentro de `withTenant()`
  (nas páginas: `const s = await page("modulo")` e `s.tx(...)`; nas ações: `const s = await act("modulo")`).
- **Tabela nova:** declarar em `src/db/erp.ts`, incluir no array `TENANT_TABLES`, rodar `npm run db:generate`,
  revisar o SQL e criar migração `--custom` com GRANT + RLS (modelo: `drizzle/0003_isolamento_modulos.sql`).
  Nunca editar migração que já rodou em produção. Teste as migrações antes de subir (ver "Testar sem Docker").
- **Permissões:** módulos e níveis em `src/lib/modules.ts`; cálculo em `src/lib/access.ts`.
  Administrador da empresa vê tudo; usuário com perfil (`access_profiles`) segue o perfil; sem perfil edita os
  módulos de negócio. **Custos de produção** só para quem tem `custos: true` (ver `s.access.costs`).
- **Arquivos `"use server"`** só podem exportar funções async (constantes ficam em `src/lib/consts.ts`).
- Datas de negócio são texto `AAAA-MM-DD` (`src/lib/dates.ts`); dinheiro numeric(14,2), quantidade numeric(14,4).
- Saldo de estoque = soma das movimentações (`balances()` em `src/server/common.ts`); o fechamento de estoque trava
  lançamentos com data ≤ data do fechamento (`insertMovements` confere).

## Onde fica cada coisa
- `src/db/schema.ts` (empresas, usuários, sessões, auditoria) · `src/db/erp.ts` (todos os módulos)
- `src/lib/modules.ts` menu lateral e módulos · `src/components/Shell.tsx` moldura (menu igual ao protótipo)
- `src/server/*-actions.ts` regras e gravações de cada módulo · `src/views/tenant/*.tsx` telas
- `src/server/simple-registry.ts` cadastros simples (unidades, tipos, prefixos, grupos, etapas, formas de pagamento…)
  renderizados por `SimplePage` + `SimpleCrud` (tabela + janela de edição)
- `src/components/ItemPicker.tsx` tela de pesquisa de itens (usada em pedidos, compras, OPs, estrutura)
- `src/server/exports.ts` downloads CSV (`/api/export/<tipo>`) · `src/app/api/anexos` anexos (guardados no banco)

## Fluxo de negócio implementado
Comercial: proposta de venda → pedido aprovado → **fila da produção** (a produção decide: gera OP ou
"não precisa de produção") → faturamento (baixa estoque + contas a receber).
Produção: OP copia a estrutura do item; produção aponta o que foi feito, inclui itens, vê retiradas de estoque da OP,
aponta quantidade produzida (entrada no estoque) e gera **montagens** a partir do que foi produzido.
Compras: solicitação → cotação (mapa de preços, vencedor por item) → pedido de compra → recebimento (estoque + contas a pagar).
Financeiro: contas a pagar/receber, fluxo de caixa, extrato por conta, relatórios CSV, configurações.

## Comandos
`npm run typecheck` · `npm run build` · `npm test` · `npm run db:generate` · `npm run db:migrate` ·
`DEMO_ADMIN_PASSWORD=… npm run db:seed-demo` (empresa "demo" com dados de exemplo em todos os módulos)

## Testar sem Docker (Windows)
PostgreSQL em memória com PGlite, numa pasta fora do projeto:
`npm i @electric-sql/pglite@0.3.10 @electric-sql/pglite-socket@0.0.15` e um `server.mjs` que faz
`new PGLiteSocketServer({ db: await PGlite.create("./data"), port: 5433 })`. Depois, no projeto, um `.env` (não vai pro git)
com `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres`, `ROOT_DOMAIN=localhost:3000`,
`COOKIE_SECURE=false`, `DATABASE_POOL_MAX=1`; rodar migrate, bootstrap, seed-demo e `npm run dev`;
abrir `http://demo.localhost:3000`.

## Decisões tomadas (out/2026)
- "Orçamento" virou **Proposta**. Situações do pedido: Proposta, Aprovado, Faturado, Cancelado. A situação de
  produção (Aguardando produção, Em produção, Produzido, Sem produção) é separada e controlada pela Produção.
- Configurações da empresa: só **Empresa** (sem NF-e). Faturamento registra a nota internamente (sem SEFAZ).
- Anexos ficam no próprio PostgreSQL (até 8 MB por arquivo) para não exigir storage extra no Easypanel.
- Código do item: manual ou automático pelo prefixo ligado ao grupo (Itens › Prefixos de código).

- Visual conferido tela a tela com o protótipo HTML (out/2026): abas de situação ficam na mesma barra dos filtros,
  indicadores no topo do Início, alertas com "Ver mais", e tabelas sem colunas extras (informação secundária vai numa
  linha abaixo, classe `.t-sub`). Fonte: peso 600 usa Ubuntu Bold, como no protótipo.
- Seed de demonstração (`scripts/seed-demo.mjs`) segue os dados do protótipo: 12 OPs em andamento com apontamentos
  "em execução", 5 montagens (uma obra com andar → apartamento → ambiente), histórico de compras e consumo semanal.

- Ajustes pedidos pela produção (out/2026, arquivo "ajustes.docx" + vídeo do Maxiprod):
  - **CRM retirado** (menu, rotas redirecionam para /pedidos; tabelas crm_* ficam no banco, sem uso).
  - **Escolha por pesquisa** em tudo que pode ter muitos registros: `SearchPicker`/`PickField` (src/components/SearchPicker.tsx)
    com as buscas em `src/server/search-actions.ts` (cliente/fornecedor, grupo, OP). Usado no pedido (cliente), na OP
    (cliente), no item e no grupo (grupo pai) e na movimentação de estoque (OP). Itens continuam no `ItemPicker`.
  - **Grupos com hierarquia** (`item_groups.parent_id`) e **prefixo do código no próprio grupo** (`code_prefix`,
    `prefix_digits`, `next_number`); a tela "Prefixos de código" saiu (migração 0005 copiou os prefixos antigos).
    Filtros por grupo incluem os subgrupos (`inGroupTree` em src/server/queries.ts).
  - **Vendedores** têm cadastro próprio (`salespeople`, Comercial › Configurações › Vendedores); a migração 0005 criou um
    vendedor para cada usuário que já era vendedor, com o mesmo id.
  - **Fornecedores** ficam em Compras › Fornecedores: é a mesma tela de clientes (`PartnersList` com `area="compras"`).
    Itens › Fornecedores saiu do menu.
  - Pedidos e OPs mostram **só os em aberto por padrão**; faturados, concluídos e cancelados aparecem quando escolhidos.
  - Pedido: condição **"Manual"** para lançar as parcelas uma a uma; o faturamento mantém essas parcelas.
  - OP manual aceita **qualquer item** (produção para estoque). Início sem a faixa de indicadores e com o fluxo compacto.
- Fluxo do Início (out/2026): raias por área, caixas maiores e todas as setas contínuas; sem Inventário, Cotação e
  Recebimento (compras: solicitação → pedido de compra → estoque e contas a pagar).

## Próximos passos sugeridos
- Emissão real de NF-e (provedor) quando for necessário.
- Importação de cadastros por planilha.
