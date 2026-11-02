import { describe, expect, it } from "vitest";
import { lineSum, mergeReceipts, netItems, parseReceipt, signedCents, storeFrom } from "../shared/receipt";

const sample = JSON.stringify({
  negozio: "LIDL Italia S.r.l. - Via Flaminia 12 Ancona",
  data: "02/11/2026",
  totale: "14,50",
  righe: [
    { testo: "LATTE PS MILB 1L", prodotto: "Latte parzialmente scremato Milbona 1 l", importo: 0.89, quantita: "1 l", tipo: "prodotto", sicuro: true },
    { testo: "DET LAV 40LAV", prodotto: "Detersivo lavatrice 40 lavaggi", importo: 5.29, tipo: "prodotto" },
    { testo: "SC. -20%", prodotto: "Sconto", importo: "1,06-", tipo: "sconto" },
    { testo: "SHOPPER", prodotto: "Busta", importo: 0.15, tipo: "prodotto" },
    { testo: "MOZZ ?? 125", prodotto: "Mozzarella 125 g", importo: 0.79, tipo: "prodotto", sicuro: false },
  ],
});

describe("scontrini", () => {
  it("legge negozio, data, totale e righe", () => {
    const r = parseReceipt(`Ecco lo scontrino: ${sample}`);
    expect(r?.store).toBe("lidl");
    expect(r?.date).toBe("2026-11-02");
    expect(r?.total).toBe(1450);
    expect(r?.lines.map((l) => l.kind)).toEqual(["item", "item", "discount", "bag", "item"]);
    expect(r?.lines[2].cents).toBe(-106);
    expect(r?.lines[4].sure).toBe(false);
  });
  it("toglie lo sconto dal prodotto sopra e ignora la busta", () => {
    const r = parseReceipt(sample)!;
    expect(netItems(r.lines).map((n) => [n.line.product, n.cents])).toEqual([
      ["Latte parzialmente scremato Milbona 1 l", 89],
      ["Detersivo lavatrice 40 lavaggi", 423],
      ["Mozzarella 125 g", 79],
    ]);
    expect(lineSum(r.lines)).toBe(89 + 529 - 106 + 15 + 79);
  });
  it("riconosce le catene", () => {
    expect(storeFrom("EUROSPIN TIRRENICA SPA")).toBe("euro");
    expect(storeFrom("Euro Spin")).toBe("euro");
    expect(storeFrom("CONAD SUPERSTORE")).toBe("conad");
    expect(storeFrom("Supermercato Oasi Torrette")).toBe("oasi");
    expect(storeFrom("Coop")).toBeNull();
  });
  it("capisce gli sconti scritti in vari modi", () => {
    expect(signedCents("-0,50")).toBe(-50);
    expect(signedCents("0,50-")).toBe(-50);
    expect(signedCents(-1.2)).toBe(-120);
    expect(signedCents("abc")).toBeNull();
  });
  it("unisce più foto senza ripetere le righe sovrapposte", () => {
    const line = (raw: string, cents: number) => ({ raw, product: raw, cents, qty: null, kind: "item" as const, sure: true });
    const a = { store: "conad" as const, storeText: "CONAD", date: "2026-11-02", total: null, lines: [line("A", 100), line("B", 200), line("C", 300)] };
    const b = { store: null, storeText: "", date: null, total: 1000, lines: [line("B", 200), line("C", 300), line("D", 400)] };
    const m = mergeReceipts([a, b])!;
    expect(m.lines.map((l) => l.raw)).toEqual(["A", "B", "C", "D"]);
    expect(m.total).toBe(1000);
    expect(m.store).toBe("conad");
  });
  it("restituisce null senza righe", () => {
    expect(parseReceipt('{"negozio":"x","righe":[]}')).toBeNull();
    expect(parseReceipt("illeggibile")).toBeNull();
  });
});

describe("abbinamento alla lista", () => {
  it("abbina ogni articolo a una riga sola, il più specifico prima", async () => {
    const { matchToList } = await import("../shared/receipt");
    const line = (product: string) => ({ raw: product.toUpperCase(), product, cents: 100, qty: null, kind: "item" as const, sure: true });
    const lines = [line("Latte di soia Alpro 1 l"), line("Latte parzialmente scremato 1 l"), line("Pane integrale"), { ...line("Busta"), kind: "bag" as const }];
    const items = [
      { id: "a", name: "Latte", done: false, deleted: false },
      { id: "b", name: "Latte di soia", done: false, deleted: false },
      { id: "c", name: "Pane", done: true, deleted: false },
      { id: "d", name: "Busta", done: false, deleted: false },
    ];
    const m = matchToList(lines, items);
    expect([...m.entries()].sort()).toEqual([
      [0, "b"],
      [1, "a"],
    ]);
  });
});
