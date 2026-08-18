# Operação e lançamento seguro de transferências de ingressos

Data da auditoria: 2026-08-06.

## Estado auditado

- A aplicação é Next.js e o repositório documenta a Vercel como ambiente de produção, usa variáveis automáticas `VERCEL_*`, Analytics e Speed Insights. Não existe vínculo local `.vercel/project.json`; o endpoint público documentado não respondeu durante a auditoria. Confirme projeto, equipe e plano diretamente no dashboard antes do rollout.
- O `DATABASE_URL` local aponta para PostgreSQL Neon por endpoint poolado. Migrations devem usar uma conexão direta Neon, fornecida temporariamente ao processo como `DATABASE_URL`; não use o pooler para `prisma migrate deploy` ou `pg_dump`.
- Resend é o provedor preferencial. Quando `RESEND_API_KEY` está ausente, o sistema usa SMTP se toda a configuração SMTP estiver presente.
- Não havia cron, worker ou configuração recorrente no repositório. O único mecanismo era o script manual `npm run transfers:outbox:process` e tentativas oportunistas nas requisições.
- Foi adicionada uma rota interna, um lease persistente e uma tentativa imediata e idempotente por item após cada commit. O Vercel Cron diário é apenas recuperação e é compatível com Hobby; Pro/Enterprise podem usar uma frequência maior se a operação exigir recuperação mais rápida.
- Uma consulta remota somente de leitura (`prisma migrate status`) encontrou pendentes, nesta ordem: `20260805000000_event_ticket_transfers_phase_1`, `20260805230000_event_ticket_transfers_phase_3` e `20260806000000_event_ticket_portal_phase_4`.

Nenhuma migration ou backfill foi executado no banco remoto durante esta auditoria.

## Variáveis de ambiente

| Variável | Onde | Obrigatória e formato | Rotação e impacto |
|---|---|---|---|
| `DATABASE_URL` | Todos os runtimes server-side | PostgreSQL URL. Na aplicação Vercel, normalmente é a URL Neon poolada. | Rotacionável coordenando credenciais e novo deploy. |
| `DIRECT_URL` | CI/operação | PostgreSQL Neon direto, sem pooler. O código não a lê automaticamente: copie-a somente para `DATABASE_URL` no processo de migration/backup. | Rotacionável; afeta apenas processos operacionais. |
| `APP_URL` | Todos | Origem absoluta, sem query, fragmento ou credenciais. HTTPS obrigatório em produção. | Rotacionar exige atualizar links, callbacks e webhooks. Links já emitidos continuam apontando para a origem antiga. |
| `NEXT_PUBLIC_SITE_URL` | Todos | Origem pública para metadata; deve coincidir com `APP_URL`. Não é secret. | Rotacionável junto com o domínio. |
| `EVENT_TICKET_TRANSFERS_ENABLED` | Preview/Production | Booleano textual, `false` no primeiro deploy. | Pode ser alterado por deploy; desligar bloqueia novas transições sem apagar dados. |
| `EVENT_TICKET_PORTAL_ENABLED` | Preview/Production | Booleano textual, `false` no primeiro deploy. | Pode ser alterado por deploy; desligar bloqueia portal e novas sessões. |
| `EVENT_TICKET_TRANSFER_TOKEN_SECRET` | Preview/Production | Secret aleatório, mínimo 32 caracteres. Também define a identidade HMAC dos titulares. | **Não rotacionar diretamente**: invalida grants/tokens e rompe a associação por hash. Exige migração com chave anterior/nova. |
| `EVENT_TICKET_TRANSFER_OUTBOX_SECRET` | Preview/Production | Secret aleatório e exclusivo, mínimo 32 caracteres. | Só rotacionar quando não existir outbox de transferência pendente/fracassada; payloads antigos tornam-se indecifráveis. |
| `EVENT_TICKET_PORTAL_SECRET` | Preview/Production | Secret aleatório e exclusivo, mínimo 32 caracteres. | Invalida magic links e cookies existentes e torna payloads pendentes do portal indecifráveis. Drene a outbox antes. |
| `CRON_SECRET` | Production e staging com agendador | Secret aleatório e exclusivo, mínimo 32 caracteres. A Vercel envia `Authorization: Bearer ...` automaticamente. | Rotacionável sem afetar ingressos, coordenando variável e agendador. |
| `RESEND_API_KEY` | Preview/Production | Chave server-side. Obrigatória salvo fallback SMTP completo. | Rotacionável; pode causar falhas temporárias de entrega. |
| `RESEND_FROM` | Preview/Production | Remetente de domínio verificado. | Rotacionável após verificação do novo remetente. |
| `RESEND_REPLY_TO` | Opcional | E-mail de resposta. | Livremente rotacionável. |
| `RESEND_WEBHOOK_SECRET` | Ambiente com webhook | Secret do webhook Resend. | Rotação exige atualizar Resend e Vercel em conjunto. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Contingência | Todos os campos essenciais devem existir; porta numérica e `SMTP_SECURE=true/false`. | Rotacionáveis em conjunto. Não são usados quando Resend está ativo. |
| `ORDER_NOTIFICATION_EMAIL` | Opcional | Destinatário interno. | Rotacionável. |
| `MERCADO_PAGO_ACCESS_TOKEN` | Preview/Production | Token server-side do Checkout Pro. | Rotacionar no provedor e deploy; pode interromper checkout. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Preview/Production | Secret de assinatura do webhook. | Rotação coordenada com Mercado Pago. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview protegido | Secret para callbacks Mercado Pago em preview. | Rotacionável coordenando Deployment Protection. |
| `JWT_SECRET` | Todos com admin | Secret aleatório com pelo menos 32 caracteres recomendado. | Rotação encerra sessões administrativas existentes. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Somente se usar super-admin legado | Credencial server-side; use senha forte. | Rotacionável; não afeta usuários `AdminUser`. |
| `EVENT_TICKET_RESERVATION_MINUTES` | Opcional | Inteiro positivo; padrão 15. | Afeta novas reservas. |
| `EVENT_TICKET_TRANSFER_BACKFILL_TARGET` | Processo isolado | `staging` ou `production`. Nunca manter no runtime. | Não se aplica. |
| `EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM` | Processo isolado | `BACKFILL-STAGING` ou `BACKFILL-PRODUCTION`. | Não se aplica. |
| `ALLOW_STAGING_EVENT_FIXTURE`, `STAGING_EVENT_STAFF_PASSWORD` | Somente staging/local | Guarda explícita e senha temporária. Nunca configurar em Production. | Remover após o ensaio. |
| `TEST_DATABASE_URL`, `TEST_DATABASE_DIRECT_URL` | Somente testes | Banco PostgreSQL dedicado, local e descartável. | Nunca apontar para staging ou produção. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Público/opcional | Identificador público do Clarity. | Não é secret. |

