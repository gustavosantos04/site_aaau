"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, RotateCcw, Search, ShieldX, WifiOff, XCircle } from "lucide-react";

import { parseEventTicketQrPayload } from "@/lib/portaria-qr";

type TicketDto = {
  participantName: string;
  participantCpfMasked: string;
  ticketCode: string;
  lotName: string;
  eventName: string;
  ticketStatus: string;
  checkedInAt: string | null;
};

type ValidationResponse = {
  status: "VALID" | "ALREADY_USED" | "CANCELED" | "REFUNDED" | "INVALID" | "WRONG_EVENT" | "CHECKED_IN" | "AUTH_REQUIRED" | "UNAUTHORIZED";
  ticket: TicketDto | null;
  message?: string;
};

type RecentEntry = {
  checkedInAt: Date | string;
  participantName: string;
  ticketCode: string;
  operatorName: string;
};

type Props = {
  eventId: string;
  initialRecentEntries: RecentEntry[];
};

const statusCopy: Record<ValidationResponse["status"], { title: string; tone: string; icon: "ok" | "warn" | "bad" }> = {
  VALID: { title: "INGRESSO VALIDO", tone: "border-emerald-400 bg-emerald-500/18 text-emerald-50", icon: "ok" },
  CHECKED_IN: { title: "CHECK-IN REALIZADO", tone: "border-emerald-400 bg-emerald-500/18 text-emerald-50", icon: "ok" },
  ALREADY_USED: { title: "INGRESSO JA UTILIZADO", tone: "border-amber-300 bg-amber-500/18 text-amber-50", icon: "warn" },
  CANCELED: { title: "INGRESSO CANCELADO", tone: "border-red-400 bg-red-500/18 text-red-50", icon: "bad" },
  REFUNDED: { title: "INGRESSO REEMBOLSADO", tone: "border-red-400 bg-red-500/18 text-red-50", icon: "bad" },
  WRONG_EVENT: { title: "INGRESSO DE OUTRO EVENTO", tone: "border-red-400 bg-red-500/18 text-red-50", icon: "bad" },
  INVALID: { title: "QR CODE INVALIDO", tone: "border-red-400 bg-red-500/18 text-red-50", icon: "bad" },
  AUTH_REQUIRED: { title: "CREDENCIAIS EXPIRADAS", tone: "border-amber-300 bg-amber-500/18 text-amber-50", icon: "warn" },
  UNAUTHORIZED: { title: "ACESSO BLOQUEADO", tone: "border-red-400 bg-red-500/18 text-red-50", icon: "bad" },
};

function formatTime(value?: string | Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function requestJson(url: string, body: Record<string, unknown>, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return (await response.json()) as ValidationResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        status: "INVALID",
        ticket: null,
        message: "Nao recebemos a confirmacao do servidor. Verifique o ingresso novamente.",
      } satisfies ValidationResponse;
    }
    return {
      status: "INVALID",
      ticket: null,
      message: "NAO FOI POSSIVEL CONFIRMAR A ENTRADA. Verifique a internet e tente novamente.",
    } satisfies ValidationResponse;
  } finally {
    window.clearTimeout(timer);
  }
}

function StatusIcon({ icon }: { icon: "ok" | "warn" | "bad" }) {
  if (icon === "ok") return <CheckCircle2 className="h-9 w-9" aria-hidden="true" />;
  if (icon === "warn") return <AlertTriangle className="h-9 w-9" aria-hidden="true" />;
  return <XCircle className="h-9 w-9" aria-hidden="true" />;
}

