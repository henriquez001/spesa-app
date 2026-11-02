import { describe, expect, it } from "vitest";
import { applyOp, counts, normalizeName, sameName, sections, validateOp, wins, type Item, type ListState } from "../shared/list";

const base: Item = { id: "item000001", name: "Latte", store: "lidl", done: false, deleted: false, createdAt: 1, updatedAt: 1 };
const op = (item: Item, opId = "op00000001") => ({ opId, item });

describe("unione delle modifiche", () => {
  it("vince la modifica più recente, in qualsiasi ordine arrivino", () => {
    const a = { ...base, done: true, updatedAt: 5 };
    const b = { ...base, name: "Latte intero", updatedAt: 7 };
    const s1: ListState = {};
    applyOp(s1, op(a));
    applyOp(s1, op(b));
    const s2: ListState = {};
    applyOp(s2, op(b));
    applyOp(s2, op(a));
    expect(s1).toEqual(s2);
    expect(s1[base.id].name).toBe("Latte intero");
  });

  it("a parità di orario decide sempre la stessa versione", () => {
    const a = { ...base, done: true, updatedAt: 5 };
    const b = { ...base, done: false, updatedAt: 5 };
    expect(wins(a, b)).toBe(!wins(b, a));
  });

  it("riapplicare la stessa operazione non cambia nulla", () => {
    const s: ListState = {};
    expect(applyOp(s, op(base))).toBe(true);
    expect(applyOp(s, op(base))).toBe(false);
  });
});

describe("controllo dei dati in arrivo", () => {
  it("accetta un'operazione valida e pulisce il nome", () => {
    expect(validateOp(op({ ...base, name: "  Pane   integrale " }))?.item.name).toBe("Pane integrale");
  });
  it("rifiuta negozi sconosciuti, id strani e nomi vuoti", () => {
    expect(validateOp(op({ ...base, store: "esselunga" as never }))).toBeNull();
    expect(validateOp(op({ ...base, id: "../x" }))).toBeNull();
    expect(validateOp(op({ ...base, name: "   " }))).toBeNull();
    expect(validateOp({ opId: "x", item: base })).toBeNull();
  });
  it("taglia i nomi troppo lunghi", () => {
    expect(normalizeName("a".repeat(200))).toHaveLength(80);
  });
  it("riconosce lo stesso articolo scritto diversamente", () => {
    expect(sameName("latte ", "LATTE")).toBe(true);
  });
});

describe("sezioni per negozio", () => {
  const state: ListState = {
    a: { ...base, id: "a", store: "conad", createdAt: 1 },
    b: { ...base, id: "b", store: "lidl", createdAt: 2, done: true },
    c: { ...base, id: "c", store: "lidl", createdAt: 3 },
    d: { ...base, id: "d", store: null, createdAt: 4 },
    e: { ...base, id: "e", store: "euro", createdAt: 5, deleted: true },
  };
  it("mette prima i negozi di oggi, poi gli altri, poi quelli senza negozio", () => {
    const s = sections(state, ["lidl", "euro"]);
    expect(s.map((x) => x.key)).toEqual(["lidl", "euro", "altri", "nessuno"]);
    expect(s[0].items.map((i) => i.id)).toEqual(["c", "b"]);
    expect(s[1].items).toEqual([]);
    expect(s[2].items.map((i) => i.id)).toEqual(["a"]);
  });
  it("conta senza gli eliminati", () => {
    expect(counts(state)).toEqual({ total: 4, done: 1 });
  });
});
