import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

let cleanup: (() => void) | undefined;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://aaau.test/" });
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, React, self: dom.window,
  })) Object.defineProperty(globalThis, name, { configurable: true, value });
  const library = await import("@testing-library/react");
  cleanup = library.cleanup;
  render = library.render;
  screen = library.screen;
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

test("controles do painel oferecem confirmacao, labels e feedback acessivel", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } });
  const { PortalTransferForm, CopyTicketCodeButton } = await import("@/components/events/portal-controls");
  render(<><PortalTransferForm ticketId="ticket-safe" /><CopyTicketCodeButton code="ABC123" /></>);
  assert.ok(screen.getByRole("textbox", { name: "E-mail do destinatário" }));
  assert.ok(screen.getByRole("checkbox", { name: /confirmo que desejo/i }));
  assert.ok(screen.getByRole("button", { name: "Transferir ingresso" }));
  assert.ok(screen.getByRole("button", { name: "Copiar código" }));
  assert.ok(screen.getAllByRole("status").length >= 1);
  assert.ok(screen.getByText(/apenas transfere a titularidade/i));
  assert.ok(screen.getByText(/não são processados nem garantidos/i));
  assert.ok(screen.getByText(/somente após o aceite do novo titular/i));
  assert.ok(screen.getByText(/QR e o código anteriores deixam de funcionar/i));
  assert.ok(screen.getByText(/Ingressos utilizados não podem ser transferidos/i));
});
