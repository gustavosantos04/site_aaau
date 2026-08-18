import type { EventDomainError } from "@/lib/events/errors";

type CheckoutValidationIssue = {
  path: PropertyKey[];
  code?: string;
};

export type CheckoutErrorBody = {
  code: string;
  message: string;
  field?: string;
  participantIndex?: number;
  retryable?: boolean;
};

export type CheckoutErrorResponse = {
  status: number;
  body: CheckoutErrorBody;
};

const participantFieldLabels: Record<string, string> = {
  name: "nome",
  cpf: "CPF",
  email: "e-mail",
  phone: "telefone",
  birthDate: "data de nascimento",
  institution: "instituição",
  course: "curso",
  campus: "campus",
};

const buyerMessages: Record<string, string> = {
  name: "Informe o nome completo do comprador.",
  cpf: "O CPF do comprador é inválido.",
  email: "O e-mail do comprador é inválido.",
  phone: "O WhatsApp do comprador é inválido.",
};

function participantSchemaMessage(participantIndex: number, field: string) {
  const participant = `Participante ${participantIndex + 1}`;
  if (field === "email") return `O e-mail do ${participant} é inválido.`;
  if (field === "cpf") return `O CPF do ${participant} é inválido.`;
  if (field === "phone") return `O telefone do ${participant} é inválido.`;
  if (field === "birthDate") {
    return `Informe uma data de nascimento válida para o ${participant}.`;
  }
  return `Revise ${participantFieldLabels[field] ?? "este campo"} do ${participant}.`;
}

export function checkoutSchemaValidationResponse(issues: CheckoutValidationIssue[]): CheckoutErrorResponse {
  const issue = issues[0];
  const [scope, indexOrField, participantField] = issue?.path ?? [];

  if (scope === "participants" && typeof indexOrField === "number" && typeof participantField === "string") {
    return {
      status: 400,
      body: {
        code: "INVALID_PARTICIPANT_DATA",
        message: participantSchemaMessage(indexOrField, participantField),
        field: `participants.${indexOrField}.${participantField}`,
        participantIndex: indexOrField,
      },
    };
  }

  if (scope === "buyer" && typeof indexOrField === "string") {
    return {
      status: 400,
      body: {
        code: "INVALID_BUYER_DATA",
        message: buyerMessages[indexOrField] ?? "Revise os dados do comprador.",
        field: `buyer.${indexOrField}`,
      },
    };
  }

  if (scope === "participants" || scope === "commercialUnitQuantity") {
    return {
      status: 400,
      body: {
        code: "INVALID_TICKET_QUANTITY",
        message: "Revise a quantidade e os participantes deste pedido.",
      },
    };
  }

  return {
    status: 400,
    body: {
      code: "INVALID_CHECKOUT_DATA",
      message: "Revise os dados obrigatórios do checkout.",
    },
  };
}

function quantityMessage(error: EventDomainError) {
  const reason = error.details?.reason;
  const maxUnits = error.details?.maxUnitsPerOrder;
  const expectedParticipants = error.details?.expectedParticipantsCount;
  const ticketsPerUnit = error.details?.ticketsPerUnit;

  if (reason === "MAX_UNITS_PER_ORDER_EXCEEDED" && typeof maxUnits === "number") {
    return `É possível comprar no máximo ${maxUnits} ${ticketsPerUnit === 1 ? "ingresso(s)" : "pacote(s)"} deste lote por pedido.`;
  }
  if (reason === "PARTICIPANT_COUNT_MISMATCH" && typeof expectedParticipants === "number") {
    return `Este pedido exige dados de ${expectedParticipants} participante(s).`;
  }
  return "Revise a quantidade de ingressos deste pedido.";
}

function participantResponse(error: EventDomainError): CheckoutErrorResponse {
  const participantIndex = error.details?.participantIndex;
  const field = error.details?.field;
  if (typeof participantIndex !== "number" || typeof field !== "string") {
    return { status: 400, body: { code: error.code, message: "Revise os dados dos participantes." } };
  }
  return {
    status: 400,
    body: {
      code: error.code,
      message: error.message,
      field: `participants.${participantIndex}.${field}`,
      participantIndex,
    },
  };
}

function buyerResponse(error: EventDomainError): CheckoutErrorResponse {
  const field = error.details?.field;
  return {
    status: 400,
    body: {
      code: error.code,
      message: error.message,
      ...(typeof field === "string" ? { field: `buyer.${field}` } : {}),
    },
  };
}

