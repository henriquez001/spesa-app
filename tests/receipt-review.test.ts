import { describe, expect, it } from "vitest";
import type { Item } from "../shared/list";
import { parseReceipt } from "../shared/receipt";
import { plan, receiptSeenAt, sumCheck, toEdit } from "../src/receipt";

const receipt = parseReceipt(
  JSON.stringify({
    negozio: "LIDL Via Flaminia",
    data: "2026-11-02",
    totale: 8.12,
    righe: [
      { testo: "LATTE PS MILB 1L", prodotto: "Latte parzialmente scremato Milbona", importo: 0.89, quantita: "1 l", tipo: "prodotto" },
      { testo: "DET LAV 40LAV", prodotto: "Detersivo lavatrice", importo: 5.29, tipo: "prodotto" },
      { testo: "SC. -20%", prodotto: "Sconto sul detersivo", importo: -1.06, tipo: "sconto" },
      { testo: "SHOPPER", prodotto: "Busta della spesa", importo: 0.15, tipo: "busta" },
      { testo: "PANE INTEGR", prodotto: "Pane integrale", importo: 1.35, tipo: "prodotto" },
      { testo: "UOVA X6", prodotto: "Uova ×6", importo: 1.5, tipo: "prodotto" },
    ],
  }),
)!;

const item = (id: string, name: string, done = false): Item => ({ id, name, store: null, done, deleted: false, createdAt: 1, updatedAt: 1 });
const items = [item("a", "Latte"), item("b", "Pane"), item("c", "Uova", true), item("d", "Passata di pomodoro")];
const NOW = new Date(2026, 10, 2, 18).getTime();

describe("revisione scontrino", () => {
  it("salva i prodotti con lo sconto tolto e spunta quelli della lista", () => {
    const p = plan(toEdit(receipt), items, "lidl", 1);
    expect(p.prices.map((x) => [x.product, x.cents, x.offer])).toEqual([
      ["Latte parzialmente scremato Milbona", 89, false],
      ["Detersivo lavatrice", 423, true],
      ["Pane integrale", 135, false],
      ["Uova ×6", 150, false],
    ]);
    expect(p.prices[0].unit).toBe("l");
    // le uova sono già spuntate: non si toccano
    expect(p.tick.sort()).toEqual(["a", "b"]);
    expect(p.matched.get(0)).toBe("a");
  });
  it("una riga esclusa non si salva e non si spunta; la busta inclusa sì", () => {
    const e = toEdit(receipt);
    e[0].include = false;
    e[3].include = true;
    const p = plan(e, items, "lidl", 1);
    expect(p.prices.map((x) => x.product)).toEqual(["Detersivo lavatrice", "Busta della spesa", "Pane integrale", "Uova ×6"]);
    expect(p.tick).toEqual(["b"]);
  });
  it("le correzioni contano", () => {
    const e = toEdit(receipt);
    e[4].product = "Pane di semola";
    e[4].price = "1,40";
    const p = plan(e, items, "conad", 1);
    expect(p.prices.find((x) => x.product === "Pane di semola")?.cents).toBe(140);
    expect(p.prices.every((x) => x.store === "conad")).toBe(true);
  });
  it("confronta la somma delle righe con il totale", () => {
    expect(sumCheck(toEdit(receipt), receipt.total)).toEqual({ sum: 812, diff: 0 });
    const e = toEdit(receipt);
    e[1].price = "5,92";
    expect(sumCheck(e, receipt.total).diff).toBe(63);
  });
  it("usa la data dello scontrino solo se plausibile", () => {
    expect(new Date(receiptSeenAt("2026-11-01", NOW)).getDate()).toBe(1);
    expect(receiptSeenAt("2027-01-01", NOW)).toBe(NOW);
    expect(receiptSeenAt("2020-01-01", NOW)).toBe(NOW);
    expect(receiptSeenAt(null, NOW)).toBe(NOW);
  });
});
