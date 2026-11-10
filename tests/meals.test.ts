import { describe, expect, it } from "vitest";
import { addDays, DEFAULT_SETTINGS, eatenId, pantry, parseDiets, planDay, shoppingNeeds, validateSettings, type Diets } from "../shared/meals";
import { amount, buyAmount, food } from "../shared/foods";
import { RECIPES } from "../shared/recipes";

// Dieta di prova inventata: stessa forma di quella vera, grammature diverse.
const RAW = {
  people: [
    {
      id: "anna",
      name: "Anna",
      days: {
        "1": { colazione: { n: "pancake", c: ["farina_riso:30", "albume:80"] }, pranzo: ["pasta:60", "fagioli:120", "olio:10", "verdure:200"], cena: ["pollo:200", "olio:10", "verdure:200"] },
        "2": { pranzo: ["riso:60", "tonno:60", "olio:10", "verdure:200"], cena: ["uova:120", "olio:10", "verdure:200"] },
        "3": { cena: ["merluzzo:200|salmone:100", "olio:10", "verdure:200"] },
        "4": { cena: ["uova:120", "olio:10", "verdure:200"] },
        "5": { cena: ["merluzzo:200|salmone:100", "olio:10", "verdure:200"] },
        "6": { pranzo: ["riso:100", "gamberetti:120", "olio:10", "verdure:150"], cena: ["pizza:400"] },
      },
    },
    {
      id: "leandro",
      name: "Bruno",
      days: {
        "1": { pranzo: ["riso:100|pane_schar:60", "pollo:150|merluzzo:200", "olio:20", "verdure:150"], cena: ["riso:50", "pollo:250", "olio:10", "verdure:200"] },
        "2": { cena: ["pane_schar:70", "uova:180", "olio:10", "verdure:200"] },
        "3": { cena: ["pane_schar:70", "merluzzo:300|salmone:140", "olio:10", "verdure:200"] },
        "4": { cena: ["pane_schar:70", "uova:180", "olio:10", "verdure:200"] },
        "5": { pranzo: ["riso:100|pane_schar:60", "pollo:150|merluzzo:200", "olio:20", "verdure:150"], cena: ["pane_schar:70", "merluzzo:300|salmone:140", "olio:10", "verdure:200"] },
        "6": { pranzo: ["riso:100", "gamberetti:120", "olio:10", "verdure:150"], cena: ["pane_schar:70", "manzo:250", "olio:10", "verdure:200"] },
      },
    },
  ],
};
const diets = parseDiets(RAW) as Diets;
const MON = "2026-11-09";

describe("diete", () => {
  it("legge il formato compatto", () => {
    expect(diets.people.map((p) => p.name)).toEqual(["Anna", "Bruno"]);
    expect(diets.people[0].days["1"].colazione?.note).toBe("pancake");
    expect(diets.people[1].days["1"].pranzo?.items[0]).toEqual([{ food: "riso", g: 100 }, { food: "pane_schar", g: 60 }]);
  });
  it("rifiuta alimenti sconosciuti e grammature assurde", () => {
    expect(parseDiets({ people: [{ id: "x", name: "X", days: { "1": { cena: ["patatine:100"] } } }] })).toBeNull();
    expect(parseDiets({ people: [{ id: "x", name: "X", days: { "1": { cena: ["pollo:-3"] } } }] })).toBeNull();
    expect(parseDiets(null)).toBeNull();
  });
});

