# Staging HTTPS e teste fisico da portaria

Este procedimento nao autoriza deploy automatico, uso de producao, pagamento real ou envio para destinatarios reais.

## Variaveis de ambiente

| Variavel | Obrigatoria | Escopo | Finalidade | Ausente |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Sim | Server-only | URL pooled do Neon no runtime; temporariamente deve receber a URL direct no processo de migration | Prisma e rotas persistentes falham |
| `JWT_SECRET` | Sim | Server-only | Assina a sessao administrativa | Login administrativo fica indisponivel |
| `ADMIN_EMAIL` | Operacional | Server-only | Super admin legado | Login legado nao existe |
| `ADMIN_PASSWORD` | Operacional | Server-only | Senha do super admin legado | Login legado nao existe |
| `APP_URL` | Sim | Server-only | Origem HTTPS confiavel para QR, e-mail, back URLs e webhook | Build/runtime que precisar de URL absoluta falha em producao |
| `NEXT_PUBLIC_SITE_URL` | Recomendada | `NEXT_PUBLIC` | URL publica usada por metadata/configuracao visual legada; manter igual a `APP_URL` | Alguns metadados usam fallback do projeto |
| `VERCEL_URL` | Automatica | Server-only | Fallback fornecido pela Vercel | Sem efeito quando `APP_URL` existe |
| `MERCADO_PAGO_ACCESS_TOKEN` | Sim para checkout | Server-only | Credencial de teste/sandbox do Mercado Pago | Preferencias e conciliacao nao funcionam |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Sim no staging operacional | Server-only | Verificacao da assinatura do webhook | Webhook perde a verificacao criptografica configuravel |
| `SMTP_HOST` | Sim para e-mail | Server-only | Host SMTP controlado | Transporte SMTP indisponivel |
| `SMTP_PORT` | Nao | Server-only | Porta SMTP, padrao 587 | Usa 587 |
| `SMTP_USER` | Sim para e-mail | Server-only | Usuario SMTP | Transporte SMTP indisponivel |
| `SMTP_PASS` | Sim para e-mail | Server-only | Senha SMTP | Transporte SMTP indisponivel |
| `SMTP_FROM` | Nao | Server-only | Remetente; fallback para `SMTP_USER` | Usa `SMTP_USER` |
| `SMTP_SECURE` | Nao | Server-only | Forca TLS implicito; por padrao depende da porta 465 | Inferido pela porta |
| `ORDER_NOTIFICATION_EMAIL` | Nao | Server-only | Caixa interna de notificacoes da loja | Notificacao interna nao e enviada |
| `EVENT_TICKET_RESERVATION_MINUTES` | Nao | Server-only | Duracao da reserva, padrao 15 minutos | Usa 15 minutos |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Nao | `NEXT_PUBLIC` | Microsoft Clarity em producao | Analytics Clarity desativado |
| `ALLOW_STAGING_EVENT_FIXTURE` | Somente fixture | Server-only/processo | Opt-in explicito para criar/limpar fixture | Script aborta |
| `STAGING_EVENT_STAFF_PASSWORD` | Somente criacao | Server-only/processo | Senha temporaria do staff ficticio | Criacao aborta |
| `TEST_DATABASE_URL` | Somente testes | Server-only/processo | Neon pooled autorizado para integracao | Integracao aborta |
| `TEST_DATABASE_DIRECT_URL` | Somente testes | Server-only/processo | Neon direct para migrations de integracao | Runner aborta |

`NODE_ENV` deve ser gerenciado pela plataforma. Em producao, cookies usam `Secure`, `HttpOnly`, `SameSite=Strict`, path `/` e expiracao de 12 horas.

## Banco Neon de staging

1. Criar projeto/branch Neon exclusivo para staging, separado de producao e da branch descartavel de integracao.
2. Obter URL pooled para runtime e URL direct para operacao de migration.
3. Configurar `DATABASE_URL` pooled no ambiente Vercel de Preview/Staging.
4. Em shell administrativo local/CI, definir `DATABASE_URL` somente para o processo com a URL direct.
5. Executar `npx prisma migrate deploy`.
6. Executar `npx prisma migrate status` e confirmar todas as migrations aplicadas.
7. Nunca executar `prisma db push`, `migrate reset` ou seed destrutivo.

## Deploy Vercel de staging

