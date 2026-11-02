import { normalizeName, type Item, type StoreId } from "../shared/list";
import { unitFromQty } from "../shared/prices";
import { lineSum, matchToList, netItems, signedCents, type Receipt, type ReceiptLine } from "../shared/receipt";
import type { NewPrice } from "./sync";

// Revisione dello scontrino (S2): righe modificabili, controllo della somma, cosa si salva.

export interface EditLine {
  line: ReceiptLine;
  product: string;
  /** importo come scritto, "0,89" o "-1,06" */
  price: string;
  include: boolean;
}

export function amountText(cents: number | null): string {
  if (cents === null) return "";
  return (cents < 0 ? "-" : "") + (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
}

export function toEdit(r: Receipt): EditLine[] {
  return r.lines.map((line) => ({ line, product: line.product, price: amountText(line.cents), include: line.kind === "item" || line.kind === "discount" }));
}

/** La riga come risulta dalle correzioni: esclusa diventa "altro", la busta inclusa diventa un prodotto. */
export function current(e: EditLine): ReceiptLine {
  let cents = signedCents(e.price);
  let kind = e.line.kind;
  if (!e.include) kind = "other";
  else if (kind === "bag" || kind === "other") kind = "item";
  if (kind === "discount" && cents !== null && cents > 0) cents = -cents;
  return { ...e.line, product: normalizeName(e.product), cents, kind };
}

/** Somma di tutte le righe stampate (anche quelle escluse: il totale le comprende). */
export function sumCheck(edits: EditLine[], total: number | null): { sum: number; diff: number | null } {
  const sum = lineSum(edits.map((e) => ({ ...e.line, cents: signedCents(e.price) })));
  return { sum, diff: total === null ? null : sum - total };
}

/** Data dello scontrino a mezzogiorno; se manca o non è plausibile, adesso. */
export function receiptSeenAt(date: string | null, now = Date.now()): number {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return now;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
  if (!Number.isFinite(t) || t > now + 24 * 3600_000 || t < now - 365 * 24 * 3600_000) return now;
  return Math.min(t, now);
}

export interface ReceiptPlan {
  prices: NewPrice[];
  /** articoli della lista da spuntare */
  tick: string[];
  /** indice riga → id articolo, per mostrare "Nella lista" */
  matched: Map<number, string>;
}

export function plan(edits: EditLine[], items: Item[], store: StoreId, seenAt: number): ReceiptPlan {
  const lines = edits.map(current);
  const matched = matchToList(lines, items);
  const prices: NewPrice[] = [];
  for (const n of netItems(lines)) {
    if (!n.line.product) continue;
    const u = unitFromQty(n.cents, n.line.qty);
    prices.push({
      product: n.line.product,
      store,
      cents: n.cents,
      qty: n.line.qty,
      unitCents: u?.unitCents ?? null,
      unit: u?.unit ?? null,
      offer: n.cents < (n.line.cents ?? 0),
      seenAt,
    });
  }
  return { prices, tick: [...matched.values()], matched };
}
