import { describe, expect, it } from "vitest";
import { asPrice, bestFor, parseConad, qtyFromName, unescapeHtml } from "../shared/catalog";
import { matches, pricesFor, type Price } from "../shared/prices";

const card = (o: object) => `<div class="product-card" data-product="${JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><span>x</span></div>`;
const html =
  card({ code: "1001", name: "Latte UHT Parzialmente Scremato 1 L Conad", brand: "CONAD", price: 0.89 }) +
  card({ code: "1002", name: "Latte UHT Scremato 500 ml Conad", brand: "CONAD", price: "0,65" }) +
  card({ code: "1003", name: "Spaghetti n.5 500 g", brand: "Barilla", basePrice: { value: 1.29 }, finalPrice: { value: 0.99 } }) +
  card({ code: "1004", name: "Senza prezzo", brand: "X" }) +
  `<div data-product='{"code":"1005","name":"Pane bauletto 400 g","price":1.5}'></div>`;

describe("listino Conad", () => {
  it("legge le schede con data-product, comunque si chiamino i campi del prezzo", () => {
    const rows = parseConad(html, 1);
    expect(rows.map((r) => [r.key, r.cents, r.offer, r.qty])).toEqual([
      ["conad-listino:1001", 89, false, "1 L"],
      ["conad-listino:1002", 65, false, "500 ml"],
      ["conad-listino:1003", 99, true, "500 g"],
      ["conad-listino:1005", 150, false, "400 g"],
    ]);
    expect(rows[2].product).toBe("Spaghetti n.5 500 g Barilla");
    expect(rows[1].unit).toBe("l");
    expect(rows[1].unitCents).toBe(130);
  });
  it("sceglie il più conveniente al litro/kg", () => {
    const rows = parseConad(html, 1);
    expect(bestFor("Latte", rows, matches).conad?.key).toBe("conad-listino:1001");
    expect(bestFor("Pane", rows, matches).conad?.cents).toBe(150);
    expect(bestFor("Biscotti", rows, matches).conad).toBeUndefined();
  });
  it("i prezzi della famiglia vincono sul listino finché sono recenti", () => {
    const now = Date.UTC(2026, 10, 2);
    const cat = asPrice(parseConad(html, now)[0]);
    const family: Price = { ...cat, id: "fam1", cents: 79, seenAt: now - 5 * 864e5, source: undefined };
    expect(pricesFor("Latte", { [cat.id]: cat, fam1: family }, now).conad?.id).toBe("fam1");
    const old = { ...family, seenAt: now - 90 * 864e5 };
    expect(pricesFor("Latte", { [cat.id]: cat, fam1: old }, now).conad?.id).toBe(cat.id);
  });
  it("utilità", () => {
    expect(unescapeHtml("a &amp; b &#39;c&#x27; &quot;")).toBe("a & b 'c' \"");
    expect(qtyFromName("Detersivo 2 x 1,5 l")).toBe("2 x 1,5 l");
  });
});
