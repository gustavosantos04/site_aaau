import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { cancelTransferAction, confirmTransferAction } from "@/app/transferencia-ingresso/actions";
import { TransferPageShell } from "@/components/events/transfer-page-shell";
import { buttonVariants } from "@/components/shared/button";
import { getEventTicketTransferBrowserConfig } from "@/lib/events/transfer-browser-session";
import { getHolderConfirmationView } from "@/lib/events/transfer-flow";
import { maskEmail } from "@/lib/events/transfer-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Confirmar transferência | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConfirmTransferPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getEventTicketTransferBrowserConfig("confirm").cookieName)?.value;
  if (!token) redirect("/transferencia-ingresso/cancelada");
  const view = await getHolderConfirmationView(token);
  if (view.state === "EXPIRED") redirect("/transferencia-ingresso/expirada");
  if (view.state === "INVALID") redirect("/transferencia-ingresso/cancelada");
  const { transfer } = view;
  return (
    <TransferPageShell title="Confirmar transferência">
      <p><strong className="text-white">Evento:</strong> {transfer.ticket.event.name}</p>
      <p><strong className="text-white">Data:</strong> {transfer.ticket.event.startAt.toLocaleString("pt-BR")}</p>
      <p><strong className="text-white">Participante atual:</strong> {transfer.ticket.participantName}</p>
      <p><strong className="text-white">Destinatário:</strong> {maskEmail(transfer.toHolderEmail)}</p>
      <p>O ingresso atual continua válido até o destinatário concluir o aceite.</p>
      <div className="flex flex-wrap gap-3 pt-2">
        <form action={confirmTransferAction}><button className={buttonVariants({ size: "md" })} type="submit">Confirmar transferência</button></form>
        <form action={cancelTransferAction}><button className={buttonVariants({ variant: "secondary", size: "md" })} type="submit">Cancelar</button></form>
      </div>
    </TransferPageShell>
  );
}
