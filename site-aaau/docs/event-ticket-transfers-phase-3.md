# Transferência de ingressos — Fase 3

## Escopo

A Fase 3 implementa solicitação, confirmação do titular, convite/aceite do destinatário, cancelamento, rejeição, conclusão pelo motor da Fase 2 e comunicação transacional. Cada operação é vinculada a um único `EventTicket`; o `EventOrder` permanece como registro financeiro e seus outros ingressos não são alterados.

## Credenciais e tokens

- A solicitação exige o `EventOrder.accessToken` do pedido original ou um `EventTicketAccessGrant` ativo, não expirado e com a versão de titularidade atual.
- Confirmação e aceite usam tokens opacos aleatórios de 256 bits. Somente HMAC-SHA-256 com finalidade separada é persistido.
- Confirmação do titular expira em 30 minutos.
- Após a confirmação, o convite do destinatário expira em 48 horas.
- Cancelamento, rejeição, expiração e conclusão removem os hashes dos tokens pendentes.
- GETs apenas projetam dados mínimos. Toda mutação usa Server Action/POST, valida Origin e aplica limite de 10 tentativas por credencial, IP e janela de 15 minutos.

## Outbox

Os e-mails são criados na mesma transação que muda o estado correspondente. O conteúdo completo é cifrado em AES-256-GCM com `EVENT_TICKET_TRANSFER_OUTBOX_SECRET`, chave derivada para a finalidade `event-ticket-transfer-outbox-v1`, IV aleatório e tag de autenticação. O token bruto do grant existe apenas dentro do payload cifrado do e-mail final.

O processador usa lease, chave de idempotência, tentativas e backoff. Falhas guardam apenas uma classificação redigida. Após a aceitação do provedor, ciphertext, IV e tag são apagados. O processamento é explícito nas Server Actions e pode ser repetido por:

```text
npm run transfers:outbox:process
```

Uma falha ou reinício depois do commit não cria outro grant, QR ou transferência: o mesmo item cifrado é reenviado com a mesma chave de idempotência.

## Acesso após transferência

`/meus-ingressos/[accessToken]` aceita tanto o token coletivo legado quanto um grant individual. No acesso coletivo, um ingresso com `originalOrderAccessRevokedAt` retorna somente `ticketId`, estado `TRANSFERRED` e data; QR, código e dados do novo titular não são consultados para a projeção pública. Ingressos irmãos continuam disponíveis. Um grant retorna exatamente o ingresso ao qual está associado.

Não foram criados `/meus-ingressos` central, recuperação geral por e-mail, menu público, marketplace ou pagamentos de revenda.
