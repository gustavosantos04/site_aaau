import type { EventPartnerCode } from "@prisma/client";

import {
  InvalidPartnerCodeError,
  PartnerCodeExpiredError,
  PartnerCodeLimitReachedError,
  ReservationInconsistencyError,
} from "@/lib/events/errors";
import { decimal, minMoney, toMoney } from "@/lib/events/money";
import type { EventTx } from "@/lib/events/types";

export function normalizePartnerCode(value: string) {
  return value.trim().toUpperCase();
}

export function validatePartnerCode(code: EventPartnerCode, eventId: string, now = new Date()) {
  if (code.eventId !== eventId || !code.active) {
    throw new InvalidPartnerCodeError();
  }

  if (code.startsAt && code.startsAt > now) {
    throw new InvalidPartnerCodeError();
  }

  if (code.expiresAt && code.expiresAt <= now) {
    throw new PartnerCodeExpiredError();
  }

  if (code.discountValue.lessThan(0)) {
    throw new InvalidPartnerCodeError();
  }

  if (code.discountType === "PERCENTAGE" && code.discountValue.greaterThan(100)) {
    throw new InvalidPartnerCodeError();
  }

  if (code.maxUses !== null && code.reservedUses + code.confirmedUses >= code.maxUses) {
    throw new PartnerCodeLimitReachedError();
  }

  return code;
}

export function calculatePartnerDiscount(code: EventPartnerCode | null, subtotalInput: Parameters<typeof decimal>[0]) {
  const subtotal = toMoney(subtotalInput);

  if (!code) {
    return toMoney(0);
  }

  const rawDiscount =
    code.discountType === "PERCENTAGE"
      ? subtotal.mul(code.discountValue).div(100)
      : decimal(code.discountValue);

  return minMoney(toMoney(rawDiscount), subtotal);
}

export async function reservePartnerCodeUse(tx: EventTx, partnerCodeId: string) {
  const changed = await tx.$executeRaw`
    UPDATE "EventPartnerCode"
    SET "reservedUses" = "reservedUses" + 1
    WHERE "id" = ${partnerCodeId}
      AND (
        "maxUses" IS NULL
        OR "reservedUses" + "confirmedUses" < "maxUses"
      )
  `;

  if (changed !== 1) {
    throw new PartnerCodeLimitReachedError();
  }
}

export async function confirmPartnerCodeUse(tx: EventTx, partnerCodeId: string) {
  const changed = await tx.$executeRaw`
    UPDATE "EventPartnerCode"
    SET
      "reservedUses" = "reservedUses" - 1,
      "confirmedUses" = "confirmedUses" + 1
    WHERE "id" = ${partnerCodeId}
      AND "reservedUses" >= 1
  `;

  if (changed !== 1) {
    throw new ReservationInconsistencyError();
  }
}

export async function releasePartnerCodeUse(tx: EventTx, partnerCodeId: string) {
  const changed = await tx.$executeRaw`
    UPDATE "EventPartnerCode"
    SET "reservedUses" = "reservedUses" - 1
    WHERE "id" = ${partnerCodeId}
      AND "reservedUses" >= 1
  `;

  if (changed !== 1) {
    throw new ReservationInconsistencyError();
  }
}
