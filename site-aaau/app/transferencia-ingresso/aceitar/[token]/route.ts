import { exchangeEventTicketTransferUrlToken } from "@/lib/events/transfer-token-exchange";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return exchangeEventTicketTransferUrlToken(request, token, "accept");
}
