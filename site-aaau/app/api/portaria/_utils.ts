import { NextResponse } from "next/server";

import { getAdminSession, type AdminActor } from "@/lib/auth";

export async function getPortariaApiActor() {
  const session = await getAdminSession();
  if (!session || (session.role !== "super_admin" && session.role !== "event_staff")) {
    return null;
  }
  return {
    email: session.email,
    role: session.role,
    adminUserId: session.adminUserId,
  } satisfies AdminActor;
}

export function unauthorizedJson() {
  return NextResponse.json(
    { status: "AUTH_REQUIRED", message: "Credenciais expiradas. Entre novamente." },
    { status: 401 },
  );
}

export function forbiddenJson() {
  return NextResponse.json(
    { status: "UNAUTHORIZED", message: "Acesso nao autorizado para este evento." },
    { status: 403 },
  );
}
