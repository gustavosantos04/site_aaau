"use client";

import Image from "next/image";
import { Instagram, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteManagementMemberAction,
  saveManagementMemberAction,
  toggleManagementMemberAction,
  type ManagementFormState,
} from "@/app/admin/gestao/actions";
import { Button } from "@/components/shared/button";
import type {
  ManagementAdminArea,
  ManagementAdminMember,
} from "@/lib/data/management-store";

const initialState: ManagementFormState = {
  status: "idle",
};

const inputClass =
  "h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-aaau-ember";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando..." : label}
    </Button>
  );
}

function IconSubmitButton({
  label,
  icon,
}: {
  label: string;
  icon?: ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/10 px-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/60 transition hover:border-white/25 hover:text-white disabled:opacity-50"
    >
      {icon}
      {pending ? "..." : label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/[0.45]">
        {label}
      </span>
      {children}
    </label>
  );
}

function MemberEditForm({
  member,
  areas,
}: {
  member: ManagementAdminMember;
  areas: ManagementAdminArea[];
}) {
  const [state, formAction] = useActionState(saveManagementMemberAction, initialState);

  return (
    <details className="rounded-[1rem] border border-white/10 bg-black/25 px-4 py-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-white/45 transition hover:text-white/75">
        Editar cadastro
      </summary>
      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="memberId" value={member.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome">
            <input name="name" required defaultValue={member.name} className={inputClass} />
          </Field>
          <Field label="Cargo">
            <input name="role" defaultValue={member.role ?? ""} className={inputClass} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Diretoria">
            <select name="areaRecordId" defaultValue={member.areaId} className={inputClass}>
              {areas.map((area) => (
                <option key={area.recordId} value={area.recordId}>
                  {area.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ordem">
            <input
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={member.sortOrder}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Foto">
            <input name="image" defaultValue={member.image ?? ""} className={inputClass} />
          </Field>
          <Field label="Instagram">
            <input
              name="instagram"
              defaultValue={member.instagram ?? ""}
              className={inputClass}
              placeholder="@usuario"
            />
          </Field>
        </div>

        <label className="flex min-h-12 items-center gap-3 rounded-[1rem] border border-white/10 bg-white/[0.03] px-4 text-sm text-white/70">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={member.isActive}
            className="h-4 w-4 accent-aaau-ember"
          />
          Exibir no site
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SubmitButton label="Salvar" />
          {state.message ? (
            <p
              className={
                state.status === "error" ? "text-sm text-[#ff9a9a]" : "text-sm text-[#b8e8c8]"
              }
            >
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </details>
  );
}

export function ManagementMemberManager({ areas }: { areas: ManagementAdminArea[] }) {
  const [state, formAction] = useActionState(saveManagementMemberAction, initialState);
  const [areaRecordId, setAreaRecordId] = useState(areas[0]?.recordId ?? "");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [image, setImage] = useState("");
  const [instagram, setInstagram] = useState("");

  const selectedArea = useMemo(
    () => areas.find((area) => area.recordId === areaRecordId) ?? areas[0],
    [areaRecordId, areas],
  );
  const nextSortOrder = (selectedArea?.members.length ?? 0) + 1;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(340px,0.78fr),minmax(0,1.22fr)]">
      <section className="h-fit rounded-[1.5rem] border border-white/10 bg-[#141010] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="border-b border-white/10 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
            Acao principal
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Cadastrar integrante</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Escolha a diretoria, preencha os dados e controle se a pessoa aparece no site.
          </p>
        </div>

        <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-black/25 p-4">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5">
              {image ? (
                <Image src={image} alt={name || "Preview"} fill className="object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-lg font-semibold uppercase text-white/40">
                  {(name || "?").slice(0, 1)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{name || "Nome do integrante"}</p>
              <p className="truncate text-sm text-white/55">
                {[role || "Cargo", selectedArea?.title].filter(Boolean).join(" - ")}
              </p>
              {instagram ? (
                <p className="mt-1 flex items-center gap-2 text-xs text-white/45">
                  <Instagram className="h-3.5 w-3.5" />
                  @{instagram.replace(/^@/, "")}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <form action={formAction} className="mt-5 space-y-4">
          <Field label="Diretoria">
            <select
              name="areaRecordId"
              value={areaRecordId}
              onChange={(event) => setAreaRecordId(event.target.value)}
              className={inputClass}
            >
              {areas.map((area) => (
                <option key={area.recordId} value={area.recordId}>
                  {area.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome completo">
            <input
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Cargo">
            <input
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Foto">
              <input
                name="image"
                value={image}
                onChange={(event) => setImage(event.target.value)}
                className={inputClass}
                placeholder="/images/gestao/nome.jpg"
              />
            </Field>
            <Field label="Instagram">
              <input
                name="instagram"
                value={instagram}
                onChange={(event) => setInstagram(event.target.value)}
                className={inputClass}
                placeholder="@usuario"
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr,1fr]">
            <Field label="Ordem">
              <input
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={nextSortOrder}
                className={inputClass}
              />
            </Field>
            <label className="flex min-h-12 items-center gap-3 self-end rounded-[1rem] border border-white/10 bg-black/20 px-4 text-sm text-white/70">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 accent-aaau-ember"
              />
              Exibir no site
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SubmitButton label="Cadastrar" />
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
          </div>
        </form>
      </section>

      <section className="space-y-5">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
            Diretorias
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {areas.map((area) => (
              <a
                key={area.recordId}
                href={`#area-${area.recordId}`}
                className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60 transition hover:border-white/25 hover:text-white"
              >
                {area.title} · {area.members.length}
              </a>
            ))}
          </div>
        </div>
        {areas.map((area) => (
          <article
            key={area.recordId}
            id={`area-${area.recordId}`}
            className="rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.22)]"
          >
            <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                  {area.title}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-white">
                  {area.members.length} integrantes
                </h2>
              </div>
              <p className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/55">
                {area.members.filter((member) => member.isActive).length} ativos no site
              </p>
            </div>

            <div className="mt-4 space-y-4">
              {area.members.length === 0 ? (
                <p className="rounded-[1.2rem] border border-dashed border-white/10 p-4 text-sm text-white/55">
                  Nenhum integrante cadastrado nesta diretoria.
                </p>
              ) : (
                area.members.map((member) => (
                  <div key={member.id} className="space-y-2">
                    <div className="flex flex-col gap-4 rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5">
                          {member.image ? (
                            <Image
                              src={member.image}
                              alt={member.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center font-semibold uppercase text-white/40">
                              {member.name.slice(0, 1)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-white">{member.name}</p>
                            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
                              {member.isActive ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                          <p className="text-sm text-white/58">{member.role || "Sem cargo"}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/35">
                            Ordem {member.sortOrder}
                            {member.instagram ? ` - @${member.instagram}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <form action={toggleManagementMemberAction}>
                          <input type="hidden" name="memberId" value={member.id} />
                          <input
                            type="hidden"
                            name="isActive"
                            value={String(!member.isActive)}
                          />
                          <IconSubmitButton label={member.isActive ? "Inativar" : "Ativar"} />
                        </form>
                        <form action={deleteManagementMemberAction}>
                          <input type="hidden" name="memberId" value={member.id} />
                          <IconSubmitButton
                            label="Remover"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                          />
                        </form>
                      </div>
                    </div>
                    <MemberEditForm member={member} areas={areas} />
                  </div>
                ))
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
