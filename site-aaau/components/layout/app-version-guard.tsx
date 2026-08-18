"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/shared/button";
import {
  APP_VERSION_RECHECK_MS,
  versionRefreshKey,
  versionUpdateAction,
} from "@/lib/app-version";

export function AppVersionGuard({ loadedVersion }: { loadedVersion: string }) {
  const pathname = usePathname();
  const checkingRef = useRef(false);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  const checkVersion = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const response = await fetch("/api/version", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { version?: unknown };
      if (typeof payload.version !== "string") return;

      const refreshKey = versionRefreshKey(loadedVersion, payload.version);
      const action = versionUpdateAction({
        loadedVersion,
        currentVersion: payload.version,
        pathname,
        refreshAlreadyAttempted: sessionStorage.getItem(refreshKey) === "1",
      });

      if (action === "reload") {
        sessionStorage.setItem(refreshKey, "1");
        window.location.reload();
      } else if (action === "prompt") {
        setAvailableVersion(payload.version);
      }
    } catch {
      // Falha de conectividade não deve interromper a navegação atual.
    } finally {
      checkingRef.current = false;
    }
  }, [loadedVersion, pathname]);

  useEffect(() => {
    void checkVersion();
    const interval = window.setInterval(() => void checkVersion(), APP_VERSION_RECHECK_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkVersion]);

  if (!availableVersion) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-xl flex-col gap-3 rounded-lg border border-aaau-sand/40 bg-aaau-night p-4 shadow-2xl sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite">
      <p className="text-sm leading-6 text-white/80">
        Atualizamos o site. Recarregue para continuar com a versão mais recente.
      </p>
      <Button
        size="sm"
        className="shrink-0"
        onClick={() => {
          sessionStorage.setItem(versionRefreshKey(loadedVersion, availableVersion), "1");
          window.location.reload();
        }}
      >
        Atualizar agora
      </Button>
    </div>
  );
}
