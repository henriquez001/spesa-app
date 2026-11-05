import { describe, expect, it } from "vitest";
import { parseEurospinPage, parseOffersPage } from "../shared/catalog";
import type { Price } from "../shared/prices";
import { productKind, searchPrices, toRow, withoutBrand } from "../shared/search";

const NOW = Date.UTC(2026, 10, 2, 12);
let n = 0;
const price = (product: string, store: Price["store"], cents: number, extra: Partial<Price> = {}): Price => ({
  id: `p${n++}`,
  product,
  store,
  cents,
  qty: null,
  unitCents: null,
  unit: null,
  offer: false,
  seenAt: NOW,
  deleted: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});

describe("ricerca prodotti", () => {
  it("riconosce il tipo di prodotto dal nome, senza confondere pane in cassetta e pane comune", () => {
    expect(productKind("Pan Bauletto bianco 400 g Mulino Bianco", "Mulino Bianco")).toBe("Pane in cassetta");
    expect(productKind("Pancarrè senza crosta 315 g")).toBe("Pane in cassetta");
    expect(productKind("Pane bianco a fette 400 g")).toBe("Pane in cassetta");
    expect(productKind("Filone casereccio 500 g")).toBe("Pane comune");
    expect(productKind("Pane integrale 500 g")).toBe("Pane integrale");
    expect(productKind("PARMALAT Latte parzialmente scremato 1 l", "PARMALAT")).toBe("Latte parzialmente scremato");
    expect(productKind("Latte intero fresco 1 l")).toBe("Latte intero");
    expect(productKind("Latte UHT senza lattosio 1 l")).toBe("Latte senza lattosio");
    expect(productKind("Fettine di mela disidratate PUERTOSOL", "PUERTOSOL")).toBe("Fettine mela");
  });

  it("toglie la marca dal nome solo quando è una parola intera", () => {
    expect(withoutBrand("Mozzarella fior di latte PASCOLI ITALIANI", "PASCOLI ITALIANI")).toBe("Mozzarella fior di latte");
    expect(withoutBrand("Conad Latte PS 1 l", "Conad")).toBe("Latte PS 1 l");
    expect(withoutBrand("Coca Cola", "Cola")).toBe("Coca");
    expect(withoutBrand("Latte", null)).toBe("Latte");
  });

  it("'pane in cassetta' trova solo il pane in cassetta; 'pane' li divide per tipo, il più conveniente al kg in cima", () => {
    const rows = [
      price("Pan Bauletto bianco Mulino Bianco", "conad", 219, { brand: "Mulino Bianco", unitCents: 548, unit: "kg", source: "conad-listino" }),
      price("Pancarrè senza crosta", "conad", 239, { unitCents: 759, unit: "kg", source: "conad-listino" }),
      price("Pane in cassetta 750 g", "lidl", 167, { unitCents: 223, unit: "kg" }),
      price("Filone casereccio 500 g", "conad", 160, { unitCents: 320, unit: "kg" }),
      price("Rosette scadute", "lidl", 99, { offer: true, validTo: NOW - 1 }),
    ].map(toRow);
    const exact = searchPrices("pane in cassetta", rows, NOW);
    expect(exact.map((g) => g.kind)).toEqual(["Pane in cassetta"]);
    expect(exact[0].rows.map((r) => r.cents)).toEqual([167, 219, 239]);
    expect(exact[0].rows[1]).toMatchObject({ brand: "Mulino Bianco", name: "Pan Bauletto bianco" });
    const all = searchPrices("pane", rows, NOW);
    expect(all.map((g) => [g.kind, g.rows.length])).toEqual([
      ["Pane in cassetta", 3],
      ["Pane comune", 1],
    ]);
    expect(searchPrices("x", rows, NOW)).toEqual([]);
  });

  it("si cerca anche per marca", () => {
    const rows = [price("Pan Bauletto bianco Mulino Bianco", "conad", 219, { brand: "Mulino Bianco" }), price("Pane in cassetta", "lidl", 167)].map(toRow);
    expect(searchPrices("mulino bianco", rows, NOW).flatMap((g) => g.rows.map((r) => r.store))).toEqual(["conad"]);
  });

  it("le offerte portano la marca a parte: Lidl dal titolo in maiuscolo, Eurospin dalla scheda", () => {
    const attr = (o: object) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const lidl = parseOffersPage(`<div data-grid-data="${attr({ productId: 1, fullTitle: "PARMALAT Latte parzialmente scremato", storeEndDate: NOW / 1000 + 9e4, price: { price: 1.19, packaging: { text: "1 l" } } })}"></div>`, "lidl-offerte", "lidl", NOW);
    expect(lidl.prices[0]).toMatchObject({ brand: "PARMALAT", qty: "1 l" });
    const euro = parseEurospinPage(`<li class="product-card" data-product-code="9"><h3 class="product-card__title m-0">Mozzarella</h3><p class="product-card__brand m-0">PASCOLI ITALIANI</p><span class="product-card__price-current">1,39€</span></li>`, NOW);
    expect(euro.prices[0]).toMatchObject({ brand: "PASCOLI ITALIANI", product: "Mozzarella PASCOLI ITALIANI" });
  });
});

describe("pan carrè", () => {
  it("è pane in cassetta", () => {
    expect(productKind("Pan Carrè Conad", "Conad")).toBe("Pane in cassetta");
  });
});
