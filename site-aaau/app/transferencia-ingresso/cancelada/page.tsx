import type { Metadata } from "next";
import { TransferPageShell } from "@/components/events/transfer-page-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Transferência indisponível | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function TransferCanceledPage() {
  return <TransferPageShell title="Solicitação encerrada"><p>A solicitação foi cancelada, recusada, já utilizada ou não pôde ser validada.</p></TransferPageShell>;
}