describe("generatore", () => {
  it("la domenica è libera", () => {
    expect(planDay("2026-11-15", diets, DEFAULT_SETTINGS)).toEqual([]);
  });

  it("nei giorni di mensa il pranzo è in azienda, negli altri viene dalla dieta", () => {
    const mon = planDay(MON, diets, DEFAULT_SETTINGS).find((d) => d.slot === "pranzo" && d.person === "leandro")!;
    expect(mon.mensa).toBe(true);
    expect(mon.portions).toEqual([]);
    const fri = planDay("2026-11-13", diets, DEFAULT_SETTINGS).find((d) => d.slot === "pranzo" && d.person === "leandro")!;
    expect(fri.mensa).toBeFalsy();
    expect(fri.recipeId).toBeTruthy();
    const friMensa = planDay("2026-11-13", diets, { ...DEFAULT_SETTINGS, mensa: { leandro: [1, 2, 3, 4, 5] } }).find((d) => d.slot === "pranzo" && d.person === "leandro")!;
    expect(friMensa.mensa).toBe(true);
  });

  it("la cena è una ricetta sola con due porzioni", () => {
    for (let i = 0; i < 6; i++) {
      const date = addDays(MON, i);
      const cene = planDay(date, diets, DEFAULT_SETTINGS).filter((d) => d.slot === "cena");
      if (i === 5) {
        // sabato: pizza per lei, manzo per lui
        expect(cene.find((c) => c.person === "anna")!.title).toBe("Pizza farcita a scelta");
        expect(cene.find((c) => c.person === "leandro")!.recipeId).toBeTruthy();
        continue;
      }
      expect(cene).toHaveLength(2);
      expect(cene[0].recipeId).toBeTruthy();
      expect(cene[0].recipeId).toBe(cene[1].recipeId);
      expect(cene[0].together).toEqual(["anna", "leandro"]);
    }
  });

  it("le grammature restano quelle della dieta e le verdure prendono il nome della ricetta", () => {
    const [anna, bruno] = planDay(MON, diets, DEFAULT_SETTINGS).filter((d) => d.slot === "cena");
    expect(anna.portions.find((p) => p.food === "pollo")!.g).toBe(200);
    expect(bruno.portions.find((p) => p.food === "pollo")!.g).toBe(250);
    expect(bruno.portions.find((p) => p.food === "riso")!.g).toBe(50);
    const veg = anna.portions.filter((p) => !["pollo", "olio", "farina_riso"].includes(p.food));
    expect(veg.reduce((s, p) => s + p.g, 0)).toBe(200);
    expect(veg.some((p) => p.food === "verdure")).toBe(false);
    // il riso a parte ha il suo passaggio, solo per chi lo mangia
    expect(anna.steps.some((s) => s.startsWith("Per Bruno:"))).toBe(true);
  });

  it("una ricetta di cena non torna nella stessa settimana", () => {
    for (let w = 0; w < 6; w++) {
      const seen = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const c = planDay(addDays(MON, w * 7 + i), diets, DEFAULT_SETTINGS).find((d) => d.slot === "cena" && d.person === "leandro")!;
        expect(seen.has(c.recipeId!)).toBe(false);
        seen.add(c.recipeId!);
      }
    }
  });

  it("le cene cambiano da una settimana all'altra", () => {
    const a = planDay(MON, diets, DEFAULT_SETTINGS).find((d) => d.slot === "cena")!.recipeId;
    const b = planDay(addDays(MON, 7), diets, DEFAULT_SETTINGS).find((d) => d.slot === "cena")!.recipeId;
    expect(a).not.toBe(b);
  });

  it("Altra ricetta cambia la ricetta ma non le grammature", () => {
    const base = planDay(MON, diets, DEFAULT_SETTINGS).find((d) => d.slot === "cena" && d.person === "anna")!;
    const other = planDay(MON, diets, DEFAULT_SETTINGS, { [`${MON}:cena`]: 1 }).find((d) => d.slot === "cena" && d.person === "anna")!;
    expect(other.recipeId).not.toBe(base.recipeId);
    expect(other.portions.find((p) => p.food === "pollo")!.g).toBe(200);
  });

  it("patate al posto del riso con il rapporto scelto", () => {
    const s = { ...DEFAULT_SETTINGS, potatoes: true, ratio: 60, exclude: [...DEFAULT_SETTINGS.exclude, "quinoa", "grano_saraceno", "miglio"] };
    const bruno = planDay(MON, diets, s).find((d) => d.slot === "cena" && d.person === "leandro")!;
    expect(bruno.portions.find((p) => p.food === "riso")).toBeUndefined();
    expect(bruno.portions.find((p) => p.food === "patate")!.g).toBe(30);
    expect(bruno.potatoes).toBe(true);
    const sat = planDay("2026-11-14", diets, s).find((d) => d.slot === "pranzo" && d.person === "anna")!;
    expect(sat.portions.find((p) => p.food === "patate")!.g).toBe(60);
    expect(sat.recipeId).toBe("patate-gamberetti-limone");
    expect(sat.title).not.toMatch(/riso/i);
  });

  it("la farina fuori piano si può spegnere", () => {
    const withFlour = RECIPES.filter((r) => r.flour).map((r) => r.id);
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      const date = addDays(MON, i);
      for (let r = 0; r < 8; r++) {
        const on = planDay(date, diets, DEFAULT_SETTINGS, { [`${date}:cena`]: r }).find((d) => d.slot === "cena" && withFlour.includes(d.recipeId ?? ""));
        if (!on) continue;
        found = true;
        expect(on.portions.some((p) => p.food === "farina_riso" && p.g === 5)).toBe(true);
        const off = planDay(date, diets, { ...DEFAULT_SETTINGS, flour: false }, { [`${date}:cena`]: r }).find((d) => d.slot === "cena" && d.person === on.person)!;
        expect(off.portions.some((p) => p.food === "farina_riso")).toBe(false);
        expect(off.steps.join(" ")).not.toMatch(/farina/);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("il pancake segue la ricetta della dieta", () => {
    const c = planDay(MON, diets, DEFAULT_SETTINGS).find((d) => d.slot === "colazione")!;
    expect(c.title).toMatch(/^Pancake /);
    expect(c.steps.length).toBeGreaterThan(2);
  });

  it("le verdure da evitare non escono mai", () => {
    for (let i = 0; i < 56; i++) {
      for (let r = 0; r < 3; r++) {
        const date = addDays(MON, i);
        for (const d of planDay(date, diets, DEFAULT_SETTINGS, { [`${date}:cena`]: r, [`${date}:pranzo`]: r })) {
          for (const p of d.portions) expect(DEFAULT_SETTINGS.exclude).not.toContain(p.food);
        }
      }
    }
  });

  it("si può evitare anche un'alternativa della dieta", () => {
    const s = { ...DEFAULT_SETTINGS, exclude: ["salmone"] };
    for (let i = 0; i < 28; i++) {
      for (const d of planDay(addDays(MON, i), diets, s)) expect(d.portions.some((p) => p.food === "salmone")).toBe(false);
    }
  });

  it("le verdure preferite escono più spesso", () => {
    const count = (prefer: string[]) => {
      let n = 0;
      for (let i = 0; i < 84; i++) {
        for (const d of planDay(addDays(MON, i), diets, { ...DEFAULT_SETTINGS, prefer })) if (d.slot === "cena" && d.portions.some((p) => p.food === "spinaci")) n++;
      }
      return n;
    };
    expect(count(["spinaci"])).toBeGreaterThan(count([]));
  });

  it("le cene variano: tante ricette e contorni diversi in un mese, nessun contorno doppio nel giorno", () => {
    const recipes = new Set<string>();
    const titles = new Set<string>();
    for (let i = 0; i < 28; i++) {
      const day = planDay(addDays(MON, i), diets, DEFAULT_SETTINGS);
      for (const d of day.filter((x) => x.slot === "cena" && x.person === "leandro")) {
        recipes.add(d.recipeId!);
        titles.add(d.title);
      }
      const lunchVeg = new Set(day.filter((x) => x.slot === "pranzo").flatMap((x) => x.portions.map((p) => p.food)));
      for (const d of day.filter((x) => x.slot === "cena" && x.recipeId?.startsWith("c-"))) {
        const side = d.portions.find((p) => food(p.food).group === "verdura")!;
        expect(lunchVeg.has(side.food)).toBe(false);
      }
    }
    expect(recipes.size).toBeGreaterThanOrEqual(16);
    expect(titles.size).toBeGreaterThanOrEqual(20);
  });

  it("le impostazioni vecchie prendono le esclusioni di default e scartano alimenti sconosciuti", () => {
    expect(validateSettings({ potatoes: true }).exclude).toEqual(DEFAULT_SETTINGS.exclude);
    expect(validateSettings({ exclude: ["verza", "boh", 3], prefer: ["zucchine"] })).toMatchObject({ exclude: ["verza"], prefer: ["zucchine"] });
    expect(validateSettings({ exclude: [] }).exclude).toEqual([]);
  });

  it("equivalenze: tacchino, vitello e cereali senza glutine a parità di grammi, anche nei testi", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 42; i++) {
      for (const d of planDay(addDays(MON, i), diets, DEFAULT_SETTINGS)) {
        for (const p of d.portions) seen.add(p.food);
        const t = d.portions.find((p) => p.food === "tacchino");
        if (t && d.recipeId) {
          expect(`${d.title} ${d.steps.join(" ")}`).not.toMatch(/\bpollo\b/i);
          expect([200, 250, 150]).toContain(t.g);
        }
        if (d.portions.some((p) => p.food === "vitello")) expect(d.portions.find((p) => p.food === "vitello")!.g).toBe(250);
        for (const c of ["quinoa", "grano_saraceno", "miglio"]) if (d.portions.some((p) => p.food === c)) expect(d.steps.join(" ")).toMatch(c === "grano_saraceno" ? /grano saraceno/ : new RegExp(c));
      }
    }
    for (const f of ["tacchino", "vitello", "quinoa", "grano_saraceno", "miglio"]) expect(seen.has(f)).toBe(true);
    // da evitare vale anche per le equivalenze
    for (let i = 0; i < 42; i++) {
      for (const d of planDay(addDays(MON, i), diets, { ...DEFAULT_SETTINGS, exclude: ["tacchino", "quinoa"] })) {
        expect(d.portions.some((p) => p.food === "tacchino" || p.food === "quinoa")).toBe(false);
      }
    }
  });

  it("le due cene di pesce della settimana non ripetono lo stesso pesce", () => {
    const fish: string[] = [];
    for (let w = 0; w < 4; w++) for (const wd of [2, 4]) {
      const c = planDay(addDays(MON, w * 7 + wd), diets, DEFAULT_SETTINGS).find((d) => d.slot === "cena" && d.person === "anna")!;
      fish.push(c.portions[0].food);
    }
    for (let i = 1; i < fish.length; i++) expect(fish[i]).not.toBe(fish[i - 1]);
  });

  it("rapporto patate: i vecchi 60 g diventano i 400 g della guida, una scelta nuova resta", () => {
    expect(DEFAULT_SETTINGS.ratio).toBe(400);
    expect(validateSettings({ ratio: 60 }).ratio).toBe(400);
    expect(validateSettings({ ratio: 60, ratioChecked: true }).ratio).toBe(60);
    expect(validateSettings({ ratio: 380 }).ratio).toBe(380);
  });

  it("ogni ricetta ha passaggi e nessun segnaposto rimasto", () => {
    for (let i = 0; i < 28; i++) {
      for (const d of planDay(addDays(MON, i), diets, { ...DEFAULT_SETTINGS, potatoes: i % 2 === 0 })) {
        expect(d.title).not.toMatch(/[{}]/);
        for (const s of d.steps) expect(s).not.toMatch(/[{}]|\[f\]/);
      }
    }
  });
});

