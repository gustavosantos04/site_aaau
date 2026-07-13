"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  authenticateAdmin,
  checkAdminLoginRateLimit,
  createAdminSession,
  getAdminAuthMissingMessage,
} from "@/lib/auth";

export type AdminLoginFormState = {
  status: "idle" | "error";
  message?: string;
};

export async function loginAdminAction(
  _prevState: AdminLoginFormState,
  formData: FormData,
): Promise<AdminLoginFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const missingMessage = getAdminAuthMissingMessage();
  const headerStore = await headers();
  const loginIp =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    "unknown";

  if (missingMessage) {
    return {
      status: "error",
      message: missingMessage,
    };
  }

  if (!checkAdminLoginRateLimit(loginIp)) {
    return {
      status: "error",
      message: "Muitas tentativas de login. Aguarde alguns minutos.",
    };
  }

  const actor = await authenticateAdmin(email, password);

  if (!actor) {
    return {
      status: "error",
      message: "Credenciais inválidas.",
    };
  }

  await createAdminSession(actor);
  if (actor.role === "event_staff") redirect("/portaria" as never);
  redirect("/admin");
}
