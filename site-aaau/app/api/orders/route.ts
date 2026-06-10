import { NextResponse } from "next/server";

import { createCheckout } from "@/lib/checkout/mercado-pago";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await createCheckout(request);

  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      orderId: result.data.orderId,
      initPoint: result.data.initPoint,
      checkoutUrl: result.data.initPoint,
    },
    { status: result.status },
  );
}
