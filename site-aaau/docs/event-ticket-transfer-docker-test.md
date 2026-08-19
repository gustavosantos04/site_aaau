# Ambiente Docker local — transferência direta

Este ambiente é exclusivo da branch de teste e usa somente PostgreSQL e Mailpit locais. Os secrets são valores públicos de fixture e não podem ser reutilizados fora deste Compose.

## Subir

```powershell
docker compose -f docker-compose.transfer-test.yml up -d --build
docker compose -f docker-compose.transfer-test.yml ps
```

URLs:

- aplicação: `http://localhost:3000`
- Mailpit: `http://localhost:8026`
- magic link de Ana: `http://localhost:3000/meus-ingressos/acesso/local-e2e-ana-magic-link-2026-000000000000000001`

## Logs e fixture

```powershell
docker compose -f docker-compose.transfer-test.yml logs -f app
docker compose -f docker-compose.transfer-test.yml exec app npx tsx scripts/transfer-test-fixture.ts show
```

Reiniciar os containers preserva o estado do teste. Para restaurar a fixture inicial, remova o volume e suba novamente:

```powershell
docker compose -f docker-compose.transfer-test.yml down -v
docker compose -f docker-compose.transfer-test.yml up -d --build
```

## Encerrar

```powershell
docker compose -f docker-compose.transfer-test.yml down
```

O `.dockerignore` exclui todos os arquivos `.env*`, `.next`, `.vercel` e `node_modules`. O Compose define explicitamente banco, SMTP e secrets locais, além de neutralizar Resend, Mercado Pago, variáveis Vercel e a telemetria do Next.js.
