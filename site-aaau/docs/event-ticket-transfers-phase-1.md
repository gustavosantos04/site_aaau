# Transferencia de ingressos — Fase 1

Esta fase cria somente a fundacao interna e permanece desabilitada por padrao. Ela nao cria rotas, paginas, e-mails ou conclusao publica de transferencia.

## Invariantes

- Transferencias, grants e versoes de QR pertencem diretamente a um `EventTicket`.
- `EventOrder` permanece como origem financeira e historica e nunca e transferido.
- `EventTicketStatus` continua operacional (`VALID`, `USED`, `CANCELED`, `REFUNDED`).
- `originalOrderAccessRevokedAt` e individual; o backfill nao o preenche.
- A migration nao modifica tokens, codigos, titulares, status ou acessos existentes.
- A pagina atual `/meus-ingressos/[accessToken]` nao foi alterada nesta fase.

## Configuracao

```dotenv
EVENT_TICKET_TRANSFERS_ENABLED="false"
EVENT_TICKET_TRANSFER_TOKEN_SECRET="uma-chave-independente-aleatoria-com-pelo-menos-32-caracteres"
```

O segredo e usado como chave HMAC-SHA-256, com separacao de dominio, para e-mails, grants, QR tokens e codigos manuais. O token bruto de um grant nunca e persistido.

## Migration em staging

1. Confirme que `DATABASE_URL` aponta para staging e mantenha a feature flag em `false`.
2. Crie um backup/snapshot do banco.
3. Execute `npx prisma migrate deploy`.
4. Execute `npx prisma validate` e uma verificacao de leitura dos ingressos atuais.
5. Nao habilite transferencias: esta fase nao conclui nem expoe transferencias.

A migration `20260805000000_event_ticket_transfers_phase_1` e exclusivamente aditiva. Ela cria tres enums, tres tabelas, cinco colunas em `EventTicket`, FKs `RESTRICT` para a historia pertencente ao ingresso, FKs opcionais `SET NULL` para ator/transferencia de origem e indices parciais PostgreSQL para uma transferencia pendente, um grant ativo e uma versao QR ativa por ingresso.

## Backfill em staging

Configure o segredo e execute:

```powershell
$env:EVENT_TICKET_TRANSFER_TOKEN_SECRET='segredo-de-staging-com-32-ou-mais-caracteres'
$env:EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM='STAGING'
npm run staging:transfers:backfill
```

O script se recusa a iniciar sem a confirmacao explicita `STAGING` ou se a feature flag estiver ativa. Ele processa lotes de 100 ingressos. Para ingressos sem versao 1, cria `EventTicketQrVersion` ativa usando HMAC do `qrToken` e do `ticketCode` atuais e preserva `issuedAt`. Ele nao atualiza `EventTicket`. Reexecucoes ignoram registros ja criados e terminam com `missing: 0` quando completas.

O segredo deve permanecer estavel: trocar a chave muda os hashes calculados e impede reconciliar credenciais historicas.

## Rollback

Antes de qualquer transferencia real ou grant real, o rollback de aplicacao consiste em manter a flag desligada e voltar ao build anterior; as colunas/tabelas aditivas podem permanecer sem afetar os fluxos existentes.

Se for indispensavel remover a estrutura em staging, primeiro valide que nao ha registros de transferencia/grant e remova manualmente FKs, indices, tabelas, colunas e enums em ordem inversa. Esse rollback destrutivo nao deve ser automatizado nem executado em producao. Depois que houver historico real, as tabelas devem ser preservadas.

## Escopo futuro

A proxima fase devera implementar confirmacao, aceite, rotacao atomica do QR e codigo, projecao `TRANSFERRED` no acesso coletivo e acesso individual. Nenhum desses comportamentos esta ativo nesta fase.
