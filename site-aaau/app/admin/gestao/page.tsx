import type { Metadata } from "next";

import { ManagementAreaForm } from "@/components/admin/management-area-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth";
import { serializeManagementMembers } from "@/lib/data/management";
import { getManagementAreas } from "@/lib/data/management-store";

export const metadata: Metadata = {
  title: "Admin Gestão",
};

export default async function AdminManagementPage() {
  await requireAdminSession();

  const areas = await getManagementAreas();

  return (
    <AdminShell
      activeHref="/admin/gestao"
      title="Gestão"
      description="Edite os integrantes de cada frente da gestão sem depender de mudanças no código."
    >
      <article className="rounded-[1.8rem] border border-aaau-ember/20 bg-aaau-ember/10 p-5 text-sm leading-7 text-white/75">
        <p className="font-semibold uppercase tracking-[0.18em] text-white">Como preencher</p>
        <p className="mt-3">
          Em cada área, use uma linha por integrante no formato <strong>Nome | Cargo | URL da foto</strong>.
          O cargo e a foto são opcionais. Se a gestão mudar, basta editar as linhas e clicar em
          salvar.
        </p>
      </article>

      <div className="space-y-5">
        {areas.map((area) => (
          <ManagementAreaForm
            key={area.id}
            area={area}
            membersText={serializeManagementMembers(area.members)}
          />
        ))}
      </div>
    </AdminShell>
  );
}
