# Site AAAU

Projeto Next.js/React do site publico e painel administrativo da AAAU, com Prisma e PostgreSQL.

## O que foi implementado

- Admin de produtos com cadastro, edicao, ativacao/inativacao, destaque, lancamento, estoque, categoria, preco, tamanhos e imagem principal.
- Produtos ativos aparecem no catalogo publico; inativos ficam apenas no painel.
- Admin de gestao com cadastro individual, edicao, remocao, ativacao/inativacao, ordem manual, foto, Instagram e preview simples.
- Checkout publico coletando nome completo, CPF, email, WhatsApp e campus.
- API `POST /api/orders` para criar pedido pendente, validar produto ativo e criar preferencia Mercado Pago quando `MERCADO_PAGO_ACCESS_TOKEN` estiver configurado.
- Webhook `POST /api/mercado-pago/webhook` para registrar eventos e atualizar status do pedido/pagamento.
- Admin de pedidos com busca, filtro por status, detalhe, CSV e link de WhatsApp.
- Ajustes mobile em checkout/admin/gestao e respeito a `prefers-reduced-motion` nas animacoes principais.

## Variaveis de ambiente

Configure `.env` local e o ambiente de producao:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/aaau_site?schema=public"
ADMIN_EMAIL="admin@exemplo.com"
ADMIN_PASSWORD="troque-esta-senha"
JWT_SECRET="uma-chave-longa-com-32-ou-mais-caracteres"
NEXT_PUBLIC_SITE_URL="https://seu-dominio.com"

MERCADO_PAGO_PUBLIC_KEY=""
NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY=""
MERCADO_PAGO_ACCESS_TOKEN=""
MERCADO_PAGO_WEBHOOK_SECRET=""
```

O `MERCADO_PAGO_ACCESS_TOKEN` deve ficar somente no backend. A public key so precisa ser usada no frontend se o fluxo migrar para SDK/client-side.

## Credenciais Mercado Pago

1. Acesse a conta Mercado Pago da AAAU ou da pessoa responsavel.
2. Entre no painel de desenvolvedores do Mercado Pago.
3. Va em "Suas integracoes".
4. Crie uma aplicacao para o site da AAAU ou selecione uma existente.
5. Acesse as credenciais da aplicacao.
6. Copie primeiro as credenciais de teste: Public Key e Access Token.
7. Coloque no `.env` local.
8. Teste o fluxo completo com credenciais de teste.
9. Depois de validar, copie as credenciais de producao.
10. Configure producao na Vercel, Railway ou servidor usado.
11. Nunca commite `.env` nem credenciais reais.

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

A migration criada fica em `prisma/migrations/20260530120000_products_management_orders_payment/migration.sql`.

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
- Checkout: preencher nome, CPF valido, email, WhatsApp, campus e criar pedido pendente.
- Mercado Pago: com token de teste, confirmar redirecionamento para checkout e retorno para `/pedido/confirmado`.
- Mobile: testar 360px, 390px, 430px, 768px e desktop sem rolagem horizontal.

## Antes de producao

- Configurar credenciais reais do Mercado Pago no ambiente de producao.
- Configurar URL publica correta em `NEXT_PUBLIC_SITE_URL`.
- Configurar webhook no painel Mercado Pago apontando para `/api/mercado-pago/webhook`.
- Definir um `MERCADO_PAGO_WEBHOOK_SECRET` e usar a URL com `?secret=valor`.
- Revisar estoque real e politica de entrega/retirada.
- Trocar senha admin e `JWT_SECRET`.
