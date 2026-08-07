import { EmailDeliveryKind } from "@prisma/client";

import { buildAaauTransactionalEmailHtml } from "@/lib/email/aaau-transactional-template";
import { buildAbsoluteUrl } from "@/lib/site-url";
import type { EventTx } from "@/lib/events/types";
import { queueTransferEmail } from "@/lib/events/transfer-outbox";

export function maskEmail(value: string) {
  const [local, domain = ""] = value.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(value);
}

function message(title: string, paragraphs: string[], action?: { label: string; url: string }) {
  const text = [title, ...paragraphs, action ? `${action.label}: ${action.url}` : null]
    .filter(Boolean).join("\n\n");
  const html = buildAaauTransactionalEmailHtml({
    title,
    eyebrow: "Ingressos AAAU",
    headerLabel: "Transferência de ingresso",
    paragraphs,
    action,
    footerNote: action
      ? "Este link é pessoal. Não encaminhe este e-mail nem compartilhe o endereço de acesso."
      : "Esta mensagem registra uma atualização no fluxo de transferência do seu ingresso.",
  });
  return { subject: title, text, html };
}

type Common = {
  transferId: string;
  eventName: string;
  ticketLabel: string;
  expiresAt: Date;
  now?: Date;
};

export function queueHolderConfirmationEmail(tx: EventTx, input: Common & {
  holderEmail: string;
  recipientEmail: string;
  rawToken: string;
  deliveryAttempt?: string;
}) {
  const payload = message("Confirme a transferência do ingresso", [
    `Evento: ${input.eventName}.`,
    `Ingresso: ${input.ticketLabel}.`,
    `Destinatário: ${maskEmail(input.recipientEmail)}.`,
    `Confirme até ${formatDate(input.expiresAt)}. O ingresso atual continua válido até o destinatário aceitar.`,
  ], { label: "Confirmar transferência", url: buildAbsoluteUrl(`/transferencia-ingresso/confirmar/${input.rawToken}`) });
  return queueTransferEmail(tx, {
    transferId: input.transferId,
    kind: EmailDeliveryKind.EVENT_TICKET_TRANSFER_HOLDER_CONFIRMATION,
    idempotencyKey: `event-ticket-transfer:${input.transferId}:holder-confirmation${input.deliveryAttempt ? `:${input.deliveryAttempt}` : ""}`,
    recipient: input.holderEmail,
    payload,
    now: input.now,
  });
}

export function queueRecipientInvitationEmail(tx: EventTx, input: Common & {
  recipientEmail: string;
  rawToken: string;
  deliveryAttempt?: string;
}) {
  const payload = message("Você recebeu um convite de ingresso", [
    `Evento: ${input.eventName}.`,
    `Aceite até ${formatDate(input.expiresAt)}. O ingresso ainda não é seu até concluir o aceite.`,
    "Nenhum pagamento é processado pela plataforma nesta etapa.",
  ], { label: "Aceitar ingresso", url: buildAbsoluteUrl(`/transferencia-ingresso/aceitar/${input.rawToken}`) });
  return queueTransferEmail(tx, {
    transferId: input.transferId,
    kind: EmailDeliveryKind.EVENT_TICKET_TRANSFER_RECIPIENT_INVITATION,
    idempotencyKey: `event-ticket-transfer:${input.transferId}:recipient-invitation${input.deliveryAttempt ? `:${input.deliveryAttempt}` : ""}`,
    recipient: input.recipientEmail,
    payload,
    now: input.now,
  });
}

export function queueTransferCompletionEmails(tx: EventTx, input: {
  transferId: string;
  eventName: string;
  newHolderEmail: string;
  previousHolderEmail: string | null;
  rawGrantToken: string;
  completedAt: Date;
}) {
  const accessUrl = buildAbsoluteUrl(`/meus-ingressos/${input.rawGrantToken}`);
  const recipient = queueTransferEmail(tx, {
    transferId: input.transferId,
    kind: EmailDeliveryKind.EVENT_TICKET_TRANSFER_RECIPIENT_COMPLETED,
    idempotencyKey: `event-ticket-transfer:${input.transferId}:recipient-completed`,
    recipient: input.newHolderEmail,
    payload: message("Ingresso transferido para você", [
      `A transferência para o evento ${input.eventName} foi concluída.`,
      "Use o acesso individual abaixo. Não compartilhe este link.",
    ], { label: "Acessar ingresso", url: accessUrl }),
    now: input.completedAt,
  });
  const previous = input.previousHolderEmail ? queueTransferEmail(tx, {
    transferId: input.transferId,
    kind: EmailDeliveryKind.EVENT_TICKET_TRANSFER_PREVIOUS_HOLDER_COMPLETED,
    idempotencyKey: `event-ticket-transfer:${input.transferId}:previous-holder-completed`,
    recipient: input.previousHolderEmail,
    payload: message("Transferência de ingresso concluída", [
      `A transferência do ingresso para ${input.eventName} foi concluída em ${formatDate(input.completedAt)}.`,
      "O QR Code e o código anteriores não funcionam mais, e os dados atuais do ingresso não serão exibidos no acesso original.",
    ]),
    now: input.completedAt,
  }) : Promise.resolve(null);
  return Promise.all([recipient, previous]);
}

export function queueTransferStatusEmail(tx: EventTx, input: {
  transferId: string;
  kind: "CANCELED" | "REJECTED";
  recipient: string;
  eventName: string;
  now: Date;
}) {
  const rejected = input.kind === "REJECTED";
  return queueTransferEmail(tx, {
    transferId: input.transferId,
    kind: rejected ? EmailDeliveryKind.EVENT_TICKET_TRANSFER_REJECTED : EmailDeliveryKind.EVENT_TICKET_TRANSFER_CANCELED,
    idempotencyKey: `event-ticket-transfer:${input.transferId}:${rejected ? "rejected" : "canceled"}`,
    recipient: input.recipient,
    payload: message(rejected ? "Convite de ingresso recusado" : "Transferência de ingresso cancelada", [
      `Evento: ${input.eventName}.`,
      "O ingresso, o QR Code e o titular não foram alterados.",
    ]),
    now: input.now,
  });
}
