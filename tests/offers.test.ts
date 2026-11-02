import { describe, expect, it } from "vitest";
import { parseOffersPage, parseValidTo } from "../shared/catalog";

const NOW = Date.UTC(2026, 10, 2, 12);
const attr = (o: object) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

describe("offerte settimanali", () => {
  it("legge la fine validità nei modi in cui la scrivono i volantini", () => {
    expect(parseValidTo("Offerte valide dal 03/11 al 09/11", NOW)).toBe(Date.UTC(2026, 10, 9, 22, 59, 59));
    expect(parseValidTo("fino al 9.11.2026", NOW)).toBe(Date.UTC(2026, 10, 9, 22, 59, 59));
    expect(parseValidTo("valide fino al 12 novembre", NOW)).toBe(Date.UTC(2026, 10, 12, 22, 59, 59));
    expect(parseValidTo("2026-11-08T23:59:59", NOW)).toBe(Date.UTC(2026, 10, 8, 22, 59, 59));
    // a cavallo d'anno: a fine dicembre "al 04/01" è gennaio dell'anno dopo
    expect(parseValidTo("dal 29/12 al 04/01", Date.UTC(2026, 11, 29))).toBe(Date.UTC(2027, 0, 4, 22, 59, 59));
    expect(parseValidTo("nessuna data", NOW)).toBeNull();
  });

  it("legge i prodotti in JSON-LD (schema.org) con la loro scadenza", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "Product", name: "Mozzarella 125 g", brand: { name: "Milbona" }, sku: "A1", offers: { price: "0.49", priceValidUntil: "2026-11-08" } },
        { "@type": "Product", name: "Senza prezzo", sku: "A2", offers: {} },
      ],
    })}</script>`;
    const { prices, cards } = parseOffersPage(html, "lidl-offerte", "lidl", NOW);
    expect(cards).toBe(2);
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ key: "lidl-offerte:A1", store: "lidl", product: "Mozzarella 125 g Milbona", cents: 49, offer: true, qty: "125 g", unit: "kg", unitCents: 392 });
    expect(prices[0].validTo).toBe(Date.UTC(2026, 10, 8, 22, 59, 59));
  });

  it("legge le schede con JSON negli attributi data-* e prende la scadenza dal testo della pagina", () => {
    const html = `<h2>Offerte valide dal 03/11 al 09/11</h2>
      <article data-grid-data="${attr({ productId: 77, fullTitle: "Pasta di semola 1 kg", price: { price: 0.79, oldPrice: 0.99 } })}"></article>
      <div data-gtm='{"item_id":"E5","item_name":"Olio extravergine 1 l","price":"5,49"}'></div>
      <div data-config="{&quot;lazy&quot;:true}"></div>`;
    const { prices } = parseOffersPage(html, "euro-offerte", "euro", NOW);
    expect(prices.map((p) => [p.key, p.cents, p.qty])).toEqual([
      ["euro-offerte:77", 79, "1 kg"],
      ["euro-offerte:E5", 549, "1 l"],
    ]);
    expect(prices.every((p) => p.offer && p.validTo === Date.UTC(2026, 10, 9, 22, 59, 59))).toBe(true);
  });

  it("una pagina senza prodotti non dà prezzi", () => {
    expect(parseOffersPage("<html><body>Volantino</body></html>", "oasi-offerte", "oasi", NOW)).toEqual({ prices: [], cards: 0 });
  });
});
