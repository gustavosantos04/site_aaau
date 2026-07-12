# Pre-lancamento e compra de teste

## Configuracao do evento

- Criar o evento pelo admin; nao hardcodar nome, slug ou data.
- Configurar datas em `America/Sao_Paulo`; o servidor persiste UTC.
- Publicar com ao menos um lote futuro elegivel.
- Antes de `salesStartAt`, validar pop-up, pagina publica, contador e checkout informativo.
- No horario, manter a pagina aberta e confirmar atualizacao automatica sem deploy.
- Confirmar que POST direto antes da abertura retorna `EVENT_SALES_NOT_STARTED` e nao cria reservas.

## Compra manual com Mercado Pago de teste

1. Confirmar Preview HTTPS, banco de staging e migrations atuais.
2. Configurar somente `MERCADO_PAGO_ACCESS_TOKEN` de teste e webhook secret de staging.
3. Configurar `APP_URL` e `NEXT_PUBLIC_SITE_URL` com a origem exata do Preview.
4. No Mercado Pago, cadastrar `https://<preview>/api/mercado-pago/webhook` para pagamentos.
5. Configurar SMTP e destinatario controlados; nao utilizar mailing ou dados pessoais reais.
6. Criar manualmente evento "Teste de Compra de Ingresso", lote de R$ 2,00, capacidade pequena e vendas abertas.
7. Abrir janela anonima e acessar o evento.
8. Preencher comprador e participante ficticios com CPF de teste sintaticamente valido.
9. Confirmar no resumo que preco, quantidade e eventual desconto vieram do servidor.
10. Iniciar Checkout Pro e usar exclusivamente comprador/cartao de teste do Mercado Pago.
11. Confirmar retorno ao staging sem considerar a back URL como aprovacao.
12. Aguardar webhook autenticado e consulta server-side ao pagamento.
13. No admin, confirmar `EventOrder=PAID`, total R$ 2,00 e `soldQuantity` incrementada uma vez.
14. Confirmar um `EventTicket` por participante, sem duplicidade.
15. Confirmar e-mail no destinatario controlado e abrir **Ver meus ingressos**.
16. Conferir QR individual e dados mascarados.
17. Na portaria, validar o QR, exigir confirmacao humana e registrar check-in.
18. Repetir o QR e confirmar `ALREADY_USED`.
19. Repetir webhook/retorno e provar idempotencia de pedido, venda, ticket e e-mail.
20. Registrar evidencias e limpar apenas os dados de teste identificados.

## Criterios de seguranca

- Back URL e query strings nunca confirmam pagamento.
- Campos de preco, lote, total, desconto, status, paymentId, preferenceId e externalReference enviados pelo navegador sao rejeitados.
- Somente webhook autenticado, consulta ao Mercado Pago, status approved e amount exato confirmam.
- Antes da abertura e a partir de `salesEndAt`, nenhum pedido ou contador pode mudar.
- Nao usar credenciais de producao, pagamento real ou banco de producao.
