"use server";

import { redirect } from "next/navigation";

import { clearAdminSession } from "@/lib/auth";

export async function logoutAdminAction() {
  await clearAdminSession();
  redirect("/admin/login");
}
