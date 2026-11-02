import { normalizeName, type StoreId } from "../shared/list";
import { euro, toCents, unitFromQty, type Reading, type Unit } from "../shared/prices";
import type { Receipt } from "../shared/receipt";
import type { NewPrice } from "./sync";

// Foto dei cartellini: riduzione, invio al server per la lettura, dati da rivedere.

export type ShotStatus = "reading" | "done" | "failed";

export interface Shot {
  id: string;
  url: string;
  blob: Blob;
  status: ShotStatus;
  error?: string;
  /** campi modificabili nella revisione */
  product: string;
  price: string;
  qty: string;
  offer: boolean;
  /** quello che ha letto il modello, per sapere se è sicuro */
  reading: Reading | null;
}

/** Lato lungo massimo: 1280 px bastano per un cartellino, uno scontrino ha righe piccole e ne vuole 2048. */
export const LABEL_SIDE = 1280;
export const RECEIPT_SIDE = 2048;

/** Riduce la foto sul lato lungo e la salva in JPEG: si legge bene e pesa poco. */
export async function toJpeg(source: CanvasImageSource, width: number, height: number, maxSide = LABEL_SIDE): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas non disponibile");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("foto non creata"))), "image/jpeg", 0.8));
}

export async function fileToJpeg(file: File, maxSide = LABEL_SIDE): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    return await toJpeg(bmp, bmp.width, bmp.height, maxSide);
  } finally {
    bmp.close();
  }
}

export async function readShot(token: string, blob: Blob): Promise<{ reading: Reading | null; error?: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { reading: null, error: "Senza rete: scrivi tu il prezzo." };
  try {
    const res = await fetch(`/api/famiglie/${token}/leggi`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
    const body = (await res.json().catch(() => ({}))) as { reading?: Reading | null; error?: string };
    if (!res.ok) return { reading: null, error: body.error ?? "Lettura non riuscita: scrivi tu il prezzo." };
    return { reading: body.reading ?? null, error: body.reading ? undefined : (body.error ?? "Non si legge: scrivi tu il prezzo.") };
  } catch {
    return { reading: null, error: "Senza rete: scrivi tu il prezzo." };
  }
}

/** Una foto (o un pezzo) di scontrino. */
export interface Part {
  id: string;
  url: string;
  blob: Blob;
  status: ShotStatus;
  error?: string;
  receipt: Receipt | null;
}

export async function readReceiptPart(token: string, blob: Blob): Promise<{ receipt: Receipt | null; error?: string }> {
  const offline = "Senza rete: lo rileggo appena torna la connessione.";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { receipt: null, error: offline };
  try {
    const res = await fetch(`/api/famiglie/${token}/leggi?tipo=scontrino`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
    const body = (await res.json().catch(() => ({}))) as { receipt?: Receipt | null; error?: string };
    if (!res.ok || !body.receipt) return { receipt: null, error: body.error ?? "Non si legge: prova una foto più vicina e dritta." };
    return { receipt: body.receipt };
  } catch {
    return { receipt: null, error: offline };
  }
}

export function fromReading(shot: Shot, reading: Reading | null, error?: string): Shot {
  if (!reading) return { ...shot, status: "failed", error, reading: null };
  return {
    ...shot,
    status: "done",
    error: undefined,
    reading,
    product: shot.product || reading.product,
    price: shot.price || (reading.cents ? (reading.cents / 100).toFixed(2).replace(".", ",") : ""),
    qty: shot.qty || (reading.qty ?? ""),
    offer: shot.offer || reading.offer,
  };
}

/** Cosa c'è da controllare in uno scatto, in parole. null se è tutto a posto. */
export function problem(shot: Shot): string | null {
  if (shot.status === "reading") return "Lettura in corso…";
  if (!normalizeName(shot.product)) return shot.error ?? "Manca il nome";
  if (!toCents(shot.price)) return shot.error ?? "Manca il prezzo";
  if (shot.reading && !shot.reading.sure) return "Controlla nome e prezzo";
  if (shot.status === "failed") return shot.error ?? "Controlla nome e prezzo";
  return null;
}

export function isSavable(shot: Shot): boolean {
  return shot.status !== "reading" && !!normalizeName(shot.product) && !!toCents(shot.price);
}

export function unitOf(shot: Shot): { unitCents: number; unit: Unit } | null {
  const cents = toCents(shot.price);
  if (!cents) return null;
  const fromQty = unitFromQty(cents, shot.qty || null);
  if (fromQty) return fromQty;
  const r = shot.reading;
  // senza quantità usiamo quello letto sul cartellino, se il prezzo non è stato cambiato
  if (r?.unitCents && r.unit && r.cents === cents) return { unitCents: r.unitCents, unit: r.unit };
  return null;
}

export function toNewPrice(shot: Shot, store: StoreId, seenAt: number): NewPrice | null {
  const cents = toCents(shot.price);
  const product = normalizeName(shot.product);
  if (!cents || !product) return null;
  const u = unitOf(shot);
  return { product, store, cents, qty: shot.qty.trim() || null, unitCents: u?.unitCents ?? null, unit: u?.unit ?? null, offer: shot.offer, seenAt };
}

export function perUnit(u: { unitCents: number; unit: Unit }): string {
  return `${euro(u.unitCents)}/${u.unit}`;
}
