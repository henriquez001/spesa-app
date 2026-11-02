import { DurableObject } from "cloudflare:workers";
import { bestFor, eurospinOffersUrl, indexWords, KEYWORDS, lidlOfferLinks, parseConadPage, parseEurospinPage, parseOffersPage, type CatalogPrice, type CatalogSource } from "../shared/catalog";
import type { StoreId } from "../shared/list";
import { matches, words } from "../shared/prices";

const MAX_PAGES = 4; // per parola: bastano le prime 120 schede
const STEP_MS = 3000; // una pagina ogni 3 secondi, per non pesare sul sito
const KEEP_FOR = 21 * 864e5; // un prezzo non più visto da 3 settimane si toglie
const UA = "Mozilla/5.0 (compatible; SpesaDiCasa/1.0; listino per uso familiare)";

type Task =
  | { source: "conad"; query: string; page: number }
  | { source: "offerte"; store: OfferStore; url: string }
  | { source: "lidl-home" }
  | { source: "euro"; page: number };

type OfferStore = "lidl" | "euro" | "oasi";

const OFFER_SOURCE: Record<OfferStore, CatalogSource> = { lidl: "lidl-offerte", euro: "euro-offerte", oasi: "oasi-offerte" };
const EURO_MAX_PAGES = 10; // oggi le offerte Eurospin sono circa 60, 12 per pagina

/**
 * Le offerte delle catene, lette una volta per notte, provate sulle pagine vere il 2026-11-02:
 * - Lidl: dalla home si prendono le pagine della settimana (".../frutta-e-verdura-kw-44-26/a10105788"),
 *   perché l'indirizzo cambia ogni settimana; ogni pagina ha le schede in data-grid-data.
 * - Eurospin: l'elenco prodotti filtrato sulle promozioni, pagina per pagina.
 * - Oasi: i volantini sono sfogliabili Calameo per punto vendita, senza dati leggibili: per ora no.
 */
function offerTasks(): Task[] {
  return [{ source: "lidl-home" }, { source: "euro", page: 1 }];
}

/**
 * Il listino online, uno solo per tutte le famiglie. Ogni notte il cron mette in coda le ricerche;
 * la coda si svuota una pagina alla volta con gli allarmi del Durable Object, così ogni passo
 * è una richiesta piccola che sta nei limiti del piano gratuito.
 */
