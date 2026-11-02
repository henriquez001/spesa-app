// Listino online: prezzi presi ogni notte dai siti dei supermercati.
// Sono prezzi "di catena" (non del singolo punto vendita) e restano separati da quelli
// della famiglia: nella lista vincono sempre i prezzi visti dalla famiglia, se recenti.

import { normalizeName, type StoreId } from "./list";
import { toCents, unitFromQty, words, type Price, type Unit } from "./prices";

export type CatalogSource = "conad-listino" | "lidl-offerte" | "euro-offerte" | "oasi-offerte";

export interface CatalogPrice {
  /** chiave stabile: fonte + codice prodotto (o nome) */
  key: string;
  source: CatalogSource;
  store: StoreId;
  product: string;
  cents: number;
  qty: string | null;
  unitCents: number | null;
  unit: Unit | null;
  offer: boolean;
  /** quando l'abbiamo letto */
  seenAt: number;
  /** fine validità per le offerte, se nota */
  validTo: number | null;
}

/** Parole di ricerca per il listino: la spesa di casa più comune. */
export const KEYWORDS = [
  "latte", "yogurt", "burro", "panna", "mozzarella", "parmigiano", "grana", "formaggio", "ricotta", "stracchino",
  "uova", "prosciutto", "mortadella", "salame", "wurstel", "pollo", "tacchino", "manzo", "macinato", "salsiccia",
  "tonno", "salmone", "merluzzo", "pasta", "spaghetti", "penne", "riso", "farina", "pane", "pancarrè",
  "fette biscottate", "biscotti", "cracker", "grissini", "cereali", "zucchero", "sale", "olio extravergine", "olio di semi", "aceto",
  "passata", "pelati", "polpa di pomodoro", "legumi", "ceci", "fagioli", "lenticchie", "piselli", "mais", "caffè",
  "tè", "camomilla", "cacao", "marmellata", "nutella", "miele", "acqua", "succo", "birra", "vino",
  "bibita", "patate", "pomodori", "insalata", "carote", "cipolle", "zucchine", "banane", "mele", "arance",
  "limoni", "pere", "surgelati", "pizza", "gelato", "minestrone", "bastoncini", "detersivo", "ammorbidente", "candeggina",
  "detersivo piatti", "pastiglie lavastoviglie", "carta igienica", "scottex", "tovaglioli", "sacchetti", "shampoo", "bagnoschiuma", "dentifricio", "sapone",
  "pannolini", "assorbenti", "croccantini", "cibo gatto", "cibo cane",
] as const;

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " ", euro: "€" };

export function unescapeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function centsOf(v: unknown): number | null {
  if (v && typeof v === "object") return centsOf(pick(v as Record<string, unknown>, ["value", "amount", "price", "formattedValue"]));
  return toCents(v);
}

/** La quantità scritta nel nome, es. "Latte UHT 1 l" → "1 l". */
export function qtyFromName(name: string): string | null {
  const m = name.match(/(\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(kg|g|gr|l|lt|ml|cl|pz|pezzi)\b/i);
  return m ? m[0].replace(/\s+/g, " ").replace(/\bgr\b/i, "g").replace(/\blt\b/i, "l") : null;
}

/** Costruisce un prezzo del listino da un oggetto prodotto, qualunque nome abbiano i campi. */
export function fromProductJson(o: Record<string, unknown>, source: CatalogSource, store: StoreId, seenAt: number): CatalogPrice | null {
  const rawName = pick(o, ["name", "productName", "item_name", "title", "nome", "description"]);
  const brand = pick(o, ["brand", "item_brand", "marca"]);
  if (typeof rawName !== "string") return null;
  let product = normalizeName(unescapeHtml(rawName));
  if (typeof brand === "string" && brand && !product.toLowerCase().includes(brand.toLowerCase())) product = normalizeName(`${product} ${brand}`);
  const final = centsOf(pick(o, ["finalPrice", "salePrice", "promoPrice", "discountedPrice", "sellingPrice", "price", "prezzo", "basePrice"]));
  const base = centsOf(pick(o, ["basePrice", "listPrice", "originalPrice", "fullPrice", "price"]));
  if (!product || !final) return null;
  const code = pick(o, ["code", "sku", "productCode", "item_id", "productId", "id", "ean"]);
  const qty = qtyFromName(product);
  const u = unitFromQty(final, qty);
  return {
    key: `${source}:${typeof code === "string" || typeof code === "number" ? code : product.toLowerCase()}`,
    source,
    store,
    product,
    cents: final,
    qty,
    unitCents: u?.unitCents ?? null,
    unit: u?.unit ?? null,
    offer: !!base && base > final,
    seenAt,
    validTo: null,
  };
}

/** Pagina di ricerca di spesaonline.conad.it: ogni scheda porta il prodotto in JSON nell'attributo data-product. */
export function parseConad(html: string, seenAt: number): CatalogPrice[] {
  const out = new Map<string, CatalogPrice>();
  const re = /data-product\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let o: unknown;
    try {
      o = JSON.parse(unescapeHtml(m[2] ?? m[3] ?? ""));
    } catch {
      continue;
    }
    if (!o || typeof o !== "object") continue;
    const p = fromProductJson(o as Record<string, unknown>, "conad-listino", "conad", seenAt);
    if (p) out.set(p.key, p);
  }
  return [...out.values()];
}

/** Le parole indicizzate di un prodotto, per la ricerca veloce sul server. */
export function indexWords(product: string): string {
  return ` ${words(product).join(" ")} `;
}

/**
 * Il prezzo più conveniente del listino per un articolo della lista, per ogni negozio.
 * Con il prezzo al kg/l si confrontano confezioni diverse; altrimenti il prezzo pieno.
 */
export function bestFor(itemName: string, rows: CatalogPrice[], matchesFn: (item: string, product: string) => boolean): Partial<Record<StoreId, CatalogPrice>> {
  const out: Partial<Record<StoreId, CatalogPrice>> = {};
  for (const p of rows) {
    if (!matchesFn(itemName, p.product)) continue;
    const cur = out[p.store];
    const cheaper = !cur || (cur.unitCents && p.unitCents && cur.unit === p.unit ? p.unitCents < cur.unitCents : p.cents < cur.cents);
    if (cheaper) out[p.store] = p;
  }
  return out;
}

/** Il prezzo del listino come prezzo dell'app, per il confronto nella lista. */
export function asPrice(p: CatalogPrice): Price {
  return {
    id: `cat-${p.key}`,
    product: p.product,
    store: p.store,
    cents: p.cents,
    qty: p.qty,
    unitCents: p.unitCents,
    unit: p.unit,
    offer: p.offer,
    seenAt: p.seenAt,
    deleted: false,
    createdAt: p.seenAt,
    updatedAt: p.seenAt,
    source: p.source,
  };
}
