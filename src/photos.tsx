import { useEffect, useRef, useState } from "preact/hooks";
import { randomId, STORE_IDS, STORE_NAMES, type StoreId } from "../shared/list";
import { fileToJpeg, fromReading, isSavable, problem, readShot, toJpeg, toNewPrice, perUnit, unitOf, type Shot } from "./photo";
import { safeStorage, type ListStore } from "./sync";
import { Icon, ICONS, Sheet } from "./ui";

// Fotografare i prezzi: scelta del negozio, scatti in serie (G3), revisione in elenco (R2).

const LAST_STORE = "spesa:ultimo-negozio";

function lastStore(): StoreId {
  const s = safeStorage()?.getItem(LAST_STORE);
  return (STORE_IDS as readonly string[]).includes(s ?? "") ? (s as StoreId) : "lidl";
}

type Stage = "pick" | "camera" | "review";

export function PhotoFlow(props: { open: boolean; store: ListStore; onClose: () => void; onSaved: (n: number, store: StoreId) => void }) {
  const [stage, setStage] = useState<Stage>("pick");
  const [shop, setShop] = useState<StoreId>(lastStore);
  const [shots, setShots] = useState<Shot[]>([]);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;

  useEffect(() => {
    if (props.open) {
      setStage("pick");
      setShop(lastStore());
    } else {
      for (const s of shotsRef.current) URL.revokeObjectURL(s.url);
      setShots([]);
    }
  }, [props.open]);

  // i cartellini letti senza rete si rileggono appena torna la connessione
  useEffect(() => {
    const retry = () => {
      for (const s of shotsRef.current) if (s.status === "failed" && !s.reading) read(s);
    };
    addEventListener("online", retry);
    return () => removeEventListener("online", retry);
  }, []);

  function patch(id: string, change: (s: Shot) => Shot) {
    setShots((list) => list.map((s) => (s.id === id ? change(s) : s)));
  }

  async function read(shot: Shot) {
    patch(shot.id, (s) => ({ ...s, status: "reading" }));
    const { reading, error } = await readShot(props.store.token, shot.blob);
    patch(shot.id, (s) => fromReading(s, reading, error));
  }

  function addShot(blob: Blob) {
    const shot: Shot = { id: randomId(), url: URL.createObjectURL(blob), blob, status: "reading", product: "", price: "", qty: "", offer: false, reading: null };
    setShots((list) => [...list, shot]);
    read(shot);
  }

  function remove(id: string) {
    setShots((list) => {
      const s = list.find((x) => x.id === id);
      if (s) URL.revokeObjectURL(s.url);
      return list.filter((x) => x.id !== id);
    });
  }

  function save() {
    const now = Date.now();
    const ready = shots.map((s) => toNewPrice(s, shop, now)).filter((p) => p !== null);
    if (ready.length === 0) return;
    props.store.addPrices(ready);
    try {
      safeStorage()?.setItem(LAST_STORE, shop);
    } catch {
      // nessun problema: la prossima volta si sceglie a mano
    }
    props.onSaved(ready.length, shop);
  }

  if (!props.open) return null;
  return (
    <>
      <StorePicker open={stage === "pick"} value={shop} onChange={setShop} onClose={props.onClose} onNext={() => setStage("camera")} />
      {stage === "camera" && (
        <Camera shop={shop} shots={shots} onShot={addShot} onReview={() => setStage("review")} onClose={props.onClose} />
      )}
      {stage === "review" && (
        <Review
          shop={shop}
          shots={shots}
          onBack={() => setStage("camera")}
          onChange={(id, change) => patch(id, (s) => ({ ...s, ...change }))}
          onRetry={(s) => read(s)}
          onRemove={remove}
          onSave={save}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- passo 1: negozio

function StorePicker(props: { open: boolean; value: StoreId; onChange: (s: StoreId) => void; onClose: () => void; onNext: () => void }) {
  return (
    <Sheet open={props.open} title="Dove stai fotografando?" onClose={props.onClose}>
      <p class="sheet-text">I prezzi delle foto finiranno in questo negozio.</p>
      <fieldset class="picker">
        <legend class="sr-only">Negozio</legend>
        <div class="picklist">
          {STORE_IDS.map((s) => (
            <label key={s} class="pick">
              <input type="radio" name="negozio-foto" checked={props.value === s} onChange={() => props.onChange(s)} />
              <span class="dot" style={{ background: `var(--s-${s})` }} aria-hidden="true" />
              <span class="pt">{STORE_NAMES[s]}</span>
              <span class="ok" aria-hidden="true">
                ✓
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button class="btn pri" data-autofocus onClick={props.onNext}>
        Apri fotocamera
      </button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- passo 2: scatti in serie

function Camera(props: { shop: StoreId; shots: Shot[]; onShot: (b: Blob) => void; onReview: () => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [flash, setFlash] = useState(0);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("niente fotocamera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
        setCamera("on");
      } catch {
        setCamera("off");
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    thumbs.current?.scrollTo({ left: thumbs.current.scrollWidth });
  }, [props.shots.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  async function shoot() {
    const v = video.current;
    if (!v || camera !== "on" || !v.videoWidth) return;
    setFlash((n) => n + 1);
    props.onShot(await toJpeg(v, v.videoWidth, v.videoHeight));
  }

  async function pick(e: Event) {
    const files = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
    for (const f of files) {
      try {
        props.onShot(await fileToJpeg(f));
      } catch {
        // file non leggibile come immagine: lo saltiamo
      }
    }
    (e.currentTarget as HTMLInputElement).value = "";
  }

  function close() {
    if (props.shots.length > 0) setConfirm(true);
    else props.onClose();
  }

  const n = props.shots.length;
  return (
    <div class="cam" role="dialog" aria-modal="true" aria-label={`Fotocamera, ${STORE_NAMES[props.shop]}`}>
      <video ref={video} class="cam-video" playsInline muted aria-hidden="true" />
      {camera === "on" && (
        <div class="cam-frame" aria-hidden="true">
          <span>Inquadra il cartellino del prezzo</span>
        </div>
      )}
      {camera === "off" && (
        <div class="cam-off">
          <Icon d={ICONS.camera} />
          <p>La fotocamera non è disponibile. Controlla il permesso nelle impostazioni del browser, oppure scegli le foto dalla galleria.</p>
          <button class="btn pri" onClick={() => file.current?.click()}>
            Scegli foto
          </button>
        </div>
      )}
      {flash > 0 && <div key={flash} class="cam-flash" aria-hidden="true" />}

      <div class="cam-top">
        <button class="cam-pill" onClick={close}>
          Chiudi
        </button>
        <span class="cam-store">
          <span class="dot" style={{ background: `var(--s-${props.shop})` }} aria-hidden="true" />
          {STORE_NAMES[props.shop]}
        </span>
      </div>

      <div class="cam-bottom">
        <div class="cam-thumbs" ref={thumbs} aria-label="Scatti fatti">
          {props.shots.map((s) => (
            <div key={s.id} class={`cam-thumb ${s.status}`}>
              <img src={s.url} alt="" />
              <span>{s.status === "reading" ? "…" : s.price ? `${s.price} €` : "?"}</span>
            </div>
          ))}
        </div>
        <div class="cam-row">
          <button class="cam-pill" onClick={() => file.current?.click()}>
            Galleria
          </button>
          <button class="shutter" aria-label="Scatta" disabled={camera !== "on"} onClick={shoot} />
          <button class="cam-review" disabled={n === 0} onClick={props.onReview}>
            {n === 0 ? "Rivedi" : `Rivedi ${n}`}
          </button>
        </div>
      </div>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={pick} />

      {confirm && (
        <div class="cam-confirm" role="alertdialog" aria-modal="true" aria-labelledby="conf-t">
          <div class="cam-confirm-box">
            <b id="conf-t">{n === 1 ? "Hai 1 scatto non salvato" : `Hai ${n} scatti non salvati`}</b>
            <p>Se chiudi ora, le foto e i prezzi letti si perdono.</p>
            <button class="btn pri" onClick={props.onReview}>
              Rivedi e salva
            </button>
            <button class="btn danger" onClick={props.onClose}>
              Scarta gli scatti
            </button>
            <button class="btn bare" onClick={() => setConfirm(false)}>
              Continua a fotografare
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- passo 3: revisione

function Review(props: {
  shop: StoreId;
  shots: Shot[];
  onBack: () => void;
  onChange: (id: string, change: Partial<Shot>) => void;
  onRetry: (s: Shot) => void;
  onRemove: (id: string) => void;
  onSave: () => void;
}) {
  // i gruppi si decidono all'apertura: uno scatto corretto non salta di gruppo mentre lo modifichi
  // e anche l'ordine: prima quelli senza nome o prezzo
  const [order] = useState(() => {
    const missing = (s: Shot) => (!s.product || !s.price ? 0 : 1);
    return props.shots.filter((s) => problem(s)).sort((a, b) => missing(a) - missing(b)).map((s) => s.id);
  });
  const rank = (s: Shot) => (order.includes(s.id) ? order.indexOf(s.id) : order.length);
  const check = props.shots.filter((s) => order.includes(s.id) || problem(s)).sort((a, b) => rank(a) - rank(b));
  const good = props.shots.filter((s) => !check.includes(s));
  const [open, setOpen] = useState<string | null>(order[0] ?? null);
  const savable = props.shots.filter(isSavable).length;
  const skipped = props.shots.length - savable;

  return (
    <div class="review" role="dialog" aria-modal="true" aria-labelledby="rev-t">
      <div class="review-bar">
        <button class="link" onClick={props.onBack}>
          ‹ Fotocamera
        </button>
        <b id="rev-t">
          {props.shots.length} SCATTI · {STORE_NAMES[props.shop].toUpperCase()}
        </b>
        <span />
      </div>
      <div class="review-body">
        {props.shots.length === 0 && <p class="empty">Nessuno scatto. Torna alla fotocamera per fotografare i cartellini.</p>}
        {check.length > 0 && (
          <ReviewGroup {...props} title={`DA CONTROLLARE · ${check.length}`} shots={check} open={open} setOpen={setOpen} />
        )}
        {good.length > 0 && <ReviewGroup {...props} title={`LETTI BENE · ${good.length}`} shots={good} open={open} setOpen={setOpen} />}
      </div>
      <div class="review-save">
        {skipped > 0 && savable > 0 && <p class="hint">{skipped === 1 ? "1 scatto senza nome o prezzo non verrà salvato." : `${skipped} scatti senza nome o prezzo non verranno salvati.`}</p>}
        <button class="btn pri" disabled={savable === 0} onClick={props.onSave}>
          {savable === 1 ? "Salva 1 prezzo" : `Salva ${savable} prezzi`}
        </button>
      </div>
    </div>
  );
}

function ReviewGroup(props: {
  title: string;
  shots: Shot[];
  open: string | null;
  setOpen: (id: string | null) => void;
  onChange: (id: string, change: Partial<Shot>) => void;
  onRetry: (s: Shot) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <h2 class="rsub mono-title">{props.title}</h2>
      <ul class="group">
        {props.shots.map((s) => {
          const isOpen = props.open === s.id;
          const issue = problem(s);
          const u = unitOf(s);
          return (
            <li key={s.id} class={`rv${isOpen ? " open" : ""}`}>
              <button class="rv-head" aria-expanded={isOpen} aria-controls={`rv-${s.id}`} onClick={() => props.setOpen(isOpen ? null : s.id)}>
                <img class="rv-thumb" src={s.url} alt="" />
                <span class="txt-main">
                  <span class="name">{s.product || "Articolo da scrivere"}</span>
                  <span class="meta">
                    {issue ? <span class="flag">{issue}</span> : u ? perUnit(u) : s.qty || "Prezzo letto"}
                  </span>
                </span>
                <span class="price">{s.price ? `${s.price} €` : "—"}</span>
                <span class="chev" aria-hidden="true">
                  ›
                </span>
              </button>
              {isOpen && (
                <div class="rv-body" id={`rv-${s.id}`}>
                  <img class="rv-photo" src={s.url} alt={`Foto del cartellino ${s.product}`} />
                  <div class="fields">
                    <label class="fld">
                      <span>Articolo</span>
                      <input value={s.product} maxLength={80} placeholder="Es. Latte parzialmente scremato" onInput={(e) => props.onChange(s.id, { product: e.currentTarget.value })} />
                    </label>
                    <label class="fld">
                      <span>Prezzo</span>
                      <input value={s.price} inputMode="decimal" placeholder="0,00" onInput={(e) => props.onChange(s.id, { price: e.currentTarget.value })} />
                    </label>
                    <label class="fld">
                      <span>Quantità</span>
                      <input value={s.qty} placeholder="Es. 500 g, 1 l, 6 pz" onInput={(e) => props.onChange(s.id, { qty: e.currentTarget.value })} />
                    </label>
                    <div class="fld">
                      <span>Al kg / l / pz</span>
                      <output>{u ? perUnit(u) : "—"}</output>
                    </div>
                    <label class="fld">
                      <span>In offerta</span>
                      <input type="checkbox" role="switch" class="switch" checked={s.offer} onChange={(e) => props.onChange(s.id, { offer: e.currentTarget.checked })} />
                    </label>
                  </div>
                  <div class="rv-actions">
                    {s.status === "failed" && (
                      <button class="btn plain small" onClick={() => props.onRetry(s)}>
                        Rileggi la foto
                      </button>
                    )}
                    <button class="btn danger small" onClick={() => props.onRemove(s.id)}>
                      Elimina scatto
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
