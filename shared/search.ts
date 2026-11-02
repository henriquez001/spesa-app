// Ricerca dei prodotti (scheda Cerca): i prezzi si dividono per tipo di prodotto, così il
// pane in cassetta si confronta solo con altro pane in cassetta e mai con il filone.

import type { StoreId } from "./list";
import { matches, words, type Price, type Unit } from "./prices";

/**
 * Tipi di prodotto riconosciuti dal nome. L'ordine conta: il primo che corrisponde vince,
 * quindi i tipi più specifici stanno prima di quelli generici ("pane integrale" prima di "pane").
 */
const KINDS: [RegExp, string][] = [
  [/\bpan(e)?\s*(bianco\s*)?(in\s+)?cassetta\b|\bpan\s*carr[eè]\b|\bpan\s*bauletto\b|\bpane\b.*\ba\s+fette\b|\btramezzin/, "Pane in cassetta"],
  [/\bpan(e)?\b.*\bintegral|\bintegral.*\bpane\b/, "Pane integrale"],
  [/\bpan(e)?\s*grattugiat|\bpangrattato\b/, "Pangrattato"],
  [/\bfette\s+biscottate\b/, "Fette biscottate"],
  [/\bpiadin/, "Piadine"],
  [/\bfiloncin|\bfilone\b|\brosett|\bciabatt|\bbaguette|\bpagnott|\bpane\b/, "Pane comune"],
  [/\blatte\b.*\b(senza\s+lattosio|zymil|delattosato|digeribile|accadi)/, "Latte senza lattosio"],
  [/\blatte\b.*\b(soia|avena|riso|mandorl)|\bbevanda\b.*\b(soia|avena|riso|mandorl)/, "Bevanda vegetale"],
  [/\blatte\b.*\b(parz|ps\b|parzialmente)/, "Latte parzialmente scremato"],
  [/\blatte\b.*\bscremato\b/, "Latte scremato"],
  [/\blatte\b.*\bintero\b/, "Latte intero"],
  [/\blatte\b.*\bcondensat/, "Latte condensato"],
  [/\byogurt\b.*\bgrec/, "Yogurt greco"],
  [/\byogurt\b/, "Yogurt"],
  [/\bmozzarell.*\bbufal|\bbufal.*\bmozzarell/, "Mozzarella di bufala"],
  [/\bmozzarell/, "Mozzarella"],
  [/\bparmigiano\b/, "Parmigiano Reggiano"],
  [/\bgrana\b/, "Grana Padano"],
  [/\bpecorino\b/, "Pecorino"],
  [/\bprosciutto\b.*\bcotto\b/, "Prosciutto cotto"],
  [/\bprosciutto\b.*\bcrudo\b|\bprosciutto\s+(di\s+)?(parma|san\s+daniele)/, "Prosciutto crudo"],
  [/\bolio\b.*\bextra\s*vergine|\bevo\b/, "Olio extravergine"],
  [/\bolio\b.*\bsemi\b/, "Olio di semi"],
  [/\bpassata\b/, "Passata di pomodoro"],
  [/\bpolpa\b.*\bpomodor/, "Polpa di pomodoro"],
  [/\bpelati\b/, "Pomodori pelati"],
  [/\bspaghett/, "Spaghetti"],
  [/\bpenne\b/, "Penne"],
  [/\bfusill/, "Fusilli"],
  [/\brigaton/, "Rigatoni"],
  [/\bpasta\b.*\buovo\b|\btagliatell|\bfettuccin/, "Pasta all'uovo"],
  [/\bcaff[eè]\b.*\b(capsul|cialde)/, "Caffè in capsule"],
  [/\bcaff[eè]\b/, "Caffè macinato"],
  [/\bdetersivo\b.*\bpiatti\b/, "Detersivo piatti"],
  [/\bdetersivo\b.*\blavatrice\b|\bdetersivo\b.*\bcapi\b|\blavatrice\b/, "Detersivo lavatrice"],
  [/\bpastiglie\b.*\blavastoviglie\b|\blavastoviglie\b/, "Lavastoviglie"],
  [/\bcarta\s+igienica\b/, "Carta igienica"],
  [/\bcarta\s+(da\s+)?cucina\b|\basciugatutto\b|\bscottex\b/, "Carta da cucina"],
  [/\buova\b/, "Uova"],
  [/\bacqua\b.*\b(frizzante|gassata|effervescente)/, "Acqua frizzante"],
  [/\bacqua\b/, "Acqua naturale"],
];

