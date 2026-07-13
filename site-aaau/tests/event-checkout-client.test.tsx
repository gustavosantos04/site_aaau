import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEventCheckoutParticipantPayload } from "@/lib/events/checkout-payload";

const participant = {
  name: "  Participante Teste  ",
  cpf: "123.456.789-00",
  email: "",
  phone: "",
  birthDate: "",
  institution: "",
  course: "",
  campus: "",
};

test("participante sem dados adicionais envia somente name e cpf", () => {
  assert.deepEqual(buildEventCheckoutParticipantPayload(participant), {
    name: "Participante Teste",
    cpf: "12345678900",
  });
});

test("campos opcionais vazios ou contendo espacos sao omitidos", () => {
  const payload = buildEventCheckoutParticipantPayload({
    ...participant,
    email: "   ",
    institution: "   ",
    campus: "\t",
  });

  for (const field of ["email", "phone", "birthDate", "institution", "course", "campus"]) {
    assert.equal(field in payload, false, field);
  }
});

test("campos opcionais preenchidos continuam no payload normalizados", () => {
  assert.deepEqual(buildEventCheckoutParticipantPayload({
    ...participant,
    email: "  participante@example.com ",
    phone: "(51) 99999-0000",
    birthDate: "2000-01-02",
    institution: "  Universidade  ",
    course: "  Engenharia  ",
    campus: "  Centro  ",
  }), {
    name: "Participante Teste",
    cpf: "12345678900",
    email: "participante@example.com",
    phone: "51999990000",
    birthDate: "2000-01-02",
    institution: "Universidade",
    course: "Engenharia",
    campus: "Centro",
  });
});