Os quatro secrets de transferência, outbox, portal e cron devem ser diferentes. A validação ocorre apenas quando uma feature é ativada; flags desligadas não bloqueiam build. Ativação também exige `APP_URL` válida e um provedor de e-mail configurado.

## Migrations

### Ordem e locks

1. `20260805000000_event_ticket_transfers_phase_1`: adiciona colunas com defaults constantes a `EventTicket`, tabelas vazias, FKs e índices. PostgreSQL moderno aplica defaults constantes sem reescrever todas as linhas, mas o `ALTER TABLE` exige lock exclusivo breve. O índice novo em `EventTicket` lê a tabela.
2. `20260805230000_event_ticket_transfers_phase_3`: depende das tabelas da fase 1, amplia enum de e-mail, adiciona colunas e cria a outbox de transferência. Locks breves em `EmailDelivery` e `EventTicketTransfer`.
3. `20260806000000_event_ticket_portal_phase_4`: depende de `EmailDelivery`, cria sessões, rate limit e outbox do portal, além do novo tipo de e-mail.

As migrations são aditivas. Elas não executam `UPDATE` de QR/código, não geram credenciais, não revogam acesso original e não apagam dados. Índices em tabelas novas têm custo baixo; o principal custo variável é o lock/scan do `EventTicket` na fase 1. Meça a quantidade de ingressos e aplique em janela de baixo tráfego.

### Staging

1. Confirme flags `false` e crie um branch/backup do Neon staging.
2. Use a URL direta somente no processo:

