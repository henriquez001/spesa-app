// Alimenti che possono comparire nelle diete e nelle ricette. Sono nomi generici:
// le grammature personali stanno nelle diete, che non sono nel codice (vedi meals.ts).

export type FoodGroup =
  | "carbo"
  | "pollo"
  | "uova"
  | "pesce_bianco"
  | "pesce_grasso"
  | "manzo"
  | "crostacei"
  | "tonno"
  | "legumi"
  | "latticini"
  | "condimento"
  | "verdura"
  | "frutta"
  | "colazione"
  | "snack"
  | "pronto";

export interface Food {
  id: string;
  /** nome nella ricetta e nella lista */
  name: string;
  group: FoodGroup;
  /** grammi di un pezzo, per contare uova, vasetti e confezioni */
  piece?: { g: number; one: string; many: string };
}

const F = (id: string, name: string, group: FoodGroup, piece?: Food["piece"]): Food => ({ id, name, group, piece });

export const FOODS: Food[] = [
  // carboidrati
  F("riso", "riso basmati", "carbo"),
  F("pasta", "pasta di semola", "carbo"),
  F("pane_schar", "pane casereccio Schär senza glutine", "carbo"),
  F("pane_integrale", "pane integrale", "carbo"),
  F("farina_riso", "farina di riso", "carbo"),
  F("patate", "patate", "carbo"),
  F("crackers_riso", "crackers di riso", "carbo"),
  F("gallette_riso", "gallette di riso", "carbo"),
  F("muesli", "muesli", "colazione"),
  // proteine
  F("pollo", "petto di pollo", "pollo"),
  F("uova", "uova", "uova", { g: 60, one: "uovo", many: "uova" }),
  F("albume", "albume d'uovo", "uova"),
  F("merluzzo", "merluzzo", "pesce_bianco"),
  F("nasello", "nasello", "pesce_bianco"),
  F("platessa", "platessa", "pesce_bianco"),
  F("salmone", "salmone", "pesce_grasso"),
  F("orata", "orata", "pesce_grasso"),
  F("sgombro", "sgombro", "pesce_grasso"),
  F("manzo", "bistecca di manzo", "manzo"),
  F("gamberetti", "gamberetti", "crostacei"),
  F("tonno", "tonno al naturale", "tonno", { g: 60, one: "scatoletta", many: "scatolette" }),
  F("fagioli", "fagioli in scatola", "legumi"),
  F("prosciutto_crudo", "prosciutto crudo", "snack"),
  // latticini
  F("mozzarella", "mozzarella senza lattosio", "latticini", { g: 125, one: "mozzarella", many: "mozzarelle" }),
  F("parmigiano", "parmigiano", "latticini"),
  F("philadelphia", "formaggio spalmabile senza lattosio", "latticini"),
  F("yogurt_greco0", "yogurt greco 0% senza lattosio", "latticini"),
  F("yogurt_fage", "yogurt greco Fage Total 5%", "latticini", { g: 150, one: "vasetto", many: "vasetti" }),
  F("yogurt_intero", "yogurt di latte intero", "latticini", { g: 125, one: "vasetto", many: "vasetti" }),
  // condimenti
  F("olio", "olio extravergine d'oliva", "condimento"),
  F("pesto", "pesto di basilico", "condimento"),
  F("burro_arachidi", "burro di arachidi", "colazione"),
  F("marmellata", "marmellata", "colazione", { g: 25, one: "monoporzione", many: "monoporzioni" }),
  F("gocce_cioccolato", "gocce di cioccolato fondente", "colazione"),
  F("cioccolato85", "cioccolato fondente 85%", "snack"),
  F("olive", "olive da tavola", "snack"),
  F("frutta_secca", "frutta secca", "snack"),
  F("frutta", "frutta fresca", "frutta"),
  F("pizza", "pizza farcita", "pronto", { g: 400, one: "pizza", many: "pizze" }),
  // verdure: "verdure" nella dieta diventa una di queste, scelta dalla ricetta
  F("verdure", "verdure di stagione", "verdura"),
  F("zucchine", "zucchine", "verdura"),
  F("finocchi", "finocchi", "verdura"),
  F("broccoli", "broccoli", "verdura"),
  F("cavolfiore", "cavolfiore", "verdura"),
  F("spinaci", "spinaci", "verdura"),
  F("peperoni", "peperoni", "verdura"),
  F("pomodorini", "pomodorini", "verdura"),
  F("passata", "passata di pomodoro", "verdura"),
  F("carote", "carote", "verdura"),
  F("verza", "verza", "verdura"),
  F("radicchio", "radicchio", "verdura"),
  F("cavolo_nero", "cavolo nero", "verdura"),
  F("fagiolini", "fagiolini", "verdura"),
  F("melanzane", "melanzane", "verdura"),
  F("rucola", "rucola", "verdura"),
  F("insalata", "insalata mista", "verdura"),
  F("sedano", "sedano", "verdura"),
  F("funghi", "funghi champignon", "verdura"),
  F("zucca", "zucca", "verdura"),
  F("cetrioli", "cetrioli", "verdura"),
  F("carciofi", "carciofi", "verdura"),
  F("porri", "porri", "verdura"),
  F("cavolini", "cavolini di Bruxelles", "verdura"),
  F("cipolla", "cipolla rossa", "verdura"),
];

export const FOOD: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

export function food(id: string): Food {
  return FOOD[id] ?? { id, name: id.replace(/_/g, " "), group: "verdura" };
}

export const PROTEIN_GROUPS: FoodGroup[] = ["pollo", "uova", "pesce_bianco", "pesce_grasso", "manzo", "crostacei", "tonno", "legumi", "pronto"];

/** "300 g petto di pollo", "3 uova", "1 mozzarella senza lattosio" */
export function amount(id: string, g: number): string {
  const f = food(id);
  if (f.piece && f.id !== "tonno" && Math.abs(g / f.piece.g - Math.round(g / f.piece.g)) < 0.15) {
    return pieces(f, Math.max(1, Math.round(g / f.piece.g)));
  }
  return `${Math.round(g)} g ${f.name}`;
}

function pieces(f: Food, n: number): string {
  const p = f.piece!;
  const word = n === 1 ? p.one : p.many;
  if (f.name === p.one || f.name === p.many) return `${n} ${word}`;
  // "mozzarella senza lattosio", "pizza farcita": il nome comincia già con il pezzo
  if (f.name.startsWith(p.one)) return `${n} ${word}${f.name.slice(p.one.length)}`;
  return `${n} ${word} di ${f.name}`;
}

/** Quantità da comprare: pezzi interi quando l'alimento si compra a pezzi. */
export function buyAmount(id: string, g: number): string {
  const f = food(id);
  if (f.piece) {
    // solo il numero e il pezzo: il nome dell'alimento è già nella riga
    const n = Math.max(1, Math.ceil(g / f.piece.g - 0.15));
    return `${n} ${n === 1 ? f.piece.one : f.piece.many}`;
  }
  if (g >= 1000) return `${(Math.ceil(g / 50) * 50 / 1000).toLocaleString("it-IT")} kg`;
  return `${Math.ceil(g / 10) * 10} g`;
}
