# Central Frete

Sistema web interno para controlar vendas de frete, custos operacionais,
recebimentos e margem. A entrega foi construída a partir da especificação,
da planilha e das referências visuais fornecidas para o exercício da skill
`construir-software-completo`.

## O que está implementado

- dashboard por competência com faturamento, custos, margem, comissão do Setor Operacional de
  3%, saldos e situações financeiras;
- vendas/fretes com criação e edição completa, seis status operacionais,
  lista fixa de custos em reais, recebimentos, estornos, exclusão administrativa
  visível na tela de detalhe e exportação CSV compatível com Excel;
- aba `Vendedores(a)` com totais por nome, comissão fixa de 7%, baixa manual
  em `EM ABERTO`/`PAGO` e data de pagamento editável;
- prazo operacional em dias, entrada no pátio de origem e chegada prevista no
  destino calculada automaticamente;
- clientes com cadastro rápido de identidade, cadastro separado de endereços
  da empresa, coleta e entrega e exclusão administrativa preservando as vendas;
- prestadores com inclusão, edição e exclusão pelo ADMIN, além de empresa, nome de referência, endereço do pátio,
  contato e situação cadastral;
- três prestadores por venda, com dados PIX, valor confirmado separado da
  situação financeira `EM ABERTO`/`PAGO` e baixa auditada pelo Financeiro;
- custos de coleta, entrega e pátios editáveis, com situação
  `EM ABERTO`/`CONFIRMADO`; coleta e entrega também armazenam dados PIX;
- Financeiro simplificado com o valor do frete e os custos de todas as vendas;
- acesso multiusuário por login e senha, com criação e edição de acessos pelo ADMIN;
- vendedores restritos às próprias vendas; depois de salvar, somente o ADMIN pode editar a venda;
- cadastro rápido de cliente com consulta de CEP e preenchimento de endereço;
- importação idempotente preservada para compatibilidade com a carga inicial;
- comprovantes de recebimento e anexos gerais da venda em PDF/JPG/PNG,
  armazenados em R2;
- autorização server-side para `ADMIN`, `GERENCIA`, `VENDEDOR` e `FINANCEIRO`;
- interface responsiva em português do Brasil.

## Reconciliação de agosto/2026

| Indicador | Valor |
| --- | ---: |
| Faturamento | R$ 7.950,00 |
| Custo total | R$ 5.564,50 |
| Margem da empresa | R$ 2.385,50 |
| Margem sobre faturamento | 30,01% |
| Total recebido | R$ 4.850,00 |
| Saldo em haver | R$ 3.100,00 |
| Pago | 1 venda · R$ 1.150,00 |
| Vencido | 2 vendas · R$ 3.100,00 |

A aba `CALCULOS` da origem informa R$ 6.800,00 como vencido porque soma os
fretes completos e ignora os adiantamentos. O sistema deriva a situação das
transações confirmadas e usa o saldo correto de R$ 3.100,00.

## Arquitetura

- Next.js 16 + React 19 sobre Vinext/Vite;
- Cloudflare Worker no servidor;
- Cloudflare D1 para dados relacionais;
- Cloudflare R2 para comprovantes;
- Drizzle apenas como fonte tipada do schema e gerador de migrações;
- consultas D1 preparadas na aplicação;
- valores monetários em centavos inteiros e percentuais em pontos-base.

O D1 é inicializado de modo idempotente no primeiro acesso e a migração SQL
versionada também acompanha o artefato de implantação. A arquitetura principal está concentrada no próprio código de aplicação e na configuração do Worker.

## Executar localmente

Requisitos: Node.js 22.13 ou superior e npm.

```bash
npm ci
npm run dev
```

Os dois comandos acima são compatíveis com Windows CMD e PowerShell; não é
necessário definir `WRANGLER_LOG_PATH` manualmente. Se o navegador não abrir
sozinho, acesse o endereço local exibido pelo Vite no terminal.

No primeiro acesso de uma base nova, entre com o usuário `admin` e a senha
inicial `central123`. Antes de disponibilizar o sistema para outras pessoas,
copie `.env.example` para `.env.local` (ou configure as mesmas variáveis no
ambiente de hospedagem), troque `CENTRAL_FRETE_PASSWORD` e defina uma chave
longa em `CENTRAL_FRETE_SESSION_SECRET`. Reinicie a aplicação após alterar o
ambiente.

Depois do primeiro login, use **Configurações** para criar os acessos individuais
com usuário, senha e perfil. O login próprio funciona tanto localmente quanto no
ambiente hospedado. Quando a plataforma também fornece identidade autenticada,
essa identidade continua compatível como forma adicional de entrada.

A aplicação começa em `/inicio`. O ADMIN pode editar usuários, perfis, situação,
PIX e redefinir senhas. O perfil VENDEDOR enxerga somente as próprias vendas e
não consegue alterá-las depois de salvas.

Configurações exibe somente o gerenciamento de acesso. A carga histórica da
planilha continua preservada no backend para instalações que já a utilizaram.

## Qualidade

```bash
npm run lint
npm exec -- tsc --noEmit
npm test
```

`npm test` executa testes de domínio, build de produção, validação do artefato
Sites e verificação do HTML renderizado. Os casos financeiros cobrem pagamento
pendente, parcial, estorno, crédito por pagamento excedente, permissões e a
reconciliação completa de agosto.

## Limites conhecidos desta primeira versão

- o importador entregue é uma migração controlada do arquivo fornecido, não um
  parser genérico para qualquer layout futuro de XLSX;
- o modelo interno preserva a cobrança única das vendas antigas, mas parcela e
  adiantamento foram retirados da interface; recebimentos parciais e múltiplas
  transações continuam suportados;
- não há integração bancária automática: a confirmação financeira é manual;
- registros históricos de CT-e/MDF-e são consolidados na linha de ICMS sem
  alterar o total dos custos já cadastrados.

## Deploy no Render com Cloudflare D1

O aplicativo pode rodar no Render sem migrar o banco. Em ambiente Node/Render, a camada `lib/server/d1.ts` usa a API oficial do Cloudflare D1; em Cloudflare Workers, continua usando o binding `env.DB` original.

Configure no Render:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_API_TOKEN` (token com permissão D1 Read e D1 Write)
- `CENTRAL_FRETE_PASSWORD`
- `CENTRAL_FRETE_SESSION_SECRET`

Build: `npm install && npm run build`

Start: `npm start`

O token do Cloudflare deve ser criado como segredo do Render e nunca commitado no GitHub.
