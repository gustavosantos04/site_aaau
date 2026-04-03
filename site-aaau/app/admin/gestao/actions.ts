"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { managementAreaBlueprints, type ManagementMember } from "@/lib/data/management";
import { ensureManagementAreaRecords } from "@/lib/data/management-store";

export type ManagementFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const formSchema = z.object({
  areaId: z.string().min(1),
  membersText: z.string(),
});

function parseMembersInput(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const members: ManagementMember[] = lines.map((line, index) => {
    const [name, role, image] = line.split("|").map((part) => part.trim());

    if (!name) {
      throw new Error(`A linha ${index + 1} precisa começar com o nome do integrante.`);
    }

    return {
      name,
      role: role || undefined,
      image: image || undefined,
    };
  });

  return members;
}

export async function saveManagementAreaMembersAction(
  _prevState: ManagementFormState,
  formData: FormData,
): Promise<ManagementFormState> {
  const parsed = formSchema.safeParse({
    areaId: formData.get("areaId"),
    membersText: formData.get("membersText"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Dados inválidos. Revise a área e a lista de integrantes.",
    };
  }

  const area = managementAreaBlueprints.find((item) => item.id === parsed.data.areaId);

  if (!area) {
    return {
      status: "error",
      message: "Área de gestão não encontrada.",
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      status: "error",
      message: "Configure o DATABASE_URL antes de salvar mudanças da gestão.",
    };
  }

  try {
    const members = parseMembersInput(parsed.data.membersText);

    await ensureManagementAreaRecords();

    const areaRecord = await prisma.managementAreaRecord.findUnique({
      where: { slug: area.id },
      select: { id: true },
    });

    if (!areaRecord) {
      return {
        status: "error",
        message: "Não foi possível localizar a área no banco.",
      };
    }

    await prisma.$transaction([
      prisma.managementMemberRecord.deleteMany({
        where: { areaId: areaRecord.id },
      }),
      ...(members.length > 0
        ? [
            prisma.managementMemberRecord.createMany({
              data: members.map((member, index) => ({
                areaId: areaRecord.id,
                name: member.name,
                role: member.role ?? null,
                image: member.image ?? null,
                sortOrder: index,
                isActive: true,
              })),
            }),
          ]
        : []),
    ]);

    revalidatePath("/");
    revalidatePath("/admin/gestao");

    return {
      status: "success",
      message: `Integrantes de ${area.title} atualizados.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar os integrantes desta área.",
    };
  }
}
