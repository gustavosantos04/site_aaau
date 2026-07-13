import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/checkout/mercado-pago";
import { selectActiveTicketLot } from "@/lib/events/availability";
import { calculatePartnerDiscount, normalizePartnerCode, validatePartnerCode } from "@/lib/events/partner-codes";
import { formatMoney } from "@/lib/events/public";
import { multiplyMoney, toMoney } from "@/lib/events/money";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const schema = z.object({
  eventSlug: z.string().trim().min(1).max(180).optional(),
  eventId: z.string().trim().min(1).max(160).optional(),
  code: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().int().min(1).max(20),
}).refine((value) => value.eventSlug || value.eventId, {
  message: "Informe o evento.",
});

export async function POST(request: Request) {
  if (!checkRateLimit(request)) {
    return NextResponse.json({ valid: false, message: "Muitas tentativas. Aguarde um instante." }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ valid: false, message: "Revise o código e a quantidade." }, { status: 400 });
  }

  const event = await prisma.ticketEvent.findFirst({
    where: parsed.data.eventId ? { id: parsed.data.eventId, published: true } : { slug: parsed.data.eventSlug, published: true },
    include: { lots: true },
  });

  if (!event || parsed.data.quantity > event.maxTicketsPerOrder) {
    return NextResponse.json({ valid: false, message: "Este código não é válido para este evento." }, { status: 200 });
  }

  try {
    const now = new Date();
    const lot = selectActiveTicketLot(event.lots, now);
    const code = await prisma.eventPartnerCode.findUnique({
      where: {
        eventId_code: {
          eventId: event.id,
          code: normalizePartnerCode(parsed.data.code),
        },
      },
    });

    if (!code) {
      return NextResponse.json({ valid: false, message: "Este código não é válido para este evento." });
    }

    validatePartnerCode(code, event.id, now);
    const subtotal = multiplyMoney(lot.price, parsed.data.quantity);
    const discountAmount = calculatePartnerDiscount(code, subtotal);
    const total = toMoney(subtotal.minus(discountAmount));

    return NextResponse.json({
      valid: true,
      partnerName: code.partnerName,
      code: code.code,
      subtotal: subtotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      total: total.toFixed(2),
      formattedDiscount: formatMoney(discountAmount),
      formattedTotal: formatMoney(total),
    });
  } catch {
    return NextResponse.json({ valid: false, message: "Este código não está mais disponível." });
  }
}
