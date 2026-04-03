import { getManagementAreas } from "@/lib/data/management-store";

import { ManagementSectionClient } from "@/components/home/management-section-client";

export async function ManagementSection() {
  const areas = await getManagementAreas();

  return <ManagementSectionClient areas={areas} />;
}
