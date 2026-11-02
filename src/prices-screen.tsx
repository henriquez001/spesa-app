import { useEffect, useState } from "preact/hooks";
import { normalizeName, STORE_IDS, STORE_NAMES } from "../shared/list";
import { euro, isOld, toCents, unitFromQty, words, type Price } from "../shared/prices";
import { perUnit } from "./photo";
import type { ListStore } from "./sync";
import { Icon, ICONS, Sheet } from "./ui";

// Scheda Prezzi: i prezzi salvati, divisi per negozio, e il pulsante per fotografarne altri.

export function dateShort(ms: number): string {
  return new Date(ms).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

export function PricesScreen({ store, onPhoto, onEdit }: { store: ListStore; onPhoto: () => void; onEdit: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const q = words(query);
  const all = Object.values(store.prices)
    .filter((p) => !p.deleted)
    .filter((p) => q.length === 0 || q.every((w) => words(p.product).some((h) => h.startsWith(w))))
    .sort((a, b) => b.seenAt - a.seenAt);
  const total = Object.values(store.prices).filter((p) => !p.deleted).length;

  return (
    <>
      <header class="nav">
        <h1 class="large">Prezzi</h1>
      </header>
      <div class="prices-actions">
        <button class="btn pri wide" onClick={onPhoto}>
          <Icon d={ICONS.camera} />
          Fotografa prezzi
        </button>
        {total > 0 && (
          <>
            <label class="sr-only" for="cerca">
              Cerca un prezzo
            </label>
            <input id="cerca" class="input" type="search" placeholder="Cerca un prezzo" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
          </>
        )}
      </div>

      {total === 0 ? (
        <div class="coming">
          <Icon d={ICONS.prezzi} />
          <h2>Ancora nessun prezzo</h2>
          <p>In negozio tocca "Fotografa prezzi" e scatta i cartellini uno dopo l'altro. Leggo io nome e prezzo; tu controlli e salvi. Poi la lista ti dice dove conviene.</p>
        </div>
      ) : all.length === 0 ? (
        <p class="empty">Nessun prezzo per "{query}".</p>
      ) : (
        STORE_IDS.map((s) => {
          const list = all.filter((p) => p.store === s);
          if (list.length === 0) return null;
          return (
            <section key={s} aria-labelledby={`pz-${s}`}>
              <div class="rsub">
                <h2 id={`pz-${s}`}>
                  <span class="dot" style={{ background: `var(--s-${s})` }} aria-hidden="true" />
                  {STORE_NAMES[s]}
                </h2>
                <span>{list.length === 1 ? "1 PREZZO" : `${list.length} PREZZI`}</span>
              </div>
              <ul class="group">
                {list.map((p) => (
                  <PriceRow key={p.id} price={p} onEdit={() => onEdit(p.id)} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}

function PriceRow({ price: p, onEdit }: { price: Price; onEdit: () => void }) {
  const old = isOld(p);
  const meta = [p.qty, p.unitCents && p.unit ? perUnit({ unitCents: p.unitCents, unit: p.unit }) : null, `visto il ${dateShort(p.seenAt)}`].filter(Boolean).join(" · ");
  return (
    <li class="row">
      <button class="txt solo" onClick={onEdit} aria-label={`Modifica ${p.product}, ${euro(p.cents)}`}>
        <span class="txt-main">
          <span class="name">{p.product}</span>
          <span class="meta">
            {p.offer && <span class="pill offer">Offerta</span>}
            {old && <span class="pill old">Prezzo vecchio</span>}
            {meta}
          </span>
        </span>
        <span class="price">{euro(p.cents)}</span>
        <span class="chev" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

export function PriceSheet(props: { price: Price | undefined; onClose: () => void; store: ListStore; onDeleted: (p: Price) => void }) {
  const [last, setLast] = useState(props.price);
  const [product, setProduct] = useState("");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("");
  const [offer, setOffer] = useState(false);

  useEffect(() => {
    if (props.price) {
      setLast(props.price);
      setProduct(props.price.product);
      setAmount((props.price.cents / 100).toFixed(2).replace(".", ","));
      setQty(props.price.qty ?? "");
      setOffer(props.price.offer);
    }
  }, [props.price?.id]);

  const p = props.price ?? last;
  if (!p) return null;
  const cents = toCents(amount);
  const valid = !!cents && !!normalizeName(product);

  function save() {
    if (!p || !cents) return;
    const u = unitFromQty(cents, qty.trim() || null) ?? (cents === p.cents && p.unitCents && p.unit ? { unitCents: p.unitCents, unit: p.unit } : null);
    props.store.updatePrice(p.id, {
      product: normalizeName(product),
      cents,
      qty: qty.trim() || null,
      unitCents: u?.unitCents ?? null,
      unit: u?.unit ?? null,
      offer,
    });
    props.onClose();
  }

  return (
    <Sheet
      open={!!props.price}
      title={`Prezzo da ${STORE_NAMES[p.store]}`}
      onClose={props.onClose}
      action={
        <button class="link strong" disabled={!valid} onClick={save}>
          Fine
        </button>
      }
    >
      <div class="fields">
        <label class="fld">
          <span>Articolo</span>
          <input data-autofocus value={product} maxLength={80} onInput={(e) => setProduct(e.currentTarget.value)} />
        </label>
        <label class="fld">
          <span>Prezzo</span>
          <input value={amount} inputMode="decimal" onInput={(e) => setAmount(e.currentTarget.value)} />
        </label>
        <label class="fld">
          <span>Quantità</span>
          <input value={qty} placeholder="Es. 500 g" onInput={(e) => setQty(e.currentTarget.value)} />
        </label>
        <label class="fld">
          <span>In offerta</span>
          <input type="checkbox" role="switch" class="switch" checked={offer} onChange={(e) => setOffer(e.currentTarget.checked)} />
        </label>
      </div>
      <p class="hint">Visto il {dateShort(p.seenAt)}. I prezzi più vecchi di 60 giorni sono segnati come vecchi.</p>
      <button
        class="btn danger"
        onClick={() => {
          props.store.updatePrice(p.id, { deleted: true });
          props.onDeleted(p);
        }}
      >
        Elimina prezzo
      </button>
    </Sheet>
  );
}
