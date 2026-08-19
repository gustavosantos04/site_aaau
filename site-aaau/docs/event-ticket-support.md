# Guia de suporte — Meus ingressos e transferências

## Orientação ao participante

Se a pessoa perdeu o e-mail, oriente-a a abrir **Meus ingressos**, informar o mesmo e-mail usado na compra ou recebido na transferência e verificar caixa de entrada, spam e abas de promoções. A tela sempre mostra uma resposta neutra; o suporte não deve confirmar publicamente se um endereço possui ingresso.

O magic link é pessoal, expira e só pode ser usado uma vez. Depois da abertura, o painel funciona por uma sessão temporária. Para encerrar, use **Sair**.

## Como explicar a transferência

- A AAAU transfere apenas a titularidade do ingresso.
- O site não recebe pagamentos entre pessoas e não garante negociações externas.
- O titular atual informa os dados completos, revisa e confirma no painel.
- A confirmação conclui a transferência imediatamente; o destinatário não precisa aceitar.
- No mesmo commit, QR e código manual antigos são invalidados e o novo titular recebe credenciais novas.
- Cada ingresso pode ser transferido uma única vez; o destinatário se torna o titular definitivo e vê essa informação no painel.
- Ingresso utilizado não pode ser transferido.
- Links antigos de confirmação ou aceite não alteram titularidade e orientam o usuário a acessar **Meus ingressos**.

## Quando o e-mail não chega

1. Confirmar apenas que a pessoa digitou o endereço pretendido, sem pedir senha ou token.
2. Pedir que aguarde alguns minutos e confira spam/promoções.
3. Se persistir, a equipe técnica deve verificar somente contadores/status da outbox e `EmailDelivery`, sem copiar payload ou link.
4. Item `FAILED` abaixo de oito tentativas será retomado pelo cron. Item com oito tentativas exige investigação técnica do provedor/configuração. A falha de e-mail não desfaz a transferência.

## Dados que o suporte nunca deve solicitar

- QR Code ou captura integral do ingresso;
- código manual;
- magic link, token de grant ou cookie;
- senha de e-mail;
- CPF completo por canal aberto;
- secrets, ciphertext ou URL completa de confirmação/aceite.

Para localizar um caso, prefira ID interno do pedido/transferência obtido por equipe autorizada e últimos quatro dígitos já mascarados quando estritamente necessário.

## Escalonamento técnico

Escalar quando houver:

- outbox esgotada;
- crescimento contínuo de pendências;
- ausência do ciclo diário de recuperação por mais de 26 horas;
- QR antigo aceito após transferência concluída;
- irmãos alterados em pedido múltiplo;
- divergência de ownership/QR version;
- suspeita de vazamento ou comprometimento de secret;
- Mercado Pago aprovado sem emissão normal do pedido.

No escalonamento, registrar horário, ambiente, ID interno e operação tentada. Não anexar tokens, QR, CPF completo ou conteúdo cifrado.