export class Catalog extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS prices (key TEXT PRIMARY KEY, store TEXT NOT NULL, words TEXT NOT NULL, data TEXT NOT NULL, seen INTEGER NOT NULL)");
      sql.exec("CREATE INDEX IF NOT EXISTS prices_store ON prices (store)");
      // fine validità delle offerte (aggiunta dopo: la colonna si crea anche sulle tabelle esistenti)
      const cols = sql.exec<{ name: string }>("PRAGMA table_info(prices)").toArray().map((c) => c.name);
      if (!cols.includes("valid_to")) sql.exec("ALTER TABLE prices ADD COLUMN valid_to INTEGER");
      sql.exec("CREATE TABLE IF NOT EXISTS queue (n INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS runs (started INTEGER PRIMARY KEY, finished INTEGER, pages INTEGER NOT NULL, saved INTEGER NOT NULL, errors INTEGER NOT NULL, last_error TEXT, sample TEXT)");
    });
  }

  /** Avvia il giro di stanotte (se ce n'è già uno in corso non ne parte un altro). */
  /** onlyOffers: solo Lidl ed Eurospin (un paio di minuti), per vedere subito le offerte nuove. */
  async start(onlyOffers = false): Promise<{ started: boolean; queued: number }> {
    const sql = this.ctx.storage.sql;
    const pending = sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM queue").one().c;
    if (pending > 0) return { started: false, queued: pending };
    // prima le offerte (poche pagine, cambiano ogni settimana), poi il listino Conad
    const tasks: Task[] = [...offerTasks(), ...(onlyOffers ? [] : KEYWORDS.map((query): Task => ({ source: "conad", query, page: 1 })))];
    for (const t of tasks) this.push(t);
    sql.exec("INSERT INTO runs (started, pages, saved, errors) VALUES (?, 0, 0, 0)", Date.now());
    sql.exec("DELETE FROM runs WHERE started < ?", Date.now() - 30 * 864e5);
    await this.ctx.storage.setAlarm(Date.now() + 100);
    return { started: true, queued: tasks.length };
  }

  private push(task: Task): void {
    this.ctx.storage.sql.exec("INSERT INTO queue (task) VALUES (?)", JSON.stringify(task));
  }

  async alarm(): Promise<void> {
    const sql = this.ctx.storage.sql;
    const row = sql.exec<{ n: number; task: string }>("SELECT n, task FROM queue ORDER BY n LIMIT 1").toArray()[0];
    const run = sql.exec<{ started: number }>("SELECT started FROM runs ORDER BY started DESC LIMIT 1").toArray()[0];
    if (!row) {
      if (run) sql.exec("UPDATE runs SET finished = ? WHERE started = ? AND finished IS NULL", Date.now(), run.started);
      sql.exec("DELETE FROM prices WHERE seen < ?", Date.now() - KEEP_FOR);
      sql.exec("DELETE FROM prices WHERE valid_to IS NOT NULL AND valid_to < ?", Date.now());
      return;
    }
    sql.exec("DELETE FROM queue WHERE n = ?", row.n);
    const task = JSON.parse(row.task) as Task;
    try {
      const { prices: found, cards } = await this.fetchTask(task);
      for (const p of found) this.save(p);
      // Conad ed Eurospin: si va avanti finché la pagina ha schede (con o senza prezzo)
      if (task.source === "conad" && cards > 0 && task.page < MAX_PAGES) this.push({ ...task, page: task.page + 1 });
      if (task.source === "euro" && cards > 0 && task.page < EURO_MAX_PAGES) this.push({ ...task, page: task.page + 1 });
      if (run) sql.exec("UPDATE runs SET pages = pages + 1, saved = saved + ? WHERE started = ?", found.length, run.started);
    } catch (e) {
      console.error("listino", task, e);
      const what = task.source === "conad" ? `${task.query} p${task.page}` : task.source === "offerte" ? task.url : task.source === "euro" ? `eurospin p${task.page}` : "lidl home";
      if (run) sql.exec("UPDATE runs SET errors = errors + 1, last_error = ? WHERE started = ?", `${what}: ${String(e).slice(0, 200)}`, run.started);
    }
    await this.ctx.storage.setAlarm(Date.now() + STEP_MS);
  }

  private fetchTask(task: Task): Promise<{ prices: CatalogPrice[]; cards: number }> {
    switch (task.source) {
      case "conad":
        return this.fetchConad(task);
      case "offerte":
        return this.fetchOffers(task);
      case "euro":
        return this.fetchEurospin(task);
      case "lidl-home":
        return this.fetchLidlHome();
    }
  }

  private async getHtml(url: string): Promise<string> {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html", "accept-language": "it-IT,it" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  /** La home Lidl: non dà prezzi, mette in coda le pagine offerte di questa settimana. */
  private async fetchLidlHome(): Promise<{ prices: CatalogPrice[]; cards: number }> {
    const html = await this.getHtml("https://www.lidl.it/");
    const links = lidlOfferLinks(html);
    if (links.length === 0) {
      this.keepSample("lidl home", html, ["kw-", "href"]);
      throw new Error("nessuna pagina offerte nella home");
    }
    for (const url of links) this.push({ source: "offerte", store: "lidl", url });
    return { prices: [], cards: 0 };
  }

  private async fetchOffers(task: Extract<Task, { source: "offerte" }>): Promise<{ prices: CatalogPrice[]; cards: number }> {
    const html = await this.getHtml(task.url);
    const page = parseOffersPage(html, OFFER_SOURCE[task.store], task.store, Date.now());
    // le pagine delle offerte future hanno schede ma nessun prezzo valido oggi: il campione serve solo se non c'è nessuna scheda
    if (page.cards === 0) this.keepSample(`${task.store}`, html, ["ld+json", "data-"]);
    return page;
  }

  private async fetchEurospin(task: Extract<Task, { source: "euro" }>): Promise<{ prices: CatalogPrice[]; cards: number }> {
    const html = await this.getHtml(eurospinOffersUrl(task.page));
    const page = parseEurospinPage(html, Date.now());
    if (task.page === 1 && page.prices.length === 0) this.keepSample("eurospin", html, ["product-card", "product-listing"]);
    return page;
  }

  /** Se una pagina non dà prezzi, tengo un pezzo di pagina per capire cosa è cambiato. */
  private keepSample(label: string, html: string, marks: string[]): void {
    const at = marks.map((m) => html.indexOf(m)).find((i) => i >= 0) ?? -1;
    const sample = at >= 0 ? html.slice(at, at + 1500) : html.slice(0, 600);
    this.ctx.storage.sql.exec("UPDATE runs SET sample = ? WHERE started = (SELECT MAX(started) FROM runs) AND sample IS NULL", `${label}: ${sample}`);
  }

  private async fetchConad(task: Extract<Task, { source: "conad" }>): Promise<{ prices: CatalogPrice[]; cards: number }> {
    const url = `https://spesaonline.conad.it/tutti-i-prodotti/_jcr_content/root/search.loader.html?query=${encodeURIComponent(task.query)}&page=${task.page}`;
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const page = parseConadPage(html, Date.now());
    const found = page.prices;
    // se la pagina ha schede ma non ne leggo nessuna, tengo un pezzo di pagina per capire cosa è cambiato
    if (found.length === 0) this.keepSample(task.query, html, ["data-product"]);
    return page;
  }

  private save(p: CatalogPrice): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO prices (key, store, words, data, seen, valid_to) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET store = excluded.store, words = excluded.words, data = excluded.data, seen = excluded.seen, valid_to = excluded.valid_to",
      p.key,
      p.store,
      indexWords(p.product),
      JSON.stringify(p),
      p.seenAt,
      p.validTo,
    );
  }

  /** Per ogni nome della lista, il prezzo più conveniente del listino in ogni negozio. */
  lookup(names: string[]): Record<string, Partial<Record<StoreId, CatalogPrice>>> {
    const out: Record<string, Partial<Record<StoreId, CatalogPrice>>> = {};
    for (const name of names.slice(0, 200)) {
      const w = words(name);
      if (w.length === 0) continue;
      // prima scrematura con la parola più lunga (senza l'ultima vocale, per i plurali); poi le regole vere
      const longest = [...w].sort((a, b) => b.length - a.length)[0];
      const stem = longest.length >= 4 ? longest.replace(/[aeio]$/, "") : longest;
      const rows = this.ctx.storage.sql
        .exec<{ data: string }>("SELECT data FROM prices WHERE words LIKE ? AND (valid_to IS NULL OR valid_to >= ?) LIMIT 500", `% ${stem}%`, Date.now())
        .toArray()
        .map((r) => JSON.parse(r.data) as CatalogPrice);
      const best = bestFor(name, rows, matches);
      if (Object.keys(best).length > 0) out[name] = best;
    }
    return out;
  }

  status(): { prices: number; byStore: Record<string, number>; lastRun: unknown; queued: number } {
    const sql = this.ctx.storage.sql;
    const byStore: Record<string, number> = {};
    for (const r of sql.exec<{ store: string; c: number }>("SELECT store, COUNT(*) AS c FROM prices GROUP BY store")) byStore[r.store] = r.c;
    return {
      prices: Object.values(byStore).reduce((a, b) => a + b, 0),
      byStore,
      lastRun: sql.exec("SELECT * FROM runs ORDER BY started DESC LIMIT 1").toArray()[0] ?? null,
      queued: sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM queue").one().c,
    };
  }
}
