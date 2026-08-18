import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/checkout/mercado-pago";
import { reconcileEventOrderPaymentFromReturn } from "@/lib/events/mercado-pago";

export const runtime = "nodejs";

const reconcileSchema = z.object({
  paymentId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1).max(120)),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accessToken: string }> },
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: "Banco de dados nao configurado." }, { status: 503 });
  }
  if (!checkRateLimit(request)) {
    return NextResponse.json({ message: "Muitas consultas. Aguarde um instante." }, { status: 429 });
  }

  const parsed = reconcileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Pagamento invalido." }, { status: 400 });
  }

  const { accessToken } = await params;
  try {
    const result = await reconcileEventOrderPaymentFromReturn({
      accessToken,
      paymentId: parsed.data.paymentId,
    });
    if (result.result === "ORDER_NOT_FOUND") {
      return NextResponse.json({ message: "Pedido nao encontrado." }, { status: 404 });
    }
    if (result.result === "EXTERNAL_REFERENCE_MISMATCH") {
      return NextResponse.json({ message: "Pagamento nao pertence ao pedido." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, result: result.result });
  } catch (error) {
    console.error("[EVENT_PAYMENT_RECONCILIATION_FAILED]", {
      reason: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    });
    return NextResponse.json({ message: "Nao foi possivel reconciliar o pagamento agora." }, { status: 502 });
  }
}
