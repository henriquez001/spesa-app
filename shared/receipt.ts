// Scontrini: tutte le righe lette da una o più foto, con negozio, data e totale.

import { looseJson } from "./loose-json";
import { normalizeName, type StoreId } from "./list";
import { matches, MAX_CENTS, words } from "./prices";

export type LineKind = "item" | "discount" | "bag" | "other";

export interface ReceiptLine {
  /** testo come stampato */
  raw: string;
  /** nome leggibile */
  product: string;
  /** importo in centesimi (negativo per gli sconti) */
  cents: number | null;
  qty: string | null;
  kind: LineKind;
  sure: boolean;
}

export interface Receipt {
  store: StoreId | null;
  storeText: string;
  /** data dello scontrino, AAAA-MM-GG */
  date: string | null;
  total: number | null;
  lines: ReceiptLine[];
}

const STORE_WORDS: [RegExp, StoreId][] = [
  [/\blidl\b/i, "lidl"],
  [/euro\s*spin/i, "euro"],
  [/\bconad\b/i, "conad"],
  [/\boasi\b/i, "oasi"],
];

export function storeFrom(text: string): StoreId | null {
  for (const [re, id] of STORE_WORDS) if (re.test(text)) return id;
  return null;
}

/** Come toCents ma accetta anche importi negativi (sconti). */
export function signedCents(x: unknown): number | null {
  let n: number;
  if (typeof x === "number") n = x;
  else if (typeof x === "string") {
    const m = x.replace(/\s/g, "").match(/(-)?\d+(?:[.,]\d{1,2})?(-)?/);
    if (!m) return null;
    n = Number(m[0].replace(/-/g, "").replace(",", "."));
    if (m[1] || m[2]) n = -n;
  } else return null;
  if (!Number.isFinite(n) || n === 0) return null;
  const c = Math.round(n * 100);
  return Math.abs(c) <= MAX_CENTS ? c : null;
}

function cleanDate(x: unknown): string | null {
  if (typeof x !== "string") return null;
  let m = x.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = x.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const KINDS: Record<string, LineKind> = { prodotto: "item", sconto: "discount", busta: "bag", altro: "other" };

export function parseReceipt(text: string): Receipt | null {
  const o = looseJson(text);
  if (!o) return null;
  const storeText = typeof o.negozio === "string" ? o.negozio.trim().slice(0, 80) : "";
  const lines: ReceiptLine[] = [];
  for (const r of Array.isArray(o.righe) ? o.righe.slice(0, 200) : []) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const raw = typeof x.testo === "string" ? x.testo.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const product = typeof x.prodotto === "string" ? normalizeName(x.prodotto) : "";
    let cents = signedCents(x.importo);
    let kind = KINDS[String(x.tipo)] ?? "item";
    if (cents !== null && cents < 0) kind = "discount";
    if (kind === "item" && /\b(shopper|busta|sacchetto)\b/i.test(`${raw} ${product}`)) kind = "bag";
    if (kind === "discount" && cents !== null && cents > 0) cents = -cents;
    if (!raw && !product) continue;
    const qty = typeof x.quantita === "string" && x.quantita.trim() ? x.quantita.trim().slice(0, 24) : null;
    lines.push({ raw: raw || product.toUpperCase(), product: product || raw, cents, qty, kind, sure: x.sicuro !== false && cents !== null && !!product });
  }
  if (lines.length === 0) return null;
  const total = signedCents(o.totale);
  return {
    store: storeFrom(storeText) ?? storeFrom(lines.slice(0, 3).map((l) => l.raw).join(" ")),
    storeText,
    date: cleanDate(o.data),
    total: total && total > 0 ? total : null,
    lines,
  };
}

/** Unisce le letture di più foto dello stesso scontrino, togliendo le righe ripetute dove le foto si sovrappongono. */
export function mergeReceipts(parts: Receipt[]): Receipt | null {
  if (parts.length === 0) return null;
  const lines: ReceiptLine[] = [];
  for (const p of parts) {
    let skip = 0;
    // la parte iniziale della foto successiva può ripetere le ultime righe della precedente
    for (let k = Math.min(5, p.lines.length, lines.length); k > 0; k--) {
      const tail = lines.slice(-k).map((l) => l.raw + l.cents);
      const head = p.lines.slice(0, k).map((l) => l.raw + l.cents);
      if (tail.join("|") === head.join("|")) {
        skip = k;
        break;
      }
    }
    lines.push(...p.lines.slice(skip));
  }
  return {
    store: parts.find((p) => p.store)?.store ?? null,
    storeText: parts.find((p) => p.storeText)?.storeText ?? "",
    date: parts.find((p) => p.date)?.date ?? null,
    total: [...parts].reverse().find((p) => p.total)?.total ?? null,
    lines,
  };
}

/** Somma delle righe incluse, per confrontarla con il totale stampato. */
export function lineSum(lines: ReceiptLine[]): number {
  return lines.reduce((t, l) => t + (l.cents ?? 0), 0);
}

/** Prezzo pagato per ogni prodotto: lo sconto si toglie dalla riga prodotto che lo precede. */
export function netItems(lines: ReceiptLine[]): { line: ReceiptLine; index: number; cents: number }[] {
  const out: { line: ReceiptLine; index: number; cents: number }[] = [];
  lines.forEach((line, index) => {
    if (line.kind === "discount" && line.cents && out.length > 0) {
      const last = out[out.length - 1];
      last.cents = Math.max(1, last.cents + line.cents);
    } else if (line.kind === "item" && line.cents && line.cents > 0) {
      out.push({ line, index, cents: line.cents });
    }
  });
  return out;
}

export const RECEIPT_PROMPT = `Questa è la foto di uno scontrino (o di una sua parte) di un supermercato italiano.
Rispondi SOLO con un oggetto JSON, senza altro testo, con queste chiavi:
"negozio": nome e indirizzo del negozio come stampati in alto, oppure "",
"data": data dello scontrino in formato AAAA-MM-GG, oppure null,
"totale": totale complessivo in euro come numero, oppure null se non si vede,
"righe": elenco di TUTTE le righe con un importo, nell'ordine, ognuna con:
  "testo": la riga come stampata,
  "prodotto": nome leggibile per esteso in italiano (es. "LATTE PS MILB 1L" → "Latte parzialmente scremato Milbona 1 l"),
  "importo": importo della riga in euro come numero, negativo per gli sconti,
  "quantita": quantità o peso se indicati (es. "1 l", "0,512 kg", "2 pz"), oppure null,
  "tipo": "prodotto", "sconto", "busta" oppure "altro" (resto, pagamento, punti, IVA non sono righe: non includerle),
  "sicuro": false se la riga non si legge bene.`;


/**
 * Abbina le righe dello scontrino agli articoli della lista ancora da prendere.
 * Ogni articolo e ogni riga si usano una volta sola; nel dubbio non si abbina.
 * Restituisce indice riga → id articolo.
 */
export function matchToList(lines: ReceiptLine[], items: { id: string; name: string; done: boolean; deleted: boolean }[]): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  const open = items.filter((i) => !i.deleted && !i.done);
  // prima gli articoli con il nome più lungo: "latte di soia" prima di "latte"
  open.sort((a, b) => words(b.name).length - words(a.name).length);
  for (const item of open) {
    const idx = lines.findIndex((l, i) => l.kind === "item" && !out.has(i) && matches(item.name, l.product));
    if (idx >= 0 && !used.has(item.id)) {
      out.set(idx, item.id);
      used.add(item.id);
    }
  }
  return out;
}
