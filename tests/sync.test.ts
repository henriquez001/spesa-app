import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListStore } from "../src/sync";
import { validateOp } from "../shared/list";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  ops() {
    return this.sent.flatMap((s) => JSON.parse(s).ops);
  }
}

const TOKEN = "abcdefghijklmnopqrstuv";

beforeEach(() => {
  vi.stubGlobal("location", { protocol: "https:", host: "spesa.example" });
});

function setup(storage = new MemoryStorage()) {
  const sockets: FakeSocket[] = [];
  const store = new ListStore(TOKEN, storage as unknown as Storage, (url) => {
    expect(url).toBe(`wss://spesa.example/api/famiglie/${TOKEN}/ws`);
    const s = new FakeSocket();
    sockets.push(s);
    return s as unknown as WebSocket;
  });
  return { store, sockets, storage };
}

describe("ListStore", () => {
  it("offline tiene le modifiche in coda e le manda alla connessione", () => {
    const { store, sockets } = setup();
    store.connect();
    const latte = store.add("Latte", "lidl");
    store.update(latte.id, { done: true });
    expect(sockets[0].sent).toHaveLength(0);
    expect(store.pending).toHaveLength(2);

    sockets[0].open();
    expect(store.status).toBe("online");
    expect(sockets[0].ops()).toHaveLength(2);

    store.receive(JSON.stringify({ t: "ack", opIds: store.pending.map((o) => o.opId) }));
    expect(store.pending).toHaveLength(0);
    expect(store.items[latte.id].done).toBe(true);
  });

  it("le modifiche locali non confermate restano sopra l'istantanea del server", () => {
    const { store, sockets } = setup();
    const pane = store.add("Pane", null);
    store.connect();
    sockets[0].open();
    store.receive(JSON.stringify({ t: "snapshot", items: [{ ...pane, name: "Pane vecchio", updatedAt: pane.updatedAt - 10 }] }));
    expect(store.items[pane.id].name).toBe("Pane");
  });

  it("applica le modifiche degli altri telefoni", () => {
    const { store } = setup();
    const now = Date.now();
    store.receive(
      JSON.stringify({
        t: "ops",
        ops: [{ opId: "remote0001", item: { id: "remote-item1", name: "Uova", store: "euro", done: false, deleted: false, createdAt: now, updatedAt: now } }],
      }),
    );
    expect(store.items["remote-item1"].name).toBe("Uova");
  });

  it("ritrova lista e coda dopo la riapertura dell'app", () => {
    const first = setup();
    first.store.add("Caffè", "conad");
    const again = setup(first.storage);
    expect(Object.values(again.store.items).map((i) => i.name)).toEqual(["Caffè"]);
    expect(again.store.pending).toHaveLength(1);
  });

  it("l'orario della modifica cresce anche se l'orologio torna indietro", () => {
    const { store } = setup();
    const item = store.add("Riso", null);
    vi.spyOn(Date, "now").mockReturnValue(item.updatedAt - 60_000);
    store.update(item.id, { done: true });
    expect(store.items[item.id].updatedAt).toBe(item.updatedAt + 1);
    vi.restoreAllMocks();
  });

  it("dopo una disconnessione riprova da solo", () => {
    vi.useFakeTimers();
    const { store, sockets } = setup();
    store.connect();
    sockets[0].open();
    sockets[0].close();
    expect(store.status).toBe("offline");
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(2);
    store.close();
    vi.useRealTimers();
  });
});

describe("prezzi nella sincronizzazione", () => {
  it("salva i prezzi in coda e li riceve dagli altri", () => {
    vi.stubGlobal("location", { protocol: "https:", host: "spesa.example" });
    const { store, sockets } = setup();
    store.connect();
    store.addPrices([{ product: "Latte", store: "lidl", cents: 89, qty: "1 l", unitCents: 89, unit: "l", offer: false, seenAt: 1 }]);
    sockets[0].open();
    expect(sockets[0].ops()[0].price.product).toBe("Latte");
    const now = Date.now();
    store.receive(
      JSON.stringify({
        t: "snapshot",
        items: [],
        prices: [{ id: "remote-price1", product: "Uova", store: "euro", cents: 149, qty: null, unitCents: null, unit: null, offer: false, seenAt: now, deleted: false, createdAt: now, updatedAt: now }],
      }),
    );
    expect(Object.values(store.prices).map((p) => p.product).sort()).toEqual(["Latte", "Uova"]);
  });
});

describe("pasti nella sincronizzazione", () => {
  it("manda i documenti dei pasti e riceve diete e documenti dal server", () => {
    vi.stubGlobal("location", { protocol: "https:", host: "spesa.example" });
    const { store, sockets } = setup();
    store.connect();
    store.setDoc("settings:pasti", { potatoes: true });
    sockets[0].open();
    expect(sockets[0].ops()[0].doc.id).toBe("settings:pasti");
    const now = Date.now();
    store.receive(
      JSON.stringify({
        t: "snapshot",
        items: [],
        prices: [],
        docs: [{ id: "eaten:2026-11-09:cena:anna", data: { date: "2026-11-09" }, deleted: false, updatedAt: now }],
        diets: { people: [{ id: "anna", name: "Anna", days: { "1": { cena: ["pollo:200"] } } }] },
      }),
    );
    expect(store.diets?.people[0].name).toBe("Anna");
    expect(Object.keys(store.docs).sort()).toEqual(["eaten:2026-11-09:cena:anna", "settings:pasti"]);
    // il server smette di mandarle: spariscono anche dal telefono
    store.receive(JSON.stringify({ t: "snapshot", items: [], prices: [], docs: [], diets: null }));
    expect(store.diets).toBeNull();
  });

  it("rifiuta documenti con id sconosciuti o troppo grandi", () => {
    expect(validateOp({ opId: "abcdefgh12", doc: { id: "hack:x", data: {}, deleted: false, updatedAt: 1 } })).toBeNull();
    expect(validateOp({ opId: "abcdefgh12", doc: { id: "eaten:x", data: { s: "x".repeat(5000) }, deleted: false, updatedAt: 1 } })).toBeNull();
    expect(validateOp({ opId: "abcdefgh12", doc: { id: "eaten:2026-11-09:cena:anna", data: {}, deleted: false, updatedAt: 1 } })).not.toBeNull();
  });
});
