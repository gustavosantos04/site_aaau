"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth";
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

const memberSchema = z.object({
  memberId: z.string().optional(),
  areaRecordId: z.string().min(1, "Selecione a diretoria."),
  name: z.string().trim().min(2, "Informe o nome completo."),
  role: z.string().trim().optional(),
  image: z.string().trim().optional(),
  instagram: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().min(0, "A ordem precisa ser zero ou maior."),
  isActive: z.coerce.boolean().default(false),
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
  await requireAdminSession();

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
                instagram: member.instagram ?? null,
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

function normalizeInstagram(value?: string) {
  if (!value) {
    return null;
  }

  return value.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").trim() || null;
}

function parseMemberForm(formData: FormData) {
  return memberSchema.safeParse({
    memberId: formData.get("memberId")?.toString() || undefined,
    areaRecordId: formData.get("areaRecordId"),
    name: formData.get("name"),
    role: formData.get("role")?.toString() || undefined,
    image: formData.get("image")?.toString() || undefined,
    instagram: formData.get("instagram")?.toString() || undefined,
    sortOrder: formData.get("sortOrder") || 0,
    isActive: formData.get("isActive") === "on",
  });
}

export async function saveManagementMemberAction(
  _prevState: ManagementFormState,
  formData: FormData,
): Promise<ManagementFormState> {
  await requireAdminSession();

  if (!process.env.DATABASE_URL) {
    return {
      status: "error",
      message: "Configure o DATABASE_URL antes de salvar integrantes.",
    };
  }

  const parsed = parseMemberForm(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revise os campos do integrante.",
    };
  }

  try {
    const data = parsed.data;

    await ensureManagementAreaRecords();

    if (data.memberId) {
      await prisma.managementMemberRecord.update({
        where: { id: data.memberId },
        data: {
          areaId: data.areaRecordId,
          name: data.name,
          role: data.role || null,
          image: data.image || null,
          instagram: normalizeInstagram(data.instagram),
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        },
      });
    } else {
      await prisma.managementMemberRecord.create({
        data: {
          areaId: data.areaRecordId,
          name: data.name,
          role: data.role || null,
          image: data.image || null,
          instagram: normalizeInstagram(data.instagram),
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        },
      });
    }

    revalidatePath("/");
    revalidatePath("/admin/gestao");

    return {
      status: "success",
      message: data.memberId ? "Integrante atualizado." : "Integrante cadastrado.",
    };
  } catch {
    return {
      status: "error",
      message: "Nao foi possivel salvar este integrante.",
    };
  }
}

export async function toggleManagementMemberAction(formData: FormData) {
  await requireAdminSession();

  const memberId = formData.get("memberId")?.toString();
  const isActive = formData.get("isActive") === "true";

  if (!memberId || !process.env.DATABASE_URL) {
    return;
  }

  await prisma.managementMemberRecord.update({
    where: { id: memberId },
    data: { isActive },
  });

  revalidatePath("/");
  revalidatePath("/admin/gestao");
}

export async function deleteManagementMemberAction(formData: FormData) {
  await requireAdminSession();

  const memberId = formData.get("memberId")?.toString();

  if (!memberId || !process.env.DATABASE_URL) {
    return;
  }

  await prisma.managementMemberRecord.delete({
    where: { id: memberId },
  });

  revalidatePath("/");
  revalidatePath("/admin/gestao");
}
