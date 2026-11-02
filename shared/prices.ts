// Prezzi letti dalle foto dei cartellini. Un prezzo è legato a un negozio e alla data
// in cui è stato visto; la lista lo collega agli articoli confrontando i nomi.

import { normalizeName, STORE_IDS, type StoreId } from "./list";

export type Unit = "kg" | "l" | "pz";
export const UNITS: Unit[] = ["kg", "l", "pz"];

export interface Price {
  id: string;
  product: string;
  store: StoreId;
  /** prezzo in centesimi */
  cents: number;
  /** quantità come scritta sul cartellino, es. "500 g" */
  qty: string | null;
  /** prezzo al kg, al litro o al pezzo, in centesimi */
  unitCents: number | null;
  unit: Unit | null;
  offer: boolean;
  seenAt: number;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
  /** solo per i prezzi del listino online (non sincronizzati): da dove vengono */
  source?: string;
}

export type PriceState = Record<string, Price>;

/** Quello che il modello di visione ha letto in una foto. */
export interface Reading {
  product: string;
  cents: number | null;
  qty: string | null;
  unitCents: number | null;
  unit: Unit | null;
  offer: boolean;
  /** true se il modello dice di aver letto tutto bene */
  sure: boolean;
}

export const OLD_AFTER = 60 * 24 * 60 * 60 * 1000;
export const MAX_CENTS = 99_999;

const ID = /^[A-Za-z0-9_-]{8,40}$/;

function cleanQty(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const q = x.replace(/\s+/g, " ").trim().slice(0, 24);
  return q || null;
}

function isStore(x: unknown): x is StoreId {
  return typeof x === "string" && (STORE_IDS as readonly string[]).includes(x);
}

function isCents(x: unknown): x is number {
  return Number.isInteger(x) && (x as number) > 0 && (x as number) <= MAX_CENTS;
}

export function validatePrice(x: unknown): Price | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !ID.test(o.id)) return null;
  if (typeof o.product !== "string") return null;
  const product = normalizeName(o.product);
  if (!product) return null;
  if (!isStore(o.store)) return null;
  if (!isCents(o.cents)) return null;
  const unitCents = o.unitCents === null || o.unitCents === undefined ? null : isCents(o.unitCents) ? o.unitCents : undefined;
  if (unitCents === undefined) return null;
  const unit = o.unit === null || o.unit === undefined ? null : UNITS.includes(o.unit as Unit) ? (o.unit as Unit) : undefined;
  if (unit === undefined) return null;
  for (const k of ["seenAt", "createdAt", "updatedAt"]) if (!Number.isFinite(o[k])) return null;
  if (typeof o.offer !== "boolean" || typeof o.deleted !== "boolean") return null;
  return {
    id: o.id,
    product,
    store: o.store,
    cents: o.cents,
    qty: cleanQty(o.qty),
    unitCents,
    unit,
    offer: o.offer,
    seenAt: Math.trunc(o.seenAt as number),
    deleted: o.deleted,
    createdAt: Math.trunc(o.createdAt as number),
    updatedAt: Math.trunc(o.updatedAt as number),
  };
}

// ---------------------------------------------------------------- importi

/** "1,29", "1.29", "€ 1,29", 1.29 → 129. Restituisce null se non è un prezzo plausibile. */
export function toCents(x: unknown): number | null {
  let n: number;
  if (typeof x === "number") n = x;
  else if (typeof x === "string") {
    const m = x.replace(/\s/g, "").match(/\d+(?:[.,]\d{1,2})?/);
    if (!m) return null;
    n = Number(m[0].replace(",", "."));
  } else return null;
  if (!Number.isFinite(n)) return null;
  const c = Math.round(n * 100);
  return c > 0 && c <= MAX_CENTS ? c : null;
}

export function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/** Prova a ricavare il prezzo al kg/l/pezzo dalla quantità scritta. */
export function unitFromQty(cents: number, qty: string | null): { unitCents: number; unit: Unit } | null {
  if (!qty) return null;
  const q = qty.toLowerCase().replace(",", ".");
  let m = q.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)\b/);
  let amount: number;
  let u: string;
  if (m) {
    amount = Number(m[1]) * Number(m[2]);
    u = m[3];
  } else {
    m = q.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl|pz|pezzi|uova)\b/) ?? q.match(/(?:x|×)\s*(\d+)/);
    if (!m) return null;
    amount = Number(m[1]);
    u = m[2] ?? "pz";
  }
  if (!(amount > 0)) return null;
  const table: Record<string, [Unit, number]> = { kg: ["kg", 1], g: ["kg", 1000], l: ["l", 1], ml: ["l", 1000], cl: ["l", 100], pz: ["pz", 1], pezzi: ["pz", 1], uova: ["pz", 1] };
  const [unit, div] = table[u] ?? ["pz", 1];
  const base = amount / div;
  const unitCents = Math.round(cents / base);
  return unitCents > 0 && unitCents <= MAX_CENTS ? { unitCents, unit } : null;
}

// ---------------------------------------------------------------- lettura del modello