```powershell
$env:DATABASE_URL=$env:DIRECT_URL
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

3. Execute a verificação inicial, o backfill e repita-o:

```powershell
$env:EVENT_TICKET_TRANSFERS_ENABLED='false'
$env:EVENT_TICKET_PORTAL_ENABLED='false'
$env:EVENT_TICKET_TRANSFER_BACKFILL_TARGET='staging'
$env:EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM='BACKFILL-STAGING'
npm run staging:transfers:backfill
npm run staging:transfers:backfill
npm run transfers:rollout:verify
```

4. Os dois backfills devem terminar com `missingVersionOne=0`, `missingActive=0`, `credentialHashMismatches=0`, `credentialChanges=0` e `updatedAtChanges=0`. Na segunda execução, `created=0`.

### Produção — somente após autorização explícita

1. Crie branch/PITR Neon e backup lógico com conexão direta:

```powershell
pg_dump --dbname="$env:DIRECT_URL" --format=custom --file="aaau-pre-ticket-transfer.backup"
```

2. Faça deploy com as duas flags desligadas.
3. Em janela de baixo tráfego, aplique migrations usando a URL direta:

```powershell
$env:DATABASE_URL=$env:DIRECT_URL
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

4. Execute o backfill com confirmação de produção:

```powershell
$env:NODE_ENV='production'
$env:EVENT_TICKET_TRANSFERS_ENABLED='false'
$env:EVENT_TICKET_PORTAL_ENABLED='false'
$env:EVENT_TICKET_TRANSFER_BACKFILL_TARGET='production'
$env:EVENT_TICKET_TRANSFER_BACKFILL_SECRET='<fornecer somente no processo>'
$env:EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM='BACKFILL-PRODUCTION'
npm run transfers:rollout:verify
npm run transfers:backfill:dry-run
npx tsx scripts/backfill-event-ticket-qr-versions.ts backfill --write
npx tsx scripts/backfill-event-ticket-qr-versions.ts backfill --write
npm run transfers:rollout:verify
```

Não salve essas confirmações como variáveis permanentes da Vercel.

## Backfill

O script inicia em modo `verify`; `backfill` sem `--write` também não escreve. A escrita processa 100 ingressos por lote e cria somente `EventTicketQrVersion.version=1` para tickets sem qualquer histórico e que satisfaçam todos os critérios seguros. A revalidação dentro da transação e a constraint `(ticketId, version)` tornam a operação idempotente. Ele exige fingerprints idênticas para `EVENT_TICKET_TRANSFER_BACKFILL_SECRET` e `EVENT_TICKET_TRANSFER_TOKEN_SECRET`, sem imprimir os secrets.

O script mede total de ingressos, versões 1, versões ativas, tickets sem versão, tickets sem versão ativa, candidatos elegíveis e hashes divergentes. Qualquer ticket sem histórico que não corresponda ao formato seguro esperado aborta o backfill.

Uma inconsistência encerra com código diferente de zero. Não tente “corrigir” manualmente: preserve banco/backup, registre apenas IDs afetados em canal restrito e escale.

## Outboxes e cron

Tabelas:

- `EventTicketTransferOutbox`: confirmações, convites, conclusão, cancelamento, rejeição e expiração.
- `EventTicketPortalOutbox`: magic link da central.
- `EmailDelivery`: rastreamento idempotente no provedor.

Ambos os processadores possuem claim atômico por registro, lease de cinco minutos, recuperação de `PROCESSING` abandonado, backoff exponencial de 30 segundos até uma hora e no máximo oito tentativas. Payloads usam AES-256-GCM e são apagados depois do envio. Ao esgotar tentativas, o item fica `FAILED`, fora da seleção automática, com erro redigido e payload ainda cifrado para investigação controlada.

`vercel.json` chama `GET /api/internal/event-ticket-outbox` diariamente às 09:00 UTC. A rota:

- aceita apenas o Bearer `CRON_SECRET` no header;
- usa comparação por digest em tempo constante;
- não aceita segredo em query string;
- processa no máximo 20 itens de cada outbox;
- tem timeout configurado em 60 segundos;
- usa lease persistente de dois minutos para limitar concorrência entre instâncias;
- retorna somente status e contadores;
- não retorna IDs, destinatários, tokens ou payloads.

O script manual usa o mesmo ciclo e lease:

```powershell
npm run transfers:outbox:process
```

O caminho normal é a tentativa imediata do item recém-persistido, depois do commit e fora da transação. Use o comando e o cron somente para recuperação. Alertar quando `failed > 0`, `exhausted > 0`, `pending` crescer continuamente ou não houver `outbox.cycle_completed` por mais de 26 horas na agenda diária. Em Pro/Enterprise, uma agenda horária pode reduzir o tempo de recuperação sem afetar o primeiro envio.

