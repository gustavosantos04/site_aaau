import { handleEventTicketOutboxCron } from "@/lib/events/outbox-cron-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleEventTicketOutboxCron(request);
}
