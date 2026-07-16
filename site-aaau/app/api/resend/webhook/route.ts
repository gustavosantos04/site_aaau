import { NextResponse } from "next/server";
import { Resend } from "resend";

import { recordResendWebhookEvent } from "@/lib/email/resend-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!apiKey || !webhookSecret) {
    return NextResponse.json({ error: "Webhook de e-mail nao configurado." }, { status: 503 });
  }

  const providerEventId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!providerEventId || !timestamp || !signature) {
    return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  }

  const rawBody = await request.text();
  let payload;
  try {
    payload = new Resend(apiKey).webhooks.verify({
      payload: rawBody,
      headers: { id: providerEventId, timestamp, signature },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Assinatura invalida." }, { status: 400 });
  }

  await recordResendWebhookEvent(providerEventId, payload);
  return NextResponse.json({ received: true });
}
