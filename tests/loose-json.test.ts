import { describe, expect, it } from "vitest";
import { parseReading } from "../shared/prices";
import { parseReceipt } from "../shared/receipt";

describe("risposte imperfette del modello", () => {
  it("prezzo con la virgola italiana", () => {
    const r = parseReading('{"prodotto": "Latte intero Granarolo", "prezzo": 1,29, "quantita": "1 l", "prezzo_unitario": 1,29, "unita": "l", "offerta": false, "leggibile": true}');
    expect(r?.cents).toBe(129);
    expect(r?.product).toMatch(/latte intero/i);
  });
  it("blocco ```json, apici singoli e virgola finale", () => {
    const r = parseReading("Ecco il risultato:\n```json\n{'prodotto': 'Pan bauletto', 'prezzo': 2.49, 'offerta': True,}\n```");
    expect(r?.cents).toBe(249);
    expect(r?.offer).toBe(true);
  });
  it("JSON rotto: legge i campi uno per uno", () => {
    const r = parseReading('{"prodotto": "Pasta Barilla penne", "prezzo": 0.89, "quantita": "500 g" "unita": "kg"');
    expect(r?.cents).toBe(89);
    expect(r?.product).toMatch(/penne/i);
  });
  it("scontrino con importi a virgola", () => {
    const r = parseReceipt('{"negozio": "Conad", "righe": [{"testo": "LATTE PS", "prodotto": "Latte", "importo": 1,19, "tipo": "articolo"}]}');
    expect(r?.lines[0]?.cents).toBe(119);
  });
});
