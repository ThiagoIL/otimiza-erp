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

- Segundo lote de ajustes (out/2026):
  - **Etapas do pedido** (`sales_stages`, Comercial › Configurações › Etapas do pedido): as 4 do sistema (Proposta, Aprovado,
    Faturado, Cancelado) não se excluem, mas mudam de nome e cor; etapas novas têm um "comportamento" igual a uma delas
    (ex.: Entregue = Faturado). `sales_orders.status` continua sendo o comportamento e `stage_id` a etapa mostrada
    (`stageIdFor` em common.ts; `SO_STAGE` em queries.ts para pedidos sem etapa). Abas da lista = etapas.
  - **Locais de entrega** (`delivery_places`) com pesquisa (`PlaceField`, `searchPlacesAction`): fábrica, endereço do
    cliente e locais cadastrados; usado no pedido e no local da montagem. Pedido tem **"Tem montagem?"** (`has_assembly`).
  - **Seleção por pesquisa em todo o sistema**: `Sel` (src/components/SearchPicker.tsx) troca `<select>` de cadastros
    mantendo um select escondido (funciona em formulário e na barra de filtros). Listas fixas curtas continuam `<select>`.
    Botão de pesquisa só com ícone (`.pick-btn`).
  - **Botão atualizar** em toda barra de filtros e **colunas pelo botão direito** em toda tabela `.tbl`
    (`ColumnMenu`, guarda no navegador; `<th data-hide>` = coluna extra escondida por padrão).
  - Valores do pedido em R$ (`MoneyInput`).
  - **Estrutura com operação** (`supply`: FABRICADO | ESTOQUE) no item e na OP; requisição só dos itens de estoque;
    retiradas da OP não mostram a entrada de produção.
  - **Apontamento de finalização** (`production_reports`, src/server/report-actions.ts, tela `/apontar`, lista em
    Produção › Apontamentos; horas foram para `/apontamentos/horas`): produto final (soma no produzido + entrada no estoque),
    peça/estrutura fabricada (avança a OP; não mexe no estoque) ou peça montada. Desfazer estorna.
  - **Usuário só de apontamento**: perfil com `permissions.apontador` = fabrica | montagem | ambos (`access.pointer`);
    vê só Apontar e Comunicação (`POINTER_NAV`).
  - **Comunicação e avisos** (`messages`, `chat_reads`, `tasks`, `notifications`; src/server/comm-actions.ts, página
    `/comunicacao`): chat geral e direto, tarefas, avisos e sininho na barra superior; botão "Avisar" no pedido, OP e montagem.

- **Plano de usuários por empresa** (out/2026): `tenants.max_users` (usuários ativos cadastrados) e `tenants.max_sessions`
  (pessoas diferentes conectadas ao mesmo tempo), vazio = sem limite. Configura no painel do sistema (Empresas › empresa).
  Regras em `src/lib/limits.ts`: cadastro/reativação de usuário bloqueia ao passar do limite; o login bloqueia quando já há
  o máximo de pessoas conectadas (a mesma pessoa em outro aparelho não ocupa vaga). Conectado = sessão válida usada dentro
  de SESSION_IDLE_MINUTES. O administrador da empresa vê o uso e desconecta pessoas em Administração › Usuários.

- **Logo da empresa** (out/2026): enviada pelo administrador em Administração › Empresa; fica em `company_settings.logo`
  (base64, PNG/JPG/WebP até 1 MB, conferido pelo conteúdo; SVG não é aceito). Rota `/api/logo` (GET para quem está
  conectado, POST/DELETE só administrador). Aparece no menu lateral (`Shell` prop `logo`) e no topo dos impressos
  (`companyHeader().logo` em data URI, usado pelo `DocReport`).

- **Quadro de compras** (out/2026, igual ao ClickUp do cliente): Compras › Pedidos de compra abre em **quadro** (kanban,
  `PurchaseBoard`) ou lista. Etapas configuráveis em Compras › Configurações (`purchase_stages`; as 4 do sistema Rascunho,
  Enviado, Recebido, Cancelado não se excluem; etapas novas têm o comportamento de uma delas, ex.: Em cotação = Rascunho,
  Beneficiamento/Transportadora = Enviado, Entregue = Recebido). Arrastar chama `setPurchaseStageAction`; a etapa de
  comportamento Recebido só chega pelo recebimento (`poStageIdFor` em common.ts; `PO_STAGE` em queries.ts). Pedido tem
  **cliente** (`client_id`) e **obra** (`work`, com `PlaceField`) para filtrar, e **campos personalizados**
  (`custom_fields.entity = 'purchase_order'`, `on_card` = aparece como etiqueta no cartão).

## Próximos passos sugeridos
- Emissão real de NF-e (provedor) quando for necessário.
- Importação de cadastros por planilha.
