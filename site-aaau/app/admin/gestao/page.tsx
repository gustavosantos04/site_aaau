import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { ManagementMemberManager } from "@/components/admin/management-member-manager";
import { requireAdminSession } from "@/lib/auth";
import { getManagementAdminAreas } from "@/lib/data/management-store";

export const metadata: Metadata = {
  title: "Admin Gestao",
};

export default async function AdminManagementPage() {
  await requireAdminSession();

  const areas = await getManagementAdminAreas();

  return (
    <AdminShell
      activeHref="/admin/gestao"
      title="Gestao"
      description="Cadastre, edite, ordene, remova e inative integrantes por diretoria."
    >
      <ManagementMemberManager areas={areas} />
    </AdminShell>
  );
}
