import { prisma } from "@/lib/db/prisma";
import { runEventTicketOutboxCycle } from "@/lib/events/outbox-operations";

async function main() {
  const result = await runEventTicketOutboxCycle({ limit: 50 });
  if (result.status === "processed" &&
    (result.transfer.failed > 0 || result.portal.failed > 0 || result.exhausted > 0)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.name : "EventTicketOutboxError");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
