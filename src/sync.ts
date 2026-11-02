import {
  applyOp,
  randomId,
  type Item,
  type ListState,
  type Op,
  type ServerMessage,
  type StoreId,
} from "../shared/list";
import type { Price, PriceState } from "../shared/prices";

const WS_CONNECTING = 0;
const WS_OPEN = 1;

export type Status = "online" | "connecting" | "offline";

interface Saved {
  items: ListState;
  prices: PriceState;
  pending: Op[];
}

export type NewPrice = Omit<Price, "id" | "deleted" | "createdAt" | "updatedAt">;

/**
 * Tiene la lista sul telefono e la sincronizza con il Durable Object della famiglia.
 * Ogni modifica va subito nello stato locale e in una coda; la coda parte appena c'è
 * rete e si svuota quando il server conferma (ack). Così l'app funziona anche offline.
 */
export class ListStore {
  items: ListState = {};
  prices: PriceState = {};
  pending: Op[] = [];
  status: Status = "connecting";
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private closed = false;

  constructor(
    readonly token: string,
    private storage: Storage | null = safeStorage(),
    private makeSocket: (url: string) => WebSocket = (u) => new WebSocket(u),
  ) {
    const saved = this.read();
    this.items = saved.items;
    this.prices = saved.prices;
    this.pending = saved.pending;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- modifiche ----

  add(name: string, store: StoreId | null): Item {
    const now = Date.now();
    const item: Item = { id: randomId(), name, store, done: false, deleted: false, createdAt: now, updatedAt: now };
    this.commit(item);
    return item;
  }

  update(id: string, patch: Partial<Pick<Item, "name" | "store" | "done" | "deleted">>): void {
    const current = this.items[id];
    if (!current) return;
    // updatedAt sempre crescente anche se l'orologio del telefono torna indietro
    const updatedAt = Math.max(Date.now(), current.updatedAt + 1);
    this.commit({ ...current, ...patch, updatedAt });
  }

  addPrices(list: NewPrice[]): void {
    const now = Date.now();
    this.commitAll(list.map((p) => ({ opId: randomId(), price: { ...p, id: randomId(), deleted: false, createdAt: now, updatedAt: now } })));
  }

  updatePrice(id: string, patch: Partial<Omit<Price, "id" | "createdAt" | "updatedAt">>): void {
    const current = this.prices[id];
    if (!current) return;
    const updatedAt = Math.max(Date.now(), current.updatedAt + 1);
    this.commitAll([{ opId: randomId(), price: { ...current, ...patch, updatedAt } }]);
  }

  private commit(item: Item): void {
    this.commitAll([{ opId: randomId(), item }]);
  }

  private commitAll(ops: Op[]): void {
    for (const op of ops) {
      applyOp(this, op);
      this.pending.push(op);
    }
    this.save();
    this.flush();
    this.emit();
  }

  // ---- rete ----

  connect(): void {
    this.closed = false;
    if (this.ws && (this.ws.readyState === WS_OPEN || this.ws.readyState === WS_CONNECTING)) return;
    this.setStatus("connecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = this.makeSocket(`${proto}//${location.host}/api/famiglie/${this.token}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus("online");
      this.flush();
    };
    ws.onmessage = (e) => this.receive(String(e.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus("offline");
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  /** Riprova subito, per esempio quando il telefono torna online o l'app torna in primo piano. */
  wake(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.connect();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  receive(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    let changed = false;
    if (msg.t === "snapshot") {
      for (const item of msg.items) changed = applyOp(this, { opId: "snapshot", item }) || changed;
      for (const price of msg.prices ?? []) changed = applyOp(this, { opId: "snapshot", price }) || changed;
      // le modifiche locali non ancora confermate restano valide sopra l'istantanea
      for (const op of this.pending) changed = applyOp(this, op) || changed;
    } else if (msg.t === "ops") {
      for (const op of msg.ops) changed = applyOp(this, op) || changed;
    } else if (msg.t === "ack") {
      const done = new Set(msg.opIds);
      const before = this.pending.length;
      this.pending = this.pending.filter((op) => !done.has(op.opId));
      changed = before !== this.pending.length;
    }
    if (changed) {
      this.save();
      this.emit();
    }
  }

  private flush(): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN || this.pending.length === 0) return;
    for (let i = 0; i < this.pending.length; i += 200) {
      this.ws.send(JSON.stringify({ t: "ops", ops: this.pending.slice(i, i + 200) }));
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.timer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.retry) * (0.75 + Math.random() * 0.5);
    this.retry++;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private setStatus(s: Status): void {
    if (this.status === s) return;
    this.status = s;
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ---- memoria del telefono ----

  private key(): string {
    return `spesa:lista:${this.token}`;
  }

  private read(): Saved {
    try {
      const raw = this.storage?.getItem(this.key());
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        return { items: s.items ?? {}, prices: s.prices ?? {}, pending: s.pending ?? [] };
      }
    } catch {
      // memoria non disponibile o rovinata: si riparte dal server
    }
    return { items: {}, prices: {}, pending: [] };
  }

  private save(): void {
    try {
      this.storage?.setItem(this.key(), JSON.stringify({ items: this.items, prices: this.prices, pending: this.pending }));
    } catch {
      // memoria piena o bloccata: la lista resta valida finché l'app è aperta
    }
  }
}

export function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
