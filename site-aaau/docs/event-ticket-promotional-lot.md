# Lote promocional por unidade comercial

## Modelo

O estoque de `EventTicketLot` é medido em unidades comerciais. Em um lote comum,
`ticketsPerUnit = 1`; em um pacote 2 por 1, `ticketsPerUnit = 2`. A reserva e a
confirmação movimentam unidades comerciais, enquanto cada participante pago gera
um `EventTicket` independente, com QR Code e código manual próprios.

Cada `EventOrder` guarda o snapshot de `ticketLotId`, `commercialUnitQuantity`,
`ticketsPerUnit` e `commercialUnitPrice`. Assim, quantidade de pacotes, quantidade
de ingressos e valor comercial não precisam ser inferidos posteriormente.

Um lote com `exclusiveWindow = true` suspende os demais somente enquanto estiver
dentro da janela, ativo e com estoque. Ao encerrar ou esgotar, a seleção volta
automaticamente ao próximo lote elegível, sem alterar seus contadores ou preço.

## Configuração aprovada

- Nome: `Lote Promocional - 2 por 1`
- Preço por pacote: `R$ 130,00`
- Capacidade: `100` pacotes
- Ingressos por pacote: `2`
- Máximo de pacotes por pedido: `2`
- Início: `07/08/2026 12:00 America/Sao_Paulo` (`2026-08-07T15:00:00Z`)
- Fim exclusivo: `08/08/2026 12:00 America/Sao_Paulo` (`2026-08-08T15:00:00Z`)
- Suspender outros lotes durante o período: sim

## Rollout posterior

Não execute estes passos antes da revisão e aprovação da implementação.

1. Fazer snapshot/PITR do banco e confirmar que o projeto/ambiente é o correto.
2. Aplicar `20260807120000_event_ticket_commercial_units` com a conexão direta,
   usando `npx prisma migrate deploy`. Não usar `prisma db push`.
3. Conferir `npx prisma migrate status` e validar que pedidos antigos receberam
   snapshots equivalentes a um ingresso por unidade.
4. Publicar o código com os campos do admin disponíveis.
5. No admin do evento correto, criar o lote com os valores acima. Não editar,
   esgotar nem duplicar o terceiro lote.
6. Conferir no admin as datas convertidas para `15:00:00Z`, capacidade de 100
   pacotes e multiplicador 2 antes de salvar/publicar.
7. Em Preview/staging, testar um pacote e dois pacotes com Mercado Pago de teste,
   emissão de 2/4 ingressos, e-mail, central e check-in individual.
8. Em produção, observar seleção de lote, reservas, pagamentos, emissão, e-mail,
   contadores e relatório. Não alterar QR versioning, transferências ou backfill.

Rollback operacional: desativar somente o lote promocional. Isso faz o lote normal
elegível voltar a ser selecionado e preserva todos os pedidos já criados. Não reverta
a migration de forma destrutiva e não diminua capacidade abaixo de vendido + reservado.
