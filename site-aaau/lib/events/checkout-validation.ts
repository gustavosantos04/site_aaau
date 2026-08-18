import type { EventDomainError } from "@/lib/events/errors";

type CheckoutValidationIssue = {
  path: PropertyKey[];
};

export function checkoutSchemaValidationResponse(issues: CheckoutValidationIssue[]) {
  for (const issue of issues) {
    const [scope, participantIndex, field] = issue.path;
    if (scope === "participants" && typeof participantIndex === "number" && field === "email") {
      return {
        message: `O e-mail do Participante ${participantIndex + 1} é inválido.`,
        code: "INVALID_PARTICIPANT_DATA",
        fieldErrors: { [`participant-${participantIndex}-email`]: "Informe um e-mail válido." },
        details: { participantIndex, field, reason: "PARTICIPANT_EMAIL_INVALID" },
      };
    }
  }

  return { message: "Revise os dados obrigatórios do checkout." };
}

export function checkoutDomainFieldErrors(error: EventDomainError) {
  if (error.code !== "INVALID_PARTICIPANT_DATA") return undefined;
  const participantIndex = error.details?.participantIndex;
  const field = error.details?.field;
  if (typeof participantIndex !== "number" || typeof field !== "string") return undefined;
  return {
    [`participant-${participantIndex}-${field}`]: field === "cpf" ? "Informe um CPF válido." : "Revise este campo.",
  };
}
