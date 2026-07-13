# Classificacao do npm audit para staging

Auditoria executada em 11/07/2026. Resultado apos atualizar Next.js de 15.5.14 para 15.5.18 e PostCSS direto para 8.5.10: 16 grupos, sendo 8 high, 7 moderate, 1 low e 0 critical.

| Pacote | Relacao e caminho | Severity | Alcance no projeto | Correcao / risco | Recomendacao |
| --- | --- | --- | --- | --- | --- |
| `@prisma/config` | Transitiva: `prisma -> @prisma/config -> effect` | High | CLI/config de Prisma; nao faz parte do runtime de `@prisma/client` | Audit aponta upgrade de Prisma, potencialmente major | Nao bloqueia staging; planejar upgrade Prisma isolado |
| `@vercel/analytics` | Direta; herda o advisory de `next -> postcss` | Moderate | Componente de analytics no browser, mas a falha reportada esta no processamento CSS de build | Audit sugere downgrade para 1.1.4, inadequado | Manter e reavaliar quando Next atualizar PostCSS interno |
| `@vercel/speed-insights` | Direta; herda o advisory de `next -> postcss` | Moderate | Componente de metricas; mesma propagacao de build | Audit sugere downgrade, com risco de regressao | Manter e monitorar |
| `ajv` | Transitiva: `eslint -> @eslint/eslintrc -> ajv` | Moderate | Dev-only; schemas internos do lint, sem `$data` controlado por usuario | Fix transitivo disponivel | Atualizar toolchain de lint em manutencao dedicada |
| `brace-expansion` | Transitiva: ESLint/TypeScript ESLint | Moderate | Dev-only; glob de arquivos locais | Fix transitivo disponivel | Atualizar lint; nao bloqueia staging |
| `defu` | Transitiva: `prisma -> @prisma/config -> c12 -> defu` | High | Configuracao CLI Prisma; defaults nao recebem JSON remoto da aplicacao | Upgrade Prisma/config | Planejar junto do Prisma; nao e runtime web alcançavel |
| `effect` | Transitiva: `prisma -> @prisma/config -> effect` | High | CLI/config Prisma; app nao usa Effect RPC/fibers | Upgrade Prisma pode exigir major | Nao bloqueia staging; testar migrations antes do upgrade |
| `esbuild` | Transitiva: `tsx -> esbuild` | Low | Dev/test only; advisory depende do dev server do esbuild no Windows, que nao e exposto | Atualizacao do `tsx`/esbuild | Atualizar em manutencao sem urgencia de runtime |
| `flatted` | Transitiva: `eslint -> file-entry-cache -> flat-cache -> flatted` | High | Dev-only; cache local do ESLint, sem payload remoto | Fix transitivo disponivel | Atualizar ESLint/cache; nao bloqueia staging |
| `js-yaml` | Transitiva da toolchain ESLint/config | Moderate | Dev-only; arquivos de configuracao locais | Fix transitivo disponivel | Atualizar toolchain |
| `minimatch` | Transitiva da toolchain ESLint | High | Dev-only; patterns locais, sem glob fornecido por request | Fix transitivo disponivel | Atualizar ESLint/plugins |
| `next` | Direta: `next -> postcss@8.4.31` | Moderate | Next e runtime, mas o advisory remanescente e do stringify CSS no build; projeto nao aceita CSS nao confiavel | Audit sugere downgrade incorreto; highs de 15.5.14 foram corrigidos em 15.5.18 | Manter 15.5.18 e atualizar para patch oficial que eleve PostCSS interno |
| `nodemailer` | Direta, server-side | High | Runtime SMTP; advisory exige uso de `sendMail({ raw: ... })`. O projeto envia apenas campos estruturados e nao aceita `raw` do usuario | Corrigido em 9.0.3, major sobre a faixa atual | Nao bloqueia staging controlado; fazer upgrade 9.x com testes SMTP antes de producao |
| `picomatch` | Transitiva: Tailwind/Chokidar/ESLint | High | Build/dev-only; patterns nao sao controlados por requests | Fix transitivo disponivel | Atualizar Tailwind/toolchain em tarefa isolada |
| `postcss` | Transitiva interna de `next` | Moderate | Processamento CSS de build; nenhum CSS de usuario entra no pipeline | Depende de patch do Next; override manual e arriscado | Monitorar patch do Next; nao usar override cego |
| `prisma` | Direta, devDependency: `prisma -> @prisma/config` | High | CLI de generate/migrate; runtime usa `@prisma/client`, que nao aparece vulneravel no audit | Upgrade disponivel com risco de mudanca de CLI/config | Planejar upgrade e validar migrations em branch Neon descartavel |

## Prioridades

- Bloqueadores de staging atuais: nenhum, considerando que Next foi atualizado para 15.5.18 e o staging nao recebe CSS/config/SMTP `raw` nao confiavel.
- Antes de producao: testar upgrade Nodemailer 9.0.3 e acompanhar patch Next que atualize o PostCSS interno.
- Prisma: upgrade separado, com `migrate status`, `migrate deploy`, generate, integracao PostgreSQL e build completos.
- Scanner `@zxing/browser` e gerador `qrcode`: sem advisory no resultado atual.
- Nao executar `npm audit fix --force`; as sugestoes incluem downgrades e majors sem contexto.
