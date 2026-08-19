# Transferência direta de ingressos — auditoria e validação local

## Fluxo anterior

O titular autenticado em **Meus ingressos** informava apenas o e-mail do destinatário. O serviço criava `EventTicketTransfer` em `PENDING_CURRENT_CONFIRMATION`, gerava token, montava/cifrava uma mensagem e fazia `EventTicketTransferOutbox.upsert()` dentro de uma transação serializável. O titular confirmava por e-mail, o registro passava para `PENDING_RECIPIENT_ACCEPTANCE` e uma segunda mensagem era criada. Só depois de o destinatário preencher dados e aceitar eram atualizados `EventTicket`, `EventTicketQrVersion`, `EventTicketAccessGrant`, auditoria e duas mensagens finais.

Os models e mecanismos reaproveitados são `EventTicketTransfer`, `EventTicketQrVersion`, `EventTicketAccessGrant`, `EventTicketTransferOutbox`, sessões/magic links do portal, validação de participante, transações serializáveis, outbox cifrada, auditoria administrativa e validação da portaria.

## Fluxo novo

O titular já autenticado escolhe um ingresso, informa nome, CPF, e-mail e nascimento, além dos campos configurados no evento, revisa nome/CPF mascarado/e-mail e confirma. A ação valida novamente a sessão e o ownership no servidor e conclui a transferência no mesmo commit, sem e-mail intermediário e sem aceite do destinatário.

O commit atômico:

1. valida sessão, titular atual, pedido pago, ticket `VALID` e ausência de check-in;
2. normaliza e valida os dados segundo as regras compartilhadas com checkout;
3. consulta o histórico do ticket e rejeita com `EVENT_TICKET_TRANSFER_LIMIT_REACHED` se já existir transferência `COMPLETED`;
4. encerra pendências legadas daquele ticket;
5. registra `EventTicketTransfer` com metadata `flow=DIRECT` e confirmação do titular;
6. revoga a versão QR ativa e grants anteriores;
7. atualiza somente o `EventTicket` escolhido, incrementando `ownershipVersion` e `qrVersion`;
8. cria uma nova versão QR `ACTIVE` e um grant individual para o destinatário;
9. marca a transferência `COMPLETED`, registra auditoria e insere as duas mensagens finais da outbox em lote;
10. faz commit; só então o envio assíncrono é tentado.

Cada `EventTicket` pode consumir essa operação uma única vez. A fonte da verdade é seu histórico `EventTicketTransfer.status=COMPLETED`, não apenas `ownershipVersion`, para manter a regra correta diante de dados legados ou correções administrativas. `EventOrder`, comprador, lote, parceiro, desconto, origem e valores não são modificados. O admin exibe titular atual, comprador original e a cadeia `origem → destino`.

## Idempotência, concorrência e timeout

A chave privada criada no formulário é transformada por HMAC em um ID determinístico. Duplo clique e retry do mesmo request retornam a transferência já concluída, sem nova alteração de ownership, QR ou outbox. Transações diferentes do mesmo ticket disputam sob isolamento `SERIALIZABLE`; a condição de versão/estado permite apenas uma vencedora. Check-in usa a mesma estratégia e somente check-in ou transferência pode vencer.

A causa do erro anterior de aproximadamente 5 segundos era o excesso de trabalho na interactive transaction: geração e consultas de colisão de três credenciais, montagem/cifragem de HTML e dois `upsert()` de outbox, além das escritas do domínio. No caminho direto, credenciais e payloads cifrados são preparados antes da transação. A transação recebe dados prontos e usa uma única `createMany()` para a outbox. Não existe chamada a Resend no commit e o timeout não foi aumentado.

## Legado e registros pendentes

Os enums e campos antigos foram preservados para não apagar história; não foi necessária migration. Rotas antigas `/transferencia-ingresso/confirmar/[token]` e `/transferencia-ingresso/aceitar/[token]` apenas redirecionam para uma explicação segura e não trocam token por cookie. As Server Actions antigas de confirmação/aceite também não executam a mutação.

Antes de uma futura ativação em produção, levantar somente em modo read-only os registros `PENDING_CURRENT_CONFIRMATION`, `PENDING_RECIPIENT_ACCEPTANCE`, `EXPIRED`, `REJECTED` e `CANCELED`. Definir com o responsável de produto se pendências devem ser expiradas administrativamente. Não converter nem concluir registros automaticamente, não executar backfill/repair e não apagar histórico.

## Ambiente local

Use exclusivamente um PostgreSQL local/temporário e sobrescreva todas as URLs durante testes. Nunca copie CPF ou e-mail real para fixtures. O runner exige que `TEST_DATABASE_URL` seja diferente das URLs do aplicativo e imprime apenas host/banco mascarados.

Para um banco PostgreSQL vazio, a cadeia histórica de migrations não é autocontida: a primeira migration versionada pressupõe `Product`. No ambiente efêmero desta implementação foi usado `prisma db push`, migrations existentes marcadas como baseline e os três índices parciais históricos foram recriados. Nenhuma migration histórica foi editada.

## Procedimento E2E manual

1. Na branch `teste-transferencia-direta`, configure `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` e `TEST_DATABASE_DIRECT_URL` para o PostgreSQL local; use flags/secrets apenas locais e mecanismo de e-mail fake.
2. Crie evento e pedido pagos fictícios com dois ingressos, A e Ticket 2. Registre, sem publicar, os hashes/versões e IDs iniciais.
3. Acesse **Meus ingressos** como A pelo magic link local.
4. No Ticket 1, escolha **Transferir ingresso**, preencha os dados fictícios completos de B e avance para revisão.
5. Confirme nome, CPF mascarado e e-mail; clique **CONFIRMAR TRANSFERÊNCIA** uma vez e depois repita com duplo clique/retry controlado.
6. Confirme que não há tela/e-mail de aceite e que a operação já aparece concluída.
7. Acesse **Meus ingressos** como B pelo e-mail fake e confirme o novo QR/código. O formulário não deve aparecer; deve ser exibida a mensagem **Transferência já utilizada**.
8. Na portaria local, valide: QR antigo A `INVALID`, código antigo A `INVALID`, QR novo B `VALID`, código novo B `VALID`.
9. Confirme no banco: A sem grant/credencial vigente; B titular atual; `ownershipVersion=2`; `qrVersion=2`; uma única QR `ACTIVE`; anterior `REVOKED`; histórico A→B; duas mensagens finais de outbox, sem convite.
10. Confirme que o pedido ainda pertence ao comprador original e que o admin mostra comprador original separado do titular atual e histórico.
11. Compare o Ticket 2 com o snapshot inicial: participante, ownership, QR/código, versões, status e grants devem estar idênticos.
12. Tente B→C pela interface e por chamada direta. Ambas devem ser bloqueadas com `EVENT_TICKET_TRANSFER_LIMIT_REACHED`, sem v3, nova transferência, ownership, outbox ou e-mail. O Ticket 2 continua elegível à sua própria transferência única.
13. Simule falha do sender fake. A transferência continua `COMPLETED`, a outbox fica `FAILED`/retryable e nova execução não duplica transferência, QR ou mensagem.
14. Dispare duas transferências simultâneas do mesmo ticket e depois transferência contra check-in. Em cada disputa, confirme exatamente uma transição vencedora e nenhum estado parcial.
15. Abra URLs antigas de confirmação/aceite e confirme que apenas a orientação de fluxo legado é exibida.

Não usar Mercado Pago real, Resend real, Neon, Vercel, deploy, backfill ou repair neste procedimento.
