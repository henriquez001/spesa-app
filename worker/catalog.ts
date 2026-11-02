import { DurableObject } from "cloudflare:workers";
import { bestFor, indexWords, KEYWORDS, parseConad, type CatalogPrice } from "../shared/catalog";
import type { StoreId } from "../shared/list";
import { matches, words } from "../shared/prices";

const PAGE_SIZE = 30; // schede per pagina di ricerca Conad
const MAX_PAGES = 4; // per parola: bastano le prime 120 schede
const STEP_MS = 3000; // una pagina ogni 3 secondi, per non pesare sul sito
const KEEP_FOR = 21 * 864e5; // un prezzo non più visto da 3 settimane si toglie
const UA = "Mozilla/5.0 (compatible; SpesaDiCasa/1.0; listino per uso familiare)";

interface Task {
  source: "conad";
  query: string;
  page: number;
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
      sql.exec("CREATE TABLE IF NOT EXISTS queue (n INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS runs (started INTEGER PRIMARY KEY, finished INTEGER, pages INTEGER NOT NULL, saved INTEGER NOT NULL, errors INTEGER NOT NULL, last_error TEXT, sample TEXT)");
    });
  }

  /** Avvia il giro di stanotte (se ce n'è già uno in corso non ne parte un altro). */
  async start(): Promise<{ started: boolean; queued: number }> {
    const sql = this.ctx.storage.sql;
    const pending = sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM queue").one().c;
    if (pending > 0) return { started: false, queued: pending };
    for (const query of KEYWORDS) this.push({ source: "conad", query, page: 1 });
    sql.exec("INSERT INTO runs (started, pages, saved, errors) VALUES (?, 0, 0, 0)", Date.now());
    sql.exec("DELETE FROM runs WHERE started < ?", Date.now() - 30 * 864e5);
    await this.ctx.storage.setAlarm(Date.now() + 100);
    return { started: true, queued: KEYWORDS.length };
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
      return;
    }
    sql.exec("DELETE FROM queue WHERE n = ?", row.n);
    const task = JSON.parse(row.task) as Task;
    try {
      const found = await this.fetchConad(task);
      for (const p of found) this.save(p);
      if (found.length >= PAGE_SIZE && task.page < MAX_PAGES) this.push({ ...task, page: task.page + 1 });
      if (run) sql.exec("UPDATE runs SET pages = pages + 1, saved = saved + ? WHERE started = ?", found.length, run.started);
    } catch (e) {
      console.error("listino", task, e);
      if (run) sql.exec("UPDATE runs SET errors = errors + 1, last_error = ? WHERE started = ?", `${task.query} p${task.page}: ${String(e).slice(0, 200)}`, run.started);
    }
    await this.ctx.storage.setAlarm(Date.now() + STEP_MS);
  }

  private async fetchConad(task: Task): Promise<CatalogPrice[]> {
    const url = `https://spesaonline.conad.it/tutti-i-prodotti/_jcr_content/root/search.loader.html?query=${encodeURIComponent(task.query)}&page=${task.page}`;
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const found = parseConad(html, Date.now());
    // se la pagina ha schede ma non ne leggo nessuna, tengo un pezzo di pagina per capire cosa è cambiato
    if (found.length === 0) {
      const at = html.indexOf("data-product");
      const sample = at >= 0 ? html.slice(at, at + 1500) : html.slice(0, 600);
      this.ctx.storage.sql.exec("UPDATE runs SET sample = ? WHERE started = (SELECT MAX(started) FROM runs) AND sample IS NULL", `${task.query}: ${sample}`);
    }
    return found;
  }

  private save(p: CatalogPrice): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO prices (key, store, words, data, seen) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET store = excluded.store, words = excluded.words, data = excluded.data, seen = excluded.seen",
      p.key,
      p.store,
      indexWords(p.product),
      JSON.stringify(p),
      p.seenAt,
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
        .exec<{ data: string }>("SELECT data FROM prices WHERE words LIKE ? LIMIT 500", `% ${stem}%`)
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
