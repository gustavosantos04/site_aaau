import type { Metadata } from "next";
import { TransferPageShell } from "@/components/events/transfer-page-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Transferência registrada | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function TransferSuccessPage() {
  return <TransferPageShell title="Tudo certo"><p>A etapa foi concluída. Consulte seu e-mail para continuar ou acessar o ingresso.</p></TransferPageShell>;
}
