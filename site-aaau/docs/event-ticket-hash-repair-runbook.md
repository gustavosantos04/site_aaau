# Reparo operacional dos hashes legacy de ingressos

Este procedimento repara exclusivamente `EventTicketQrVersion.qrTokenHash` e
`EventTicketQrVersion.ticketCodeHash`. Ele não altera credenciais, ownership, status,
titular, check-in, transferências, grants, pedidos, preços ou estoque.

## Garantias do comando

- `verify` é somente leitura e informa totais, versões ativas, hashes válidos e
  divergentes, inconsistências estruturais, transferidos, elegíveis e revisão manual.
- `repair` é dry-run por padrão. A escrita exige também `--write`.
- Produção exige `NODE_ENV=production`, alvo `production`, confirmação
  `REPAIR-PRODUCTION`, banco não local e fingerprints idênticas entre o secret do
  runtime e o secret fornecido ao reparador.
- O reparo usa transações serializáveis pequenas (25 ingressos), compare-and-set e
  aborta diante de versão estrutural inconsistente ou alteração concorrente.
- Reexecuções são idempotentes: um ingresso já correto não recebe update.
- O JSON operacional não contém QR token, código manual, CPF, e-mail, nome ou secret.

## Elegibilidade automática

Todas as condições abaixo precisam ser verdadeiras:

```text
ownershipVersion = 1
qrVersion = 1
lastQrRotatedAt IS NULL
transferredAt IS NULL
originalOrderAccessRevokedAt IS NULL
status = VALID
checkedInAt IS NULL
exatamente uma versão ACTIVE
versão ACTIVE = EventTicket.qrVersion = 1
active.revokedAt IS NULL
active.transferId IS NULL
```

Qualquer divergência estrutural interrompe toda escrita. Hash divergente fora desses
critérios é apenas reportado para revisão manual.

## Preparação segura no PowerShell

Execute em um terminal novo, na raiz do projeto. Obtenha o secret atual de produção e
a URL direta do banco pelos canais operacionais autorizados. Não cole os valores no
histórico do shell, em arquivos `.env` ou no Git.

```powershell
function Set-ProcessSecret([string]$Name, [string]$Prompt) {
  $secureValue = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    [Environment]::SetEnvironmentVariable(
      $Name,
      [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer),
      'Process'
    )
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

Set-ProcessSecret 'EVENT_TICKET_TRANSFER_TOKEN_SECRET' 'Secret atual do runtime de produção'
Set-ProcessSecret 'EVENT_TICKET_TRANSFER_HASH_REPAIR_SECRET' 'Secret que será usado no reparo'
Set-ProcessSecret 'DATABASE_URL' 'URL direta de produção do Neon'
$env:NODE_ENV = 'production'
$env:EVENT_TICKET_TRANSFER_HASH_REPAIR_TARGET = 'production'
```

Ao terminar, feche o terminal ou remova as três variáveis do processo.

## Procedimento de produção

1. Compare as fingerprints sem acessar o banco:

   ```powershell
   npm run transfers:hashes:fingerprint
   ```

   Prossiga somente com `fingerprintsMatch: true`. Registre apenas as fingerprints.

2. Execute a verificação somente leitura:

   ```powershell
   npm run transfers:hashes:verify
   ```

   Salve o JSON em local operacional seguro. Para o cenário esperado, deve haver zero
   `inconsistentVersions` e zero `notAutomaticallyRepairable`. Confira se
   `legacyEligibleForRepair` corresponde à quantidade esperada antes de escrever.

3. Faça também o dry-run do reparador:

   ```powershell
   npm run transfers:hashes:repair
   ```

   `mode` deve ser `dry-run`, `repaired` deve ser `0` e `wouldRepair` deve coincidir
   com `legacyEligibleForRepair` do verify.

4. No Neon Console, selecione o projeto e a branch raiz de produção. Abra
   **Backup & Restore**, crie um snapshot manual chamado, por exemplo,
   `pre-ticket-hash-repair-YYYYMMDD-HHmm`, aguarde a operação terminar e registre o ID
   e o horário. Snapshots só podem ser criados a partir de uma branch raiz. Não inicie
   o reparo enquanto a operação estiver pendente.

5. Habilite a confirmação de escrita somente depois da revisão e do snapshot:

   ```powershell
   $env:EVENT_TICKET_TRANSFER_HASH_REPAIR_CONFIRM = 'REPAIR-PRODUCTION'
   npm run transfers:hashes:repair -- --write
   ```

   Confirme no JSON: `mode: "write"`, `repaired` igual à quantidade aprovada e, em
   `after.metrics`, zero `credentialHashMismatches`, zero `inconsistentVersions` e
   zero `legacyEligibleForRepair`.

6. Execute verify novamente:

   ```powershell
   npm run transfers:hashes:verify
   ```

   O resultado obrigatório é zero `credentialHashMismatches` e zero inconsistências.

7. Confirme idempotência repetindo a escrita:

   ```powershell
   npm run transfers:hashes:repair -- --write
   ```

   O resultado obrigatório é `repaired: 0` e `wouldRepair: 0`.

8. Remova a autorização de escrita antes de qualquer outra atividade:

   ```powershell
   Remove-Item Env:EVENT_TICKET_TRANSFER_HASH_REPAIR_CONFIRM -ErrorAction SilentlyContinue
   ```

9. Revise os commits locais, faça push e deploy pelo fluxo normal somente depois dos
   passos anteriores. Não execute migration: este reparo não cria nem altera schema.

10. Faça uma única transferência real A → B de um ingresso ainda não usado. Registre
    o `transferId`, mas não registre tokens ou credenciais. Confirme solicitação,
    confirmação, convite, aceite e conclusão.

11. Na portaria em modo de validação, sem confirmar check-in, valide que o QR e o
    código antigos retornam inválido e os novos retornam válido.

12. Confirme os dois portais e as entregas: B vê apenas o ingresso recebido com QR e
    código novos; A vê o item como transferido e mantém eventuais irmãos intactos; as
    mensagens de conclusão para A e B aparecem uma única vez nas outboxes/deliveries.

## Interrupção e rollback

Não prossiga se houver fingerprint diferente, inconsistência estrutural, item para
revisão manual, contagem inesperada ou erro concorrente. O reparador faz rollback do
lote corrente. Se uma restauração do snapshot for necessária, siga o fluxo de restore
do Neon, aguarde todas as operações terminarem e só então reconecte a aplicação. A
documentação oficial está em <https://neon.com/docs/ai/ai-database-versioning>.
