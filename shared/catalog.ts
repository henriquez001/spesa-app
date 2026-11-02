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
  /** prezzo riservato a chi ha la carta della catena (es. "Lidl Plus", "Eurospin Family") */
  card?: string | null;
  /** la marca, se il sito la dà a parte o si riconosce nel nome */
  brand?: string | null;
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
  // "1.000g" è mille grammi, non un grammo
  name = name.replace(/(\d)\.(\d{3})(?=\s*(?:g|gr|ml)\b)/gi, "$1$2");
  if (/^\s*al kg\b/i.test(name)) return "1 kg";
  const m = name.match(/(\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(kg|g|gr|l|lt|ml|cl|pz|pezzi)\b/i);
  return m ? m[0].replace(/\s+/g, " ").replace(/\bgr\b/i, "g").replace(/\blt\b/i, "l") : null;
}

/** Costruisce un prezzo del listino da un oggetto prodotto, qualunque nome abbiano i campi. */
export function fromProductJson(o: Record<string, unknown>, source: CatalogSource, store: StoreId, seenAt: number): CatalogPrice | null {
  const rawName = pick(o, ["name", "fullTitle", "productName", "item_name", "title", "nome", "description"]);
  const brand = pick(o, ["brand", "item_brand", "marca", "marchio"]);
  if (typeof rawName !== "string") return null;
  let product = normalizeName(unescapeHtml(rawName));
  if (typeof brand === "string" && brand && !product.toLowerCase().includes(brand.toLowerCase())) product = normalizeName(`${product} ${brand}`);
  const final = centsOf(pick(o, ["finalPrice", "salePrice", "promoPrice", "discountedPrice", "sellingPrice", "price", "prezzo", "basePrice"]));
  const base = centsOf(pick(o, ["basePrice", "listPrice", "originalPrice", "fullPrice", "price"]));
  if (!product || !final) return null;
  const code = pick(o, ["code", "sku", "productCode", "item_id", "productId", "id", "ean"]);
  // Conad dà la quantità a parte: netQuantity 0.25 + netQuantityUm "KG"
  const nq = Number(o.netQuantity);
  const um = typeof o.netQuantityUm === "string" ? o.netQuantityUm.toLowerCase() : "";
  const pack = typeof o.packaging === "string" ? qtyFromName(o.packaging) : null;
  const qty = qtyFromName(product) ?? pack ?? (nq > 0 && /^(kg|g|l|ml|cl|pz)$/.test(um) ? `${String(nq).replace(".", ",")} ${um}` : null);
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
    brand: typeof brand === "string" && brand.trim() ? unescapeHtml(brand.trim()) : null,
  };
}

/**
 * Pagina di ricerca di spesaonline.conad.it: ogni scheda porta il prodotto in JSON nell'attributo data-product
 * (campi visti: code, nome, marchio, basePrice, netQuantity, netQuantityUm, bassiFissi...).
 * Le schede con basePrice 0 (prezzo legato al punto vendita) si saltano. `cards` conta tutte le schede.
 */
export function parseConadPage(html: string, seenAt: number): { prices: CatalogPrice[]; cards: number } {
  const out = new Map<string, CatalogPrice>();
  let cards = 0;
  const re = /data-product\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let o: unknown;
    try {
      o = JSON.parse(unescapeHtml(m[2] ?? m[3] ?? ""));
    } catch {
      continue;
    }
    if (!o || typeof o !== "object") continue;
    cards++;
    const p = fromProductJson(o as Record<string, unknown>, "conad-listino", "conad", seenAt);
    if (p) out.set(p.key, p);
  }
  return { prices: [...out.values()], cards };
}

export function parseConad(html: string, seenAt: number): CatalogPrice[] {
  return parseConadPage(html, seenAt).prices;
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
    brand: p.brand ?? null,
    card: p.card ?? null,
    validTo: p.validTo,
  };
}

// ---------------------------------------------------------------- offerte settimanali (Lidl, Eurospin, Oasi)

const MONTHS: Record<string, number> = {
  gen: 1, gennaio: 1, feb: 2, febbraio: 2, mar: 3, marzo: 3, apr: 4, aprile: 4, mag: 5, maggio: 5, giu: 6, giugno: 6,
  lug: 7, luglio: 7, ago: 8, agosto: 8, set: 9, settembre: 9, ott: 10, ottobre: 10, nov: 11, novembre: 11, dic: 12, dicembre: 12,
};

/**
 * La fine validità scritta in una pagina di offerte: "dal 03/11 al 09/11", "fino al 9.11.2026",
 * "valide fino al 9 novembre", "2026-11-09". Restituisce la fine di quel giorno (ora italiana circa),
 * con l'anno di `now` (o il successivo, se la data è già passata da più di due mesi).
 */
