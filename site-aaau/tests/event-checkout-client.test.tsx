import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

import { buildEventCheckoutParticipantPayload } from "@/lib/events/checkout-payload";

let cleanup: (() => void) | undefined;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;

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
});

afterEach(() => cleanup?.());

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
