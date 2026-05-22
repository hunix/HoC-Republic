/**
 * useVersionCheck — polls `system.version` and shows a reload toast
 * when the server's build hash diverges from the one loaded at page start.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { rpc } from "@/lib/rpc";

declare global {
  interface Window {
    __HOC_BUILD_VERSION__?: string;
  }
}

const POLL_INTERVAL_MS = 60_000; // 1 minute

type VersionInfo = {
  version: string;
  buildHash: string | null;
  builtAt: string | null;
  gatewayStartedAt: string;
};

export function useVersionCheck() {
  const initialHash = useRef(window.__HOC_BUILD_VERSION__ ?? null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [serverVersion, setServerVersion] = useState<VersionInfo | null>(null);

  const checkVersion = useCallback(async () => {
    try {
      const res = await rpc<VersionInfo>("system.version", {});
      if (!res) { return; }
      setServerVersion(res);
      // If we have an initial hash and the server's hash differs, a new build is available
      if (
        initialHash.current &&
        res.buildHash &&
        res.buildHash !== initialHash.current
      ) {
        setUpdateAvailable(true);
      }
    } catch {
      // Silently ignore — connection may be temporarily down
    }
  }, []);

  useEffect(() => {
    // Initial check after a short delay (let the app settle)
    const firstCheck = setTimeout(checkVersion, 5_000);
    // Periodic polling
    const interval = setInterval(checkVersion, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(firstCheck);
      clearInterval(interval);
    };
  }, [checkVersion]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, serverVersion, reload };
}
