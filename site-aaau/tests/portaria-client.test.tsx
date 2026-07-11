import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";
import { BrowserQRCodeReader } from "@zxing/browser";

type ScanCallback = (result?: { getText(): string }) => void;

let cleanup: (() => void) | undefined;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;
let scanCallback: ScanCallback | undefined;
let decoderStops = 0;
let decoderStarts = 0;
let trackStops = 0;

const ticket = {
  participantName: "Participante com nome operacional longo para validar o card",
  participantCpfMasked: "***.***.***-42",
  ticketCode: "TKT-PORTARIA-01",
  lotName: "Lote 1",
  eventName: "Evento teste",
  ticketStatus: "VALID",
  checkedInAt: null,
};

before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/portaria" });
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement,
    DOMException: dom.window.DOMException,
    Event: dom.window.Event,
    React,
  })) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => { trackStops += 1; } }],
      }),
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, "srcObject", { configurable: true, writable: true });

  const testingLibrary = await import("@testing-library/react");
  cleanup = testingLibrary.cleanup;
  fireEvent = testingLibrary.fireEvent;
  render = testingLibrary.render;
  screen = testingLibrary.screen;
  waitFor = testingLibrary.waitFor;

  BrowserQRCodeReader.prototype.decodeFromVideoDevice = async function (_deviceId, _element, callback) {
    decoderStarts += 1;
    scanCallback = callback as ScanCallback;
    return { stop: () => { decoderStops += 1; } } as never;
  };
});

afterEach(() => {
  cleanup?.();
  scanCallback = undefined;
  decoderStops = 0;
  decoderStarts = 0;
  trackStops = 0;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

async function renderClient() {
  const { PortariaEventClient } = await import("@/components/portaria/portaria-event-client");
  return render(<PortariaEventClient eventId="event-client-test" initialRecentEntries={[]} />);
}

function jsonResponse(value: unknown) {
  return Promise.resolve(new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } }));
}

function emitScan(payload = "tk_abcdefghijklmnop") {
  assert.ok(scanCallback);
  scanCallback({ getText: () => payload });
}

test("scanner pausa no primeiro QR, deduplica frames e exige confirmacao humana", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/validate")) return jsonResponse({ status: "VALID", ticket });
    return jsonResponse({ status: "CHECKED_IN", ticket: { ...ticket, ticketStatus: "USED" } });
  };
  const view = await renderClient();

  fireEvent.click(screen.getByRole("button", { name: /abrir leitor/i }));
  fireEvent.click(screen.getByRole("button", { name: /abrir leitor/i }));
  await waitFor(() => assert.equal(decoderStarts, 1));

  emitScan();
  emitScan();
  await screen.findByText("INGRESSO VALIDO");
  assert.equal(calls.filter((url) => url.endsWith("/validate")).length, 1);
  assert.equal(calls.filter((url) => url.endsWith("/check-in")).length, 0);
  assert.ok(decoderStops >= 1);

  fireEvent.click(screen.getByRole("button", { name: /^confirmar entrada$/i }));
  await screen.findByText("CHECK-IN REALIZADO");
  assert.equal(calls.filter((url) => url.endsWith("/check-in")).length, 1);

  view.unmount();
  assert.ok(decoderStops >= 1);
  assert.ok(trackStops >= 1);
});

test("estados nao validos nunca oferecem confirmacao e cancelar reinicia o leitor", async () => {
  const states = {
    ALREADY_USED: "INGRESSO JA UTILIZADO",
    CANCELED: "INGRESSO CANCELADO",
    REFUNDED: "INGRESSO REEMBOLSADO",
    WRONG_EVENT: "INGRESSO DE OUTRO EVENTO",
    INVALID: "QR CODE INVALIDO",
  } as const;
  for (const [status, title] of Object.entries(states) as [keyof typeof states, string][]) {
    cleanup?.();
    scanCallback = undefined;
    globalThis.fetch = async () => jsonResponse({ status, ticket: status === "INVALID" || status === "WRONG_EVENT" ? null : ticket });
    await renderClient();
    fireEvent.click(screen.getByRole("button", { name: /abrir leitor/i }));
    await waitFor(() => assert.ok(scanCallback));
    emitScan();
    await screen.findByText(title);
    assert.equal(screen.queryByRole("button", { name: /^confirmar entrada$/i }), null);
    const cancel = screen.getByRole("button", { name: /cancelar.*voltar/i });
    if (status === "ALREADY_USED") {
      const startsBeforeCancel = decoderStarts;
      fireEvent.click(cancel);
      await waitFor(() => assert.ok(decoderStarts > startsBeforeCancel));
    }
  }
});

test("offline bloqueia confirmacao e resposta perdida nao apresenta sucesso falso", async () => {
  globalThis.fetch = async () => jsonResponse({ status: "VALID", ticket });
  await renderClient();
  fireEvent.click(screen.getByRole("button", { name: /abrir leitor/i }));
  await waitFor(() => assert.ok(scanCallback));
  emitScan();
  await screen.findByText("INGRESSO VALIDO");

  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  window.dispatchEvent(new Event("offline"));
  await screen.findByText(/SEM CONEXAO/);
  assert.equal((screen.getByRole("button", { name: /^confirmar entrada$/i }) as HTMLButtonElement).disabled, true);

  cleanup?.();
  scanCallback = undefined;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  globalThis.fetch = async () => { throw new DOMException("timeout", "AbortError"); };
  await renderClient();
  fireEvent.click(screen.getByRole("button", { name: /abrir leitor/i }));
  await waitFor(() => assert.ok(scanCallback));
  emitScan();
  await screen.findByText("QR CODE INVALIDO");
  assert.ok(screen.getByText(/Nao recebemos a confirmacao do servidor/i));
  assert.equal(screen.queryByText("CHECK-IN REALIZADO"), null);
});

test("camera negada e visibilitychange interrompem recursos", async () => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => { throw new DOMException("denied", "NotAllowedError"); } },
  });
  await renderClient();
  fireEvent.click(screen.getByRole("button", { name: /abrir leitor/i }));
  await screen.findByText(/Permissao da camera negada/i);

  cleanup?.();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { trackStops += 1; } }] }) },
  });
  await renderClient();
  const startsBeforeOpen = decoderStarts;
  fireEvent.click(screen.getByRole("button", { name: /abrir leitor/i }));
  await waitFor(() => assert.ok(decoderStarts > startsBeforeOpen));
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  document.dispatchEvent(new Event("visibilitychange"));
  assert.ok(decoderStops >= 1);
});
