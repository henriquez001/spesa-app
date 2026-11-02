import { useMemo, useState } from "preact/hooks";
import { STORE_IDS, STORE_NAMES, type Item, type StoreId } from "../shared/list";
import { euro } from "../shared/prices";
import { mergeReceipts, signedCents, type Receipt } from "../shared/receipt";
import type { Part } from "./photo";
import { current, plan, receiptSeenAt, sumCheck, toEdit, type EditLine } from "./receipt";
import type { NewPrice } from "./sync";

// Revisione dello scontrino, variante S2: testo stampato sopra, nome capito sotto, "Nella lista" sulle righe abbinate.

export function ReceiptReview(props: {
  parts: Part[];
  shop: StoreId;
  items: Item[];
  onBack: () => void;
  onRetry: (p: Part) => void;
  onSave: (prices: NewPrice[], tick: string[], store: StoreId) => void;
}) {
  const reading = props.parts.filter((p) => p.status === "reading").length;
  const failed = props.parts.filter((p) => p.status === "failed");
  const done = props.parts.filter((p) => p.status === "done" && p.receipt);
  const receipt = reading === 0 ? mergeReceipts(done.map((p) => p.receipt as Receipt)) : null;
  // quando una foto riletta arriva, la revisione riparte con tutte le righe
  const key = done.map((p) => p.id).join("|");

  return (
    <div class="review" role="dialog" aria-modal="true" aria-labelledby="sc-t">
      <div class="review-bar">
        <button class="link" onClick={props.onBack}>
          ‹ Indietro
        </button>
        <b id="sc-t">SCONTRINO</b>
        <span />
      </div>
      {reading > 0 ? (
        <div class="review-body">
          <p class="empty" role="status">
            {props.parts.length === 1 ? "Leggo lo scontrino…" : `Leggo lo scontrino: ${props.parts.length - reading} di ${props.parts.length} foto lette…`}
          </p>
        </div>
      ) : !receipt ? (
        <div class="review-body">
          <p class="empty">{failed[0]?.error ?? "Non sono riuscito a leggere lo scontrino."}</p>
          <div class="sc-actions">
            {failed.length > 0 && (
              <button class="btn plain" onClick={() => failed.forEach(props.onRetry)}>
                Rileggi
              </button>
            )}
            <button class="btn pri" onClick={props.onBack}>
              Rifai la foto
            </button>
          </div>
        </div>
      ) : (
        <Editor key={key} receipt={receipt} failed={failed} {...props} />
      )}
    </div>
  );
}

