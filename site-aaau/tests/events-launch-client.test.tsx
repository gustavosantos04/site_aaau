import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";

let cleanup: (() => void) | undefined;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://staging.example/" });
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    DOMException: dom.window.DOMException,
    Event: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent,
    React,
    sessionStorage: dom.window.sessionStorage,
    self: dom.window,
  })) Object.defineProperty(globalThis, name, { configurable: true, value });
  const testingLibrary = await import("@testing-library/react");
  cleanup = testingLibrary.cleanup;
  fireEvent = testingLibrary.fireEvent;
  render = testingLibrary.render;
  screen = testingLibrary.screen;
  waitFor = testingLibrary.waitFor;
});

afterEach(() => {
  cleanup?.();
  sessionStorage.clear();
});

function upcoming(overrides: Partial<Record<string, unknown>> = {}) {
  const serverNow = new Date();
  return {
    active: true,
    eventName: "Evento Futuro com Nome Longo para Teste",
    eventSlug: "evento-futuro",
    salesStartAt: new Date(serverNow.getTime() + 60_000).toISOString(),
    eventStartAt: new Date(serverNow.getTime() + 86_400_000).toISOString(),
    venueName: "Local de teste",
    coverImage: null,
    serverNow: serverNow.toISOString(),
    ...overrides,
  };
}

function responseJson(value: unknown) {
  return Promise.resolve(new Response(JSON.stringify(value), { status: 200 }));
}

test("popup aparece uma vez por sessao e uma nova abertura pode aparecer", async () => {
  const { UpcomingSalePopup } = await import("@/components/events/upcoming-sale-popup");
  let payload = upcoming();
  globalThis.fetch = async () => responseJson(payload);
  const first = render(<UpcomingSalePopup />);
  await screen.findByRole("dialog");
  assert.ok(screen.getByText("Evento Futuro com Nome Longo para Teste"));
  fireEvent.click(screen.getByRole("button", { name: /fechar aviso/i }));
  assert.equal(screen.queryByRole("dialog"), null);

  first.unmount();
  render(<UpcomingSalePopup />);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(screen.queryByRole("dialog"), null);

  cleanup?.();
  payload = upcoming({ salesStartAt: new Date(Date.now() + 120_000).toISOString() });
  render(<UpcomingSalePopup />);
  await screen.findByRole("dialog");
});

test("popup nao aparece sem proxima venda e Escape fecha preservando foco", async () => {
  const { UpcomingSalePopup } = await import("@/components/events/upcoming-sale-popup");
  globalThis.fetch = async () => responseJson({ active: false, serverNow: new Date().toISOString() });
  render(<UpcomingSalePopup />);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(screen.queryByRole("dialog"), null);

  cleanup?.();
  globalThis.fetch = async () => responseJson(upcoming());
  render(<UpcomingSalePopup />);
  await screen.findByRole("dialog");
  await waitFor(() => assert.equal(document.activeElement?.getAttribute("aria-label"), "Fechar aviso do evento"));
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
});

test("contador nunca fica negativo e ao zerar consulta novamente o servidor", async () => {
  const { UpcomingSalePopup } = await import("@/components/events/upcoming-sale-popup");
  const now = new Date();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return responseJson(calls === 1 ? upcoming({ serverNow: now.toISOString(), salesStartAt: new Date(now.getTime() + 100).toISOString() }) : { active: false, serverNow: new Date().toISOString() });
  };
  render(<UpcomingSalePopup />);
  await screen.findByRole("dialog");
  await waitFor(() => assert.ok(calls >= 2), { timeout: 2500 });
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));

  const { countdownParts } = await import("@/components/events/event-sale-countdown");
  assert.deepEqual(countdownParts(-1000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});
