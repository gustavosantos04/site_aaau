"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  saveManagementAreaMembersAction,
  type ManagementFormState,
} from "@/app/admin/gestao/actions";
import { Button } from "@/components/shared/button";
import type { ManagementArea } from "@/lib/data/management";

const initialState: ManagementFormState = {
  status: "idle",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando" : "Salvar integrantes"}
    </Button>
  );
}

export function ManagementAreaForm({
  area,
  membersText,
}: {
  area: ManagementArea;
  membersText: string;
}) {
  const [state, formAction] = useActionState(saveManagementAreaMembersAction, initialState);

  return (
    <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
            {area.title}
          </p>
          <h2 className="font-display text-3xl uppercase tracking-[0.08em] text-white">
            {area.members.length.toString().padStart(2, "0")} integrantes
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-white/65">{area.description}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
          Formato: Nome | Cargo | URL da foto
        </div>
      </div>

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="areaId" value={area.id} />

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
            Integrantes
          </span>
          <textarea
            name="membersText"
            defaultValue={membersText}
            rows={Math.max(area.members.length + 2, 6)}
            className="min-h-[12rem] w-full rounded-[1.4rem] border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-white outline-none transition placeholder:text-white/25 focus:border-white/25 focus:bg-black/30"
            placeholder={`Exemplo:\nAna Souza | Presidente\nBruno Lima | Vice-presidente | https://...`}
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/45">
            Uma linha por pessoa. Se quiser remover alguém, apague a linha e salve.
          </p>
          <SubmitButton />
        </div>

        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "text-sm text-[#ff9a9a]"
                : "text-sm text-[#b8e8c8]"
            }
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </article>
  );
}
