import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

let cleanup: (() => void) | undefined;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let fireEvent: typeof import("@testing-library/react").fireEvent;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://aaau.test/" });
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, React, self: dom.window,
  })) Object.defineProperty(globalThis, name, { configurable: true, value });
  const library = await import("@testing-library/react");
  cleanup = library.cleanup;
  render = library.render;
  screen = library.screen;
  fireEvent = library.fireEvent;
});

afterEach(() => cleanup?.());

test("aviso de ingresso transferido nao renderiza QR, codigo ou dados do novo titular", async () => {
  const { TransferredTicketNotice } = await import("@/components/events/transferred-ticket-notice");
  const rendered = render(<TransferredTicketNotice />);
  assert.ok(screen.getByRole("heading", { name: "Ingresso transferido" }));
  assert.ok(screen.getByText("Este ingresso não está mais disponível neste acesso."));
  const html = rendered.container.innerHTML;
  assert.equal(html.includes("qr-secreto"), false);
  assert.equal(html.includes("CODIGO-SECRETO"), false);
  assert.equal(html.includes("nova.titular@example.com"), false);
  assert.equal(rendered.container.querySelector("svg"), null);
});

test("formulario da central e acessivel, responsivo e previne envio duplicado", async () => {
  const { PortalAccessForm } = await import("@/components/events/portal-access-form");
  const rendered = render(<PortalAccessForm initialMessage="Resposta neutra" />);
  assert.ok(screen.getByRole("textbox", { name: "E-mail usado nos ingressos" }));
  assert.ok(screen.getByRole("button", { name: "Enviar link de acesso" }));
  assert.ok(screen.getByRole("status"));
  assert.ok(screen.getByText("Resposta neutra"));
  assert.ok(rendered.container.innerHTML.includes("w-full"));
  assert.equal(rendered.container.querySelector("input")?.getAttribute("autocomplete"), "email");
});

