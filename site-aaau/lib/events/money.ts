import { Prisma } from "@prisma/client";

export function decimal(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value);
}

export function toMoney(value: Prisma.Decimal | string | number) {
  return decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function multiplyMoney(value: Prisma.Decimal | string | number, quantity: number) {
  return toMoney(decimal(value).mul(quantity));
}

export function minMoney(left: Prisma.Decimal, right: Prisma.Decimal) {
  return left.lessThan(right) ? left : right;
}

export function assertSameMoney(left: Prisma.Decimal | string | number, right: Prisma.Decimal | string | number) {
  return toMoney(left).equals(toMoney(right));
}
