// Generatore dei pasti. Le diete (grammature personali) non stanno nel codice: arrivano dal
// server solo alla famiglia autorizzata (vedi worker/family.ts). Qui c'è la logica che, per una
// data, sceglie le alternative della dieta, abbina una ricetta e calcola cosa serve comprare.

import { FOOD, food, PROTEIN_GROUPS } from "./foods";
import { CONTORNI, PANCAKE_FLAVOURS, PANCAKE_STEPS, RECIPES, SIDE_CARB_STEP, type Recipe, type Slot } from "./recipes";

export type { Slot } from "./recipes";
export const SLOTS: Slot[] = ["colazione", "spuntino", "pranzo", "merenda", "cena"];
export const SLOT_NAMES: Record<Slot, string> = { colazione: "Colazione", spuntino: "Spuntino", pranzo: "Pranzo", merenda: "Merenda", cena: "Cena" };
export const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
export const WEEKDAY_NAMES = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

export interface Portion {
  food: string;
  g: number;
}

/** Una voce della dieta: una o più alternative ("150 g pollo o 200 g merluzzo"). */
export type Component = Portion[];

export interface DietMeal {
  items: Component[];
  /** "pancake": la colazione segue la ricetta del pancake della dieta */
  note?: string;
}

export interface Person {
  id: string;
  name: string;
  /** chiave = giorno della settimana, 1 lunedì … 6 sabato; la domenica è libera */
  days: Record<string, Partial<Record<Slot, DietMeal>>>;
}

export interface Diets {
  people: Person[];
}

export interface MealSettings {
  /** giorni (1-6) in cui la persona pranza fuori casa, in mensa */
  mensa: Record<string, number[]>;
  potatoes: boolean;
  /** grammi di patate al posto di 100 g di riso */
  ratio: number;
  flour: boolean;
  /** giorni di pasti coperti dalla spesa */
  horizon: number;
  /** alimenti da evitare: ricette e contorni che li usano non escono */
  exclude: string[];
  /** alimenti da preferire: ricette e contorni che li usano escono più spesso */
  prefer: string[];
}

export const DEFAULT_SETTINGS: MealSettings = { mensa: { leandro: [1, 2, 3, 4] }, potatoes: false, ratio: 60, flour: true, horizon: 6, exclude: ["verza", "cavolfiore", "finocchi", "peperoni"], prefer: [] };
export const FLOUR_G = 5;

export interface Dish {
  date: string;
  slot: Slot;
  person: string;
  title: string;
  mensa?: boolean;
  recipeId?: string;
  /** stessa ricetta cucinata per più persone */
  together?: string[];
  portions: Portion[];
  aromi: string[];
  flour: boolean;
  potatoes: boolean;
  minutes?: number;
  steps: string[];
}

// ------------------------------------------------------------------ diete: lettura e controllo

/**
 * Legge le diete dal formato compatto del server:
 * { people: [{ id, name, days: { "1": { pranzo: ["riso:80|pane_schar:60", "pollo:150"] , colazione: { n: "pancake", c: [...] } } } }] }
 */
export function parseDiets(raw: unknown): Diets | null {
  if (!raw || typeof raw !== "object") return null;
  const people = (raw as { people?: unknown }).people;
  if (!Array.isArray(people) || people.length === 0 || people.length > 8) return null;
  const out: Person[] = [];
  for (const p of people) {
    if (!p || typeof p !== "object") return null;
    const { id, name, days } = p as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-z]{1,20}$/.test(id) || typeof name !== "string" || !name.trim()) return null;
    if (!days || typeof days !== "object") return null;
    const person: Person = { id, name: name.trim().slice(0, 30), days: {} };
    for (const [day, meals] of Object.entries(days as Record<string, unknown>)) {
      if (!/^[0-6]$/.test(day) || !meals || typeof meals !== "object") return null;
      person.days[day] = {};
      for (const [slot, m] of Object.entries(meals as Record<string, unknown>)) {
        if (!(SLOTS as string[]).includes(slot)) return null;
        const meal = parseMeal(m);
        if (!meal) return null;
        person.days[day][slot as Slot] = meal;
      }
    }
    out.push(person);
  }
  return { people: out };
}

