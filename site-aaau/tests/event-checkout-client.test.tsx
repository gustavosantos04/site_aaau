import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

import { buildEventCheckoutParticipantPayload } from "@/lib/events/checkout-payload";
import {
  checkoutDomainErrorResponse,
  checkoutSchemaValidationResponse,
} from "@/lib/events/checkout-validation";
import { InvalidParticipantDataError } from "@/lib/events/errors";
import { versionUpdateAction } from "@/lib/app-version";

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
    code: "invalid_string",
  }]), {
    status: 400,
    body: {
      message: "O e-mail do Participante 2 é inválido.",
      code: "INVALID_PARTICIPANT_DATA",
      field: "participants.1.email",
      participantIndex: 1,
    },
  });
});

test("schema associa nascimento invalido e dados do comprador aos campos corretos", () => {
  assert.deepEqual(checkoutSchemaValidationResponse([{
    path: ["participants", 2, "birthDate"],
    code: "invalid_string",
  }]), {
    status: 400,
    body: {
      code: "INVALID_PARTICIPANT_DATA",
      message: "Informe uma data de nascimento válida para o Participante 3.",
      field: "participants.2.birthDate",
      participantIndex: 2,
    },
  });
  assert.deepEqual(checkoutSchemaValidationResponse([{
    path: ["buyer", "email"],
    code: "invalid_string",
  }]), {
    status: 400,
    body: {
      code: "INVALID_BUYER_DATA",
      message: "O e-mail do comprador é inválido.",
      field: "buyer.email",
    },
  });
});

test("erro de CPF usa classificacao de participante e o campo correto", () => {
  const error = new InvalidParticipantDataError(1, "cpf", "PARTICIPANT_CPF_INVALID");
  assert.equal(error.code, "INVALID_PARTICIPANT_DATA");
  assert.equal(error.message, "O CPF do Participante 2 é inválido.");
  assert.deepEqual(checkoutDomainErrorResponse(error), {
    status: 400,
    body: {
      code: "INVALID_PARTICIPANT_DATA",
      message: "O CPF do Participante 2 é inválido.",
      field: "participants.1.cpf",
      participantIndex: 1,
    },
  });
});

test("checkout apresenta no formulario o CPF invalido do segundo participante", async () => {
  const { EventCheckoutForm } = await import("@/components/events/event-checkout-form");
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: "O CPF do Participante 2 é inválido.",
    code: "INVALID_PARTICIPANT_DATA",
    field: "participants.1.cpf",
    participantIndex: 1,
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

  await waitFor(() => assert.equal(screen.getAllByText("O CPF do Participante 2 é inválido.").length, 2));
  await waitFor(() => assert.equal(document.activeElement, cpfs[2]));
});

test("versao igual nao atualiza e versao nova recarrega pagina comum uma vez", () => {
  assert.equal(versionUpdateAction({
    loadedVersion: "build-a",
    currentVersion: "build-a",
    pathname: "/eventos",
    refreshAlreadyAttempted: false,
  }), "none");
  assert.equal(versionUpdateAction({
    loadedVersion: "build-a",
    currentVersion: "build-b",
    pathname: "/eventos",
    refreshAlreadyAttempted: false,
  }), "reload");
  assert.equal(versionUpdateAction({
    loadedVersion: "build-a",
    currentVersion: "build-b",
    pathname: "/eventos",
    refreshAlreadyAttempted: true,
  }), "prompt");
});

test("versao nova apenas avisa em checkout, retorno de pagamento e transferencia", () => {
  for (const pathname of [
    "/eventos/operacao-cachorrada/checkout",
    "/eventos/pagamento/sucesso",
    "/transferencia-ingresso/aceitar",
    "/admin/eventos",
  ]) {
    assert.equal(versionUpdateAction({
      loadedVersion: "build-a",
      currentVersion: "build-b",
      pathname,
      refreshAlreadyAttempted: false,
    }), "prompt", pathname);
  }
});
