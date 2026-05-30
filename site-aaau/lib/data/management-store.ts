import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import {
  buildManagementAreas,
  managementAreaBlueprints,
  type ManagementArea,
  type ManagementMember,
} from "@/lib/data/management";

export type ManagementAdminMember = ManagementMember & {
  id: string;
  areaId: string;
  sortOrder: number;
  isActive: boolean;
};

export type ManagementAdminArea = Omit<ManagementArea, "members"> & {
  recordId: string;
  members: ManagementAdminMember[];
};

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
              instagram: member.instagram ?? undefined,
            }),
          ),
        ]),
      );

      return buildManagementAreas(membersByArea);
    },
    buildManagementAreas(),
  );
}

export async function getManagementAdminAreas(): Promise<ManagementAdminArea[]> {
  noStore();
  const fallback: ManagementAdminArea[] = buildManagementAreas().map((area) => ({
    ...area,
    recordId: area.id,
    members: area.members.map((member, memberIndex) => ({
      id: `${area.id}-${memberIndex}`,
      areaId: area.id,
      name: member.name,
      role: member.role ?? undefined,
      image: member.image ?? undefined,
      instagram: member.instagram ?? undefined,
      sortOrder: memberIndex,
      isActive: true,
    })),
  }));

  return withFallback(
    async () => {
      await ensureManagementAreaRecords();

      const records = await prisma.managementAreaRecord.findMany({
        include: {
          members: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      const recordsBySlug = Object.fromEntries(records.map((record) => [record.slug, record]));

      return managementAreaBlueprints.map((area) => {
        const record = recordsBySlug[area.id];

        return {
          ...area,
          recordId: record.id,
          members: record.members.map((member) => ({
            id: member.id,
            areaId: member.areaId,
            name: member.name,
            role: member.role ?? undefined,
            image: member.image ?? undefined,
            instagram: member.instagram ?? undefined,
            sortOrder: member.sortOrder,
            isActive: member.isActive,
          })),
        };
      });
    },
    fallback,
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