export function parseValidTo(text: string, now: number): number | null {
  const t = text.toLowerCase();
  const year = new Date(now).getUTCFullYear();
  const endOf = (y: number | null, m: number, d: number): number | null => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const ts = Date.UTC(y ?? year, m - 1, d, 22, 59, 59);
    // senza anno: una data passata da più di due mesi è dell'anno prossimo (volantino a cavallo di dicembre)
    return y === null && ts < now - 60 * 864e5 ? Date.UTC(year + 1, m - 1, d, 22, 59, 59) : ts;
  };
  const iso = t.match(/\b(20\d\d)-(\d\d)-(\d\d)/);
  if (iso) return endOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const num = t.match(/\b(?:al|fino al|entro il|-|–)\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (num) {
    const y = num[3] ? (num[3].length === 2 ? 2000 + Number(num[3]) : Number(num[3])) : null;
    return endOf(y, Number(num[2]), Number(num[1]));
  }
  const word = t.match(/\b(?:al|fino al|entro il)\s*(\d{1,2})\s+([a-z]+)(?:\s+(20\d\d))?/);
  if (word && MONTHS[word[2]]) return endOf(word[3] ? Number(word[3]) : null, MONTHS[word[2]], Number(word[1]));
  return null;
}

/** I blocchi JSON-LD della pagina (schema.org), già letti. */
function jsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* blocco rotto: si salta */
    }
  }
  return out;
}

/** Gli attributi data-* che contengono un oggetto JSON (schede prodotto di molti siti). */
function dataJson(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /\sdata-[\w-]+\s*=\s*("(\s*(?:\{|\[|&quot;|&#123;)[^"]*)"|'(\s*[{[][^']*)')/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const raw = unescapeHtml(m[2] ?? m[3] ?? "").trim();
    if (raw[0] !== "{" && raw[0] !== "[") continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* non era JSON */
    }
  }
  return out;
}

const NAME_KEYS = ["name", "fullTitle", "productName", "item_name", "title", "nome"];
const PRICE_KEYS = ["price", "prezzo", "finalPrice", "salePrice", "promoPrice", "discountedPrice", "sellingPrice", "offers"];

/** Cerca dentro un JSON qualunque gli oggetti che sembrano un prodotto con prezzo. */
function productObjects(v: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 8 || !v || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) productObjects(x, out, depth + 1);
    return;
  }
  const o = v as Record<string, unknown>;
  const hasName = NAME_KEYS.some((k) => typeof o[k] === "string" && (o[k] as string).trim().length > 1);
  const hasPrice = PRICE_KEYS.some((k) => o[k] !== undefined && o[k] !== null);
  if (hasName && hasPrice) {
    // schema.org: il prezzo sta in offers (oggetto o elenco)
    const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
    if (offers && typeof offers === "object") {
      const of = offers as Record<string, unknown>;
      const brand = o.brand && typeof o.brand === "object" ? (o.brand as Record<string, unknown>).name : o.brand;
      out.push({ ...o, brand, price: of.price ?? of.lowPrice, priceValidUntil: of.priceValidUntil ?? o.priceValidUntil, id: o.sku ?? o.gtin13 ?? o.productID ?? o.id });
    } else out.push(o);
    return;
  }
  for (const x of Object.values(o)) productObjects(x, out, depth + 1);
}

/**
 * Una pagina di offerte di una catena, letta senza sapere in anticipo come è fatta:
 * prodotti in JSON-LD (schema.org) o in attributi data-* con JSON. Tutto quello che si legge
 * qui è in offerta; la fine validità viene dal prodotto o, se manca, dal testo della pagina.
 * `cards` conta gli oggetti prodotto trovati, anche quelli senza prezzo leggibile.
 */