function Editor(props: {
  receipt: Receipt;
  failed: Part[];
  shop: StoreId;
  items: Item[];
  onRetry: (p: Part) => void;
  onSave: (prices: NewPrice[], tick: string[], store: StoreId) => void;
}) {
  const r = props.receipt;
  const [shop, setShop] = useState<StoreId>(r.store ?? props.shop);
  const [edits, setEdits] = useState<EditLine[]>(() => toEdit(r));
  const [open, setOpen] = useState<number | null>(null);
  const seenAt = receiptSeenAt(r.date);
  const p = useMemo(() => plan(edits, props.items, shop, seenAt), [edits, props.items, shop, seenAt]);
  const { sum, diff } = sumCheck(edits, r.total);
  const names = new Map(props.items.map((i) => [i.id, i.name]));

  function change(i: number, c: Partial<EditLine>) {
    setEdits((list) => list.map((e, k) => (k === i ? { ...e, ...c } : e)));
  }

  const n = p.prices.length;
  const m = p.tick.length;
  const label = `Salva ${n === 1 ? "1 prezzo" : `${n} prezzi`}${m > 0 ? ` e spunta ${m}` : ""}`;
  const date = r.date ? r.date.split("-").reverse().join("/") : "data non letta";

  return (
    <>
      <div class="review-body">
        <section class="sc-head zz" aria-label="Scontrino in breve">
          <div class="rhead">
            <b>{(r.storeText || STORE_NAMES[shop]).toUpperCase()}</b>
            <span>
              {date} · {edits.length === 1 ? "1 riga" : `${edits.length} righe`}
            </span>
          </div>
          <div class="rline big">
            <span>TOTALE</span>
            <span>{r.total !== null ? euro(r.total) : "—"}</span>
          </div>
          <p class={`sc-ok${diff ? " warn" : ""}`}>
            {diff === null ? (
              <>Somma righe {euro(sum)}, totale non letto</>
            ) : diff === 0 ? (
              <>
                <span aria-hidden="true">✓</span>Somma righe {euro(sum)}, uguale al totale
              </>
            ) : (
              <>
                <span aria-hidden="true">!</span>Somma righe {euro(sum)}, {diff > 0 ? "più" : "meno"} del totale di {euro(Math.abs(diff))}: controlla gli importi
              </>
            )}
          </p>
        </section>

        {props.failed.length > 0 && (
          <p class="sc-note">
            {props.failed.length === 1 ? "1 foto non è stata letta, le sue righe mancano." : `${props.failed.length} foto non sono state lette, le loro righe mancano.`}{" "}
            <button class="link" onClick={() => props.failed.forEach(props.onRetry)}>
              Rileggi
            </button>
          </p>
        )}

        <div class="fields sc-store">
          <label class="fld">
            <span>I prezzi vanno in</span>
            <select value={shop} onChange={(ev) => setShop(ev.currentTarget.value as StoreId)}>
              {STORE_IDS.map((s) => (
                <option key={s} value={s}>
                  {STORE_NAMES[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h2 class="rsub mono-title">RIGHE · {edits.length}</h2>
        <ul class="group">
          {edits.map((e, i) => {
            const line = current(e);
            const isOpen = open === i;
            const inList = p.matched.get(i);
            const cents = signedCents(e.price);
            return (
              <li key={i} class={`lrx${e.include ? "" : " off"}${isOpen ? " open" : ""}`}>
                <button class="lrx-head" aria-expanded={isOpen} aria-controls={`lr-${i}`} onClick={(ev) => {
                    setOpen(isOpen ? null : i);
                    const li = ev.currentTarget.parentElement;
                    // la riga aperta resta visibile sopra la barra di salvataggio
                    if (!isOpen) requestAnimationFrame(() => li?.scrollIntoView({ block: "nearest" }));
                  }}>
                  <span class="t">
                    <span class="raw">{e.line.raw}</span>
                    <span class="nm">{e.product || "Nome da scrivere"}</span>
                    {!e.include ? (
                      <span class="lrx-tag">Non salvata</span>
                    ) : inList ? (
                      <span class="inlist">Nella lista: {names.get(inList)}</span>
                    ) : !e.line.sure || cents === null || !line.product ? (
                      <span class="flag">Controlla</span>
                    ) : null}
                  </span>
                  <span class="pr">{cents === null ? "—" : e.price.replace("-", "−")}</span>
                  <span class="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
                {isOpen && (
                  <div class="rv-body" id={`lr-${i}`}>
                    <div class="fields">
                      <label class="fld">
                        <span>{e.line.kind === "discount" ? "Descrizione" : "Articolo"}</span>
                        <input value={e.product} maxLength={80} onInput={(ev) => change(i, { product: ev.currentTarget.value })} />
                      </label>
                      <label class="fld">
                        <span>Importo</span>
                        <input value={e.price} inputMode="decimal" placeholder="0,00" onInput={(ev) => change(i, { price: ev.currentTarget.value })} />
                      </label>
                      <label class="fld">
                        <span>{e.line.kind === "discount" ? "Togli dal prezzo sopra" : "Salva il prezzo"}</span>
                        <input type="checkbox" role="switch" class="switch" checked={e.include} onChange={(ev) => change(i, { include: ev.currentTarget.checked })} />
                      </label>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div class="review-save">
        {m > 0 && <p class="hint">Gli articoli con "Nella lista" vengono spuntati come presi.</p>}
        <button class="btn pri" disabled={n === 0} onClick={() => props.onSave(p.prices, p.tick, shop)}>
          {label}
        </button>
      </div>
    </>
  );
}
