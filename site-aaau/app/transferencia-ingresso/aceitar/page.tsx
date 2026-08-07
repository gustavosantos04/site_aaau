import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { acceptTransferAction, rejectTransferAction } from "@/app/transferencia-ingresso/actions";
import { TransferPageShell } from "@/components/events/transfer-page-shell";
import { TransferRecipientForm } from "@/components/events/transfer-recipient-form";
import { getEventTicketTransferBrowserConfig } from "@/lib/events/transfer-browser-session";
import { getRecipientAcceptanceView } from "@/lib/events/transfer-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Aceitar ingresso | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AcceptTransferPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(getEventTicketTransferBrowserConfig("accept").cookieName)?.value;
  if (!token) redirect("/transferencia-ingresso/cancelada");
  const view = await getRecipientAcceptanceView(token);
  if (view.state === "EXPIRED") redirect("/transferencia-ingresso/expirada");
  if (view.state === "INVALID") redirect("/transferencia-ingresso/cancelada");
  const { transfer } = view;
  const { erro } = await searchParams;
  return (
    <TransferPageShell title="Aceitar ingresso">
      <TransferRecipientForm
        event={transfer.ticket.event}
        lotName={transfer.ticket.lot.name}
        recipientEmail={transfer.toHolderEmail}
        inputError={erro === "dados"}
        acceptAction={acceptTransferAction}
        rejectAction={rejectTransferAction}
      />
    </TransferPageShell>
  );
}