function parseMeal(m: unknown): DietMeal | null {
  const list = Array.isArray(m) ? m : m && typeof m === "object" ? (m as { c?: unknown }).c : null;
  const note = m && typeof m === "object" && !Array.isArray(m) ? (m as { n?: unknown }).n : undefined;
  if (!Array.isArray(list) || list.length === 0 || list.length > 12) return null;
  const items: Component[] = [];
  for (const c of list) {
    if (typeof c !== "string") return null;
    const alts = c.split("|").map((a) => {
      const [f, g] = a.split(":");
      return { food: f.trim(), g: Number(g) };
    });
    if (alts.some((a) => !FOOD[a.food] || !Number.isFinite(a.g) || a.g <= 0 || a.g > 1000)) return null;
    items.push(alts);
  }
  return { items, note: typeof note === "string" ? note : undefined };
}

export function validateSettings(x: unknown): MealSettings {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const mensa: Record<string, number[]> = {};
  if (o.mensa && typeof o.mensa === "object") {
    for (const [k, v] of Object.entries(o.mensa as Record<string, unknown>)) {
      if (/^[a-z]{1,20}$/.test(k) && Array.isArray(v)) mensa[k] = [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 6))].sort();
    }
  }
  const ratio = Number(o.ratio);
  const horizon = Number(o.horizon);
  return {
    mensa: o.mensa && typeof o.mensa === "object" ? mensa : { ...DEFAULT_SETTINGS.mensa },
    potatoes: typeof o.potatoes === "boolean" ? o.potatoes : DEFAULT_SETTINGS.potatoes,
    ratio: Number.isFinite(ratio) && ratio >= 10 && ratio <= 600 ? Math.round(ratio) : DEFAULT_SETTINGS.ratio,
    flour: typeof o.flour === "boolean" ? o.flour : DEFAULT_SETTINGS.flour,
    horizon: Number.isInteger(horizon) && horizon >= 1 && horizon <= 14 ? horizon : DEFAULT_SETTINGS.horizon,
    exclude: Array.isArray(o.exclude) ? foodIds(o.exclude) : [...DEFAULT_SETTINGS.exclude],
    prefer: Array.isArray(o.prefer) ? foodIds(o.prefer) : [...DEFAULT_SETTINGS.prefer],
  };
}

function foodIds(list: unknown[]): string[] {
  return [...new Set(list.filter((f): f is string => typeof f === "string" && f in FOOD))].slice(0, 60);
}

// ------------------------------------------------------------------ date

/** "2026-11-09" → numero del giorno dall'epoca (UTC, così non cambia con l'ora legale). */
export function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 864e5);
}