1. Criar banco Neon exclusivo de staging.
2. Configurar `DATABASE_URL` pooled no ambiente de staging.
3. Separar a URL direct para o job/processo de migration.
4. Configurar `JWT_SECRET` aleatorio e exclusivo.
5. Configurar `ADMIN_EMAIL` e `ADMIN_PASSWORD` temporarios fortes.
6. Configurar `APP_URL=https://dominio-real-do-staging`.
7. Configurar `NEXT_PUBLIC_SITE_URL` com a mesma origem.
8. Configurar credenciais Mercado Pago de teste e `MERCADO_PAGO_WEBHOOK_SECRET` de staging.
9. Configurar SMTP controlado e destinatarios de teste.
10. Executar `DATABASE_URL="<direct-staging>" npx prisma migrate deploy` no ambiente seguro apropriado.
11. Executar `npm ci`, `npx prisma generate`, `npm run build` e as suites obrigatorias.
12. Criar o deploy Preview/Staging na Vercel sem promover para producao.
13. Confirmar HTTPS e o header `Permissions-Policy: camera=(self)`.
14. Validar `/eventos`, `/admin/login`, `/admin` e logout.
15. Validar login event_staff e redirecionamento para `/portaria`.
16. Validar que `/portaria` lista somente eventos atribuidos.
17. Criar o fixture somente se o banco e o dominio forem comprovadamente de staging.
18. Executar os checklists fisicos abaixo.
19. Executar cleanup do fixture e confirmar que o prefixo nao permanece.
20. Revogar/remover credenciais temporarias do staff quando o teste terminar.

## Fixture operacional

O script cria evento, lote, pedido pago ficticio, cinco participantes/tickets (`VALID`, `VALID`, `USED`, `CANCELED`, `REFUNDED`), event_staff e assignment. Nao chama SMTP ou Mercado Pago.

```powershell
$env:NODE_ENV = "staging"
$env:ALLOW_STAGING_EVENT_FIXTURE = "true"
$env:STAGING_EVENT_STAFF_PASSWORD = "<senha-temporaria-forte>"
npm run staging:fixture:create
```

A criacao mostra uma unica vez a URL segura de `/meus-ingressos/[accessToken]`, `/portaria` e o e-mail ficticio. Nao mostra `qrToken` nem persiste senha em texto puro.

```powershell
$env:NODE_ENV = "staging"
$env:ALLOW_STAGING_EVENT_FIXTURE = "true"
npm run staging:fixture:cleanup
```

## Android Chrome

Registrar modelo, Android, Chrome, resultado por item, bugs e evidencias. Nao marcar antecipadamente.

1. Abrir o staging HTTPS e fazer login como event_staff.
2. Confirmar redirecionamento para `/portaria` e selecionar o evento atribuido.
3. Confirmar que a camera nao abriu antes do toque; tocar **Abrir leitor**.
4. Permitir a camera e confirmar uso da traseira.
5. Ler QR em outro celular; confirmar que nao houve check-in automatico.
6. Conferir participante/ticket; tocar **Confirmar entrada** e validar `CHECK-IN REALIZADO`.
7. Acionar o proximo ingresso; reler o mesmo QR e validar `ALREADY_USED` com horario.
8. Ler o segundo QR valido, cancelar antes de confirmar e provar que continua `VALID`; reler e confirmar.
9. Ler `CANCELED` e `REFUNDED`; confirmar ausencia do CTA.
10. Ler QR de outro evento; validar `WRONG_EVENT` sem dados do participante.
11. Repetir com QR impresso.
12. Negar e recuperar permissao da camera.
13. Alternar para outro app e voltar; bloquear/desbloquear o aparelho; confirmar reabertura limpa.
14. Executar dez leituras sequenciais sem scanner duplicado ou travamento critico.
15. Desligar Wi-Fi/dados antes de confirmar; validar `OFFLINE` sem sucesso falso.
16. Religiar a internet, revalidar e confirmar o ingresso.

## iPhone Safari

Registrar modelo, iOS, versao Safari/iOS, resultado por item, bugs e evidencias. Executar os mesmos cenarios do Android, com atencao adicional a permissao da camera, camera traseira, retorno apos trocar de app, retorno apos bloquear/desbloquear, cleanup/reabertura, dez leituras, QR em tela e impresso e transicao offline/online.

## Criterio de aprovacao fisica

Staging somente e aprovado quando Android Chrome e iPhone Safari comprovarem: abertura sob gesto, camera traseira utilizavel, QR em tela e impresso, confirmacao humana obrigatoria, check-in confirmado, duplicidade `ALREADY_USED`, bloqueio de cancelado/reembolsado/outro evento, offline sem sucesso falso e dez leituras sequenciais sem falha critica. Qualquer falha deve ser registrada, corrigida na causa e retestada no navegador afetado.

## Mercado Pago e SMTP

- Usar exclusivamente credenciais Mercado Pago de teste/sandbox no staging. `APP_URL` define back URLs e `notification_url`; registrar no provedor o webhook HTTPS do staging.
- Nunca misturar token de producao com banco de staging. Nao executar pagamento real durante esta preparacao.
- Usar SMTP e destinatario controlados. Validar o e-mail de ingresso, o link de `/meus-ingressos` e a origem `APP_URL`; nunca usar CPF, comprador ou mailing reais.
