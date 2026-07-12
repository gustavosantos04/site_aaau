export type EventCheckoutParticipantDraft = {
  name: string;
  cpf: string;
  email: string;
  phone: string;
  birthDate: string;
  institution: string;
  course: string;
  campus: string;
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function buildEventCheckoutParticipantPayload(
  participant: EventCheckoutParticipantDraft,
) {
  const name = participant.name.trim();
  const cpf = digits(participant.cpf);
  const email = participant.email.trim();
  const phone = digits(participant.phone);
  const birthDate = participant.birthDate.trim();
  const institution = participant.institution.trim();
  const course = participant.course.trim();
  const campus = participant.campus.trim();

  return {
    name,
    cpf,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(institution ? { institution } : {}),
    ...(course ? { course } : {}),
    ...(campus ? { campus } : {}),
  };
}
