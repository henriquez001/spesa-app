// Logica condivisa tra web app e Worker: articoli, operazioni e unione dei cambiamenti.
// Ogni modifica è un'operazione che porta l'articolo intero. Vince la versione con
// updatedAt più recente (last-writer-wins), quindi riapplicare la stessa operazione
// non cambia nulla: è ciò che rende sicura la coda offline.

import { validatePrice, type Price, type PriceState } from "./prices";

export const STORE_IDS = ["lidl", "euro", "conad", "oasi"] as const;
export type StoreId = (typeof STORE_IDS)[number];

export const STORE_NAMES: Record<StoreId, string> = {
  lidl: "Lidl",
  euro: "Eurospin",
  conad: "Conad",
  oasi: "Oasi",
};

export const MAX_NAME = 80;
export const MAX_OPS_PER_MESSAGE = 500;

export interface Item {
  id: string;
  name: string;
  store: StoreId | null;
  done: boolean;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Un documento dei pasti: impostazioni, pasto mangiato, acquisto, inventario della dispensa,
 * "altra ricetta". Il tipo è il prefisso dell'id (es. "eaten:2026-11-09:cena:alice").
 */
export interface Doc {
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updatedAt: number;
}

export const DOC_KINDS = ["settings", "reroll", "eaten", "bought", "stock"] as const;
const DOC_ID = new RegExp(`^(${DOC_KINDS.join("|")}):[A-Za-z0-9:._-]{1,80}$`);
const MAX_DOC_BYTES = 4000;

/** Un'operazione porta un articolo della lista, un prezzo o un documento dei pasti, sempre intero. */
export type Op =
  | { opId: string; item: Item; price?: undefined; doc?: undefined }
  | { opId: string; price: Price; item?: undefined; doc?: undefined }
  | { opId: string; doc: Doc; item?: undefined; price?: undefined };

export type ListState = Record<string, Item>;

/** Tutto quello che la famiglia condivide. */
export interface Data {
  items: ListState;
  prices: PriceState;
  docs?: Record<string, Doc>;
}

export type ClientMessage = { t: "ops"; ops: Op[] };
export type ServerMessage =
  | { t: "snapshot"; items: Item[]; prices: Price[]; docs?: Doc[]; diets?: unknown }
  | { t: "ops"; ops: Op[] }
  | { t: "ack"; opIds: string[] };

interface Versioned {
  updatedAt: number;
}

/** true se `incoming` deve sostituire `current`. A parità di orario decide un confronto stabile. */
export function wins<T extends Versioned>(current: T | undefined, incoming: T): boolean {
  if (!current) return true;
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return JSON.stringify(incoming) > JSON.stringify(current);
}

/** Applica un'operazione allo stato. Restituisce true se lo stato è cambiato. */
export function applyOp(state: Data, op: Op): boolean {
  if (op.item) {
    if (!wins(state.items[op.item.id], op.item)) return false;
    state.items[op.item.id] = op.item;
    return true;
  }
  if (op.doc) {
    const docs = (state.docs ??= {});
    if (!wins(docs[op.doc.id], op.doc)) return false;
    docs[op.doc.id] = op.doc;
    return true;
  }
  if (!wins(state.prices[op.price.id], op.price)) return false;
  state.prices[op.price.id] = op.price;
  return true;
}

export function validateDoc(x: unknown): Doc | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !DOC_ID.test(o.id)) return null;
  if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) return null;
  if (typeof o.deleted !== "boolean" || !Number.isFinite(o.updatedAt)) return null;
  const data = o.data as Record<string, unknown>;
  if (JSON.stringify(data).length > MAX_DOC_BYTES) return null;
  return { id: o.id, data, deleted: o.deleted, updatedAt: Math.trunc(o.updatedAt as number) };
}

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

export function sameName(a: string, b: string): boolean {
  return normalizeName(a).toLocaleLowerCase("it") === normalizeName(b).toLocaleLowerCase("it");
}

function isStore(x: unknown): x is StoreId {
  return typeof x === "string" && (STORE_IDS as readonly string[]).includes(x);
}

/** Controlla un articolo arrivato dalla rete. Restituisce null se non è valido. */
export function validateItem(x: unknown): Item | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(o.id)) return null;
  if (typeof o.name !== "string") return null;
  const name = normalizeName(o.name);
  if (!name) return null;
  if (o.store !== null && !isStore(o.store)) return null;
  if (typeof o.done !== "boolean" || typeof o.deleted !== "boolean") return null;
  if (!Number.isFinite(o.createdAt) || !Number.isFinite(o.updatedAt)) return null;
  return {
    id: o.id,
    name,
    store: o.store as StoreId | null,
    done: o.done,
    deleted: o.deleted,
    createdAt: Math.trunc(o.createdAt as number),
    updatedAt: Math.trunc(o.updatedAt as number),
  };
}

export function validateOp(x: unknown): Op | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.opId !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(o.opId)) return null;
  if (o.item !== undefined) {
    const item = validateItem(o.item);
    return item ? { opId: o.opId, item } : null;
  }
  if (o.doc !== undefined) {
    const doc = validateDoc(o.doc);
    return doc ? { opId: o.opId, doc } : null;
  }
  const price = validatePrice(o.price);
  return price ? { opId: o.opId, price } : null;
}

export interface Section {
  key: StoreId | "altri" | "nessuno";
  title: string;
  store: StoreId | null;
  items: Item[];
}

/** Divide gli articoli visibili in sezioni: i negozi del giro, poi gli altri negozi, poi quelli senza negozio. */
export function sections(state: ListState, trip: StoreId[]): Section[] {
  const visible = Object.values(state)
    .filter((i) => !i.deleted)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const out: Section[] = trip.map((s) => ({ key: s, title: STORE_NAMES[s], store: s, items: [] as Item[] }));
  const altri: Section = { key: "altri", title: "Altri negozi", store: null, items: [] };
  const nessuno: Section = { key: "nessuno", title: "Senza negozio", store: null, items: [] };
  for (const item of visible) {
    if (item.store === null) nessuno.items.push(item);
    else {
      const sec = out.find((s) => s.store === item.store);
      (sec ?? altri).items.push(item);
    }
  }
  return [...out, altri, nessuno].filter((s) => s.items.length > 0 || trip.includes(s.key as StoreId));
}

export function counts(state: ListState): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const i of Object.values(state)) {
    if (i.deleted) continue;
    total++;
    if (i.done) done++;
  }
  return { total, done };
}

export function randomId(bytes = 12): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const FAMILY_TOKEN = /^[A-Za-z0-9_-]{22}$/;
