import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Aceitar ingresso | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AcceptTransferPage() {
  redirect("/transferencia-ingresso/cancelada?legado=1" as never);
}
