"use server";

import { redirect } from "next/navigation";

import { authenticateAdmin, createAdminSession, getAdminAuthMissingMessage } from "@/lib/auth";

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

  if (missingMessage) {
    return {
      status: "error",
      message: missingMessage,
    };
  }

  const isAuthenticated = await authenticateAdmin(email, password);

  if (!isAuthenticated) {
    return {
      status: "error",
      message: "Credenciais inválidas.",
    };
  }

  await createAdminSession(email);
  redirect("/admin");
}