const cap = (s: string) => s.charAt(0).toLocaleUpperCase("it") + s.slice(1);

/** Il nome senza la marca (che si mostra a parte). */
export function withoutBrand(product: string, brand: string | null | undefined): string {
  if (!brand) return product;
  const b = brand.trim();
  const re = new RegExp(`(^|\\s)${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i");
  const out = product.replace(re, " ").replace(/\s+/g, " ").trim();
  return out || product;
}

/**
 * Il tipo di prodotto: da una tabella per la spesa più comune, altrimenti le prime due parole
 * significative del nome senza marca e quantità ("Fettine di mela disidratate" → "Fettine mela").
 */
export function productKind(product: string, brand?: string | null): string {
  const name = withoutBrand(product, brand);
  const t = name.toLocaleLowerCase("it").normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [re, label] of KINDS) if (re.test(t)) return label;
  const w = words(name).filter((x) => !/^\d/.test(x));
  return w.length ? cap(w.slice(0, 2).join(" ")) : cap(name);
}

/** Un prezzo nella ricerca: quello della famiglia o del listino, con marca e tipo. */
export interface SearchRow {
  id: string;
  store: StoreId;
  brand: string | null;
  name: string;
  kind: string;
  cents: number;
  qty: string | null;
  unitCents: number | null;
  unit: Unit | null;
  offer: boolean;
  card: string | null;
  validTo: number | null;
  /** "famiglia" se l'avete visto voi, altrimenti la fonte del listino */
  source: string;
  seenAt: number;
}

export interface SearchGroup {
  kind: string;
  rows: SearchRow[];
}

export function toRow(p: Price & { brand?: string | null; card?: string | null; validTo?: number | null }): SearchRow {
  const brand = p.brand?.trim() || null;
  return {
    id: p.id,
    store: p.store,
    brand,
    name: withoutBrand(p.product, brand),
    kind: productKind(p.product, brand),
    cents: p.cents,
    qty: p.qty,
    unitCents: p.unitCents,
    unit: p.unit,
    offer: p.offer,
    card: p.card ?? null,
    validTo: p.validTo ?? null,
    source: p.source ?? "famiglia",
    seenAt: p.seenAt,
  };
}

/** Il più conveniente prima: al kg/l se l'unità è la stessa, altrimenti il prezzo pieno. */
function cheaper(a: SearchRow, b: SearchRow): number {
  if (a.unitCents && b.unitCents && a.unit === b.unit) return a.unitCents - b.unitCents;
  if (a.unitCents && !b.unitCents) return -1;
  if (!a.unitCents && b.unitCents) return 1;
  return a.cents - b.cents;
}

/**
 * Cerca tra i prezzi: devono esserci tutte le parole scritte (nel nome, nella marca o nel tipo),
 * così "pane in cassetta" esclude il filone. Un prezzo della famiglia e uno del listino per lo
 * stesso prodotto nello stesso negozio restano entrambi: si vede da dove viene ognuno.
 * Gruppi ordinati per numero di prezzi, righe dal più conveniente.
 */
export function searchPrices(query: string, rows: SearchRow[], now = Date.now()): SearchGroup[] {
  if (words(query).length === 0) return [];
  const byKind = new Map<string, SearchRow[]>();
  for (const r of rows) {
    if (r.validTo && r.validTo < now) continue;
    if (!matches(query, `${r.kind} ${r.brand ?? ""} ${r.name}`)) continue;
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }
  return [...byKind.entries()]
    .map(([kind, list]) => ({ kind, rows: list.sort(cheaper) }))
    .sort((a, b) => b.rows.length - a.rows.length || a.kind.localeCompare(b.kind, "it"));
}
