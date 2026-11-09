import { useState } from "preact/hooks";
import { amount, buyAmount, food } from "../shared/foods";
import {
  addDays,
  eatenId,
  pantry,
  planDay,
  rerollKey,
  shoppingNeeds,
  SLOT_NAMES,
  SLOTS,
  today,
  validateSettings,
  weekday,
  WEEKDAY_NAMES,
  WEEKDAYS,
  type Bought,
  type Diets,
  type Dish,
  type Eaten,
  type MealSettings,
  type Need,
  type Slot,
  type Stock,
  FLOUR_G,
} from "../shared/meals";
import { randomId } from "../shared/list";
import type { ListStore } from "./sync";
import { Icon, Sheet } from "./ui";

// Schermata Pasti (variante P3): striscia dei giorni, filtro per persona, pasti del giorno.
// Impostazioni nel foglio S2. La spesa "Per i pasti" sta nella scheda Spesa (MealNeeds).

const SETTINGS_ID = "settings:pasti";
const GEAR =
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";

// ---------------------------------------------------------------- dati derivati dai documenti

export function mealState(store: ListStore) {
  const docs = Object.values(store.docs).filter((d) => !d.deleted);
  const settings = validateSettings(store.docs[SETTINGS_ID]?.deleted ? null : store.docs[SETTINGS_ID]?.data);
  const rerolls: Record<string, number> = {};
  const eaten: Eaten[] = [];
  const bought: Bought[] = [];
  const stock: Stock[] = [];
  for (const d of docs) {
    const kind = d.id.slice(0, d.id.indexOf(":"));
    const x = d.data as Record<string, unknown>;
    if (kind === "reroll" && Number.isInteger(x.n)) rerolls[d.id.slice(7)] = x.n as number;
    else if (kind === "eaten" && Array.isArray(x.portions)) eaten.push(x as unknown as Eaten);
    else if (kind === "bought" && typeof x.food === "string") bought.push(x as unknown as Bought);
    else if (kind === "stock" && typeof x.food === "string") stock.push(x as unknown as Stock);
  }
  const eatenIds = new Set(docs.filter((d) => d.id.startsWith("eaten:")).map((d) => d.id));
  return { settings, rerolls, eaten, bought, stock, eatenIds, home: pantry(stock, bought, eaten) };
}

const personName = (diets: Diets, id: string) => diets.people.find((p) => p.id === id)?.name ?? id;

function longDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const month = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][m - 1];
  const wd = WEEKDAY_NAMES[weekday(date)];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d} ${month}`;
}

function Who({ diets, id }: { diets: Diets; id: string }) {
  const i = diets.people.findIndex((p) => p.id === id);
  return (
    <span class={`who p${i % 4}`} aria-hidden="true">
      {personName(diets, id).charAt(0)}
    </span>
  );
}

const CHECK = (
  <span class="check" aria-hidden="true">
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 7.5l2.6 2.6L11 4.6" />
    </svg>
  </span>
);

// ---------------------------------------------------------------- schermata

export function MealsScreen({ store }: { store: ListStore }) {
  const diets = store.diets;
  const [day, setDay] = useState(0);
  const [who, setWho] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<{ slot: Slot; id: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const start = today();
  const date = addDays(start, day);
  const st = mealState(store);

  const header = (
    <header class="nav">
      <div>
        <h1 class="large">Pasti</h1>
        <span class="nav-sub">{longDate(date)}</span>
      </div>
      {diets && (
        <button class="tool icon-only" aria-label="Impostazioni" onClick={() => setSettingsOpen(true)}>
          <Icon d={GEAR} />
        </button>
      )}
    </header>
  );

  if (!diets) {
    return (
      <>
        {header}
        <p class="empty">
          Le diete non sono ancora arrivate su questo telefono. Apri l'app con la rete attiva: arrivano dal server solo per la vostra famiglia.
        </p>
      </>
    );
  }

  const dishes = planDay(date, diets, st.settings, st.rerolls);
  const shown = who ? dishes.filter((d) => d.person === who) : dishes;

  function toggleEaten(d: Dish) {
    const id = eatenId(d.date, d.slot, d.person);
    if (st.eatenIds.has(id)) store.setDoc(id, {}, true);
    else store.setDoc(id, { date: d.date, slot: d.slot, person: d.person, portions: d.portions, at: Date.now() });
  }

  function reroll(slot: Slot) {
    const key = rerollKey(date, slot);
    store.setDoc(`reroll:${key}`, { n: (st.rerolls[key] ?? 0) + 1 });
  }

  return (
    <>
      {header}
      <div class="days" role="tablist" aria-label="Giorno">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(start, i);
          return (
            <button
              key={d}
              class={`day${i === day ? " on" : ""}${i === 0 ? " today" : ""}`}
              role="tab"
              aria-selected={i === day}
              aria-label={`${i === 0 ? "Oggi, " : ""}${longDate(d)}`}
              onClick={() => setDay(i)}
            >
              <small>{WEEKDAYS[weekday(d)].toUpperCase()}</small>
              <span>{Number(d.slice(8))}</span>
            </button>
          );
        })}
      </div>
      <div class="seg" role="tablist" aria-label="Persona">
        {[null, ...diets.people.map((p) => p.id)].map((id) => (
          <button key={id ?? "tutti"} role="tab" aria-selected={who === id} class={who === id ? "on" : ""} onClick={() => setWho(id)}>
            {id ? personName(diets, id) : "Entrambi"}
          </button>
        ))}
      </div>

      {dishes.length === 0 ? (
        <p class="empty">
          Giorno libero.
          <br />
          Nessun pasto previsto dalla dieta.
        </p>
      ) : (
        SLOTS.map((slot) => {
          const list = shown.filter((d) => d.slot === slot);
          if (!list.length) return null;
          const cooked = list.find((d) => d.recipeId);
          const sameRecipe = cooked && list.filter((d) => d.recipeId).every((d) => d.recipeId === cooked.recipeId);
          return (
            <section key={slot} class="meal" aria-labelledby={`pasto-${slot}`}>
              <div class="mhead">
                <h2 id={`pasto-${slot}`}>{SLOT_NAMES[slot]}</h2>
                {cooked && (
                  <button class="link" onClick={() => reroll(slot)}>
                    Altra ricetta
                  </button>
                )}
              </div>
              <ul class="group">
                {list.map((d, i) => {
                  const showRecipe = d.recipeId && (!sameRecipe || list.findIndex((x) => x.recipeId) === i);
                  return [
                    showRecipe ? <RecipeRow key={`r-${d.person}`} dish={d} onOpen={() => setRecipe({ slot, id: d.recipeId! })} /> : null,
                    <DishRow
                      key={d.person}
                      diets={diets}
                      dish={d}
                      grouped={!!sameRecipe && !!d.recipeId}
                      done={st.eatenIds.has(eatenId(d.date, d.slot, d.person))}
                      onToggle={() => toggleEaten(d)}
                    />,
                  ];
                })}
              </ul>
            </section>
          );
        })
      )}

      <RecipeSheet diets={diets} dishes={recipe ? dishes.filter((d) => d.slot === recipe.slot && d.recipeId === recipe.id) : []} open={!!recipe} onClose={() => setRecipe(null)} />
      <SettingsSheet store={store} diets={diets} settings={st.settings} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

function RecipeRow({ dish, onOpen }: { dish: Dish; onOpen: () => void }) {
  return (
    <li class="row">
      <button class="txt recipe" onClick={onOpen}>
        <span class="txt-main">
          <span class="name strong">{dish.title}</span>
          <span class="pills">
            {dish.aromi.length > 0 && <span class="pill aroma">{dish.aromi.join(", ")}</span>}
            {dish.potatoes && <span class="pill aroma">patate al posto del riso</span>}
            {dish.flour && <span class="pill out">fuori piano: 5 g farina di riso</span>}
          </span>
          <span class="more">Preparazione{dish.minutes ? ` · ${dish.minutes} min` : ""} ›</span>
        </span>
      </button>
    </li>
  );
}

function DishRow(props: { diets: Diets; dish: Dish; grouped: boolean; done: boolean; onToggle: () => void }) {
  const { dish, diets } = props;
  const name = personName(diets, dish.person);
  const portions = dish.portions.filter((p) => !(dish.flour && p.food === "farina_riso" && p.g === FLOUR_G)).map((p) => amount(p.food, p.g)).join(" · ");
  const title = props.grouped ? name : dish.title;
  const meta = dish.mensa ? `${name} · pasto in azienda` : props.grouped ? portions : `${name} · ${portions}`;
  return (
    <li class={`row dish${props.done ? " done" : ""}`}>
      <span class="who-cell">
        <Who diets={diets} id={dish.person} />
      </span>
      <span class="txt static">
        <span class="txt-main">
          <span class="name">{title}</span>
          <span class="meta">{meta}</span>
          {!props.grouped && dish.potatoes && (
            <span class="pills">
              <span class="pill aroma">patate al posto del riso</span>
            </span>
          )}
        </span>
      </span>
      {!dish.mensa && (
        <button class="check-hit" role="checkbox" aria-checked={props.done} aria-label={`${title}: mangiato da ${name}`} onClick={props.onToggle}>
          {CHECK}
        </button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- ricetta

function RecipeSheet({ diets, dishes, open, onClose }: { diets: Diets; dishes: Dish[]; open: boolean; onClose: () => void }) {
  const first = dishes[0];
  return (
    <Sheet open={open && !!first} title="Ricetta" onClose={onClose} closeLabel="Chiudi">
      {first && (
        <div class="recipe-sheet">
          <span class="eyebrow">
            {longDate(first.date)} · {SLOT_NAMES[first.slot].toLowerCase()}
            {first.minutes ? ` · ${first.minutes} min` : ""}
          </span>
          {[...new Set(dishes.map((d) => d.recipeId))].map((rid) => {
            const group = dishes.filter((d) => d.recipeId === rid);
            const d0 = group[0];
            return (
              <div key={rid} class="recipe-block">
                <h3>{d0.title}</h3>
                <div class="ports">
                  {group.map((d) => (
                    <div key={d.person} class="port">
                      <span class="pn">
                        <Who diets={diets} id={d.person} />
                        {personName(diets, d.person)}
                      </span>
                      <ul>
                        {d.portions.map((p) => (
                          <li key={p.food}>{amount(p.food, p.g)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {d0.aromi.length > 0 && (
                  <p class="adds">
                    <b>Aggiunte:</b> {d0.aromi.join(", ")}, sale e pepe
                  </p>
                )}
                {d0.flour && <p class="adds out">La farina non è nella dieta: si toglie dalle Impostazioni.</p>}
                <h4>Preparazione</h4>
                <ol class="steps">
                  {d0.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- impostazioni (S2)

const MENSA_DAYS = [1, 2, 3, 4, 5, 6];

function SettingsSheet(props: { store: ListStore; diets: Diets; settings: MealSettings; open: boolean; onClose: () => void }) {
  const { store, settings: s } = props;
  const save = (patch: Partial<MealSettings>) => store.setDoc(SETTINGS_ID, { ...s, ...patch } as unknown as Record<string, unknown>);
  // la mensa riguarda chi ha pranzi nella dieta nei giorni feriali; di solito una persona sola
  const worker = props.diets.people.find((p) => p.id in s.mensa) ?? props.diets.people.find((p) => p.id === "leandro") ?? props.diets.people[0];
  const days = s.mensa[worker.id] ?? [];
  const toggleDay = (d: number) => save({ mensa: { ...s.mensa, [worker.id]: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() } });
  const listed = days.map((d) => WEEKDAY_NAMES[d]);

  return (
    <Sheet open={props.open} title="Impostazioni" onClose={props.onClose} closeLabel="Chiudi">
      <div class="settings">
        <h3 class="shead">{worker.name} · giorni in mensa</h3>
        <div class="sgroup">
          <div class="dchips">
            {MENSA_DAYS.map((d) => (
              <button key={d} class="dchip" aria-pressed={days.includes(d)} aria-label={WEEKDAY_NAMES[d]} onClick={() => toggleDay(d)}>
                {WEEKDAYS[d].charAt(0)}
              </button>
            ))}
          </div>
        </div>
        <p class="sfoot">
          {listed.length
            ? `${worker.name} pranza in azienda ${listed.join(", ")}: quei pranzi non entrano nella spesa.`
            : `${worker.name} pranza sempre a casa.`}{" "}
          Negli altri giorni il pranzo viene dalla dieta.
        </p>

        <h3 class="shead">Sostituzioni</h3>
        <div class="sgroup">
          <label class="srow">
            <span>Patate al posto del riso</span>
            <input type="checkbox" role="switch" class="switch" checked={s.potatoes} onChange={(e) => save({ potatoes: e.currentTarget.checked })} />
          </label>
          <div class="srow">
            <span class="srow-text">
              Riso 100 g
              <small>vale in patate</small>
            </span>
            <span class="val">{s.ratio} g</span>
            <span class="stepper">
              <button aria-label="Meno patate" disabled={s.ratio <= 10} onClick={() => save({ ratio: Math.max(10, s.ratio - 10) })}>
                −
              </button>
              <button aria-label="Più patate" disabled={s.ratio >= 600} onClick={() => save({ ratio: Math.min(600, s.ratio + 10) })}>
                +
              </button>
            </span>
          </div>
        </div>
        <p class="sfoot">Vale per pranzi e cene di tutti. Il valore va confermato con la nutrizionista.</p>

        <h3 class="shead">Ricette</h3>
        <div class="sgroup">
          <label class="srow">
            <span>Farina fuori piano (max 5 g)</span>
            <input type="checkbox" role="switch" class="switch" checked={s.flour} onChange={(e) => save({ flour: e.currentTarget.checked })} />
          </label>
        </div>
        <p class="sfoot">Le ricette che la usano mostrano l'etichetta arancio.</p>

        <h3 class="shead">Spesa</h3>
        <div class="sgroup">
          <div class="srow">
            <span class="srow-text">
              Pasti da coprire
              <small>giorni da oggi</small>
            </span>
            <span class="val">{s.horizon}</span>
            <span class="stepper">
              <button aria-label="Un giorno in meno" disabled={s.horizon <= 1} onClick={() => save({ horizon: s.horizon - 1 })}>
                −
              </button>
              <button aria-label="Un giorno in più" disabled={s.horizon >= 14} onClick={() => save({ horizon: s.horizon + 1 })}>
                +
              </button>
            </span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- spesa: "Per i pasti"

const NEEDS_SHOWN = 10;

export function MealNeeds({ store }: { store: ListStore }) {
  const [homeOpen, setHomeOpen] = useState(false);
  const [all, setAll] = useState(false);
  if (!store.diets) return null;
  const st = mealState(store);
  const from = today();
  const needs = shoppingNeeds(from, store.diets, st.settings, st.rerolls, st.eatenIds, st.home);
  const until = addDays(from, st.settings.horizon - 1);

  function buy(n: Need) {
    store.setDoc(`bought:${randomId()}`, { food: n.food, g: n.g, at: Date.now() });
  }

  return (
    <section aria-labelledby="sez-pasti">
      <div class="rsub">
        <h2 id="sez-pasti">Per i pasti</h2>
        <span>fino a {WEEKDAYS[weekday(until)].toLowerCase()} {Number(until.slice(8))}</span>
      </div>
      {needs.length ? (
        <ul class="group">
          {(all ? needs : needs.slice(0, NEEDS_SHOWN)).map((n) => (
            <li key={n.food} class="row">
              <button class="check-hit" role="checkbox" aria-checked={false} aria-label={`Preso: ${food(n.food).name}`} onClick={() => buy(n)}>
                {CHECK}
              </button>
              <span class="txt static">
                <span class="txt-main">
                  <span class="name">{cap(food(n.food).name)}</span>
                  <span class="meta">{usesLabel(n.uses)}</span>
                </span>
                <span class="qty">{buyAmount(n.food, n.g)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="group-empty">In casa c'è tutto per i pasti di questi giorni.</p>
      )}
      <div class="clear">
        {needs.length > NEEDS_SHOWN && (
          <button class="btn plain" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? "Mostra meno" : `Mostra tutti (${needs.length})`}
          </button>
        )}
        <button class="btn plain" onClick={() => setHomeOpen(true)}>
          Cosa c'è in casa
        </button>
      </div>
      <PantrySheet store={store} home={st.home} open={homeOpen} onClose={() => setHomeOpen(false)} />
    </section>
  );
}

function usesLabel(uses: string[]): string {
  if (uses.length <= 3) return uses.join(", ");
  return `${uses.slice(0, 2).join(", ")} e altri ${uses.length - 2} pasti`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function PantrySheet(props: { store: ListStore; home: Record<string, number>; open: boolean; onClose: () => void }) {
  const foods = Object.entries(props.home)
    .filter(([, g]) => g > 0)
    .sort((a, b) => food(a[0]).name.localeCompare(food(b[0]).name, "it"));
  function correct(id: string, value: string) {
    const g = Math.max(0, Math.round(Number(value.replace(",", "."))));
    if (!Number.isFinite(g) || g === props.home[id]) return;
    props.store.setDoc(`stock:${id}`, { food: id, g, at: Date.now() });
  }
  return (
    <Sheet open={props.open} title="In casa" onClose={props.onClose} closeLabel="Chiudi">
      <p class="hint">Scende da sola quando segnate un pasto come mangiato e sale quando spuntate quello che avete preso. Correggi i grammi se non tornano.</p>
      {foods.length ? (
        <ul class="group flush">
          {foods.map(([id, g]) => (
            <li key={id} class="row pantry">
              <label class="txt static" for={`casa-${id}`}>
                <span class="txt-main">
                  <span class="name">{cap(food(id).name)}</span>
                </span>
              </label>
              <span class="grams">
                <input
                  id={`casa-${id}`}
                  class="input num"
                  inputMode="numeric"
                  value={String(g)}
                  onBlur={(e) => correct(id, e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                />
                g
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="group-empty">Per ora non risulta niente: spunta gli alimenti in "Per i pasti" quando li compri.</p>
      )}
    </Sheet>
  );
}