export function addDays(date: string, n: number): string {
  return new Date((dayNumber(date) + n) * 864e5).toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Data di oggi nel fuso del telefono. */
export function today(now = new Date()): string {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ generatore

const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);

function mainOf(chosen: Portion[]): Portion | undefined {
  return (
    chosen.find((p) => PROTEIN_GROUPS.includes(food(p.food).group)) ??
    chosen.find((p) => ["mozzarella", "parmigiano", "pesto"].includes(p.food))
  );
}

function carbOf(chosen: Portion[]): Portion | undefined {
  return chosen.find((p) => food(p.food).group === "carbo" && !["farina_riso", "crackers_riso", "gallette_riso"].includes(p.food));
}

function accepts(r: Recipe, main: Portion | undefined): boolean {
  if (!main) return false;
  return r.proteins.includes(main.food) || r.proteins.includes(food(main.food).group);
}

function fits(r: Recipe, slot: Slot, chosen: Portion[]): boolean {
  if (!(r.slots as string[]).includes(slot)) return false;
  if (!accepts(r, mainOf(chosen))) return false;
  if (r.needs && !r.needs.every((n) => chosen.some((p) => p.food === n))) return false;
  const carb = carbOf(chosen);
  if (r.carbs) return !!carb && r.carbs.includes(carb.food);
  // un secondo con il carboidrato a parte: va bene con riso, pane e patate, non con la pasta
  return !carb || carb.food !== "pasta";
}

/** Mescola in modo stabile: stesso seme, stesso ordine. */
function shuffled<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Sceglie un'alternativa per ogni voce della dieta. La voce principale cambia per settimana, le altre ogni giorno. */
function choose(meal: DietMeal, date: string, exclude: string[] = []): Portion[] {
  const d = dayNumber(date);
  const week = Math.floor((d + 3) / 7); // le settimane cominciano di lunedì
  const wd = weekday(date);
  return meal.items.map((all, i) => {
    // le alternative da evitare escono solo se la dieta non ne lascia altre
    const ok = all.filter((a) => !exclude.includes(a.food));
    const alts = ok.length ? ok : all;
    if (alts.length === 1) return alts[0];
    const isMain = alts.some((a) => PROTEIN_GROUPS.includes(food(a.food).group));
    // la voce principale non dipende dalla posizione, così due persone con le stesse alternative mangiano lo stesso pesce
    const idx = isMain ? Math.floor(wd / 2) + week : d + i;
    return alts[mod(idx, alts.length)];
  });
}

function applySwaps(chosen: Portion[], s: MealSettings): { portions: Portion[]; potatoes: boolean } {
  let potatoes = false;
  const portions = chosen.map((p) => {
    if (s.potatoes && p.food === "riso") {
      potatoes = true;
      return { food: "patate", g: round5((p.g * s.ratio) / 100) };
    }
    return { ...p };
  });
  return { portions, potatoes };
}

function withVeg(portions: Portion[], veg: string[]): Portion[] {
  const out: Portion[] = [];
  for (const p of portions) {
    if (p.food === "verdure" && veg.length) {
      for (const v of veg) out.push({ food: v, g: round5(p.g / veg.length) });
    } else out.push(p);
  }
  return out;
}

function fill(step: string, names: Record<string, string>): string {
  return step.replace(/\{(proteina|carbo|verdura|contorno)\}/g, (_, k: string) => names[k] ?? k);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function listTitle(portions: Portion[]): string {
  const names = portions.filter((p) => p.food !== "olio").map((p) => food(p.food).name.replace(/ senza lattosio| d'uovo/g, ""));
  if (names.length <= 1) return cap(names[0] ?? "");
  return cap(`${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`);
}

/** Ripete due volte gli elementi che usano un alimento preferito: dopo il mescolamento finiscono più spesso in testa. */
function weighted<T>(list: T[], foods: (x: T) => string[], prefer: string[]): T[] {
  if (!prefer.length) return list;
  return list.flatMap((x) => (foods(x).some((f) => prefer.includes(f)) ? [x, x] : [x]));
}

const uniq = <T,>(list: T[]): T[] => [...new Set(list)];

function pickSide(s: MealSettings, week: number, n: number, usedToday: Set<string>): string {
  const ok = Object.keys(CONTORNI).filter((v) => !s.exclude.includes(v));
  const list = ok.length ? ok : Object.keys(CONTORNI);
  const seq = uniq(shuffled(weighted(list, (v) => [v], s.prefer), `contorni:${week}`));
  // niente stessa verdura due volte nello stesso giorno
  for (let k = 0; k < seq.length; k++) {
    const v = seq[mod(n + k, seq.length)];
    if (!usedToday.has(v)) return v;
  }
  return seq[mod(n, seq.length)];
}

/** Chiave della scelta "Altra ricetta" per un pasto. */
export const rerollKey = (date: string, slot: Slot) => `${date}:${slot}`;

/** Tutti i piatti di una data, per tutte le persone. */
export function planDay(date: string, diets: Diets, settings: MealSettings, rerolls: Record<string, number> = {}): Dish[] {
  const wd = weekday(date);
  const out: Dish[] = [];
  if (wd === 0) return out; // domenica: giorno libero
  const d = dayNumber(date);
  const week = Math.floor((d + 3) / 7);

  for (const slot of SLOTS) {
    const reroll = rerolls[rerollKey(date, slot)] ?? 0;
    // chi mangia questo pasto e con quali alimenti
    const eaters: { person: Person; meal: DietMeal; chosen: Portion[]; mensa: boolean }[] = [];
    for (const person of diets.people) {
      const meal = person.days[String(wd)]?.[slot];
      if (!meal) continue;
      const mensa = slot === "pranzo" && (settings.mensa[person.id] ?? []).includes(wd);
      eaters.push({ person, meal, chosen: choose(meal, date, settings.exclude), mensa });
    }

    if (slot === "pranzo" || slot === "cena") {
      // chi mangia a casa, raggruppato per alimento principale: una ricetta per gruppo
      const groups = new Map<string, typeof eaters>();
      for (const e of eaters) {
        if (e.mensa) {
          out.push({ date, slot, person: e.person.id, title: "Mensa", mensa: true, portions: [], aromi: [], flour: false, potatoes: false, steps: [] });
          continue;
        }
        const main = mainOf(e.chosen);
        const key = main ? `${food(main.food).group}:${carbOf(e.chosen)?.food === "pasta" ? "pasta" : ""}` : `solo:${e.person.id}`;
        groups.set(key, [...(groups.get(key) ?? []), e]);
      }
      for (const [key, members] of groups) {
        const swapped = members.map((m) => applySwaps(m.chosen, settings));
        const allowed = RECIPES.filter((r) => !r.veg.some((v) => settings.exclude.includes(v)));
        let candidates = allowed.filter((r) => swapped.every((s) => fits(r, slot, s.portions)));
        if (!candidates.length) candidates = allowed.filter((r) => swapped.every((s) => fits(r, slot, members[0].chosen)) && !r.carbs);
        const ids = members.map((m) => m.person.id);
        const together = ids.length > 1 ? ids : undefined;
        if (!candidates.length) {
          // nessuna ricetta adatta (per esempio la pizza): il pasto resta come nella dieta
          members.forEach((m, i) => {
            const main = mainOf(m.chosen);
            const title = main?.food === "pizza" ? "Pizza farcita a scelta" : listTitle(swapped[i].portions);
            out.push({ date, slot, person: m.person.id, title, together, portions: swapped[i].portions, aromi: [], flour: false, potatoes: swapped[i].potatoes, steps: [] });
          });
          continue;
        }
        // ordine nuovo ogni settimana; le verdure preferite contano doppio
        const sorted = candidates.sort((a, b) => a.id.localeCompare(b.id));
        const pool = uniq(shuffled(weighted(sorted, (r) => r.veg, settings.prefer), `${key}:${week}`));
        const offset = slot === "pranzo" ? Math.floor(pool.length / 2) : 0;
        const recipe = pool[mod(wd + offset + reroll, pool.length)];
        const flour = !!recipe.flour && settings.flour;
        const first = swapped[0].portions;
        // contorno a rotazione: in una settimana non si ripete
        const side = recipe.side ? pickSide(settings, week, wd + reroll + (slot === "pranzo" ? 8 : 0), new Set(out.filter((o) => o.date === date).flatMap((o) => o.portions.map((p) => p.food)))) : undefined;
        const veg = side ? [side] : recipe.veg;
        const names = {
          proteina: food(mainOf(first)?.food ?? "").name,
          carbo: food(carbOf(first)?.food ?? "").name,
          verdura: veg.map((v) => food(v).name).join(" e "),
          contorno: side ? CONTORNI[side].title : "verdure di stagione",
        };
        const steps = recipe.steps
          .filter((s) => flour || !s.startsWith("[f]"))
          .map((s) => fill(s.replace(/^\[f\]/, ""), names));
        if (side) steps.push(CONTORNI[side].step);
        if (!recipe.carbs) {
          // carboidrato a parte: un passaggio per tipo, con il nome di chi lo mangia se non è per tutti
          const byCarb = new Map<string, string[]>();
          swapped.forEach((s, i) => {
            const c = carbOf(s.portions);
            if (c) byCarb.set(c.food, [...(byCarb.get(c.food) ?? []), members[i].person.name]);
          });
          for (const [c, who] of byCarb) {
            const step = SIDE_CARB_STEP[c] ?? `Servi accanto ${food(c).name}.`;
            steps.push(who.length === members.length ? step : `Per ${who.join(" e ")}: ${step.charAt(0).toLowerCase()}${step.slice(1)}`);
          }
        }
        members.forEach((m, i) => {
          const portions = withVeg(swapped[i].portions, veg);
          if (flour) portions.push({ food: "farina_riso", g: FLOUR_G });
          out.push({ date, slot, person: m.person.id, title: cap(fill(recipe.title, names)), recipeId: recipe.id, together, portions, aromi: recipe.aromi, flour, potatoes: swapped[i].potatoes, minutes: recipe.minutes, steps });
        });
      }
      continue;
    }

    // colazione, spuntino, merenda: come da dieta, con le alternative che ruotano
    for (const e of eaters) {
      const portions = e.chosen.map((p) => ({ ...p }));
      if (e.meal.note === "pancake") {
        const flavour = PANCAKE_FLAVOURS[mod(d, PANCAKE_FLAVOURS.length)];
        out.push({ date, slot, person: e.person.id, title: `Pancake ${flavour}`, portions, aromi: [flavour.replace(/^(alla|al|allo) /, "")], flour: false, potatoes: false, minutes: 10, steps: PANCAKE_STEPS });
      } else {
        out.push({ date, slot, person: e.person.id, title: listTitle(portions), portions, aromi: [], flour: false, potatoes: false, steps: [] });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ dispensa e spesa

export interface Eaten {
  date: string;
  slot: Slot;
  person: string;
  portions: Portion[];
  at: number;
}
export interface Bought {
  food: string;
  g: number;
  at: number;
}
export interface Stock {
  food: string;
  g: number;
  at: number;
}

export const eatenId = (date: string, slot: Slot, person: string) => `eaten:${date}:${slot}:${person}`;

/** Quanto c'è in casa: ultimo inventario + acquisti dopo − pasti mangiati dopo. */
export function pantry(stock: Stock[], bought: Bought[], eaten: Eaten[]): Record<string, number> {
  const base = new Map<string, Stock>();
  for (const s of stock) {
    const cur = base.get(s.food);
    if (!cur || s.at > cur.at) base.set(s.food, s);
  }
  const out: Record<string, number> = {};
  const since = (f: string) => base.get(f)?.at ?? 0;
  for (const s of base.values()) out[s.food] = s.g;
  for (const b of bought) if (b.at > since(b.food)) out[b.food] = (out[b.food] ?? 0) + b.g;
  for (const e of eaten) {
    for (const p of e.portions) if (e.at > since(p.food)) out[p.food] = (out[p.food] ?? 0) - p.g;
  }
  for (const k of Object.keys(out)) out[k] = Math.max(0, Math.round(out[k]));
  return out;
}

export interface Need {
  food: string;
  g: number;
  /** "Mer cena", "Sab pranzo" */
  uses: string[];
}

/** Cosa comprare per i pasti dei prossimi giorni, tolto quello che c'è in casa. */
export function shoppingNeeds(
  from: string,
  diets: Diets,
  settings: MealSettings,
  rerolls: Record<string, number>,
  eatenIds: Set<string>,
  home: Record<string, number>,
): Need[] {
  const need = new Map<string, Need>();
  for (let i = 0; i < settings.horizon; i++) {
    const date = addDays(from, i);
    for (const dish of planDay(date, diets, settings, rerolls)) {
      if (dish.mensa || eatenIds.has(eatenId(date, dish.slot, dish.person))) continue;
      const label = `${WEEKDAYS[weekday(date)]} ${dish.slot}`;
      for (const p of dish.portions) {
        const n = need.get(p.food) ?? { food: p.food, g: 0, uses: [] };
        n.g += p.g;
        if (!n.uses.includes(label)) n.uses.push(label);
        need.set(p.food, n);
      }
    }
  }
  const out: Need[] = [];
  for (const n of need.values()) {
    const missing = n.g - (home[n.food] ?? 0);
    if (missing > 0) out.push({ ...n, g: missing });
  }
  return out.sort((a, b) => order(a.food) - order(b.food) || a.food.localeCompare(b.food));
}

const GROUP_ORDER = ["pollo", "manzo", "pesce_bianco", "pesce_grasso", "crostacei", "tonno", "uova", "latticini", "verdura", "frutta", "carbo", "legumi"];
function order(id: string): number {
  const i = GROUP_ORDER.indexOf(food(id).group);
  return i === -1 ? 99 : i;
}

/** Aromi freschi da avere in casa per le ricette dei prossimi giorni. */
export const FRESH_AROMI = ["limone", "zenzero", "cipollotto", "prezzemolo", "basilico", "rosmarino", "menta", "aneto", "erba cipollina", "salvia", "timo", "finocchietto", "coriandolo", "aglio"];
