import type { Metadata } from "next";
import { TransferPageShell } from "@/components/events/transfer-page-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Transferência indisponível | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function TransferCanceledPage({ searchParams }: { searchParams: Promise<{ legado?: string }> }) {
  const { legado } = await searchParams;
  return <TransferPageShell title="Transferência indisponível"><p>{legado === "1"
    ? "Este link pertence ao fluxo antigo de aceite e não pode mais concluir uma transferência. Acesse Meus ingressos para consultar suas credenciais atuais."
    : "A solicitação foi cancelada, recusada, já utilizada ou não pôde ser validada."}</p></TransferPageShell>;
}