## Ativação gradual

### A — deploy inativo

```dotenv
EVENT_TICKET_TRANSFERS_ENABLED=false
EVENT_TICKET_PORTAL_ENABLED=false
```

Validar home, checkout, Mercado Pago, e-mails existentes, portaria e links antigos.

### B — schema e backfill

Aplicar o roteiro acima, executar o backfill duas vezes e arquivar os contadores.

### C — somente portal

```dotenv
EVENT_TICKET_PORTAL_ENABLED=true
EVENT_TICKET_TRANSFERS_ENABLED=false
```

Validar menu, resposta neutra, e-mail, cookie HttpOnly, painel, logout e links antigos. Nenhum card deve oferecer transferência.

### D — teste controlado

Faça o teste completo em staging com dados fictícios. Não foi adicionada allowlist de e-mails em produção: ela introduziria PII em configuração e uma segunda política de autorização. Caso seja indispensável um canário produtivo, restrinja por `eventId` server-side em uma mudança separada e testada; não esconda apenas o botão.

### E — geral

Ative transferências somente após aprovação dos testes, monitorando cron, falhas de e-mail, conclusão e portaria.

## Roteiro manual de staging

1. **Um ingresso:** compra e pagamento fictícios; portal; solicitar, confirmar e aceitar transferência; confirmar novo acesso; QR/código antigos falham e novos funcionam.
2. **Pedido com três:** transferir somente o segundo; primeiro e terceiro mantêm exatamente QR, código, versão e status; comprador vê o segundo redigido; destinatário vê somente o segundo.
3. **Falha de e-mail:** usar credencial inválida do provedor em staging; confirmar `FAILED`; restaurar credencial; reprocessar; conferir que ownership/QR não rotacionaram novamente.
4. **Concorrência:** disparar check-in e aceite final simultaneamente; apenas uma transição vence e os logs permanecem coerentes.
5. **Expiração/cancelamento:** expirar confirmação e aceite, cancelar e rejeitar; QR original permanece válido enquanto a transferência não conclui.
6. **Portaria:** antes da conclusão o QR antigo funciona; depois falham QR e código antigos; novos funcionam; irmãos continuam válidos; ingresso usado não oferece transferência.

Nunca faça check-in de ingresso real de produção durante o ensaio.

## Produção e rollback

Checklist antes de ativar: backup/PITR confirmado, migration status limpo, backfill idempotente, cron observado, Resend/SMTP validado, suporte avisado e responsáveis definidos.

Rollback de aplicação:

1. Desligue imediatamente as duas flags e faça redeploy.
2. Volte para a versão anterior da aplicação.
3. **Mantenha o schema aditivo**; não remova tabelas/colunas/enums durante o incidente.
4. Preserve outboxes e sessões para análise. Não rotacione secrets como primeira resposta, salvo comprometimento confirmado.
5. Verifique checkout, links antigos e portaria.
6. Se necessário, processe ou encerre itens pendentes somente após decisão operacional documentada.

Restaurar banco é último recurso, pois pode apagar compras/check-ins posteriores ao backup. Não use rollback destrutivo de migration para rollback normal de deploy.

## Observabilidade segura

Os logs estruturados usam `scope=event-tickets` e eventos como `portal.access_requested`, `portal.session_created`, `transfer.requested`, `transfer.holder_confirmed`, `transfer.recipient_accepted`, `transfer.completed`, `transfer.canceled`, `email.sent`, `email.failed`, `outbox.cycle_completed` e `outbox.cycle_skipped`.

São permitidos somente IDs internos e contadores. Nunca registrar CPF, e-mail completo, telefone, token, QR, código manual, ciphertext, secret ou URL contendo token. O fixture de staging não imprime mais o link coletivo.

Consultas operacionais devem retornar apenas contadores, por exemplo:

```sql
SELECT status, count(*) FROM "EventTicketTransferOutbox" GROUP BY status;
SELECT status, count(*) FROM "EventTicketPortalOutbox" GROUP BY status;
SELECT status, count(*) FROM "EventTicketTransfer" GROUP BY status;
```

Consulte [event-ticket-support.md](./event-ticket-support.md) para atendimento ao público.