describe("dispensa e spesa", () => {
  it("dispensa: inventario, acquisti e pasti mangiati", () => {
    const home = pantry(
      [{ food: "pollo", g: 100, at: 10 }],
      [{ food: "pollo", g: 500, at: 20 }, { food: "pollo", g: 999, at: 5 }],
      [{ date: MON, slot: "cena", person: "anna", portions: [{ food: "pollo", g: 200 }], at: 30 }],
    );
    expect(home.pollo).toBe(400);
  });

  it("la spesa conta i pasti dei prossimi giorni meno quello che c'è in casa", () => {
    const s = { ...DEFAULT_SETTINGS, horizon: 1 };
    const needs = shoppingNeeds(MON, diets, s, {}, new Set(), { pollo: 100 });
    expect(needs.find((n) => n.food === "pollo")!.g).toBe(200 + 250 - 100);
    expect(needs.find((n) => n.food === "pollo")!.uses).toEqual(["Lun cena"]);
    // un pasto già mangiato non serve più
    const eaten = new Set([eatenId(MON, "cena", "anna"), eatenId(MON, "cena", "leandro")]);
    expect(shoppingNeeds(MON, diets, s, {}, eaten, {}).find((n) => n.food === "pollo")).toBeUndefined();
  });

  it("i pranzi in mensa non entrano nella spesa", () => {
    const needs = shoppingNeeds(MON, diets, { ...DEFAULT_SETTINGS, horizon: 1, mensa: { leandro: [1] } }, {}, new Set(), {});
    expect(needs.find((n) => n.food === "pollo")!.g).toBe(450);
  });
});

describe("quantità", () => {
  it("scrive uova e vasetti a pezzi", () => {
    expect(amount("uova", 180)).toBe("3 uova");
    expect(amount("mozzarella", 125)).toBe("1 mozzarella senza lattosio");
    expect(amount("pollo", 250)).toBe("250 g petto di pollo");
    expect(buyAmount("uova", 300)).toBe("5 uova");
    expect(buyAmount("frutta", 2400)).toBe("2,4 kg");
  });
});
