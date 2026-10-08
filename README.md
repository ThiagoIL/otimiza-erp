# Otimiza+ ERP

ERP multiempresa (multitenant) para a indústria. Cada empresa cliente acessa pelo próprio subdomínio
(`suaempresa.seudominio.com.br`) com os dados isolados das demais. O administrador do sistema cria e
gerencia as empresas pelo painel web em `admin.seudominio.com.br`.

Esta é a base da versão de produção: autenticação, empresas, usuários, níveis de acesso, auditoria e o
primeiro módulo migrado do protótipo (cadastro de itens e grupos). Os demais módulos do protótipo
(produção, compras, vendas, financeiro, NF-e) entram sobre esta mesma estrutura.

---

## Sumário

1. [Tecnologias](#tecnologias)
2. [Como o sistema está organizado](#como-o-sistema-está-organizado)
3. [Níveis de usuário e regras de proteção](#níveis-de-usuário-e-regras-de-proteção)
4. [Segurança](#segurança)
5. [Rodar do zero no seu computador](#rodar-do-zero-no-seu-computador)
6. [Migrations (banco de dados)](#migrations-banco-de-dados)
7. [Enviar para o GitHub](#enviar-para-o-github)
8. [Publicar no Easypanel](#publicar-no-easypanel)
9. [Operação do dia a dia](#operação-do-dia-a-dia)
10. [Variáveis de ambiente](#variáveis-de-ambiente)
11. [Estrutura de pastas](#estrutura-de-pastas)

---

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Aplicação (telas e servidor) | Next.js 15 (App Router, Server Actions), React 19, TypeScript |
| Banco de dados | PostgreSQL 16 |
| Acesso ao banco e migrations | Drizzle ORM + drizzle-kit (migrations em SQL versionadas na pasta `drizzle/`) |
| Senhas | bcrypt (custo 12) |
| Validação | Zod |
| Testes | Vitest |
| Publicação | Docker (Dockerfile pronto para o Easypanel) |

---

## Como o sistema está organizado

O sistema descobre **quem está acessando pelo domínio**:

| Endereço | O que abre |
|---|---|
| `admin.seudominio.com.br` | Painel do administrador do sistema (empresas, administradores, auditoria) |
| `empresa.seudominio.com.br` | Sistema da empresa cliente (início, itens, usuários, minha conta) |
| `seudominio.com.br` e `www` | Página de apresentação, pedindo para acessar pelo endereço da empresa |
| Qualquer outro domínio ou IP | Recusado (`404 Domínio não configurado`) |

**Isolamento entre empresas (três camadas):**

1. **Sessão presa ao subdomínio.** O cookie de login vale só para o subdomínio onde foi criado, e o
   servidor ainda confere se a sessão pertence àquela empresa. Login de uma empresa não vale em outra
   nem no painel do sistema.
2. **Consultas sempre filtradas pela empresa** no código.
3. **Row Level Security no PostgreSQL.** As tabelas de negócio só devolvem e só aceitam linhas da
   empresa informada na transação (`withTenant` em `src/lib/db.ts`). Se algum código esquecer o filtro,
   o banco devolve zero linhas em vez de dados de outra empresa.

---

## Níveis de usuário e regras de proteção

| Nível | Onde entra | O que faz |
|---|---|---|
| **Administrador do sistema** | `admin.` | Cria e suspende empresas, cria o primeiro administrador de cada uma, gerencia todos os usuários, vê a auditoria |
| **Administrador da empresa** | subdomínio da empresa | Gerencia os usuários da própria empresa e usa todos os módulos |
| **Usuário da empresa** | subdomínio da empresa | Usa os módulos; não gerencia usuários |

**Conta master** (o primeiro administrador do sistema, criado na instalação):

- não pode ser excluída, desativada nem deixar de ser administradora do sistema;
- a senha não pode ser apagada: só pode ser trocada por outra que siga a política, em
  **Minha conta**, informando a senha atual;
- nenhum outro administrador pode redefinir a senha dela.

**Regras para todos:**

- ninguém altera o próprio nível de acesso, nem desativa ou exclui a própria conta;
- sempre sobra ao menos um administrador ativo no sistema e em cada empresa;
- um usuário não muda de empresa, e usuários de empresa nunca viram administradores do sistema.

Essas regras estão **no código** (`src/lib/rules.ts`, com testes) **e no banco** (gatilhos e restrições
na migration `drizzle/0001_regras_de_seguranca.sql`). Mesmo que alguém altere o banco direto ou um bug
passe pelo código, o PostgreSQL recusa a operação.

---

## Segurança

- Senhas com bcrypt; política: mínimo de 10 caracteres, com maiúsculas, minúsculas e números.
- Senha provisória forte para cada usuário novo, mostrada uma única vez, com troca obrigatória no
  primeiro acesso.
- Bloqueio de 15 minutos após 5 senhas erradas, mais limite de tentativas por rede e por e-mail
  (guardado no banco, funciona com mais de uma instância).
- Mensagem de erro de login genérica e tempo de resposta igual, para não revelar quais e-mails existem.
- Sessão com token aleatório de 256 bits; no banco fica só o hash. Cookie `HttpOnly`, `Secure`,
  `SameSite=Lax` e prefixo `__Host-` em produção. Expira em 12 horas ou após 2 horas sem uso.
- Trocar a senha, redefinir, desativar ou mudar o nível encerra todas as sessões do usuário; suspender a
  empresa desconecta todos os usuários dela.
- Cabeçalhos de segurança: Content-Security-Policy, HSTS, X-Frame-Options, nosniff, Referrer-Policy.
- Ações de formulário com verificação de origem (proteção contra CSRF) e validação de todos os campos
  no servidor.
- Auditoria de logins, falhas de login e alterações de empresas, usuários e itens, com IP.
- Erros do banco são traduzidos em mensagens amigáveis, sem expor detalhes internos.
- O container roda com usuário sem privilégios e tem verificação de saúde em `/api/health`.

---

## Rodar do zero no seu computador

### Pré-requisitos

- **Node.js 22** (ou 20.18+) e npm
- **PostgreSQL 16**: instalado na máquina ou pelo Docker (há um `docker-compose.yml` pronto)
- Git

### Passo a passo

```bash
# 1. baixar o código
git clone https://github.com/ThiagoIL/otimiza-erp.git
cd otimiza-erp

# 2. instalar as dependências
npm install

# 3. subir o PostgreSQL (se não tiver um instalado)
docker compose up -d

# 4. criar o arquivo de configuração
cp .env.example .env
```

Edite o `.env`. Para desenvolvimento local, o importante é:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/otimiza_erp"
ROOT_DOMAIN="localhost:3000"
COOKIE_SECURE="false"
INITIAL_ADMIN_NAME="Seu Nome"
INITIAL_ADMIN_EMAIL="voce@seudominio.com.br"
INITIAL_ADMIN_PASSWORD="UmaSenhaForte2026"
```

```bash
# 5. criar as tabelas e regras do banco (migrations)
npm run db:migrate

# 6. criar a conta master com os dados do .env
npm run db:bootstrap

# 7. (opcional) criar a empresa de demonstração "demo" com alguns itens
DEMO_ADMIN_PASSWORD="DemoFabrica2026" npm run db:seed-demo

# 8. iniciar em modo de desenvolvimento
npm run dev
```

No Linux e no macOS, as variáveis do `.env` precisam estar carregadas para os scripts dos passos 5 a 7.
Se aparecer "defina DATABASE_URL", rode antes: `set -a; . ./.env; set +a`.
No Windows (PowerShell), defina-as com `$env:DATABASE_URL="..."`.

Abra no navegador (os navegadores já entendem `*.localhost`, sem configurar nada):

- Painel do sistema: <http://admin.localhost:3000> (entre com a conta master)
- Empresa de demonstração: <http://demo.localhost:3000> (`admin@demo.com.br` e a senha do passo 7)

### Testes e verificações

```bash
npm test            # testes das regras de permissão e dos subdomínios
npm run typecheck   # checagem de tipos do TypeScript
npm run build       # build de produção
```

---

## Migrations (banco de dados)

As migrations ficam em `drizzle/`, em SQL, e são aplicadas em ordem. O banco guarda quais já rodaram na
tabela `drizzle.__drizzle_migrations`, então rodar de novo não repete nada.

| Comando | Para que serve |
|---|---|
| `npm run db:migrate` | Aplica as migrations pendentes no banco do `DATABASE_URL` |
| `npm run db:generate` | Gera uma nova migration a partir das mudanças em `src/db/schema.ts` |
| `npx drizzle-kit generate --custom --name nome` | Cria uma migration vazia para SQL escrito à mão (gatilhos, políticas) |
| `npm run db:studio` | Abre um visualizador do banco no navegador |

**Para mudar o banco:**

1. Altere `src/db/schema.ts`.
2. Rode `npm run db:generate` e confira o SQL gerado em `drizzle/`.
3. Rode `npm run db:migrate` no seu banco local e teste.
4. Faça o commit da pasta `drizzle/` junto com o código.
5. No deploy, o container aplica a migration sozinho antes de iniciar.

**Tabela nova com dados de empresa:** além do `tenant_id`, crie uma migration `--custom` ativando o
isolamento, no mesmo modelo de `0001_regras_de_seguranca.sql`:

```sql
ALTER TABLE "minha_tabela" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "minha_tabela" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "minha_tabela"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
```

No código, acesse essas tabelas sempre dentro de `withTenant(tenantId, async (tx) => ...)`.

**Nunca edite uma migration que já rodou em produção.** Para corrigir, crie uma nova.

---

## Enviar para o GitHub

Com o código descompactado numa pasta:

```bash
cd otimiza-erp
git init
git add .
git commit -m "Otimiza+ ERP: base multitenant"
git branch -M main
git remote add origin https://github.com/ThiagoIL/otimiza-erp.git
git push -u origin main
```

O `.gitignore` já impede o envio do `.env`, do `node_modules` e da pasta `.next`.
**Nunca envie o `.env`** para o repositório.

---

## Publicar no Easypanel

### 1. DNS do domínio

No painel do seu DNS (recomendado: Cloudflare), crie registros **A** apontando para o IP da VPS:

| Nome | Tipo | Valor |
|---|---|---|
| `@` | A | IP da VPS |
| `www` | A | IP da VPS |
| `*` | A | IP da VPS (todos os subdomínios: `admin` e as empresas) |

Se usar Cloudflare com o proxy ligado (nuvem laranja), configure SSL/TLS como **Full (strict)**.

### 2. Banco de dados

1. No projeto do Easypanel, clique em **+ Service → Postgres**. Use a versão 16, nome `db`.
2. Copie a **Internal Connection URL** (algo como `postgres://postgres:SENHA@projeto_db:5432/projeto`).
3. Em **Backups** do serviço, ative backups diários para um destino externo (S3, Cloudflare R2 ou
   Backblaze B2). Teste uma restauração de vez em quando.

### 3. Aplicação

1. **+ Service → App**, nome `erp`.
2. **Source → GitHub**: repositório `ThiagoIL/otimiza-erp`, branch `main`.
3. **Build → Dockerfile** (o arquivo `Dockerfile` da raiz).
4. **Environment**: cole as variáveis abaixo, trocando pelos seus valores.

```env
DATABASE_URL=postgres://postgres:SENHA@projeto_db:5432/projeto
ROOT_DOMAIN=seudominio.com.br
ADMIN_SUBDOMAIN=admin
COOKIE_SECURE=true
TRUST_PROXY=true
APP_TIMEZONE=America/Sao_Paulo
INITIAL_ADMIN_NAME=Seu Nome
INITIAL_ADMIN_EMAIL=voce@seudominio.com.br
INITIAL_ADMIN_PASSWORD=UmaSenhaForteDeVerdade2026
```

5. **Domains**: adicione o domínio `admin.seudominio.com.br` com a porta **3000** e HTTPS ligado.
6. **Deploy.**

Na primeira subida, o container aplica as migrations, cria a conta master e inicia a aplicação.
Confira em **Logs**:

```
[migrate] banco atualizado.
[bootstrap] conta master criada: voce@seudominio.com.br ...
[otimiza-erp] iniciando a aplicação na porta 3000…
```

7. **Apague `INITIAL_ADMIN_PASSWORD`** das variáveis e faça novo deploy. A conta já existe e a senha
   não deve ficar guardada no painel.

### 4. Subdomínios das empresas (wildcard)

Cada empresa nova usa um subdomínio novo. Para não precisar cadastrar um por um, use um domínio
coringa com certificado coringa. O certificado coringa exige desafio por DNS. Exemplo com a Cloudflare:

1. Na Cloudflare, crie um **API Token** com a permissão **Zone → DNS → Edit** só para o seu domínio.
2. No Easypanel, em **Settings → Traefik → Environment**, adicione (o nome `cloudflare` é livre):

   ```env
   TRAEFIK_CERTIFICATESRESOLVERS_cloudflare_ACME_EMAIL=voce@seudominio.com.br
   TRAEFIK_CERTIFICATESRESOLVERS_cloudflare_ACME_STORAGE=/data/acme.json
   TRAEFIK_CERTIFICATESRESOLVERS_cloudflare_ACME_DNSCHALLENGE_PROVIDER=cloudflare
   TRAEFIK_CERTIFICATESRESOLVERS_cloudflare_ACME_DNSCHALLENGE_RESOLVERS=1.1.1.1,8.8.8.8
   CF_DNS_API_TOKEN=seu_token_da_cloudflare
   ```

3. Reinicie o Traefik.
4. No app `erp`, em **Domains → Add Domain**: domínio `seudominio.com.br`, marque
   **Wildcard domain**, informe o resolver `cloudflare`, porta **3000**.
5. Adicione também o domínio raiz `seudominio.com.br` (sem wildcard) se quiser a página de apresentação.

Confira o guia oficial do Easypanel para domínio coringa caso os nomes dos campos mudem.

### 5. Verificação

- `https://seudominio.com.br/api/health` deve responder `{"status":"ok","db":true}`.
- Entre em `https://admin.seudominio.com.br` com a conta master.
- Crie uma empresa em **Empresas → Nova empresa**. Ela fica acessível na hora em
  `https://subdominio.seudominio.com.br`.

### Atualizações

A cada `git push` na branch `main`, faça **Deploy** no Easypanel (ou ligue o deploy automático).
As migrations novas são aplicadas sozinhas na subida. Se uma migration falhar, o container não inicia
e a versão anterior continua no ar. Veja o erro em **Logs**.

---

## Operação do dia a dia

**Criar uma empresa cliente:** Painel → Empresas → Nova empresa. Informe o nome, o subdomínio e o
primeiro administrador. O sistema mostra uma senha provisória uma única vez: envie-a por um canal seguro.

**Suspender uma empresa** (inadimplência, fim de contrato): abra a empresa e mude a situação para
Suspensa. Todos os usuários dela são desconectados e o login fica bloqueado. Os dados continuam
guardados.

**Usuário bloqueado por tentativas erradas:** abra o usuário e clique em Desbloquear agora, ou aguarde 15
minutos.

**Esqueceu a senha da conta master:** pelo console do serviço `erp` no Easypanel:

```bash
NEW_PASSWORD='NovaSenhaForte2026' node scripts/reset-master-password.mjs
```

**Backups:** ative no serviço Postgres do Easypanel e teste a restauração periodicamente.

---

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `DATABASE_URL` | sim | | Conexão com o PostgreSQL |
| `ROOT_DOMAIN` | sim | | Domínio principal, sem `https://`. Local: `localhost:3000` |
| `ADMIN_SUBDOMAIN` | não | `admin` | Subdomínio do painel do sistema |
| `COOKIE_SECURE` | não | `true` em produção | Cookie só por HTTPS. Use `false` apenas localmente |
| `TRUST_PROXY` | não | `true` | Usa o IP real enviado pelo Traefik nos limites e na auditoria |
| `SESSION_HOURS` | não | `12` | Duração máxima da sessão |
| `SESSION_IDLE_MINUTES` | não | `120` | Tempo sem uso até encerrar a sessão |
| `APP_TIMEZONE` | não | `America/Sao_Paulo` | Fuso para exibir datas |
| `DATABASE_POOL_MAX` | não | `10` | Conexões simultâneas com o banco por instância |
| `INITIAL_ADMIN_NAME` | só na 1ª subida | | Nome da conta master |
| `INITIAL_ADMIN_EMAIL` | só na 1ª subida | | E-mail da conta master |
| `INITIAL_ADMIN_PASSWORD` | só na 1ª subida | | Senha da conta master; apague depois de criada |

---

## Estrutura de pastas

```
drizzle/                     migrations SQL (aplicadas em ordem)
  0000_inicial.sql           tabelas
  0001_regras_de_seguranca.sql  conta master, último administrador, isolamento por empresa (RLS)
scripts/
  migrate.mjs                aplica as migrations
  bootstrap.mjs              cria a conta master
  reset-master-password.mjs  recuperação da senha da master pelo servidor
  seed-demo.mjs              empresa de demonstração
src/
  app/                       rotas (Next.js App Router)
    (entrada)/login          tela de login (sistema ou empresa, conforme o domínio)
    (sistema)/               telas logadas; o menu muda conforme o domínio
    api/health               verificação de saúde
  components/                formulários, menu, logo, tabelas
  db/schema.ts               modelo de dados
  lib/
    context.ts               área, empresa e sessão da requisição
    session.ts               sessões e cookies
    rules.ts                 regras de permissão (testadas)
    db.ts                    conexão e withTenant (isolamento por empresa)
    password.ts              senhas
  server/                    ações dos formulários (Server Actions)
  views/                     telas do painel do sistema e da empresa
tests/                       testes automatizados
Dockerfile                   imagem de produção
docker-entrypoint.sh         migrations → conta master → aplicação
docker-compose.yml           PostgreSQL para desenvolvimento
```
