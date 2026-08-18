import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

import { buildEventCheckoutParticipantPayload } from "@/lib/events/checkout-payload";
import {
  checkoutDomainFieldErrors,
  checkoutSchemaValidationResponse,
} from "@/lib/events/checkout-validation";
import { InvalidParticipantDataError } from "@/lib/events/errors";

let cleanup: (() => void) | undefined;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;
const originalFetch = globalThis.fetch;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://aaau.test/eventos/promo/checkout" });
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    React,
    self: dom.window,
    sessionStorage: dom.window.sessionStorage,
  })) Object.defineProperty(globalThis, name, { configurable: true, value });
  const library = await import("@testing-library/react");
  cleanup = library.cleanup;
  fireEvent = library.fireEvent;
  render = library.render;
  screen = library.screen;
  waitFor = library.waitFor;
});

afterEach(() => {
  cleanup?.();
  globalThis.fetch = originalFetch;
});

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

test("checkout 2 por 1 cria dois participantes por pacote e limita a dois pacotes", async () => {
  const { EventCheckoutForm } = await import("@/components/events/event-checkout-form");
  render(<EventCheckoutForm event={{
    slug: "promo",
    name: "Evento promocional",
    startAt: "2026-08-15T23:00:00.000Z",
    venueName: "Arena",
    currentLotId: "promo-lot",
    currentLotName: "Lote Promocional - 2 por 1",
    currentLotPrice: "130.00",
    ticketsPerUnit: 2,
    maxUnitsPerOrder: 2,
    requireParticipantEmail: false,
    requireParticipantPhone: false,
    requireBirthDate: false,
    requireInstitution: false,
    requireCourse: false,
    requireCampus: false,
  }} />);

  assert.ok(screen.getByText("Participante 1"));
  assert.ok(screen.getByText("Participante 2"));
  assert.equal(screen.queryByText("Participante 3"), null);
  assert.ok(screen.getByText(/R\$\s*130,00 por pacote com 2 ingressos/));

  const increase = screen.getByRole("button", { name: "Aumentar quantidade" });
  fireEvent.click(increase);
  assert.ok(screen.getByText("Participante 3"));
  assert.ok(screen.getByText("Participante 4"));
  assert.equal(increase.getAttribute("disabled"), "");
  assert.ok(screen.getByText("2 pacote(s)"));
  assert.ok(screen.getByText("Ingressos emitidos"));
  assert.ok(screen.getByText("4"));
});

test("erro de e-mail identifica o segundo participante e o campo correto", () => {
  assert.deepEqual(checkoutSchemaValidationResponse([{
    path: ["participants", 1, "email"],
  }]), {
    message: "O e-mail do Participante 2 é inválido.",
    code: "INVALID_PARTICIPANT_DATA",
    fieldErrors: { "participant-1-email": "Informe um e-mail válido." },
    details: {
      participantIndex: 1,
      field: "email",
      reason: "PARTICIPANT_EMAIL_INVALID",
    },
  });
});

test("erro de CPF usa classificacao de participante e o campo correto", () => {
  const error = new InvalidParticipantDataError(1, "cpf");
  assert.equal(error.code, "INVALID_PARTICIPANT_DATA");
  assert.equal(error.message, "O CPF do Participante 2 é inválido.");
  assert.deepEqual(checkoutDomainFieldErrors(error), {
    "participant-1-cpf": "Informe um CPF válido.",
  });
});

test("checkout apresenta no formulario o CPF invalido do segundo participante", async () => {
  const { EventCheckoutForm } = await import("@/components/events/event-checkout-form");
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: "O CPF do Participante 2 é inválido.",
    code: "INVALID_PARTICIPANT_DATA",
    fieldErrors: { "participant-1-cpf": "Informe um CPF válido." },
  }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

  render(<EventCheckoutForm event={{
    slug: "promo",
    name: "Evento promocional",
    startAt: "2026-08-15T23:00:00.000Z",
    venueName: "Arena",
    currentLotId: "promo-lot",
    currentLotName: "Lote Promocional - 2 por 1",
    currentLotPrice: "130.00",
    ticketsPerUnit: 2,
    maxUnitsPerOrder: 2,
    requireParticipantEmail: false,
    requireParticipantPhone: false,
    requireBirthDate: false,
    requireInstitution: false,
    requireCourse: false,
    requireCampus: false,
  }} />);

  const names = screen.getAllByLabelText(/Nome completo/);
  const cpfs = screen.getAllByLabelText(/CPF/);
  fireEvent.change(names[0], { target: { value: "Comprador Teste" } });
  fireEvent.change(cpfs[0], { target: { value: "52998224725" } });
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: "comprador@example.com" } });
  fireEvent.change(screen.getByLabelText(/WhatsApp/), { target: { value: "51999990000" } });
  fireEvent.change(names[1], { target: { value: "Participante Um" } });
  fireEvent.change(cpfs[1], { target: { value: "11144477735" } });
  fireEvent.change(names[2], { target: { value: "Participante Dois" } });
  fireEvent.change(cpfs[2], { target: { value: "12345678901" } });
  fireEvent.click(screen.getByRole("button", { name: "Ir para pagamento" }));

  await waitFor(() => assert.ok(screen.getByText("O CPF do Participante 2 é inválido.")));
  assert.ok(screen.getByText("Informe um CPF válido."));
});
