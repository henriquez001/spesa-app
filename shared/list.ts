// Logica condivisa tra web app e Worker: articoli, operazioni e unione dei cambiamenti.
// Ogni modifica è un'operazione che porta l'articolo intero. Vince la versione con
// updatedAt più recente (last-writer-wins), quindi riapplicare la stessa operazione
// non cambia nulla: è ciò che rende sicura la coda offline.

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

export interface Op {
  opId: string;
  item: Item;
}

export type ListState = Record<string, Item>;

export type ClientMessage = { t: "ops"; ops: Op[] };
export type ServerMessage =
  | { t: "snapshot"; items: Item[] }
  | { t: "ops"; ops: Op[] }
  | { t: "ack"; opIds: string[] };

/** true se `incoming` deve sostituire `current`. A parità di orario decide un confronto stabile. */
export function wins(current: Item | undefined, incoming: Item): boolean {
  if (!current) return true;
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return stableKey(incoming) > stableKey(current);
}

function stableKey(i: Item): string {
  return JSON.stringify([i.deleted, i.done, i.store, i.name]);
}

/** Applica un'operazione allo stato. Restituisce true se lo stato è cambiato. */
export function applyOp(state: ListState, op: Op): boolean {
  const current = state[op.item.id];
  if (!wins(current, op.item)) return false;
  state[op.item.id] = op.item;
  return true;
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
  const item = validateItem(o.item);
  return item ? { opId: o.opId, item } : null;
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
