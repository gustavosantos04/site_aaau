import type { Metadata } from "next";

import { TransferPageShell } from "@/components/events/transfer-page-shell";
import { buttonVariants } from "@/components/shared/button";
import { getHolderConfirmationView } from "@/lib/events/transfer-flow";
import { maskEmail } from "@/lib/events/transfer-emails";
import { cancelTransferAction, confirmTransferAction } from "../../actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Confirmar transferência | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConfirmTransferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getHolderConfirmationView(token);
  if (view.state === "EXPIRED") return <TransferPageShell title="Link expirado"><p>Esta solicitação não está mais disponível.</p></TransferPageShell>;
  if (view.state === "INVALID") return <TransferPageShell title="Link indisponível"><p>Não foi possível validar esta solicitação.</p></TransferPageShell>;
  const { transfer } = view;
  return (
    <TransferPageShell title="Confirmar transferência">
      <p><strong className="text-white">Evento:</strong> {transfer.ticket.event.name}</p>
      <p><strong className="text-white">Data:</strong> {transfer.ticket.event.startAt.toLocaleString("pt-BR")}</p>
      <p><strong className="text-white">Participante atual:</strong> {transfer.ticket.participantName}</p>
      <p><strong className="text-white">Destinatário:</strong> {maskEmail(transfer.toHolderEmail)}</p>
      <p>O ingresso atual continua válido até o destinatário concluir o aceite.</p>
      <div className="flex flex-wrap gap-3 pt-2">
        <form action={confirmTransferAction.bind(null, token)}><button className={buttonVariants({ size: "md" })} type="submit">Confirmar transferência</button></form>
        <form action={cancelTransferAction.bind(null, token)}><button className={buttonVariants({ variant: "secondary", size: "md" })} type="submit">Cancelar</button></form>
      </div>
    </TransferPageShell>
  );
}
