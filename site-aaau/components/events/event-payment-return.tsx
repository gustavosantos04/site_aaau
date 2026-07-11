"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { buttonVariants } from "@/components/shared/button";

type StatusPayload = {
  status: string;
  eventName: string;
  eventSlug: string;
  ticketsReady: boolean;
  formattedTotal: string;
};

const copy = {
  sucesso: {
    title: "Pagamento confirmado",
    pending: "Confirmando pagamento",
    fallback: "Seu pagamento ainda está sendo processado.",
    icon: CheckCircle2,
  },
  pendente: {
    title: "Pagamento em processamento",
    pending: "Pagamento em processamento",
    fallback: "Assim que o pagamento for confirmado, seus ingressos serão emitidos.",
    icon: Clock,
  },
  erro: {
    title: "Pagamento não concluído",
    pending: "Verificando pagamento",
    fallback: "Se o pedido não foi confirmado, volte ao evento e tente novamente.",
    icon: XCircle,
  },
};

export function EventPaymentReturn({ variant }: { variant: keyof typeof copy }) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [missingToken, setMissingToken] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const content = copy[variant];
  const Icon = content.icon;

  useEffect(() => {
    let canceled = false;
    const accessToken = sessionStorage.getItem("aaau:eventOrderAccessToken");
    setAccessToken(accessToken);

    if (!accessToken) {
      setMissingToken(true);
      setLoading(false);
      return;
    }

    async function poll() {
      for (let attempt = 0; attempt < 10 && !canceled; attempt += 1) {
        const response = await fetch(`/api/eventos/orders/${accessToken}/status`, { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as StatusPayload;
          setStatus(payload);
          if (payload.status === "PAID") break;
        }
        setLoading(false);
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      setLoading(false);
    }

    void poll();
    return () => {
      canceled = true;
    };
  }, []);

  const paid = status?.status === "PAID";
  const canOpenTickets = paid && status?.ticketsReady && accessToken;
  const title = paid ? "Pagamento confirmado" : variant === "erro" && status && status.status !== "PENDING" ? content.title : content.pending;

  return (
    <section className="mx-auto flex min-h-[68vh] max-w-3xl items-center px-4 py-12 sm:px-6">
      <div className="w-full rounded-[0.5rem] border border-white/10 bg-white/[0.05] p-6 text-center sm:p-8">
        <Icon className="mx-auto h-12 w-12 text-aaau-sand" />
        <h1 className="mt-5 break-words font-display text-3xl uppercase tracking-[0.06em] text-white sm:text-5xl sm:tracking-[0.08em]">{title}</h1>
        {missingToken ? (
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/65">
            Não encontramos a identificação segura deste pedido nesta sessão. Se o pagamento foi confirmado, seus ingressos serão liberados após o processamento.
          </p>
        ) : loading ? (
          <p className="mt-4 text-sm text-white/65">Consultando status interno do pedido...</p>
        ) : paid ? (
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/70">
            Seu ingresso está garantido para {status.eventName}. Acesse seus ingressos para apresentar o QR Code individual na entrada.
          </p>
        ) : (
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/65">{content.fallback}</p>
        )}
        {canOpenTickets ? (
          <Link href={`/meus-ingressos/${accessToken}` as Route} className={buttonVariants({ variant: "primary", size: "md", className: "mt-6" })}>
            Ver meus ingressos
          </Link>
        ) : status?.eventSlug ? (
          <Link href={`/eventos/${status.eventSlug}` as Route} className={buttonVariants({ variant: "secondary", size: "md", className: "mt-6" })}>
            Voltar ao evento
          </Link>
        ) : (
          <Link href={"/eventos" as Route} className={buttonVariants({ variant: "secondary", size: "md", className: "mt-6" })}>
            Ver eventos
          </Link>
        )}
      </div>
    </section>
  );
}
