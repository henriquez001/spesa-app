import { FAMILY_TOKEN } from "../shared/list";
import { safeStorage } from "./sync";

// Il codice della famiglia sta nel link d'invito (?f=...). Una volta aperto il link
// lo teniamo nel telefono e lo togliamo dalla barra degli indirizzi.

const KEY = "spesa:famiglia";

export function tokenFromLink(text: string): string | null {
  const t = text.trim();
  if (FAMILY_TOKEN.test(t)) return t;
  try {
    const f = new URL(t).searchParams.get("f");
    return f && FAMILY_TOKEN.test(f) ? f : null;
  } catch {
    return null;
  }
}

export function loadToken(): string | null {
  const fromUrl = new URLSearchParams(location.search).get("f");
  if (fromUrl && FAMILY_TOKEN.test(fromUrl)) {
    saveToken(fromUrl);
    const url = new URL(location.href);
    url.searchParams.delete("f");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    return fromUrl;
  }
  const saved = safeStorage()?.getItem(KEY) ?? null;
  return saved && FAMILY_TOKEN.test(saved) ? saved : null;
}

export function saveToken(token: string): void {
  try {
    safeStorage()?.setItem(KEY, token);
  } catch {
    // senza memoria il link andrà riaperto la prossima volta
  }
}

export async function createFamily(): Promise<string> {
  const res = await fetch("/api/famiglie", { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  if (!FAMILY_TOKEN.test(token)) throw new Error("codice non valido");
  return token;
}

export function inviteLink(token: string): string {
  return `${location.origin}/?f=${token}`;
}
