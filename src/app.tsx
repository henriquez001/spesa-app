import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  counts,
  normalizeName,
  sameName,
  sections,
  STORE_IDS,
  STORE_NAMES,
  type Item,
  type StoreId,
} from "../shared/list";
import { createFamily, inviteLink, loadToken, saveToken, tokenFromLink } from "./family";
import { ListStore, safeStorage, type Status } from "./sync";

type Tab = "lista" | "prezzi" | "offerte" | "negozi";

export function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  if (!token) {
    return (
      <Welcome
        onReady={(t) => {
          saveToken(t);
          setToken(t);
        }}
      />
    );
  }
  return <Home token={token} />;
}

// ---------------------------------------------------------------- benvenuto

function Welcome({ onReady }: { onReady: (token: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [link, setLink] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      onReady(await createFamily());
    } catch {
      setError("Serve la rete per creare la lista. Riprova quando sei connesso.");
      setBusy(false);
    }
  }

  function join(e: Event) {
    e.preventDefault();
    const t = tokenFromLink(link);
    if (t) onReady(t);
    else setError("Questo non sembra un link d'invito. Copialo di nuovo dal messaggio che hai ricevuto.");
  }

  return (
    <main class="welcome">
      <div class="rcard zz welcome-card">
        <div class="rhead">
          <b>SPESA DI CASA</b>
          <span>lista di famiglia</span>
        </div>
        <p>Una lista sola per tutta la famiglia. Quello che aggiunge uno compare subito sugli altri telefoni, e funziona anche senza rete.</p>
        <Barcode label="BENVENUTI" />
      </div>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {!joining ? (
        <div class="stack-actions">
          <button class="btn pri" onClick={create} disabled={busy}>
            {busy ? "Creo la lista…" : "Crea la lista di famiglia"}
          </button>
          <button class="btn plain" onClick={() => setJoining(true)}>
            Ho un link d'invito
          </button>
        </div>
      ) : (
        <form class="stack-actions" onSubmit={join}>
          <label class="field-label" for="invite">
            Incolla il link che ti hanno mandato
          </label>
          <input
            id="invite"
            class="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://…/?f=…"
            value={link}
            onInput={(e) => setLink(e.currentTarget.value)}
          />
          <button class="btn pri" type="submit" disabled={!link.trim()}>
            Entra nella lista
          </button>
          <button class="btn plain" type="button" onClick={() => setJoining(false)}>
            Annulla
          </button>
        </form>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- schermata principale

function useStore(token: string): ListStore {
  const store = useMemo(() => new ListStore(token), [token]);
  const [, force] = useState(0);
  useEffect(() => {
    const off = store.subscribe(() => force((n) => n + 1));
    store.connect();
    const wake = () => {
      if (document.visibilityState === "visible") store.wake();
    };
    addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      off();
      removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      store.close();
    };
  }, [store]);
  return store;
}

const TRIP_KEY = "spesa:giro";

function loadTrip(): StoreId[] {
  try {
    const raw = JSON.parse(safeStorage()?.getItem(TRIP_KEY) ?? "null") as unknown;
    if (Array.isArray(raw)) return STORE_IDS.filter((s) => raw.includes(s));
  } catch {
    // valore rovinato: si usa quello predefinito
  }
  return ["lidl", "euro"];
}

interface ToastState {
  id: number;
  text: string;
  undo?: () => void;
}

function Home({ token }: { token: string }) {
  const store = useStore(token);
  const [tab, setTab] = useState<Tab>("lista");
  const [trip, setTrip] = useState<StoreId[]>(loadTrip);
  const [editing, setEditing] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  function showToast(text: string, undo?: () => void) {
    setToast({ id: Date.now(), text, undo });
  }

  function toggleTrip(s: StoreId) {
    const next = trip.includes(s) ? trip.filter((x) => x !== s) : STORE_IDS.filter((x) => x === s || trip.includes(x));
    setTrip(next);
    try {
      safeStorage()?.setItem(TRIP_KEY, JSON.stringify(next));
    } catch {
      // resta valido finché l'app è aperta
    }
  }

  return (
    <div class="shell">
      <main class="content" id="contenuto">
        {tab === "lista" ? (
          <ListScreen
            store={store}
            trip={trip}
            onToggleTrip={toggleTrip}
            onEdit={setEditing}
            onInvite={() => setInviting(true)}
            onToast={showToast}
          />
        ) : (
          <Coming tab={tab} />
        )}
      </main>
      {toast && <Toast key={toast.id} toast={toast} onDone={() => setToast(null)} />}
      <TabBar tab={tab} onTab={setTab} />
      <EditSheet
        item={editing ? store.items[editing] : undefined}
        onClose={() => setEditing(null)}
        onSave={(id, patch) => store.update(id, patch)}
        onDelete={(id) => {
          const name = store.items[id]?.name ?? "";
          store.update(id, { deleted: true });
          setEditing(null);
          showToast(`Eliminato: ${name}`, () => store.update(id, { deleted: false }));
        }}
      />
      <InviteSheet open={inviting} token={token} onClose={() => setInviting(false)} />
    </div>
  );
}

function ListScreen(props: {
  store: ListStore;
  trip: StoreId[];
  onToggleTrip: (s: StoreId) => void;
  onEdit: (id: string) => void;
  onInvite: () => void;
  onToast: (text: string, undo?: () => void) => void;
}) {
  const { store, trip } = props;
  const secs = sections(store.items, trip);
  const { total, done } = counts(store.items);

  function clearDone() {
    const ids = Object.values(store.items)
      .filter((i) => i.done && !i.deleted)
      .map((i) => i.id);
    for (const id of ids) store.update(id, { deleted: true });
    props.onToast(ids.length === 1 ? "Tolto 1 articolo preso" : `Tolti ${ids.length} articoli presi`, () => {
      for (const id of ids) store.update(id, { deleted: false });
    });
  }

  return (
    <>
      <header class="nav">
        <h1 class="large">Spesa</h1>
        <button class="tool" onClick={props.onInvite}>
          <Icon d={ICONS.invite} />
          Invita
        </button>
      </header>

      <ReceiptCard total={total} done={done} trip={trip} onToggleTrip={props.onToggleTrip} />
      <SyncLine status={store.status} pending={store.pending.length} />
      <AddForm store={store} trip={trip} onToast={props.onToast} />

      {total === 0 ? (
        <p class="empty">La lista è vuota. Scrivi qui sopra cosa serve: comparirà subito anche sugli altri telefoni.</p>
      ) : (
        secs.map((s) => (
          <section key={s.key} aria-labelledby={`sez-${s.key}`}>
            <div class="rsub">
              <h2 id={`sez-${s.key}`}>
                {s.store && <span class="dot" style={{ background: `var(--s-${s.store})` }} aria-hidden="true" />}
                {s.title}
              </h2>
              <span>{s.items.filter((i) => !i.done).length} DA PRENDERE</span>
            </div>
            {s.items.length > 0 ? (
              <ul class="group">
                {s.items.map((item) => (
                  <Row key={item.id} item={item} showStore={s.key === "altri"} onToggle={() => store.update(item.id, { done: !item.done })} onEdit={() => props.onEdit(item.id)} />
                ))}
              </ul>
            ) : (
              <p class="group-empty">Niente da prendere qui.</p>
            )}
          </section>
        ))
      )}

      {done > 0 && (
        <div class="clear">
          <button class="btn plain" onClick={clearDone}>
            Togli i presi ({done})
          </button>
        </div>
      )}
    </>
  );
}

function ReceiptCard(props: { total: number; done: number; trip: StoreId[]; onToggleTrip: (s: StoreId) => void }) {
  const now = new Date();
  const date = now.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div class="rcard zz">
      <div class="rhead">
        <b>SPESA DI CASA</b>
        <span>{date}</span>
      </div>
      <div class="rline">
        <span>ARTICOLI</span>
        <span>{props.total}</span>
      </div>
      <div class="rline">
        <span>PRESI</span>
        <span>{props.done}</span>
      </div>
      <div class="rline big">
        <span>DA PRENDERE</span>
        <span>{props.total - props.done}</span>
      </div>
      <fieldset class="trip">
        <legend>Negozi di oggi</legend>
        <div class="chips">
          {STORE_IDS.map((s) => {
            const on = props.trip.includes(s);
            return (
              <button key={s} class={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => props.onToggleTrip(s)}>
                <span class="dot" style={{ background: `var(--s-${s})` }} aria-hidden="true" />
                {STORE_NAMES[s]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Barcode label={now.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }).replace("/", "") + " " + now.getFullYear()} />
    </div>
  );
}

function SyncLine({ status, pending }: { status: Status; pending: number }) {
  const text =
    status === "online"
      ? pending > 0
        ? "Invio delle modifiche…"
        : "Sincronizzata con la famiglia"
      : status === "connecting"
        ? "Collegamento…"
        : "Offline · le modifiche partono appena torna la rete";
  return (
    <p class={`sync ${status}`} role="status">
      <span class="sync-dot" aria-hidden="true" />
      {text}
    </p>
  );
}

function AddForm({ store, trip, onToast }: { store: ListStore; trip: StoreId[]; onToast: (t: string) => void }) {
  const [name, setName] = useState("");
  const [shop, setShop] = useState<string>(trip[0] ?? "");
  const input = useRef<HTMLInputElement>(null);

  function submit(e: Event) {
    e.preventDefault();
    const clean = normalizeName(name);
    if (!clean) return;
    const existing = Object.values(store.items).find((i) => !i.deleted && sameName(i.name, clean));
    if (existing && !existing.done) {
      onToast(`${existing.name} è già in lista`);
    } else if (existing) {
      store.update(existing.id, { done: false });
      onToast(`${existing.name} rimesso da prendere`);
    } else {
      store.add(clean, (shop || null) as StoreId | null);
    }
    setName("");
    input.current?.focus();
  }

  return (
    <form class="add" onSubmit={submit}>
      <label class="sr-only" for="nuovo">
        Articolo da aggiungere
      </label>
      <input
        id="nuovo"
        ref={input}
        class="input"
        placeholder="Aggiungi un articolo"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={80}
        value={name}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <div class="add-row">
        <label class="sr-only" for="negozio">
          Negozio
        </label>
        <select id="negozio" class="select" value={shop} onChange={(e) => setShop(e.currentTarget.value)}>
          <option value="">Qualsiasi negozio</option>
          {STORE_IDS.map((s) => (
            <option key={s} value={s}>
              {STORE_NAMES[s]}
            </option>
          ))}
        </select>
        <button class="btn pri small" type="submit" disabled={!normalizeName(name)}>
          Aggiungi
        </button>
      </div>
    </form>
  );
}

function Row({ item, showStore, onToggle, onEdit }: { item: Item; showStore: boolean; onToggle: () => void; onEdit: () => void }) {
  return (
    <li class={`row${item.done ? " done" : ""}`}>
      <button class="check-hit" role="checkbox" aria-checked={item.done} aria-label={item.name} onClick={onToggle}>
        <span class="check" aria-hidden="true">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7.5l2.6 2.6L11 4.6" />
          </svg>
        </span>
      </button>
      <button class="txt" onClick={onEdit} aria-label={`Modifica ${item.name}`}>
        <span class="txt-main">
          <span class="name">{item.name}</span>
          {showStore && item.store && (
            <span class="meta">
              <span class="dot" style={{ background: `var(--s-${item.store})` }} aria-hidden="true" />
              {STORE_NAMES[item.store]}
            </span>
          )}
        </span>
        <span class="chev" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- fogli

function useSheet(open: boolean): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      // un fotogramma dopo, così la transizione parte dalla posizione chiusa
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 400);
    return () => clearTimeout(t);
  }, [open]);
  return { mounted, shown };
}

function Sheet(props: { open: boolean; title: string; onClose: () => void; action?: ComponentChildren; children: ComponentChildren }) {
  const { mounted, shown } = useSheet(props.open);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!props.open) return;
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [props.open]);

  useEffect(() => {
    if (shown) box.current?.querySelector<HTMLElement>("[data-autofocus], button")?.focus();
  }, [shown]);

  if (!mounted) return null;
  return (
    <>
      <div class={`scrim${shown ? " on" : ""}`} onClick={props.onClose} aria-hidden="true" />
      <div ref={box} class={`sheet${shown ? " on" : ""}`} role="dialog" aria-modal="true" aria-label={props.title}>
        <div class="grab" aria-hidden="true" />
        <div class="sh">
          <button class="link" onClick={props.onClose}>
            Annulla
          </button>
          <b>{props.title}</b>
          <span class="sh-action">{props.action}</span>
        </div>
        {props.children}
      </div>
    </>
  );
}

function EditSheet(props: {
  item: Item | undefined;
  onClose: () => void;
  onSave: (id: string, patch: { name?: string; store?: StoreId | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [last, setLast] = useState<Item | undefined>(props.item);
  const [name, setName] = useState("");
  const [shop, setShop] = useState<StoreId | null>(null);
  const open = !!props.item;

  useEffect(() => {
    if (props.item) {
      setLast(props.item);
      setName(props.item.name);
      setShop(props.item.store);
    }
  }, [props.item?.id]);

  const item = props.item ?? last;
  if (!item) return null;

  function save() {
    if (!item) return;
    const clean = normalizeName(name);
    const patch: { name?: string; store?: StoreId | null } = {};
    if (clean && clean !== item.name) patch.name = clean;
    if (shop !== item.store) patch.store = shop;
    if (Object.keys(patch).length) props.onSave(item.id, patch);
    props.onClose();
  }

  return (
    <Sheet
      open={open}
      title="Modifica articolo"
      onClose={props.onClose}
      action={
        <button class="link strong" onClick={save} disabled={!normalizeName(name)}>
          Fine
        </button>
      }
    >
      <label class="field-label" for="nome">
        Nome
      </label>
      <input id="nome" class="input" data-autofocus value={name} maxLength={80} onInput={(e) => setName(e.currentTarget.value)} />
      <fieldset class="picker">
        <legend class="field-label">Negozio</legend>
        <div class="picklist">
        {([null, ...STORE_IDS] as (StoreId | null)[]).map((s) => (
          <label key={s ?? "nessuno"} class="pick">
            <input type="radio" name="negozio-mod" checked={shop === s} onChange={() => setShop(s)} />
            {s ? <span class="dot" style={{ background: `var(--s-${s})` }} aria-hidden="true" /> : <span class="dot ring" aria-hidden="true" />}
            <span class="pt">{s ? STORE_NAMES[s] : "Qualsiasi negozio"}</span>
            <span class="ok" aria-hidden="true">
              ✓
            </span>
          </label>
        ))}
        </div>
      </fieldset>
      <button class="btn danger" onClick={() => props.onDelete(item.id)}>
        Elimina articolo
      </button>
    </Sheet>
  );
}

function InviteSheet({ open, token, onClose }: { open: boolean; token: string; onClose: () => void }) {
  const link = inviteLink(token);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Spesa di casa", text: "Ecco la nostra lista della spesa:", url: link });
    } catch {
      // annullato dall'utente
    }
  }

  return (
    <Sheet open={open} title="Invita in famiglia" onClose={onClose}>
      <p class="sheet-text">Manda questo link a chi fa la spesa con te. Aprendolo vedrà e potrà modificare la stessa lista.</p>
      <input class="input mono" readOnly value={link} aria-label="Link d'invito" onFocus={(e) => e.currentTarget.select()} />
      <div class="stack-actions">
        {canShare && (
          <button class="btn pri" onClick={share}>
            Condividi link
          </button>
        )}
        <button class={`btn ${canShare ? "plain" : "pri"}`} onClick={copy}>
          {copied ? "Link copiato" : "Copia link"}
        </button>
      </div>
      <p class="hint">Chi ha il link può usare la lista: mandalo solo in famiglia.</p>
    </Sheet>
  );
}

function Toast({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    const t = setTimeout(onDone, 5000);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, []);
  return (
    <div class={`toast${shown ? " on" : ""}`} role="status">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          class="link strong"
          onClick={() => {
            toast.undo?.();
            onDone();
          }}
        >
          Annulla
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- altre schede

const COMING: Record<Exclude<Tab, "lista">, { title: string; text: string }> = {
  prezzi: { title: "Prezzi", text: "Qui fotograferai i cartellini: i prezzi finiranno nel negozio giusto e la lista ti dirà dove conviene. Arriva nella fase 2." },
  offerte: { title: "Offerte", text: "Qui vedrai le offerte dei volantini che corrispondono alla tua lista. Arriva nella fase 4." },
  negozi: { title: "Negozi", text: "Qui sceglierai i tuoi punti vendita e terrai le carte fedeltà. Arriva nella fase 5." },
};

function Coming({ tab }: { tab: Exclude<Tab, "lista"> }) {
  const c = COMING[tab];
  return (
    <>
      <header class="nav">
        <h1 class="large">{c.title}</h1>
      </header>
      <div class="coming">
        <Icon d={ICONS[tab]} />
        <h2>In arrivo</h2>
        <p>{c.text}</p>
      </div>
    </>
  );
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const tabs: [Tab, string][] = [
    ["lista", "Lista"],
    ["prezzi", "Prezzi"],
    ["offerte", "Offerte"],
    ["negozi", "Negozi"],
  ];
  return (
    <nav class="tabbar" aria-label="Sezioni">
      {tabs.map(([t, label]) => (
        <button key={t} class={`tab${tab === t ? " on" : ""}`} aria-current={tab === t ? "page" : undefined} onClick={() => onTab(t)}>
          <Icon d={ICONS[t]} />
          {label}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------- piccoli pezzi

const ICONS = {
  lista: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  prezzi: "M3 12l9-9h8v8l-9 9zM16 8h.01",
  offerte: "M4 4h16v16H4zM4 9h16M9 4v16",
  negozi: "M3 9l2-5h14l2 5M4 9v11h16V9M3 9h18",
  invite: "M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M16 11h6",
};

function Icon({ d }: { d: string }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const BARS = (() => {
  let x = 0;
  let r = 7;
  const out: [number, number][] = [];
  for (let i = 0; i < 40; i++) {
    r = (r * 9301 + 49297) % 233280;
    const w = 1 + (r % 3);
    if (i % 2 === 0) out.push([x, w]);
    x += w * 1.15;
  }
  return out;
})();

function Barcode({ label }: { label: string }) {
  return (
    <div class="barcode" aria-hidden="true">
      <svg viewBox="0 0 120 30" preserveAspectRatio="none">
        {BARS.map(([x, w]) => (
          <rect key={x} x={x} y={0} width={w} height={30} fill="currentColor" />
        ))}
      </svg>
      <span>{label}</span>
    </div>
  );
}
