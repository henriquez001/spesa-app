import { describe, expect, it } from "vitest";
import { lidlOfferLinks, parseEurospinPage, parseOffersPage, parseValidTo } from "../shared/catalog";

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

  // ricavati dalle pagine vere di lidl.it del 2026-11-02 (campi ridotti)
  it("Lidl: prezzo normale, prezzo solo con Lidl Plus, confezione, scadenza e offerte non ancora iniziate", () => {
    const end = 1794437999; // 2026-11-04 22:59:59 UTC
    const html = [
      { productId: 11150780, fullTitle: "Clementine", storeStartDate: 1793228400, storeEndDate: end, price: { price: 3.29, oldPrice: 4.99, packaging: { text: "2 kg cassetta" } } },
      { productId: 11029670, fullTitle: "Carote del Fucino IGP", storeStartDate: 1793228400, storeEndDate: end, price: { hasVat: false }, lidlPlus: [{ price: { price: 1.19, packaging: { text: "800 g confezione" } }, lidlPlusText: "Con Lidl Plus" }] },
      { productId: 11150791, fullTitle: "Finocchio", storeStartDate: 1793228400, storeEndDate: end, price: { price: 1.99, packaging: { text: "Al kg" } } },
      { productId: 99, fullTitle: "Broccoli", storeStartDate: Date.UTC(2026, 10, 5) / 1000, storeEndDate: end, price: { price: 0.99 } },
    ].map((o) => `<div data-grid-data="${attr(o)}"></div>`).join("");
    const { prices, cards } = parseOffersPage(html, "lidl-offerte", "lidl", NOW);
    expect(cards).toBe(4);
    expect(prices.map((p) => [p.key, p.product, p.cents, p.qty, p.unitCents, p.card])).toEqual([
      ["lidl-offerte:11150780", "Clementine", 329, "2 kg", 165, null],
      ["lidl-offerte:11029670", "Carote del Fucino IGP", 119, "800 g", 149, "Lidl Plus"],
      ["lidl-offerte:11150791", "Finocchio", 199, "1 kg", 199, null],
    ]);
    expect(prices.every((p) => p.offer && p.validTo === end * 1000)).toBe(true);
  });

  it("Lidl: dalla home prende le pagine offerte della settimana, senza quelle non alimentari", () => {
    const html = `<a href="/c/frutta-e-verdura-kw-44-26/a10105788"></a><a href="/c/frutta-e-verdura-kw-44-26/a10105788"></a>
      <a href="/c/store/super-offerte-kw-45-26/a10106092"></a><a href="/c/parkside-fai-da-te-e-giardino-kw-44-26/a10105797"></a>
      <a href="/c/cibo-e-bevande/s10068374"></a>`;
    expect(lidlOfferLinks(html)).toEqual(["https://www.lidl.it/c/frutta-e-verdura-kw-44-26/a10105788", "https://www.lidl.it/c/store/super-offerte-kw-45-26/a10106092"]);
  });

  // ricavato dall'elenco offerte vero di eurospin.com del 2026-11-02
  it("Eurospin: schede HTML con marchio, confezione, prezzo Family e scadenza; il modello vuoto non conta", () => {
    const card = (code: string, title: string, brand: string, meta: string, price: string, until: string) => `
      <li class="product-card relative flex" data-product-code="${code}" data-promotion-type="ribassati">
        <span class="product-card__badge-date whitespace-nowrap">Fino al <span class="product-card__badge-date-value">${until}</span></span>
        <h3 class="product-card__title m-0">${title}</h3>
        <p class="product-card__brand m-0 text-grey-500">${brand}</p>
        <div class="product-card__meta-wrapper flex"><p class="product-card__meta m-0">
            ${meta}
        </p></div>
        <div class="product-card__price-family"><div class="product-card__price-col"><span class="product-card__price-label">Prezzo Family</span>
        <span class="product-card__price-current product-card__price-current--promo">${price}</span></div></div>
      </li>`;
    const html = `<ul data-js="results">${card("143958", "Mozzarella fior di latte", "PASCOLI ITALIANI", "400g", "1,39€", "30/11/2026")}${card("200", "Soda caustica in scaglie", "", "1.000g", "2,99€", "30/11/2026")}</ul>
      <template>${card("", "", "", "", "", "")}</template>`;
    const { prices, cards } = parseEurospinPage(html, NOW);
    expect(cards).toBe(2);
    expect(prices.map((p) => [p.key, p.product, p.cents, p.qty, p.unitCents, p.card])).toEqual([
      ["euro-offerte:143958", "Mozzarella fior di latte PASCOLI ITALIANI", 139, "400g", 348, "Eurospin Family"],
      ["euro-offerte:200", "Soda caustica in scaglie", 299, "1000g", 299, "Eurospin Family"],
    ]);
    expect(prices.every((p) => p.store === "euro" && p.offer && p.validTo === Date.UTC(2026, 10, 30, 22, 59, 59))).toBe(true);
  });
});
