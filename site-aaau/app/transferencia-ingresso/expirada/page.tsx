import type { Metadata } from "next";
import { TransferPageShell } from "@/components/events/transfer-page-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Transferência expirada | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function TransferExpiredPage() {
  return <TransferPageShell title="Link expirado"><p>O prazo desta solicitação terminou. O ingresso atual não foi alterado e uma nova solicitação pode ser iniciada.</p></TransferPageShell>;
}
