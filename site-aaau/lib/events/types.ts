import type { Prisma } from "@prisma/client";

export type EventTx = Prisma.TransactionClient;

export type EventBuyerInput = {
  name: string;
  cpf?: string;
  email: string;
  phone: string;
};

export type EventParticipantInput = {
  name: string;
  cpf: string;
  email?: string;
  phone?: string;
  birthDate?: Date | string | null;
  institution?: string;
  course?: string;
  campus?: string;
};

export type CreateEventOrderReservationInput = {
  eventId?: string;
  slug?: string;
  buyer: EventBuyerInput;
  participants: EventParticipantInput[];
  partnerCode?: string | null;
  idempotencyKey?: string | null;
  now?: Date;
};

export type CreateEventOrderReservationResult = {
  orderId: string;
  externalReference: string;
  accessToken: string;
  expiresAt: Date;
  total: Prisma.Decimal;
  alreadyCreated: boolean;
};

export type ConfirmEventOrderPaymentInput = {
  eventOrderId: string;
  paymentId: string;
  paidAmount: Prisma.Decimal | string | number;
  paidAt?: Date;
  now?: Date;
};

export type ConfirmEventOrderPaymentResult = {
  alreadyProcessed: boolean;
  newlyPaid: boolean;
  ticketsIssued: number;
};

export type CheckInSource = "QR" | "MANUAL";

export type CheckInValidationStatus =
  | "VALID"
  | "ALREADY_USED"
  | "CANCELED"
  | "REFUNDED"
  | "INVALID"
  | "WRONG_EVENT";
