# Transferencias de ingressos — Fase 2

Esta fase implementa somente o motor interno que conclui a transferencia de um `EventTicket`.
Ela nao cria rota, pagina, e-mail, magic link, interface administrativa ou marketplace.

## Titular atual e registro da compra

`EventOrder` e `EventOrderParticipant` continuam sendo os registros financeiros e historicos da
compra original. Eles nunca sao atualizados pela transferencia. Os campos `participant*` de
`EventTicket` representam o titular atual e sao os unicos dados pessoais substituidos na conclusao.
O ingresso preserva `id`, `eventOrderId`, `eventId`, `lotId` e `orderParticipantId`.

## Atomicidade e isolamento

`completeEventTicketTransfer` executa em uma transacao PostgreSQL `SERIALIZABLE`, usando o retry
transacional do dominio. A operacao recebe `transferId`, `ticketId` e `expectedOwnershipVersion` e
faz update condicional exclusivamente pelo `EventTicket.id`. QR, codigo manual, grants, historico
e auditoria sao alterados na mesma transacao. Qualquer falha desfaz todas essas mudancas.

Ingressos irmaos do mesmo pedido nao sao consultados para mutacao. O pedido, o lote, o pagamento,
os contadores e o participante original permanecem inalterados.

## Credenciais e idempotencia

O QR e o codigo manual anteriores deixam de existir no `EventTicket`. Seus hashes permanecem no
historico `EventTicketQrVersion` com status `REVOKED`, motivo `TRANSFER_COMPLETED` e referencia a
transferencia. A nova versao fica `ACTIVE`. Tokens sao gerados com o mesmo mecanismo criptografico
da emissao original; colisoes provocam nova geracao.

O grant novo armazena somente o HMAC. O token bruto existe apenas no retorno da primeira conclusao.
Uma repeticao identica retorna o ingresso ja concluido sem nova rotacao, versao, grant ou auditoria;
como o token bruto nao e persistido, ele retorna `null` no replay.

## Concorrencia com check-in

Transferencia e check-in usam transacoes seriais e updates condicionais sobre `status`,
`checkedInAt`, credenciais e `ownershipVersion`. Se o check-in vencer, a transferencia encontra o
ingresso usado e falha integralmente. Se a transferencia vencer, as credenciais antigas deixam de
resolver e o check-in falha. Nunca sao confirmados os dois estados para o mesmo ingresso.