export function parseOffersPage(html: string, source: CatalogSource, store: StoreId, seenAt: number): { prices: CatalogPrice[]; cards: number } {
  const objs: Record<string, unknown>[] = [];
  for (const j of [...jsonLd(html), ...dataJson(html)]) productObjects(j, objs);
  const text = unescapeHtml(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
  const pageValid = parseValidTo(text, seenAt);
  const out = new Map<string, CatalogPrice>();
  for (const raw of objs) {
    const o = lidlProduct(raw, seenAt);
    if (!o) continue;
    const p = fromProductJson(o, source, store, seenAt);
    if (!p) continue;
    const own = typeof o.validTo === "number" ? o.validTo : typeof o.priceValidUntil === "string" ? parseValidTo(o.priceValidUntil, seenAt) : null;
    out.set(p.key, { ...p, offer: true, validTo: own ?? pageValid, card: typeof o.card === "string" ? o.card : null });
  }
  return { prices: [...out.values()], cards: objs.length };
}

// ---------------------------------------------------------------- Lidl

/**
 * Le schede Lidl (attributo data-grid-data) hanno il prezzo in price.price, oppure solo in
 * lidlPlus[0].price.price quando è riservato a chi ha l'app Lidl Plus; la confezione in
 * price.packaging.text ("2 kg cassetta", "Al kg") e le date in storeStartDate/storeEndDate (secondi).
 * Le offerte che partono più avanti ("Da giovedì 5/11") si saltano: si leggono la notte in cui iniziano.
 * Un oggetto che non è una scheda Lidl passa com'è.
 */
function lidlProduct(o: Record<string, unknown>, now: number): Record<string, unknown> | null {
  if (typeof o.fullTitle !== "string" || !("storeEndDate" in o || "lidlPlus" in o || "regionsPrices" in o)) return o;
  const start = Number(o.storeStartDate);
  if (start > 0 && start * 1000 > now) return null;
  const price = (o.price ?? {}) as Record<string, unknown>;
  const plus = Array.isArray(o.lidlPlus) ? ((o.lidlPlus[0] as Record<string, unknown> | undefined)?.price as Record<string, unknown> | undefined) : undefined;
  const own = typeof price.price === "number" ? price.price : null;
  const value = own ?? (typeof plus?.price === "number" ? plus.price : null);
  if (value === null) return { ...o, price: null };
  const packaging = ((own !== null ? price.packaging : plus?.packaging) ?? price.packaging) as { text?: unknown } | undefined;
  const end = Number(o.storeEndDate);
  // Lidl scrive la marca in maiuscolo davanti al nome: "PARMALAT Latte parzialmente scremato"
  const title = String(o.fullTitle);
  const lead = title.match(/^((?:[A-ZÀ-Ý0-9&'.\-]{2,}\s+)+)(?=[A-ZÀ-Ý][a-zà-ÿ])/);
  const brand = lead ? lead[1].trim() : undefined;
  return {
    productId: o.productId ?? o.itemId,
    fullTitle: o.fullTitle,
    brand,
    price: value,
    packaging: typeof packaging?.text === "string" ? packaging.text : undefined,
    validTo: end > 0 ? end * 1000 : undefined,
    card: own === null ? "Lidl Plus" : undefined,
  };
}

/** Lidl cambia ogni settimana gli indirizzi delle pagine offerte: si prendono dalla home. */
const LIDL_NOT_FOOD = /parkside|livarno|esmara|lupilu|ultimate-speed|silvercrest|crivit|giocattoli|fiori-e-piante|moda|auto-e-garage|casa-e-arredo|fai-da-te|max-mila/;

export function lidlOfferLinks(html: string): string[] {
  const out = new Set<string>();
  const re = /href="(\/c\/(?:store\/)?([a-z0-9-]+)-kw-\d{1,2}-\d{2}\/a\d+)"/g;
  for (let m = re.exec(html); m; m = re.exec(html)) if (!LIDL_NOT_FOOD.test(m[2])) out.add(`https://www.lidl.it${m[1]}`);
  return [...out];
}

// ---------------------------------------------------------------- Eurospin

/** L'elenco delle offerte Eurospin (tutte le promozioni), 12 schede per pagina. */
export function eurospinOffersUrl(page: number): string {
  return `https://www.eurospin.com/it-it/prodotti/?by_typeOffer=offerta&by_typeOffer=family&by_typeOffer=limitati&by_typeOffer=ribassati&page=${page}`;
}

/**
 * Le schede prodotto Eurospin sono HTML (li.product-card con data-product-code): titolo, marchio,
 * confezione, prezzo scontato, prezzo pieno e "Fino al 30/11/2026". Il modello vuoto dentro
 * <template> non conta. "Prezzo Family" è il prezzo per chi ha la carta Eurospin Family.
 */
export function parseEurospinPage(html: string, seenAt: number): { prices: CatalogPrice[]; cards: number } {
  const body = html.replace(/<template[\s\S]*?<\/template>/gi, "");
  const parts = body.split(/<li\b(?=[^>]*\bdata-product-code=)/i).slice(1);
  const text = (chunk: string, cls: string): string => {
    const m = chunk.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</(?:p|span|h3|div)>`));
    return m ? unescapeHtml(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
  };
  const out = new Map<string, CatalogPrice>();
  for (const part of parts) {
    const li = part.split(/<\/li>/i)[0];
    const code = li.match(/data-product-code="([^"]+)"/)?.[1];
    const title = text(li, "product-card__title");
    const cents = toCents(text(li, "product-card__price-current"));
    if (!code || !title || !cents) continue;
    const brand = text(li, "product-card__brand");
    const product = normalizeName(brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${title} ${brand}` : title);
    const qty = qtyFromName(product) ?? qtyFromName(text(li, "product-card__meta"));
    const u = unitFromQty(cents, qty);
    const until = li.match(/badge-date-value[^>]*>\s*([^<]+)/)?.[1];
    out.set(`euro-offerte:${code}`, {
      key: `euro-offerte:${code}`,
      source: "euro-offerte",
      store: "euro",
      product,
      cents,
      qty,
      unitCents: u?.unitCents ?? null,
      unit: u?.unit ?? null,
      offer: true,
      seenAt,
      validTo: until ? parseValidTo(`fino al ${until}`, seenAt) : null,
      card: /Prezzo Family/i.test(li) ? "Eurospin Family" : null,
      brand: brand || null,
    });
  }
  return { prices: [...out.values()], cards: parts.length };
}