export function checkoutDomainErrorResponse(error: EventDomainError): CheckoutErrorResponse {
  if (error.code === "INVALID_PARTICIPANT_DATA") return participantResponse(error);
  if (error.code === "INVALID_BUYER_DATA") return buyerResponse(error);

  switch (error.code) {
    case "EVENT_NOT_FOUND":
    case "EVENT_NOT_PUBLISHED":
      return { status: 404, body: { code: error.code, message: "Este evento não está disponível para compra." } };
    case "EVENT_SALES_NOT_STARTED":
      return { status: 409, body: { code: error.code, message: "As vendas deste evento ainda não começaram." } };
    case "EVENT_SALES_ENDED":
      return { status: 410, body: { code: error.code, message: "As vendas deste evento já foram encerradas." } };
    case "NO_ACTIVE_TICKET_LOT":
      return { status: 409, body: { code: error.code, message: "Não há um lote disponível para compra agora." } };
    case "INCONSISTENT_TICKET_COUNTERS":
      return { status: 500, body: { code: "CHECKOUT_INTERNAL_ERROR", message: "Não foi possível validar o estoque agora. Tente novamente em alguns instantes." } };
    case "INSUFFICIENT_TICKET_AVAILABILITY":
      return { status: 409, body: { code: error.code, message: "Este lote acabou de esgotar ou não possui a quantidade solicitada." } };
    case "INVALID_TICKET_QUANTITY":
      return { status: 400, body: { code: error.code, message: quantityMessage(error) } };
    case "EVENT_CHECKOUT_STALE":
      return { status: 409, body: { code: error.code, message: "O lote foi atualizado enquanto você preenchia seus dados. Revise as informações e tente novamente." } };
    case "INVALID_PARTNER_CODE":
      return { status: 400, body: { code: error.code, message: "Este código não é válido para o evento ou lote selecionado." } };
    case "PARTNER_CODE_EXPIRED":
      return { status: 410, body: { code: error.code, message: "Este código já expirou." } };
    case "PARTNER_CODE_LIMIT_REACHED":
      return { status: 409, body: { code: error.code, message: "Este código atingiu o limite de utilizações." } };
    case "EVENT_ORDER_NOT_FOUND":
      return { status: 404, body: { code: error.code, message: "Não foi possível localizar este pedido." } };
    case "EVENT_ORDER_EXPIRED":
      return { status: 410, body: { code: error.code, message: "A reserva deste pedido expirou. Inicie uma nova compra." } };
    case "EVENT_ORDER_INVALID_STATUS":
      return { status: 409, body: { code: error.code, message: "Este pedido não pode mais iniciar um pagamento." } };
    case "IDEMPOTENCY_CONFLICT":
      return { status: 409, body: { code: error.code, message: "Os dados da compra mudaram. Revise o pedido e tente novamente." } };
    case "FREE_EVENT_ORDER_UNSUPPORTED":
      return { status: 422, body: { code: error.code, message: "Este pedido não pode ser processado pelo checkout atual." } };
    case "EVENT_PAYMENT_PREFERENCE_ERROR":
      return { status: 502, body: { code: error.code, message: "Não foi possível iniciar o pagamento agora. Tente novamente em alguns instantes.", retryable: true } };
    case "EVENT_PAYMENT_PREFERENCE_CREATING":
      return { status: 202, body: { code: error.code, message: "Estamos preparando seu pagamento. Aguarde um instante.", retryable: true } };
    case "EVENT_PAYMENT_PREFERENCE_AMBIGUOUS":
      return { status: 409, body: { code: error.code, message: "O pagamento está sendo reconciliado. Aguarde antes de tentar novamente." } };
    case "RESERVATION_INCONSISTENCY":
      return { status: 409, body: { code: error.code, message: "A reserva mudou durante o processamento. Inicie uma nova tentativa." } };
    case "PAYMENT_AMOUNT_MISMATCH":
    case "PAYMENT_ID_CONFLICT":
      return { status: 409, body: { code: error.code, message: "O pagamento não corresponde a este pedido." } };
    case "LATE_APPROVED_PAYMENT":
      return { status: 410, body: { code: error.code, message: "O pagamento foi identificado após o fim da reserva e precisa de atendimento." } };
    default:
      return { status: 400, body: { code: error.code, message: "Não foi possível continuar com este pedido." } };
  }
}

export function checkoutFieldErrorKey(field: string) {
  const participant = /^participants\.(\d+)\.(\w+)$/.exec(field);
  if (participant) return `participant-${participant[1]}-${participant[2]}`;
  const buyer = /^buyer\.(\w+)$/.exec(field);
  if (!buyer) return null;
  return `buyer${buyer[1][0]?.toUpperCase() ?? ""}${buyer[1].slice(1)}`;
}
