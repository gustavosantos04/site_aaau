"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createEventAction,
  saveLotAction,
  savePartnerCodeAction,
  updateEventAction,
  type AdminEventFormState,
} from "@/app/admin/eventos/actions";
import { Button } from "@/components/shared/button";

const initialState: AdminEventFormState = { status: "idle" };
const inputClass =
  "h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-aaau-ember";
const textareaClass =
  "min-h-28 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-aaau-ember";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending ? "Salvando..." : label}
    </Button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Check({
  name,
  label,
  helper,
  defaultChecked = false,
}: {
  name: string;
  label: string;
  helper?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[1rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 accent-aaau-ember" />
      <span>
        <strong className="block font-semibold text-white/85">{label}</strong>
        {helper ? <span className="mt-1 block text-xs leading-5 text-white/45">{helper}</span> : null}
      </span>
    </label>
  );
}

function Message({ state }: { state: AdminEventFormState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p className={state.status === "success" ? "text-sm text-aaau-sand" : "text-sm text-red-200"}>
      {state.message}
    </p>
  );
}

function toLocalInput(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = -3 * 60;
  const local = new Date(date.getTime() + offset * 60_000);
  return local.toISOString().slice(0, 16);
}

type EventFormValue = {
  id?: string;
  name?: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  bannerImage?: string | null;
  coverImage?: string | null;
  startAt?: Date | string;
  endAt?: Date | string | null;
  salesStartAt?: Date | string | null;
  salesEndAt?: Date | string | null;
  venueName?: string;
  venueAddress?: string | null;
  minimumAge?: number | null;
  published?: boolean;
  showRemainingTickets?: boolean;
  maxTicketsPerOrder?: number;
  lowStockThreshold?: number;
  requireParticipantEmail?: boolean;
  requireParticipantPhone?: boolean;
  requireBirthDate?: boolean;
  requireInstitution?: boolean;
  requireCourse?: boolean;
  requireCampus?: boolean;
};

type LotFormValue = {
  id?: string;
  name?: string;
  description?: string | null;
  price?: { toString(): string } | string | number;
  quantity?: number;
  salesStartAt?: Date | string | null;
  salesEndAt?: Date | string | null;
  position?: number;
  active?: boolean;
  autoActivate?: boolean;
};

type PartnerCodeFormValue = {
  id?: string;
  code?: string;
  partnerName?: string;
  partnerType?: "ATHLETIC" | "PARTNER" | "PROMOTION" | "OTHER";
  discountType?: "PERCENTAGE" | "FIXED";
  discountValue?: { toString(): string } | string | number;
  maxUses?: number | null;
  startsAt?: Date | string | null;
  expiresAt?: Date | string | null;
  active?: boolean;
};

function decimalInput(value?: { toString(): string } | string | number | null) {
  return value == null ? "" : value.toString();
}

export function EventAdminForm({ event }: { event?: EventFormValue }) {
  const editing = Boolean(event?.id);
  const [state, formAction] = useActionState(editing ? updateEventAction : createEventAction, initialState);

  return (
    <form action={formAction} className="space-y-6 rounded-[1.5rem] border border-white/10 bg-[#141010] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-6">
      {event?.id ? <input type="hidden" name="eventId" value={event.id} /> : null}
      <Message state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome">
          <input name="name" required defaultValue={event?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Slug">
          <input name="slug" defaultValue={event?.slug ?? ""} className={inputClass} placeholder="gerado pelo nome" />
        </Field>
      </div>

      <Field label="Descricao curta">
        <input name="shortDescription" required defaultValue={event?.shortDescription ?? ""} className={inputClass} />
      </Field>
      <Field label="Descricao">
        <textarea name="description" required defaultValue={event?.description ?? ""} className={textareaClass} />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Banner/card">
          <input name="bannerImage" defaultValue={event?.bannerImage ?? ""} className={inputClass} placeholder="/images/brand/event-launch.svg" />
        </Field>
        <Field label="Capa/hero">
          <input name="coverImage" defaultValue={event?.coverImage ?? ""} className={inputClass} placeholder="/images/brand/event-integration.svg" />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Inicio do evento">
          <input name="startAt" type="datetime-local" required defaultValue={toLocalInput(event?.startAt)} className={inputClass} />
        </Field>
        <Field label="Fim do evento">
          <input name="endAt" type="datetime-local" defaultValue={toLocalInput(event?.endAt)} className={inputClass} />
        </Field>
        <Field label="Inicio das vendas">
          <input name="salesStartAt" type="datetime-local" defaultValue={toLocalInput(event?.salesStartAt)} className={inputClass} />
        </Field>
        <Field label="Fim das vendas">
          <input name="salesEndAt" type="datetime-local" defaultValue={toLocalInput(event?.salesEndAt)} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Local">
          <input name="venueName" required defaultValue={event?.venueName ?? ""} className={inputClass} />
        </Field>
        <Field label="Endereco">
          <input name="venueAddress" defaultValue={event?.venueAddress ?? ""} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Classificacao minima">
          <input name="minimumAge" type="number" min="0" defaultValue={event?.minimumAge ?? ""} className={inputClass} />
        </Field>
        <Field label="Max ingressos/pedido">
          <input name="maxTicketsPerOrder" type="number" min="1" defaultValue={event?.maxTicketsPerOrder ?? 4} className={inputClass} />
        </Field>
        <Field label="Limite ultimos ingressos">
          <input name="lowStockThreshold" type="number" min="0" defaultValue={event?.lowStockThreshold ?? 10} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Check name="published" label="Publicado" defaultChecked={event?.published ?? false} />
        <Check name="showRemainingTickets" label="Mostrar restantes" defaultChecked={event?.showRemainingTickets ?? false} />
        <Check name="requireParticipantEmail" label="Exigir e-mail participante" defaultChecked={event?.requireParticipantEmail ?? false} />
        <Check name="requireParticipantPhone" label="Exigir telefone participante" defaultChecked={event?.requireParticipantPhone ?? false} />
        <Check name="requireBirthDate" label="Exigir nascimento" defaultChecked={event?.requireBirthDate ?? false} />
        <Check name="requireInstitution" label="Exigir instituicao" defaultChecked={event?.requireInstitution ?? false} />
        <Check name="requireCourse" label="Exigir curso" defaultChecked={event?.requireCourse ?? false} />
        <Check name="requireCampus" label="Exigir campus" defaultChecked={event?.requireCampus ?? false} />
      </div>

      <p className="rounded-[1rem] border border-aaau-sand/20 bg-aaau-sand/10 p-4 text-sm leading-6 text-white/68">
        Datas sao interpretadas no contexto America/Sao_Paulo. Alterar slug de evento divulgado pode invalidar links compartilhados.
      </p>

      <SubmitButton label={editing ? "Salvar evento" : "Criar evento"} />
    </form>
  );
}

export function EventLotForm({ eventId, lot }: { eventId: string; lot?: LotFormValue }) {
  const [state, formAction] = useActionState(saveLotAction, initialState);
  const editing = Boolean(lot?.id);
  return (
    <form action={formAction} className="space-y-4 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="autoActivate" value="true" />
      {lot?.id ? <input type="hidden" name="lotId" value={lot.id} /> : null}
      <Message state={state} />
      <div>
        <h2 className="text-lg font-semibold text-white">{editing ? `Editar ${lot?.name}` : "Criar novo lote"}</h2>
        <p className="mt-1 text-sm leading-6 text-white/55">Defina a data de abertura. O site libera o lote automaticamente quando chegar o horário.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Lote"><input name="name" required defaultValue={lot?.name ?? ""} className={inputClass} /></Field>
        <Field label="Preco"><input name="price" required defaultValue={decimalInput(lot?.price)} className={inputClass} placeholder="49,90" /></Field>
        <Field label="Quantidade"><input name="quantity" type="number" min="1" required defaultValue={lot?.quantity ?? ""} className={inputClass} /></Field>
        <Field label="Ordem do lote"><input name="position" type="number" min="1" defaultValue={lot?.position ?? 1} required className={inputClass} /></Field>
        <Field label="Abre para vendas em"><input name="salesStartAt" type="datetime-local" defaultValue={toLocalInput(lot?.salesStartAt)} className={inputClass} /></Field>
        <Field label="Encerra as vendas em"><input name="salesEndAt" type="datetime-local" defaultValue={toLocalInput(lot?.salesEndAt)} className={inputClass} /></Field>
      </div>
      <Field label="Descricao"><input name="description" defaultValue={lot?.description ?? ""} className={inputClass} /></Field>
      <Check
        name="active"
        label="Disponibilizar este lote no site"
        helper="Deixe marcado mesmo que a abertura seja futura. A data acima controla quando as vendas começam."
        defaultChecked={lot?.active ?? true}
      />
      <SubmitButton label={editing ? "Salvar lote" : "Criar lote"} />
    </form>
  );
}

export function EventPartnerCodeForm({ eventId, code }: { eventId: string; code?: PartnerCodeFormValue }) {
  const [state, formAction] = useActionState(savePartnerCodeAction, initialState);
  const editing = Boolean(code?.id);
  return (
    <form action={formAction} className="space-y-4 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
      <input type="hidden" name="eventId" value={eventId} />
      {code?.id ? <input type="hidden" name="codeId" value={code.id} /> : null}
      <Message state={state} />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Codigo"><input name="code" required defaultValue={code?.code ?? ""} className={inputClass} placeholder="UFRGS10" /></Field>
        <Field label="Parceiro"><input name="partnerName" required defaultValue={code?.partnerName ?? ""} className={inputClass} /></Field>
        <Field label="Tipo">
          <select name="partnerType" className={inputClass} defaultValue={code?.partnerType ?? "PARTNER"}>
            <option value="ATHLETIC">Atletica</option>
            <option value="PARTNER">Parceiro</option>
            <option value="PROMOTION">Promocao</option>
            <option value="OTHER">Outro</option>
          </select>
        </Field>
        <Field label="Tipo desconto">
          <select name="discountType" className={inputClass} defaultValue={code?.discountType ?? "PERCENTAGE"}>
            <option value="PERCENTAGE">Percentual</option>
            <option value="FIXED">Valor fixo</option>
          </select>
        </Field>
        <Field label="Desconto"><input name="discountValue" required defaultValue={decimalInput(code?.discountValue)} className={inputClass} placeholder="10" /></Field>
        <Field label="Limite"><input name="maxUses" type="number" min="1" defaultValue={code?.maxUses ?? ""} className={inputClass} /></Field>
        <Field label="Inicio"><input name="startsAt" type="datetime-local" defaultValue={toLocalInput(code?.startsAt)} className={inputClass} /></Field>
        <Field label="Expira"><input name="expiresAt" type="datetime-local" defaultValue={toLocalInput(code?.expiresAt)} className={inputClass} /></Field>
      </div>
      <Check name="active" label="Ativo" defaultChecked={code?.active ?? true} />
      <SubmitButton label={editing ? "Salvar codigo" : "Criar codigo"} />
    </form>
  );
}
