# Central pública de ingressos — Fase 4

## Política de autorização

A central não cria contas. O endereço informado recebe um magic link apenas quando há conteúdo autorizado. A resposta HTTP e visual é sempre neutra.

São consolidados:

- pedidos com ingressos em que `EventOrder.buyerEmail` corresponde ao e-mail da sessão;
- grants individuais ativos, não expirados e com `ownershipVersion` atual;
- transferências concluídas em que o e-mail era o titular anterior, como histórico redigido.

`EventOrderParticipant.email` não concede acesso nesta fase. Historicamente esse endereço foi coletado como dado do participante, enquanto o acesso coletivo foi entregue ao comprador. Considerá-lo prova de posse concederia acesso sem uma verificação previamente acordada. Uma futura mudança dessa política deverá emitir grant individual e nunca liberar os irmãos do pedido.

## Sessão

O magic link usa token aleatório de 256 bits e apenas HMAC é persistido. Na primeira abertura ele é consumido atomicamente e trocado por outro token aleatório, armazenado em cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção e restrito a `/meus-ingressos`. A URL final não contém token. Sessões expiram em 60 minutos e podem ser revogadas pelo botão Sair.

Nenhuma lista de ingressos é armazenada na sessão. Pedidos, grants, versões e histórico são recalculados no servidor a cada painel.

O `emailHash` da sessão usa a mesma identidade HMAC `holder-email` adotada por `EventTicketAccessGrant` e pelo histórico de transferência. Isso permite a junção por hash sem consultar e-mails em texto aberto. Tokens, cookie, rate limit e outbox continuam separados por finalidade e pelo segredo exclusivo da central.

## E-mail e abuso

O payload do e-mail fica em outbox cifrada com AES-256-GCM e é apagado após entrega. O envio usa `EmailDelivery` com chave idempotente. Solicitações têm cooldown de cinco minutos.

O rate limiting usa PostgreSQL e chaves HMAC para IP, e-mail e fingerprint de token. A interface `PortalRateLimitBackend` permite trocar o backend por Redis sem alterar os serviços. Não são persistidos IP ou e-mail brutos na tabela de limites.

## Operação

Variáveis obrigatórias:

```text
EVENT_TICKET_PORTAL_ENABLED=true
EVENT_TICKET_PORTAL_SECRET=<segredo independente com pelo menos 32 caracteres>
EVENT_TICKET_TRANSFER_TOKEN_SECRET=<segredo HMAC da identidade de titular configurado nas fases anteriores>
```

O processador existente `npm run transfers:outbox:process` também processa a outbox da central.