export function PortariaEventClient({ eventId, initialRecentEntries }: Props) {
  const [mode, setMode] = useState<"home" | "scanner" | "search">("home");
  const [online, setOnline] = useState(true);
  const [cameraMessage, setCameraMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [activeQrToken, setActiveQrToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TicketDto[]>([]);
  const [recentEntries, setRecentEntries] = useState(initialRecentEntries);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastPayloadRef = useRef<string | null>(null);
  const scannerStartingRef = useRef(false);
  const scannerGenerationRef = useRef(0);

  const stopCamera = useCallback(() => {
    scannerGenerationRef.current += 1;
    scannerStartingRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const validateQrToken = useCallback(async (qrToken: string) => {
    setProcessing(true);
    const response = await requestJson(`/api/portaria/eventos/${eventId}/tickets/validate`, { qrToken });
    setResult(response);
    setActiveQrToken(response.status === "VALID" ? qrToken : null);
    setProcessing(false);
  }, [eventId]);

  const handlePayload = useCallback(async (payload: string) => {
    if (processing || payload === lastPayloadRef.current) return;
    lastPayloadRef.current = payload;
    stopCamera();
    const parsed = parseEventTicketQrPayload(payload);
    if (!parsed.ok) {
      setResult({ status: "INVALID", ticket: null });
      setActiveQrToken(null);
      return;
    }
    await validateQrToken(parsed.qrToken);
  }, [processing, stopCamera, validateQrToken]);

  const startScanner = useCallback(async () => {
    if (scannerStartingRef.current || controlsRef.current) return;
    scannerStartingRef.current = true;
    const generation = scannerGenerationRef.current + 1;
    scannerGenerationRef.current = generation;
    setMode("scanner");
    setResult(null);
    setCameraMessage("");
    lastPayloadRef.current = null;

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setCameraMessage("Camera indisponivel. Verifique a permissao do navegador e abra a portaria por uma conexao HTTPS.");
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (generation !== scannerGenerationRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = mediaStream;
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      mediaStream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (scanResult) => {
        const text = scanResult?.getText();
        if (text) void handlePayload(text);
      });
      if (generation !== scannerGenerationRef.current) controls.stop();
      else controlsRef.current = controls;
    } catch (error) {
      stopCamera();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError") setCameraMessage("Permissao da camera negada. Libere o acesso no navegador para continuar.");
      else if (name === "NotFoundError") setCameraMessage("Nenhuma camera foi encontrada neste dispositivo.");
      else if (name === "NotReadableError") setCameraMessage("A camera esta ocupada por outro aplicativo.");
      else setCameraMessage("Camera indisponivel. Verifique a permissao do navegador e abra a portaria por uma conexao HTTPS.");
    } finally {
      if (generation === scannerGenerationRef.current) scannerStartingRef.current = false;
    }
  }, [handlePayload, stopCamera]);

  const confirmQr = async () => {
    if (!activeQrToken || confirming || !online) return;
    setConfirming(true);
    const response = await requestJson(`/api/portaria/eventos/${eventId}/tickets/check-in`, { qrToken: activeQrToken });
    setResult(response);
    setActiveQrToken(null);
    setConfirming(false);
    if (response.status === "CHECKED_IN" && response.ticket) {
      navigator.vibrate?.(80);
      setRecentEntries((entries) => [{
        checkedInAt: new Date().toISOString(),
        participantName: response.ticket!.participantName,
        ticketCode: response.ticket!.ticketCode,
        operatorName: "Agora",
      }, ...entries].slice(0, 10));
      window.setTimeout(() => {
        setResult(null);
        void startScanner();
      }, 1500);
    }
  };

  const searchTickets = async () => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      setSearchResults([]);
      return;
    }
    const response = await fetch(`/api/portaria/eventos/${eventId}/tickets/search?q=${encodeURIComponent(trimmed)}`);
    const json = (await response.json()) as { results?: TicketDto[] };
    setSearchResults(json.results ?? []);
  };

  const validateManual = async (ticketCode: string) => {
    const response = await requestJson(`/api/portaria/eventos/${eventId}/tickets/manual/validate`, { ticketCode });
    setResult(response);
    setActiveQrToken(null);
  };

  const confirmManual = async (ticketCode: string) => {
    if (confirming || !online) return;
    setConfirming(true);
    const response = await requestJson(`/api/portaria/eventos/${eventId}/tickets/manual/check-in`, { ticketCode });
    setResult(response);
    setConfirming(false);
    if (response.status === "CHECKED_IN" && response.ticket) navigator.vibrate?.(80);
  };

  const status = result ? statusCopy[result.status] : null;

  return (
    <div className="space-y-5">
      {!online ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-50">
          <WifiOff className="h-5 w-5" aria-hidden="true" />
          SEM CONEXAO. Os check-ins precisam de internet nesta versao.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={startScanner} className="flex min-h-16 items-center justify-center gap-3 rounded-xl bg-emerald-500 px-5 py-4 text-base font-black uppercase text-black">
          <Camera className="h-6 w-6" aria-hidden="true" />
          Abrir leitor de QR Code
        </button>
        <button onClick={() => { stopCamera(); setMode("search"); setResult(null); }} className="flex min-h-16 items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-4 text-base font-black uppercase text-white">
          <Search className="h-6 w-6" aria-hidden="true" />
          Buscar participante
        </button>
      </div>

      {mode === "scanner" ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-black p-3">
          <div className="relative aspect-[3/4] max-h-[68vh] overflow-hidden rounded-xl bg-zinc-950 sm:aspect-video">
            <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-emerald-300/80" />
            {processing ? <div className="absolute inset-x-0 bottom-0 bg-black/80 px-4 py-3 text-center text-sm font-bold uppercase text-white">Validando...</div> : null}
          </div>
          {cameraMessage ? <p className="rounded-xl border border-amber-300 bg-amber-500/15 px-4 py-3 text-sm text-amber-50">{cameraMessage}</p> : null}
          <button onClick={() => { stopCamera(); setMode("home"); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-bold uppercase text-white">
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
            Fechar leitor
          </button>
        </section>
      ) : null}

      {mode === "search" ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#101010] p-4">
          <div className="flex gap-2">
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Nome, CPF ou ticketCode" className="min-h-12 flex-1 rounded-xl border border-white/10 bg-black px-4 text-base text-white placeholder:text-white/35" />
            <button onClick={searchTickets} className="min-h-12 rounded-xl bg-white px-4 text-sm font-black uppercase text-black">Buscar</button>
          </div>
          <div className="space-y-3">
            {searchResults.map((ticket) => (
              <article key={ticket.ticketCode} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{ticket.participantName}</h3>
                  <p className="text-sm text-white/60">{ticket.ticketCode} - {ticket.lotName} - {ticket.participantCpfMasked}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button onClick={() => validateManual(ticket.ticketCode)} className="min-h-12 rounded-xl border border-white/15 px-4 text-sm font-black uppercase text-white">Validar ingresso</button>
                  <button onClick={() => confirmManual(ticket.ticketCode)} disabled={confirming || !online} className="min-h-12 rounded-xl bg-emerald-500 px-4 text-sm font-black uppercase text-black disabled:opacity-45">Confirmar entrada</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {result && status ? (
        <section tabIndex={-1} aria-live="assertive" className={`space-y-4 rounded-2xl border-2 p-5 ${status.tone}`}>
          <div className="flex items-center gap-3">
            <StatusIcon icon={status.icon} />
            <h2 className="text-2xl font-black uppercase">{status.title}</h2>
          </div>
          {result.message ? <p className="text-sm font-semibold">{result.message}</p> : null}
          {result.ticket ? (
            <div className="space-y-1 text-base">
              <p className="text-2xl font-black">{result.ticket.participantName}</p>
              <p>Ticket {result.ticket.ticketCode}</p>
              <p>Lote {result.ticket.lotName}</p>
              {result.status === "ALREADY_USED" ? <p>Entrada registrada as {formatTime(result.ticket.checkedInAt)}</p> : null}
            </div>
          ) : null}
          {result.status === "VALID" && activeQrToken ? (
            <button onClick={confirmQr} disabled={confirming || !online} className="min-h-16 w-full rounded-xl bg-emerald-400 px-5 py-4 text-lg font-black uppercase text-black disabled:opacity-45">
              {confirming ? "Confirmando..." : "Confirmar entrada"}
            </button>
          ) : null}
          {result.status === "CHECKED_IN" ? (
            <button onClick={() => { setResult(null); void startScanner(); }} className="min-h-14 w-full rounded-xl bg-white px-5 py-4 text-base font-black uppercase text-black">
              Ler proximo agora
            </button>
          ) : null}
          {result.status !== "CHECKED_IN" ? (
            <button onClick={() => { setResult(null); setActiveQrToken(null); void startScanner(); }} className="min-h-12 w-full rounded-xl border border-current px-4 py-3 text-sm font-black uppercase">
              Cancelar / voltar ao leitor
            </button>
          ) : null}
          {result.status === "UNAUTHORIZED" ? (
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldX className="h-5 w-5" aria-hidden="true" />
              Procure um super admin.
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-white/10 bg-[#101010] p-4">
        <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white/55">Ultimas entradas</h2>
        {recentEntries.map((entry, index) => (
          <div key={`${entry.ticketCode}-${index}`} className="grid grid-cols-[4.5rem_1fr] gap-3 border-t border-white/10 pt-3 text-sm">
            <strong className="text-white">{formatTime(entry.checkedInAt)}</strong>
            <span className="text-white/70">{entry.participantName}<br /><span className="text-white/45">{entry.ticketCode} - {entry.operatorName}</span></span>
          </div>
        ))}
        {recentEntries.length === 0 ? <p className="text-sm text-white/50">Nenhuma entrada registrada ainda.</p> : null}
      </section>
    </div>
  );
}
