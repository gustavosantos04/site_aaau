# Site AAAU

Projeto Next.js/React do site publico e painel administrativo da AAAU, com Prisma e PostgreSQL.

## O que foi implementado

- Admin de produtos com cadastro, edicao, ativacao/inativacao, destaque, lancamento, estoque, categoria, preco, tamanhos e imagem principal.
- Produtos ativos aparecem no catalogo publico; inativos ficam apenas no painel.
- Admin de gestao com cadastro individual, edicao, remocao, ativacao/inativacao, ordem manual, foto, Instagram e preview simples.
- Checkout publico coletando nome completo, CPF, email, WhatsApp e campus antes do pagamento.
- API `POST /api/checkout` para criar pedido pendente, validar produto/preco no banco e criar preferencia Checkout Pro server-side.
- API publica `GET /api/orders/[id]` para paginas de retorno sem expor CPF completo ou dados internos.
- Webhook `POST /api/mercado-pago/webhook` com validacao `x-signature`/`x-request-id`, consulta do pagamento no Mercado Pago e atualizacao idempotente do pedido.
- Admin de pedidos com busca, filtro por status, detalhe, CSV e link de WhatsApp.
- Ajustes mobile em checkout/admin/gestao e respeito a `prefers-reduced-motion` nas animacoes principais.

## Variaveis de ambiente

Configure `.env` local e o ambiente de producao:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/aaau_site?schema=public"
ADMIN_EMAIL="admin@exemplo.com"
ADMIN_PASSWORD="troque-esta-senha"
JWT_SECRET="uma-chave-longa-com-32-ou-mais-caracteres"
APP_URL="https://seu-dominio.com.br"
NEXT_PUBLIC_SITE_URL="https://seu-dominio.com.br"

MERCADO_PAGO_ACCESS_TOKEN=""
MERCADO_PAGO_WEBHOOK_SECRET=""

RESEND_API_KEY=""
RESEND_FROM="AAAU UniRitter <ingressos@aaau.com.br>"
RESEND_REPLY_TO=""
RESEND_WEBHOOK_SECRET=""
ORDER_NOTIFICATION_EMAIL=""

SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""

NEXT_PUBLIC_CLARITY_PROJECT_ID=""
```

O `MERCADO_PAGO_ACCESS_TOKEN` deve ficar somente no backend e nunca deve receber prefixo `NEXT_PUBLIC_`. Este fluxo de Checkout Pro nao usa public key no navegador. `APP_URL` e a origem confiavel para QR, e-mails, retornos e webhook; `NEXT_PUBLIC_SITE_URL` deve usar a mesma origem para metadata publica.
`RESEND_API_KEY` habilita o envio transacional pelo Resend. `RESEND_WEBHOOK_SECRET` valida os eventos recebidos em `POST /api/resend/webhook`, usados para registrar entrega, atraso, rejeicao e reclamacao de spam. As variaveis `SMTP_*` ficam como contingencia e so sao usadas quando `RESEND_API_KEY` estiver vazia.

## Analytics e performance

- Vercel Analytics: no dashboard da Vercel, abra o projeto e ative Analytics. O componente `Analytics` ja esta carregado no layout.
- Vercel Speed Insights: no dashboard da Vercel, abra Speed Insights/Observability e ative para o projeto. O componente `SpeedInsights` ja esta carregado no layout.
- Microsoft Clarity: crie um projeto em `https://clarity.microsoft.com`, copie o Project ID e configure `NEXT_PUBLIC_CLARITY_PROJECT_ID` nas variaveis de ambiente da Vercel. Se a variavel ficar vazia, o Clarity nao carrega.

## Credenciais Mercado Pago

1. Acesse a conta Mercado Pago da AAAU ou da pessoa responsavel.
2. Entre no painel de desenvolvedores do Mercado Pago.
3. Va em "Suas integracoes".
4. Crie uma aplicacao para o site da AAAU ou selecione uma existente.
5. Acesse as credenciais da aplicacao.
6. Copie primeiro o Access Token de teste.
7. Coloque no `.env.local` local junto com `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
8. Em Webhooks > Configurar notificacoes, cadastre `https://seu-dominio.com.br/api/mercado-pago/webhook`, selecione o evento Pagamentos e copie a chave secreta gerada para `MERCADO_PAGO_WEBHOOK_SECRET`.
9. Teste o fluxo completo com credenciais de teste.
10. Depois de validar, configure na Vercel Production: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `NEXT_PUBLIC_SITE_URL`.
11. Nunca commite `.env`, `.env.local` nem credenciais reais.

## Banco e Prisma

Gerar Prisma Client:

```bash
npm run db:generate
```

Rodar migration em ambiente com permissao para shadow database:

```bash
npm run db:migrate
```

Se o banco local nao puder criar shadow database, use para desenvolvimento:

```bash
npx prisma db push --skip-generate
```

As migrations ficam em `prisma/migrations/`.

## Como rodar

```bash
npm install
npm run db:generate
npm run dev
```

Abra `http://localhost:3000`.

## Testes manuais

- Admin: login, cadastrar produto, editar produto, inativar produto.
- Admin: cadastrar integrante da gestao, editar, inativar e remover.
- Admin: abrir pedidos, filtrar, buscar, exportar CSV e abrir WhatsApp.
- Publico: abrir home, catalogo, produto, carrinho e checkout.
- Checkout: preencher nome, CPF valido, email, WhatsApp, campus e iniciar pagamento.
- Checkout: testar produto com tamanho, produto sem tamanho, quantidade invalida, CPF invalido, email invalido e envio de preco manipulado no payload.
- Mercado Pago: com token de teste, confirmar redirecionamento para Checkout Pro e retorno para `/pagamento/sucesso`, `/pagamento/pendente` ou `/pagamento/erro`.
- Webhook: simular assinatura invalida, notificacao aprovada, duplicada, recusada, pendente, pedido inexistente e valor divergente.
- Mobile: testar 360px, 390px, 430px, 768px e desktop sem rolagem horizontal.

## Antes de producao

- Configurar credenciais reais do Mercado Pago no ambiente de producao.
- Configurar URL publica correta em `NEXT_PUBLIC_SITE_URL`.
- Configurar webhook no painel Mercado Pago apontando para `https://seu-dominio.com.br/api/mercado-pago/webhook`.
- Copiar a chave secreta do webhook para `MERCADO_PAGO_WEBHOOK_SECRET`.
- Revisar estoque real e politica de entrega/retirada.
- Trocar senha admin e `JWT_SECRET`.
