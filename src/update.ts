import { useEffect, useState } from "preact/hooks";

// Controlla se online c'è una versione più nuova dell'app.
// Non ci fidiamo solo del service worker: su iPhone un'app sulla schermata Home
// spesso torna in primo piano senza ricaricarsi, quindi leggiamo /version.json.

export const APP_VERSION = __APP_VERSION__;

export type Check = "idle" | "checking" | "latest" | "error";

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const { version } = (await res.json()) as { version?: unknown };
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

export function isNewer(latest: string | null, current: string): boolean {
  return !!latest && latest > current;
}

export async function applyUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    // senza service worker basta ricaricare
  }
  location.reload();
}

export function formatVersion(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const day = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  return `${day} · ${time}`;
}

const EVERY = 30 * 60 * 1000;

/** Stato dell'aggiornamento: se c'è una versione nuova, se l'utente l'ha rimandata, e il controllo a mano. */
export function useUpdate() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [check, setCheck] = useState<Check>("idle");

  async function run(manual: boolean): Promise<void> {
    if (manual) setCheck("checking");
    const latest = await fetchLatestVersion();
    const newer = isNewer(latest, APP_VERSION);
    if (newer) {
      setAvailable(true);
      setDismissed(false);
    }
    if (manual) {
      setCheck(latest === null ? "error" : newer ? "idle" : "latest");
      if (!newer) setTimeout(() => setCheck("idle"), 2500);
    }
  }

  useEffect(() => {
    if (import.meta.env.DEV) return;
    run(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") run(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => run(false), EVERY);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  return {
    showBanner: available && !dismissed,
    check,
    checkNow: () => run(true),
    later: () => setDismissed(true),
    update: applyUpdate,
  };
}