/** Estrae la lettura dal testo del modello, che dovrebbe essere JSON ma a volte ha testo intorno. */
export function parseReading(text: string): Reading | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const product = typeof o.prodotto === "string" ? normalizeName(o.prodotto) : "";
  const cents = toCents(o.prezzo);
  const qty = cleanQty(o.quantita);
  let unitCents = toCents(o.prezzo_unitario);
  let unit: Unit | null = UNITS.includes(o.unita as Unit) ? (o.unita as Unit) : null;
  if (cents && (!unitCents || !unit)) {
    const calc = unitFromQty(cents, qty);
    if (calc) ({ unitCents, unit } = calc);
  }
  if (!unit) unitCents = null;
  if (!product && !cents) return null;
  return {
    product,
    cents,
    qty,
    unitCents,
    unit,
    offer: o.offerta === true,
    sure: o.leggibile !== false && !!product && !!cents,
  };
}

export const READING_PROMPT = `Questa è la foto di un cartellino del prezzo in un supermercato italiano.
Rispondi SOLO con un oggetto JSON, senza altro testo, con queste chiavi:
"prodotto": nome del prodotto con la marca se si vede (stringa),
"prezzo": prezzo di vendita in euro come numero; se c'è un prezzo scontato usa quello scontato,
"quantita": quantità della confezione come scritta, es. "500 g", "1 l", "6 pz", oppure null,
"prezzo_unitario": prezzo al kg, al litro o al pezzo come numero, oppure null,
"unita": "kg", "l" oppure "pz", oppure null,
"offerta": true se il prezzo è in promozione,
"leggibile": false se qualcosa non si legge bene.`;

// ---------------------------------------------------------------- collegare prezzi e articoli

const STOP = new Set(["di", "da", "del", "della", "con", "per", "e", "al", "alla", "allo", "in", "il", "la", "le", "lo", "gli", "i", "un", "una"]);

export function words(name: string): string[] {
  return name
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|ml|cl|pz|x)\b/g, " ")
    .replace(/[×x]\s*\d+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

const stem = (w: string) => (w.length >= 4 ? w.replace(/[aeio]$/, "") : w);

/**
 * true se il prezzo riguarda l'articolo: ogni parola dell'articolo compare nel prodotto,
 * anche al plurale ("pomodori") o abbreviata sul cartellino ("parz." per "parzialmente").
 */
export function matches(itemName: string, product: string): boolean {
  const need = words(itemName);
  if (need.length === 0) return false;
  const have = words(product);
  return need.every((w) => have.some((h) => h === w || stem(h) === stem(w) || (h.length >= 4 && w.startsWith(h))));
}

/**
 * Per ogni negozio, il prezzo più recente che corrisponde all'articolo.
 * Un prezzo visto dalla famiglia (cartellino o scontrino) vince sul listino online finché non è vecchio.
 */
export function pricesFor(itemName: string, prices: PriceState, now = Date.now()): Partial<Record<StoreId, Price>> {
  const out: Partial<Record<StoreId, Price>> = {};
  const rank = (p: Price) => (!p.source && !isOld(p, now) ? 1 : 0);
  for (const p of Object.values(prices)) {
    if (p.deleted || !matches(itemName, p.product)) continue;
    const cur = out[p.store];
    if (!cur || rank(p) > rank(cur) || (rank(p) === rank(cur) && p.seenAt > cur.seenAt)) out[p.store] = p;
  }
  return out;
}

export interface Comparison {
  /** prezzo nel negozio dell'articolo (o il più basso se l'articolo non ha negozio) */
  here: Price | null;
  /** il negozio più conveniente, se diverso e il risparmio vale la pena */
  cheaper: { price: Price; saving: number } | null;
  /** il negozio dell'articolo è il più conveniente: di quanto rispetto al secondo */
  best: { other: Price; saving: number } | null;
  /** nessun prezzo nel negozio dell'articolo, ma c'è altrove: il più basso */
  elsewhere: Price | null;
}

/** Soglie decise: conviene spostare solo se si risparmia almeno 0,30 € o il 10%. */
export function worthIt(saving: number, base: number): boolean {
  return saving >= 30 || saving >= base * 0.1;
}

export function compare(itemName: string, store: StoreId | null, prices: PriceState): Comparison {
  const byStore = pricesFor(itemName, prices);
  const all = Object.values(byStore).filter((p): p is Price => !!p);
  if (all.length === 0) return { here: null, cheaper: null, best: null, elsewhere: null };
  const sorted = [...all].sort((a, b) => a.cents - b.cents);
  const here = store ? (byStore[store] ?? null) : sorted[0];
  if (!here) return { here: null, cheaper: null, best: null, elsewhere: sorted[0] };
  const cheapest = sorted[0];
  if (cheapest.store !== here.store) {
    const saving = here.cents - cheapest.cents;
    return { here, cheaper: worthIt(saving, here.cents) ? { price: cheapest, saving } : null, best: null, elsewhere: null };
  }
  const second = sorted.find((p) => p.store !== here.store);
  return { here, cheaper: null, best: second && second.cents > here.cents ? { other: second, saving: second.cents - here.cents } : null, elsewhere: null };
}

export function isOld(p: Price, now = Date.now()): boolean {
  return now - p.seenAt > OLD_AFTER;
}

