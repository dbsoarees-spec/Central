# Central Frete

Sistema web interno para controlar vendas de frete, custos operacionais,
recebimentos e margem.

## Acesso e usuários

O acesso é feito somente por **usuário e senha**. Não é necessário informar
e-mail para entrar ou para criar usuários.

Em uma base nova, quando a tabela `users` estiver vazia, o primeiro acesso
redireciona automaticamente para **Configurar administrador**. Nessa tela,
a pessoa responsável escolhe:

- nome;
- usuário;
- senha;
- confirmação da senha.

Esse primeiro cadastro recebe o perfil `ADMIN`. O sistema não cria um usuário
ADMIN automaticamente e não existe senha global de bootstrap.

As senhas são armazenadas somente como hash PBKDF2 com salt individual. A
variável `CENTRAL_FRETE_PASSWORD` não é utilizada e pode ser removida do
ambiente do Render.

Depois do primeiro cadastro, o ADMIN pode criar os demais usuários com usuário,
senha e perfil (`ADMIN`, `GERENCIA`, `VENDEDOR` ou `FINANCEIRO`). O sistema gera
um identificador interno de e-mail apenas para compatibilidade com o schema
legado; esse endereço não é exibido nem usado no login.

## Arquitetura

- Next.js 16 + React 19 sobre Vinext/Vite;
- Cloudflare Worker no servidor;
- Cloudflare D1 para dados relacionais;
- Cloudflare R2 para comprovantes;
- Drizzle como fonte tipada do schema e gerador de migrações;
- consultas D1 preparadas na aplicação;
- valores monetários em centavos inteiros e percentuais em pontos-base.

O D1 é inicializado de modo idempotente no primeiro acesso e a migração SQL
versionada acompanha o artefato de implantação.

## Executar localmente

Requisitos: Node.js 22.13 ou superior e npm.

```bash
npm ci
npm run dev
```

A aplicação começa em `/inicio`. Se a base estiver vazia, acesse `/login` e o
sistema levará para `/configurar-admin`.

## Variáveis de ambiente

Configure no ambiente de hospedagem:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_API_TOKEN` (token com permissão D1 Read e D1 Write)
- `CENTRAL_FRETE_SESSION_SECRET`
- `PORT` (fornecida automaticamente pelo Render)

Não configure `CENTRAL_FRETE_PASSWORD`: a senha não é definida por variável
de ambiente e deve ser escolhida pelo administrador no primeiro acesso.

O token do Cloudflare deve ser criado como segredo do Render e nunca
commitado no GitHub.

## Deploy no Render

Build:

```bash
npm install && npm run build
```

Start:

```bash
npm start
```

O aplicativo pode rodar no Render sem migrar o banco. Em ambiente Node/Render,
a camada `lib/server/d1.ts` usa a API oficial do Cloudflare D1; em Cloudflare
Workers, continua usando o binding `env.DB` original.

## Qualidade

```bash
npm run lint
npm exec -- tsc --noEmit
npm test
```
