import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { asPrice, type CatalogPrice } from "../shared/catalog";
import { normalizeName, sameName, STORE_NAMES, type StoreId } from "../shared/list";
import { euro } from "../shared/prices";
import { searchPrices, toRow, type SearchRow } from "../shared/search";
import { perUnit } from "./photo";
import { dateShort } from "./prices-screen";
import { safeStorage, type ListStore } from "./sync";

// Scheda Cerca (giro 18, variante C1-A): un prodotto, il suo prezzo in ogni negozio.
// I risultati si dividono per tipo di prodotto e si confrontano solo dentro lo stesso tipo.

const RECENT_KEY = "spesa:ricerche";
const MAX_RECENT = 6;

function loadRecent(): string[] {
  try {
    const v = JSON.parse(safeStorage()?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]): void {
  try {
    safeStorage()?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // resta in memoria finché l'app è aperta
  }
}

/** Il nome con cui l'articolo entra in lista: marca e prodotto, perché si cercava proprio quello. */
function listName(r: SearchRow): string {
  const brand = r.brand && !/^marca\s/i.test(r.brand) ? r.brand : "";
  return normalizeName(brand ? `${brand} ${r.name}` : r.name);
}

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** "Pane in cassetta" → "in cassetta" nelle chip, quando tutti i tipi iniziano con la stessa parola. */
function chipLabel(kind: string, all: string[]): string {
  const first = kind.split(" ")[0];
  const same = all.length > 1 && all.every((k) => k.split(" ")[0] === first && k.includes(" "));
  return same ? kind.slice(first.length + 1) : kind;
}

export function SearchScreen({ store }: { store: ListStore }) {
  const [q, setQ] = useState("");
  const [online, setOnline] = useState<CatalogPrice[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "offline">("idle");
  const [kind, setKind] = useState("Tutti");
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const input = useRef<HTMLInputElement>(null);
  const query = q.trim();

  // sul server dalla seconda lettera, 250 ms dopo l'ultima battuta
  useEffect(() => {
    setKind("Tutti");
    if (query.length < 2) {
      setOnline([]);
      setState("idle");
      return;
    }
    let live = true;
    setState("loading");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/famiglie/${store.token}/cerca?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { prezzi?: CatalogPrice[] };
        if (live) {
          setOnline(body.prezzi ?? []);
          setState("done");
        }
      } catch {
        if (live) {
          setOnline([]);
          setState("offline");
        }
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, store.token]);

  const groups = useMemo(() => {
    if (query.length < 2) return [];
    const rows = [...Object.values(store.prices).filter((p) => !p.deleted), ...online.map(asPrice)].map(toRow);
    return searchPrices(query, rows);
  }, [query, online, store.prices]);

  function remember(text: string) {
    const t = text.trim().toLocaleLowerCase("it");
    if (t.length < 2) return;
    const next = [t, ...recent.filter((r) => r !== t)].slice(0, MAX_RECENT);
    setRecent(next);
    saveRecent(next);
  }

  function inList(r: SearchRow): boolean {
    const name = listName(r);
    return Object.values(store.items).some((i) => !i.deleted && !i.done && sameName(i.name, name));
  }

  function add(r: SearchRow) {
    const name = listName(r);
    const existing = Object.values(store.items).find((i) => !i.deleted && sameName(i.name, name));
    if (existing) store.update(existing.id, { done: false, store: r.store });
    else store.add(name, r.store);
    remember(query);
  }

  const kinds = groups.map((g) => g.kind);
  const shown = kind === "Tutti" ? groups : groups.filter((g) => g.kind === kind);
  const count = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <>
      <header class="nav">
        <h1 class="large">Cerca</h1>
      </header>
      <form
        class="search-bar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          remember(q);
          input.current?.blur();
        }}
      >
        <label class="search">
          <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" />
          </svg>
          <span class="sr-only">Cerca un prodotto</span>
          <input
            ref={input}
            type="search"
            placeholder="Pane in cassetta, latte intero…"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={80}
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
        </label>
      </form>

      {query.length < 2 ? (
        <>
          {recent.length > 0 && (
            <>
              <div class="rsub">
                <span>RICERCHE RECENTI</span>
                <button
                  class="link small"
                  onClick={() => {
                    setRecent([]);
                    saveRecent([]);
                  }}
                >
                  Cancella
                </button>
              </div>
              <div class="chips recent">
                {recent.map((r) => (
                  <button key={r} class="chip" onClick={() => setQ(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </>
          )}
          <p class="search-hint">Cerca tra i prezzi che avete fotografato, il listino Conad e le offerte di Lidl ed Eurospin. Si confrontano solo prodotti dello stesso tipo.</p>
        </>
      ) : groups.length === 0 ? (
        <p class="search-hint" aria-live="polite">
          {state === "loading"
            ? "Cerco…"
            : state === "offline"
              ? `Senza rete cerco solo tra i vostri prezzi, e per «${query}» non ce ne sono.`
              : `Nessun prezzo per «${query}». Aggiungilo alla lista e fotografa il prezzo quando lo trovi.`}
        </p>
      ) : (
        <>
          <div class="rsub" aria-live="polite">
            <span>
              {count} {count === 1 ? "PREZZO" : "PREZZI"} · {groups.length} {groups.length === 1 ? "TIPO" : "TIPI"}
            </span>
            {state === "loading" && <span>CERCO…</span>}
            {state === "offline" && <span>SOLO I VOSTRI</span>}
          </div>
          {groups.length > 1 && (
            <div class="chips hscroll" role="group" aria-label="Tipo di prodotto">
              {["Tutti", ...kinds].map((k) => (
                <button key={k} class={`chip${k === kind ? " on" : ""}`} aria-pressed={k === kind} onClick={() => setKind(k)}>
                  {k === "Tutti" ? "Tutti" : chipLabel(k, kinds)}
                </button>
              ))}
            </div>
          )}
          {shown.slice(0, 20).map((g) => (
            <section key={g.kind} class="prod" aria-label={g.kind}>
              <div class="prod-head">
                <h2>{g.kind}</h2>
                <span>
                  {g.rows.length} {g.rows.length === 1 ? "prodotto" : "prodotti"}
                  {g.rows[0].unitCents && g.rows[0].unit ? ` · da ${perUnit({ unitCents: g.rows[0].unitCents, unit: g.rows[0].unit })}` : ""}
                </span>
              </div>
              <ul class="prod-list">
                {g.rows.slice(0, 12).map((r, i) => (
                  <ResultRow key={r.id} row={r} best={i === 0 && g.rows.length > 1} added={inList(r)} onAdd={() => add(r)} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function ResultRow({ row: r, best, added, onAdd }: { row: SearchRow; best: boolean; added: boolean; onAdd: () => void }) {
  const from = r.source === "famiglia" ? `Vostro, ${dateShort(r.seenAt)}` : r.offer ? null : "Listino";
  const shop = STORE_NAMES[r.store as StoreId];
  return (
    <li class="prow">
      <span class="dot" style={{ background: `var(--s-${r.store})` }} aria-hidden="true" />
      <span class="prow-main">
        <span class="brand">{r.brand ?? `Marca ${shop}`}</span>
        <span class="prow-name">
          {r.name}
          {r.qty && !r.name.includes(r.qty) && <span class="qty"> {r.qty}</span>}
        </span>
        <span class="prow-where">
          {shop}
          {from ? ` · ${from}` : ""}
        </span>
        {(best || r.offer || r.card) && (
          <span class="meta wrap">
            {best && <span class="pill best">Più conveniente</span>}
            {r.offer && <span class="pill offer">{r.validTo ? `Offerta fino al ${shortDate(r.validTo)}` : "Offerta"}</span>}
            {r.card && <span class="pill offer">Con {r.card === "Eurospin Family" ? "carta Family" : r.card}</span>}
          </span>
        )}
      </span>
      <span class="prow-side">
        <span class="prow-price">
          {euro(r.cents)}
          {r.unitCents && r.unit && <small>{perUnit({ unitCents: r.unitCents, unit: r.unit })}</small>}
        </span>
        <button class={`add-pill${added ? " added" : ""}`} onClick={onAdd} disabled={added} aria-label={added ? `${r.name} è in lista` : `Aggiungi ${r.brand ?? ""} ${r.name} alla lista`}>
          <span>{added ? "In lista" : "Aggiungi"}</span>
        </button>
      </span>
    </li>
  );
}
