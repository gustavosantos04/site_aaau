import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { EventAdminForm } from "@/components/admin/event-admin-forms";
import { requireAdminRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Novo evento" };

export default async function NewAdminEventPage() {
  await requireAdminRole("super_admin");

  return (
    <AdminShell
      activeHref="/admin/eventos"
      title="Novo evento"
      description="Crie o rascunho comercial, configure datas, local e regras de participantes."
    >
      <EventAdminForm />
    </AdminShell>
  );
}
