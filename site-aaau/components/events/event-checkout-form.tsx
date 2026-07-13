"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle, BadgeCheck, Minus, Plus, ShieldCheck } from "lucide-react";

import { Button } from "@/components/shared/button";
import { buildEventCheckoutParticipantPayload } from "@/lib/events/checkout-payload";
import { formatMoney } from "@/lib/events/public";

type CheckoutEvent = {
  slug: string;
  name: string;
  startAt: string;
  venueName: string;
  maxTicketsPerOrder: number;
  currentLotName: string;
  currentLotPrice: string;
  requireParticipantEmail: boolean;
  requireParticipantPhone: boolean;
  requireBirthDate: boolean;
  requireInstitution: boolean;
  requireCourse: boolean;
  requireCampus: boolean;
};

type Participant = {
  name: string;
  cpf: string;
  email: string;
  phone: string;
  birthDate: string;
  institution: string;
  course: string;
  campus: string;
};

type Buyer = {
  name: string;
  cpf: string;
  email: string;
  phone: string;
};

type PartnerPreview =
  | { valid: true; code: string; partnerName: string; discountAmount: string; total: string; formattedDiscount: string; formattedTotal: string }
  | { valid: false; message: string };

const emptyParticipant: Participant = {
  name: "",
  cpf: "",
  email: "",
  phone: "",
  birthDate: "",
  institution: "",
  course: "",
  campus: "",
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function randomKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function EventCheckoutForm({ event }: { event: CheckoutEvent }) {
  const [quantity, setQuantity] = useState(1);
  const [buyer, setBuyer] = useState<Buyer>({ name: "", cpf: "", email: "", phone: "" });
  const [participants, setParticipants] = useState<Participant[]>([{ ...emptyParticipant }]);
  const [partnerCode, setPartnerCode] = useState("");
  const [partnerPreview, setPartnerPreview] = useState<PartnerPreview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const idempotencyKeyRef = useRef(randomKey());
  const payloadSignatureRef = useRef("");

  const subtotal = useMemo(() => Number(event.currentLotPrice) * quantity, [event.currentLotPrice, quantity]);
  const total = partnerPreview?.valid ? Number(partnerPreview.total) : subtotal;

  function setParticipantCount(next: number) {
    const clamped = Math.min(event.maxTicketsPerOrder, Math.max(1, next));
    setQuantity(clamped);
    setParticipants((current) =>
      Array.from({ length: clamped }, (_, index) => current[index] ?? { ...emptyParticipant }),
    );
    setPartnerPreview(null);
  }

  function updateParticipant(index: number, field: keyof Participant, value: string) {
    setParticipants((current) => current.map((participant, itemIndex) => itemIndex === index ? { ...participant, [field]: value } : participant));
  }

  function useBuyerForFirstParticipant() {
    setParticipants((current) =>
      current.map((participant, index) =>
        index === 0
          ? { ...participant, name: buyer.name, cpf: buyer.cpf, email: buyer.email, phone: buyer.phone }
          : participant,
      ),
    );
  }

  function validateForm() {
    const errors: Record<string, string> = {};
    if (buyer.name.trim().length < 3) errors.buyerName = "Informe seu nome completo.";
    if (digits(buyer.cpf).length !== 11) errors.buyerCpf = "Informe um CPF válido.";
    if (!buyer.email.includes("@")) errors.buyerEmail = "Informe um e-mail válido.";
    if (digits(buyer.phone).length < 10) errors.buyerPhone = "Informe um WhatsApp válido.";

    const participantCpfs = participants.map((participant) => digits(participant.cpf)).filter(Boolean);
    if (new Set(participantCpfs).size !== participantCpfs.length) {
      errors.participants = "Cada participante deste pedido precisa possuir um CPF diferente.";
    }

    participants.forEach((participant, index) => {
      if (participant.name.trim().length < 2) errors[`participant-${index}-name`] = "Informe o nome.";
      if (digits(participant.cpf).length !== 11) errors[`participant-${index}-cpf`] = "Informe o CPF.";
      if (event.requireParticipantEmail && !participant.email.includes("@")) errors[`participant-${index}-email`] = "Informe o e-mail.";
      if (event.requireParticipantPhone && digits(participant.phone).length < 10) errors[`participant-${index}-phone`] = "Informe o telefone.";
      if (event.requireBirthDate && !participant.birthDate) errors[`participant-${index}-birthDate`] = "Informe a data.";
      if (event.requireInstitution && !participant.institution.trim()) errors[`participant-${index}-institution`] = "Informe a instituição.";
      if (event.requireCourse && !participant.course.trim()) errors[`participant-${index}-course`] = "Informe o curso.";
      if (event.requireCampus && !participant.campus.trim()) errors[`participant-${index}-campus`] = "Informe o campus.";
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function validatePartnerCode() {
    if (!partnerCode.trim()) return;
    setValidatingCode(true);
    setPartnerPreview(null);
    try {
      const response = await fetch("/api/eventos/partner-code/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventSlug: event.slug, code: partnerCode, quantity }),
      });
      setPartnerPreview(await response.json());
    } finally {
      setValidatingCode(false);
    }
  }

  function payloadSignature() {
    return JSON.stringify({
      eventSlug: event.slug,
      buyer,
      participants,
      partnerCode: partnerPreview?.valid ? partnerCode.trim() : undefined,
      quantity,
    });
  }

  async function submit(attempt = 0): Promise<void> {
    if (!validateForm()) return;
    const signature = payloadSignature();
    if (payloadSignatureRef.current && payloadSignatureRef.current !== signature) {
      idempotencyKeyRef.current = randomKey();
    }
    payloadSignatureRef.current = signature;
    setSubmitting(true);
    setFeedback(attempt > 0 ? "Estamos preparando seu pagamento..." : "Criando reserva e preparando pagamento...");

    const response = await fetch("/api/eventos/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventSlug: event.slug,
        buyer,
        participants: participants.map(buildEventCheckoutParticipantPayload),
        partnerCode: partnerPreview?.valid ? partnerCode.trim() : undefined,
        idempotencyKey: idempotencyKeyRef.current,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (body.code === "EVENT_PAYMENT_PREFERENCE_CREATING" && body.retryable && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return submit(attempt + 1);
    }

    if (!response.ok || !body.initPoint) {
      setFeedback(body.message ?? "Não conseguimos preparar o pagamento agora. Tente novamente em alguns instantes.");
      setSubmitting(false);
      return;
    }

    sessionStorage.setItem("aaau:eventOrderAccessToken", body.accessToken);
    setRedirecting(true);
    setFeedback("Redirecionando para o Mercado Pago...");
    window.location.assign(body.initPoint);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,24rem]">
      <div className="space-y-5">
        <ol className="grid grid-cols-3 overflow-hidden rounded-[0.5rem] border border-white/10 bg-white/[0.04]" aria-label="Etapas da compra">
          {["1. Ingressos", "2. Seus dados", "3. Pagamento"].map((step, index) => (
            <li key={step} className={`px-2 py-3 text-center text-[0.68rem] font-semibold uppercase text-white/70 sm:text-xs ${index > 0 ? "border-l border-white/10" : ""}`}>
              {step}
            </li>
          ))}
        </ol>
        <section className="rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aaau-sand">Compra oficial AAAU</p>
          <h1 className="mt-2 break-words font-display text-3xl uppercase tracking-[0.06em] text-white sm:text-4xl sm:tracking-[0.08em]">{event.name}</h1>
          <p className="mt-2 text-sm leading-6 text-white/65">{event.venueName} · {new Date(event.startAt).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</p>
          <p className="mt-3 flex items-start gap-2 text-xs leading-6 text-white/55"><ShieldCheck className="mt-1 h-4 w-4 shrink-0" /><span>Pagamento concluído no Mercado Pago.</span></p>
        </section>

        <section className="rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white">Ingressos</h2>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-white">{event.currentLotName}</p>
              <p className="text-sm text-white/60">{formatMoney(event.currentLotPrice)} por ingresso</p>
            </div>
            <div className="flex h-12 w-fit items-center rounded-full border border-white/10 bg-aaau-night">
              <button type="button" className="h-12 w-12 disabled:cursor-not-allowed disabled:opacity-35" disabled={quantity <= 1} onClick={() => setParticipantCount(quantity - 1)} aria-label="Diminuir quantidade"><Minus className="mx-auto h-4 w-4" /></button>
              <span className="w-10 text-center font-semibold">{quantity}</span>
              <button type="button" className="h-12 w-12 disabled:cursor-not-allowed disabled:opacity-35" disabled={quantity >= event.maxTicketsPerOrder} onClick={() => setParticipantCount(quantity + 1)} aria-label="Aumentar quantidade"><Plus className="mx-auto h-4 w-4" /></button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-5 sm:grid-cols-2">
          <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white sm:col-span-2">Comprador</h2>
          <p className="text-sm leading-6 text-white/60 sm:col-span-2">Usaremos estes dados para identificar a compra e enviar o acesso aos ingressos.</p>
          <Input label="Nome completo" required autoComplete="name" value={buyer.name} onChange={(value) => setBuyer({ ...buyer, name: value })} error={fieldErrors.buyerName} />
          <Input label="CPF" required autoComplete="off" inputMode="numeric" value={buyer.cpf} onChange={(value) => setBuyer({ ...buyer, cpf: value })} error={fieldErrors.buyerCpf} />
          <Input label="E-mail" required autoComplete="email" type="email" value={buyer.email} onChange={(value) => setBuyer({ ...buyer, email: value })} error={fieldErrors.buyerEmail} />
          <Input label="WhatsApp" required autoComplete="tel" inputMode="numeric" value={buyer.phone} onChange={(value) => setBuyer({ ...buyer, phone: value })} error={fieldErrors.buyerPhone} />
        </section>

        <section className="space-y-4 rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white">Participantes</h2>
              <p className="mt-1 text-sm text-white/60">Cada ingresso será emitido para o participante.</p>
            </div>
            <Button className="w-full tracking-[0.12em] sm:w-auto sm:tracking-[0.18em]" variant="secondary" size="sm" onClick={useBuyerForFirstParticipant}>Usar meus dados</Button>
          </div>
          {fieldErrors.participants ? <p className="text-sm text-red-200">{fieldErrors.participants}</p> : null}
          {participants.map((participant, index) => (
            <div key={index} className="grid gap-3 rounded-[0.5rem] border border-white/10 bg-aaau-night/45 p-4 sm:grid-cols-2">
              <h3 className="font-semibold uppercase tracking-[0.16em] text-white sm:col-span-2">Participante {index + 1}</h3>
              <Input label="Nome completo" required autoComplete="name" value={participant.name} onChange={(value) => updateParticipant(index, "name", value)} error={fieldErrors[`participant-${index}-name`]} />
              <Input label="CPF" required autoComplete="off" inputMode="numeric" value={participant.cpf} onChange={(value) => updateParticipant(index, "cpf", value)} error={fieldErrors[`participant-${index}-cpf`]} />
              {event.requireParticipantEmail ? <Input label="E-mail" type="email" value={participant.email} onChange={(value) => updateParticipant(index, "email", value)} error={fieldErrors[`participant-${index}-email`]} /> : null}
              {event.requireParticipantPhone ? <Input label="Telefone" inputMode="numeric" value={participant.phone} onChange={(value) => updateParticipant(index, "phone", value)} error={fieldErrors[`participant-${index}-phone`]} /> : null}
              {event.requireBirthDate ? <Input label="Data de nascimento" type="date" value={participant.birthDate} onChange={(value) => updateParticipant(index, "birthDate", value)} error={fieldErrors[`participant-${index}-birthDate`]} /> : null}
              {event.requireInstitution ? <Input label="Instituição" value={participant.institution} onChange={(value) => updateParticipant(index, "institution", value)} error={fieldErrors[`participant-${index}-institution`]} /> : null}
              {event.requireCourse ? <Input label="Curso" value={participant.course} onChange={(value) => updateParticipant(index, "course", value)} error={fieldErrors[`participant-${index}-course`]} /> : null}
              {event.requireCampus ? <Input label="Campus" value={participant.campus} onChange={(value) => updateParticipant(index, "campus", value)} error={fieldErrors[`participant-${index}-campus`]} /> : null}
            </div>
          ))}
        </section>

        <section className="rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white">Código de atlética ou parceiro</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input label="Código" value={partnerCode} onChange={(value) => { setPartnerCode(value); setPartnerPreview(null); }} placeholder="Ex.: UFRGS10" />
            <Button className="mt-6 sm:mt-0" variant="secondary" onClick={validatePartnerCode} disabled={validatingCode || !partnerCode.trim()}>
              {validatingCode ? "Validando" : "Aplicar"}
            </Button>
          </div>
          {partnerPreview ? (
            <p className={partnerPreview.valid ? "mt-3 text-sm text-aaau-sand" : "mt-3 text-sm text-red-200"}>
              {partnerPreview.valid ? `Código aplicado: ${partnerPreview.partnerName} - ${partnerPreview.formattedDiscount}` : partnerPreview.message}
            </p>
          ) : null}
        </section>
      </div>

      <aside className="h-fit rounded-[0.5rem] border border-white/10 bg-[#111]/90 p-5 lg:sticky lg:top-24">
        <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-white">Resumo</h2>
        <div className="mt-5 space-y-3 text-sm text-white/70">
          <Row label="Evento" value={event.name} />
          <Row label="Quantidade" value={`${quantity} ingresso(s)`} />
          <Row label="Preço unitário" value={formatMoney(event.currentLotPrice)} />
          <Row label="Subtotal" value={formatMoney(subtotal)} />
          {partnerPreview?.valid ? <Row label={partnerPreview.code} value={`- ${partnerPreview.formattedDiscount}`} /> : null}
          <div className="border-t border-white/10 pt-4">
            <Row label="Total" value={formatMoney(total)} strong />
          </div>
        </div>
        <p className="mt-4 text-xs leading-6 text-white/50">Valores e disponibilidade serão confirmados novamente antes do pagamento.</p>
        {feedback ? <p className="mt-4 flex gap-2 text-sm text-aaau-sand" aria-live="polite"><AlertCircle className="h-4 w-4 shrink-0" />{feedback}</p> : null}
        <Button className="mt-5 w-full tracking-[0.12em] sm:tracking-[0.18em]" size="lg" onClick={() => void submit()} disabled={submitting || redirecting}>
          {redirecting ? "Redirecionando" : submitting ? "Preparando" : "Ir para pagamento"}
        </Button>
        <p className="mt-4 flex items-center gap-2 text-xs leading-6 text-white/50"><BadgeCheck className="h-4 w-4" />Pagamento processado pelo Mercado Pago.</p>
      </aside>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  error,
  type = "text",
  inputMode,
  placeholder,
  autoComplete,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  inputMode?: "numeric" | "email" | "text";
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">{label}{required ? <span className="text-aaau-sand"> *</span> : null}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="mt-2 h-12 w-full rounded-[0.5rem] border border-white/10 bg-aaau-night px-3 text-sm text-white outline-none transition focus:border-aaau-sand/60"
        aria-invalid={Boolean(error)}
      />
      {error ? <span className="mt-1 block text-xs text-red-200">{error}</span> : null}
    </label>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className={strong ? "break-words text-right font-display text-2xl text-aaau-sand" : "break-words text-right font-semibold text-white"}>{value}</span>
    </div>
  );
}
