"use server";

import { redirect } from "next/navigation";

export async function requestTransferAction(
  accessToken: string,
  ticketId: string,
  accessKind: "ORIGINAL_ORDER" | "INDIVIDUAL_GRANT",
  formData: FormData,
) {
  void accessToken;
  void ticketId;
  void accessKind;
  void formData;
  redirect("/meus-ingressos" as never);
}
