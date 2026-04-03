import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import {
  buildManagementAreas,
  managementAreaBlueprints,
  type ManagementArea,
  type ManagementMember,
} from "@/lib/data/management";

async function withFallback<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("Database disabled");
    }

    return await query();
  } catch {
    return fallback;
  }
}

export async function getManagementAreas(): Promise<ManagementArea[]> {
  noStore();

  return withFallback(
    async () => {
      const records = await prisma.managementAreaRecord.findMany({
        include: {
          members: {
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      const membersByArea = Object.fromEntries(
        records.map((record) => [
          record.slug,
          record.members.map(
            (member): ManagementMember => ({
              name: member.name,
              role: member.role ?? undefined,
              image: member.image ?? undefined,
            }),
          ),
        ]),
      );

      return buildManagementAreas(membersByArea);
    },
    buildManagementAreas(),
  );
}

export async function ensureManagementAreaRecords() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Database disabled");
  }

  await Promise.all(
    managementAreaBlueprints.map((area) =>
      prisma.managementAreaRecord.upsert({
        where: { slug: area.id },
        update: {
          title: area.title,
        },
        create: {
          slug: area.id,
          title: area.title,
        },
      }),
    ),
  );
}
