export type EventDomainErrorCode =
  | "EVENT_NOT_FOUND"
  | "EVENT_NOT_PUBLISHED"
  | "EVENT_SALES_NOT_STARTED"
  | "EVENT_SALES_ENDED"
  | "NO_ACTIVE_TICKET_LOT"
  | "INCONSISTENT_TICKET_COUNTERS"
  | "INSUFFICIENT_TICKET_AVAILABILITY"
  | "INVALID_TICKET_QUANTITY"
  | "INVALID_PARTNER_CODE"
  | "PARTNER_CODE_EXPIRED"
  | "PARTNER_CODE_LIMIT_REACHED"
  | "EVENT_ORDER_NOT_FOUND"
  | "EVENT_ORDER_EXPIRED"
  | "EVENT_ORDER_INVALID_STATUS"
  | "IDEMPOTENCY_CONFLICT"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_ID_CONFLICT"
  | "LATE_APPROVED_PAYMENT"
  | "FREE_EVENT_ORDER_UNSUPPORTED"
  | "EVENT_PAYMENT_PREFERENCE_ERROR"
  | "EVENT_PAYMENT_PREFERENCE_CREATING"
  | "EVENT_PAYMENT_PREFERENCE_AMBIGUOUS"
  | "RESERVATION_INCONSISTENCY"
  | "TICKET_ALREADY_ISSUED"
  | "TICKET_NOT_FOUND"
  | "TICKET_INVALID"
  | "TICKET_ALREADY_USED"
  | "UNAUTHORIZED_CHECK_IN";

export class EventDomainError extends Error {
  constructor(
    public readonly code: EventDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EventDomainError";
  }
}

export class EventNotFoundError extends EventDomainError {
  constructor() {
    super("EVENT_NOT_FOUND", "Evento nao encontrado.");
  }
}

export class EventNotPublishedError extends EventDomainError {
  constructor() {
    super("EVENT_NOT_PUBLISHED", "Evento nao publicado.");
  }
}

export class EventSalesNotStartedError extends EventDomainError {
  constructor() {
    super("EVENT_SALES_NOT_STARTED", "Vendas ainda nao iniciadas.");
  }
}

export class EventSalesEndedError extends EventDomainError {
  constructor() {
    super("EVENT_SALES_ENDED", "Vendas encerradas.");
  }
}

export class NoActiveTicketLotError extends EventDomainError {
  constructor() {
    super("NO_ACTIVE_TICKET_LOT", "Nenhum lote disponivel para venda.");
  }
}

export class InconsistentTicketCountersError extends EventDomainError {
  constructor() {
    super("INCONSISTENT_TICKET_COUNTERS", "Contadores de ingresso inconsistentes.");
  }
}

export class InsufficientTicketAvailabilityError extends EventDomainError {
  constructor() {
    super("INSUFFICIENT_TICKET_AVAILABILITY", "Ingressos insuficientes.");
  }
}

export class InvalidTicketQuantityError extends EventDomainError {
  constructor() {
    super("INVALID_TICKET_QUANTITY", "Quantidade de ingressos invalida.");
  }
}

export class InvalidPartnerCodeError extends EventDomainError {
  constructor() {
    super("INVALID_PARTNER_CODE", "Codigo de parceiro invalido.");
  }
}

export class PartnerCodeExpiredError extends EventDomainError {
  constructor() {
    super("PARTNER_CODE_EXPIRED", "Codigo de parceiro expirado.");
  }
}

export class PartnerCodeLimitReachedError extends EventDomainError {
  constructor() {
    super("PARTNER_CODE_LIMIT_REACHED", "Limite de uso do codigo atingido.");
  }
}

export class EventOrderNotFoundError extends EventDomainError {
  constructor() {
    super("EVENT_ORDER_NOT_FOUND", "Pedido de evento nao encontrado.");
  }
}

export class EventOrderExpiredError extends EventDomainError {
  constructor() {
    super("EVENT_ORDER_EXPIRED", "Reserva do pedido expirada.");
  }
}

export class EventOrderInvalidStatusError extends EventDomainError {
  constructor() {
    super("EVENT_ORDER_INVALID_STATUS", "Status do pedido invalido para a operacao.");
  }
}

export class IdempotencyConflictError extends EventDomainError {
  constructor() {
    super("IDEMPOTENCY_CONFLICT", "Chave de idempotencia reutilizada com payload diferente.");
  }
}

export class PaymentAmountMismatchError extends EventDomainError {
  constructor() {
    super("PAYMENT_AMOUNT_MISMATCH", "Valor pago diverge do total do pedido.");
  }
}

export class PaymentIdConflictError extends EventDomainError {
  constructor() {
    super("PAYMENT_ID_CONFLICT", "Pagamento ja vinculado a outro pedido.");
  }
}

export class LateApprovedPaymentError extends EventDomainError {
  constructor() {
    super("LATE_APPROVED_PAYMENT", "Pagamento aprovado apos expiracao da reserva.");
  }
}

export class FreeEventOrderUnsupportedError extends EventDomainError {
  constructor() {
    super("FREE_EVENT_ORDER_UNSUPPORTED", "Pedidos gratuitos de evento ainda nao sao suportados.");
  }
}

export class EventPaymentPreferenceError extends EventDomainError {
  constructor(message = "Nao foi possivel criar a preferencia de pagamento do evento.") {
    super("EVENT_PAYMENT_PREFERENCE_ERROR", message);
  }
}

export class EventPaymentPreferenceCreatingError extends EventDomainError {
  constructor() {
    super("EVENT_PAYMENT_PREFERENCE_CREATING", "Preferencia de pagamento em criacao.");
  }
}

export class EventPaymentPreferenceAmbiguousError extends EventDomainError {
  constructor() {
    super("EVENT_PAYMENT_PREFERENCE_AMBIGUOUS", "Preferencia de pagamento exige reconciliacao manual.");
  }
}

export class ReservationInconsistencyError extends EventDomainError {
  constructor() {
    super("RESERVATION_INCONSISTENCY", "Reserva inconsistente para a transicao solicitada.");
  }
}

export class TicketAlreadyIssuedError extends EventDomainError {
  constructor() {
    super("TICKET_ALREADY_ISSUED", "Ingresso ja emitido para participante.");
  }
}

export class TicketNotFoundError extends EventDomainError {
  constructor() {
    super("TICKET_NOT_FOUND", "Ingresso nao encontrado.");
  }
}

export class TicketInvalidError extends EventDomainError {
  constructor() {
    super("TICKET_INVALID", "Ingresso invalido.");
  }
}

export class TicketAlreadyUsedError extends EventDomainError {
  constructor() {
    super("TICKET_ALREADY_USED", "Ingresso ja utilizado.");
  }
}

export class UnauthorizedCheckInError extends EventDomainError {
  constructor() {
    super("UNAUTHORIZED_CHECK_IN", "Usuario sem permissao para check-in.");
  }
}
