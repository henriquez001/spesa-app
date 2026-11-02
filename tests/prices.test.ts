import { describe, expect, it } from "vitest";
import { compare, euro, matches, parseReading, toCents, unitFromQty, validatePrice, type Price, type PriceState } from "../shared/prices";

const day = 864e5;
function price(id: string, product: string, store: Price["store"], cents: number, seenAt = Date.now()): Price {
  return { id: `price-${id}`.padEnd(10, "0"), product, store, cents, qty: null, unitCents: null, unit: null, offer: false, seenAt, deleted: false, createdAt: seenAt, updatedAt: seenAt };
}

describe("importi", () => {
  it("capisce i prezzi scritti in modi diversi", () => {
    expect(toCents("1,29")).toBe(129);
    expect(toCents("€ 0.89")).toBe(89);
    expect(toCents(2)).toBe(200);
    expect(toCents("gratis")).toBeNull();
    expect(toCents(0)).toBeNull();
  });
  it("scrive gli euro all'italiana", () => {
    expect(euro(129).replace(/\s/g, " ")).toBe("1,29 €");
  });
  it("calcola il prezzo al kg, al litro e al pezzo", () => {
    expect(unitFromQty(129, "500 g")).toEqual({ unitCents: 258, unit: "kg" });
    expect(unitFromQty(89, "1 l")).toEqual({ unitCents: 89, unit: "l" });
    expect(unitFromQty(119, "4 x 125 g")).toEqual({ unitCents: 238, unit: "kg" });
    expect(unitFromQty(179, "6 uova")).toEqual({ unitCents: 30, unit: "pz" });
    expect(unitFromQty(100, "confezione")).toBeNull();
  });
});

describe("lettura del modello", () => {
  it("estrae il JSON anche con testo intorno", () => {
    const r = parseReading('Ecco: {"prodotto":"Latte parzialmente scremato Milbona","prezzo":"0,89","quantita":"1 l","prezzo_unitario":null,"unita":null,"offerta":false,"leggibile":true} spero vada bene');
    expect(r).toEqual({ product: "Latte parzialmente scremato Milbona", cents: 89, qty: "1 l", unitCents: 89, unit: "l", offer: false, sure: true });
  });
  it("segna da controllare se manca qualcosa", () => {
    expect(parseReading('{"prodotto":"Yogurt","prezzo":null,"leggibile":true}')?.sure).toBe(false);
    expect(parseReading('{"prodotto":"Yogurt","prezzo":1.19,"leggibile":false}')?.sure).toBe(false);
  });
  it("restituisce null se non c'è nulla", () => {
    expect(parseReading("non riesco a leggere")).toBeNull();
    expect(parseReading("{rotto")).toBeNull();
  });
});

describe("collegare prezzi e articoli", () => {
  it("riconosce lo stesso prodotto scritto in modo più lungo", () => {
    expect(matches("Latte", "Latte parzialmente scremato 1 l")).toBe(true);
    expect(matches("latte scremato", "LATTE PARZ. SCREMATO MILBONA")).toBe(true);
    expect(matches("Uova ×6", "Uova da allevamento a terra 6 pz")).toBe(true);
    expect(matches("Caffè", "Caffe Lavazza Crema e Gusto")).toBe(true);
  });
  it("non confonde prodotti diversi", () => {
    expect(matches("Latte", "Yogurt al latte intero")).toBe(true); // contiene "latte": accettato, ma vince il più recente/economico
    expect(matches("Pane", "Panettone")).toBe(false);
    expect(matches("Passata di pomodoro", "Pomodori pelati")).toBe(false);
  });

  const prices: PriceState = {};
  for (const p of [
    price("a", "Passata di pomodoro Cirio", "conad", 91),
    price("b", "Passata di pomodoro Baresa", "lidl", 75),
    price("c", "Passata pomodoro", "euro", 79),
    price("d", "Passata di pomodoro vecchia", "lidl", 99, Date.now() - 10 * day),
  ])
    prices[p.id] = p;

  it("trova il negozio più conveniente se vale la pena", () => {
    const c = compare("Passata di pomodoro", "conad", prices);
    expect(c.here?.cents).toBe(91);
    expect(c.cheaper?.price.store).toBe("lidl");
    expect(c.cheaper?.saving).toBe(16);
  });
  it("dice quanto si risparmia dove è già il più conveniente", () => {
    const c = compare("Passata di pomodoro", "lidl", prices);
    expect(c.best).toEqual({ other: expect.objectContaining({ store: "euro" }), saving: 4 });
  });
  it("sotto la soglia non propone di spostarsi", () => {
    const c = compare("Passata di pomodoro", "euro", prices);
    expect(c.cheaper).toBeNull();
  });
  it("controlla i prezzi in arrivo dalla rete", () => {
    expect(validatePrice(price("e", "Pane", "oasi", 150))).not.toBeNull();
    expect(validatePrice({ ...price("f", "Pane", "oasi", 150), cents: -1 })).toBeNull();
    expect(validatePrice({ ...price("g", "Pane", "esselunga" as never, 150) })).toBeNull();
  });
});