test("central mantem resposta neutra e agenda somente a outbox recem-persistida", () => {
  const source = readFileSync(path.join(process.cwd(), "app/meus-ingressos/actions.ts"), "utf8");
  assert.match(source, /const PORTAL_NEUTRAL_MESSAGE = "Se encontrarmos ingressos vinculados a esse e-mail, enviaremos um link de acesso\."/);
  assert.match(source, /portalOutboxIds: \[result\.outboxId\]/);
  assert.match(source, /catch \{[\s\S]*return \{ message: PORTAL_NEUTRAL_MESSAGE \};/);
  assert.doesNotMatch(source, /processEventTicketPortalOutbox\(\{\s*limit:/);
});

test("transferencia direta coleta dados, revisa titular e exige confirmacao final", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } });
  const { PortalTransferForm, CopyTicketCodeButton } = await import("@/components/events/portal-controls");
  render(<><PortalTransferForm ticketId="ticket-safe" requestId="request-safe-123456" event={{
    startAt: "2026-08-22T02:00:00.000Z",
    minimumAge: 18,
    requireParticipantPhone: true,
    requireInstitution: true,
    requireCourse: true,
    requireCampus: true,
  }} /><CopyTicketCodeButton code="ABC123" /></>);
  assert.ok(screen.getByText(/apenas transfere a titularidade/i));
  assert.ok(screen.getByText(/não são processados nem garantidos/i));
  assert.ok(screen.getByText(/concluída imediatamente/i));
  assert.ok(screen.getByText(/Ingressos utilizados não podem ser transferidos/i));
  fireEvent.change(screen.getByRole("textbox", { name: "Nome completo" }), { target: { value: "Bruna Teste" } });
  fireEvent.change(screen.getByRole("textbox", { name: "CPF" }), { target: { value: "52998224725" } });
  fireEvent.change(screen.getByRole("textbox", { name: "E-mail" }), { target: { value: "bruna@event-test.local" } });
  fireEvent.change(screen.getByLabelText(/Data de nascimento/i), { target: { value: "2000-01-15" } });
  fireEvent.change(screen.getByRole("textbox", { name: "WhatsApp" }), { target: { value: "51999990000" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Instituição" }), { target: { value: "Universidade Teste" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Curso" }), { target: { value: "Direito" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Campus" }), { target: { value: "Centro" } });
  fireEvent.click(screen.getByRole("button", { name: "Revisar transferência" }));
  assert.ok(screen.getByText("Você está transferindo este ingresso para:"));
  assert.ok(screen.getByText("***.***.***-25"));
  assert.ok(screen.getByRole("button", { name: "CONFIRMAR TRANSFERÊNCIA" }));
  assert.ok(screen.getByRole("button", { name: "Copiar código" }));
  assert.ok(screen.getAllByRole("status").length >= 1);
  assert.ok(screen.getByText(/não exige aceite/i));
  assert.ok(screen.getByText(/novo titular receberá uma nova credencial/i));
});

test("aceite exige nascimento por idade minima e mantem erro corrigivel no formulario", async () => {
  const { TransferRecipientForm } = await import("@/components/events/transfer-recipient-form");
  const event = {
    name: "Evento 18+",
    startAt: new Date("2026-08-22T02:00:00.000Z"),
    venueName: "Arena",
    venueAddress: null,
    requireParticipantPhone: false,
    requireBirthDate: false,
    requireInstitution: false,
    requireCourse: false,
    requireCampus: false,
    minimumAge: 18,
  };
  const rendered = render(
    <TransferRecipientForm
      event={event}
      lotName="Lote"
      recipientEmail="destino@event-test.local"
      inputError
      acceptAction={async () => undefined}
      rejectAction={async () => undefined}
    />,
  );
  const birthDate = screen.getByLabelText(/Nascimento \(idade mínima: 18 anos\)/i);
  assert.equal(birthDate.getAttribute("required"), "");
  assert.equal(birthDate.getAttribute("max"), "2008-08-22");
  assert.ok(screen.getByRole("alert"));
  assert.match(screen.getByRole("alert").textContent ?? "", /pode tentar novamente/i);

  cleanup?.();
  const unrestricted = render(
    <TransferRecipientForm
      event={{ ...event, name: "Evento livre", minimumAge: null }}
      lotName="Lote"
      recipientEmail="destino@event-test.local"
      acceptAction={async () => undefined}
      rejectAction={async () => undefined}
    />,
  );
  assert.equal(unrestricted.container.querySelector('input[name="birthDate"]'), null);
});

test("links legados nao trocam token por cookie nem executam aceite", () => {
  const acceptRoute = readFileSync(path.join(process.cwd(), "app/transferencia-ingresso/aceitar/[token]/route.ts"), "utf8");
  const confirmRoute = readFileSync(path.join(process.cwd(), "app/transferencia-ingresso/confirmar/[token]/route.ts"), "utf8");
  const actions = readFileSync(path.join(process.cwd(), "app/transferencia-ingresso/actions.ts"), "utf8");
  assert.match(acceptRoute, /cancelada\?legado=1/);
  assert.match(confirmRoute, /cancelada\?legado=1/);
  assert.doesNotMatch(acceptRoute, /exchangeEventTicketTransferUrlToken/);
  assert.doesNotMatch(confirmRoute, /exchangeEventTicketTransferUrlToken/);
  assert.doesNotMatch(actions, /acceptEventTicketTransfer/);
  assert.doesNotMatch(actions, /confirmEventTicketTransfer/);
});

test("admin deixa explicita e ativa a exigencia de nascimento quando ha idade minima", () => {
  const form = readFileSync(path.join(process.cwd(), "components/admin/event-admin-forms.tsx"), "utf8");
  const action = readFileSync(path.join(process.cwd(), "app/admin/eventos/actions.ts"), "utf8");
  assert.match(form, /ageRequiresBirthDate/);
  assert.match(form, /Ativado automaticamente porque o evento possui classificacao minima/);
  assert.match(action, /requireBirthDate: minimumAge !== null \|\| bool\(formData, "requireBirthDate"\)/);
});
