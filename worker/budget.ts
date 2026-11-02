import { DurableObject } from "cloudflare:workers";
import { utcDay } from "../shared/budget";

/**
 * Un solo contatore per tutto l'account: tiene i neuroni di Workers AI usati oggi (giorno UTC,
 * come la quota di Cloudflare). Ogni lettura prenota il suo costo massimo prima di partire
 * e poi lo corregge con il costo vero, così anche letture in contemporanea non sforano.
 */
export class AiBudget extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, used REAL NOT NULL)");
    });
  }

  private used(day: string): number {
    return this.ctx.storage.sql.exec<{ used: number }>("SELECT used FROM days WHERE day = ?", day).toArray()[0]?.used ?? 0;
  }

  private add(day: string, n: number): void {
    this.ctx.storage.sql.exec("INSERT INTO days (day, used) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET used = MAX(0, used + excluded.used)", day, n);
  }

  /** Prenota `cost` neuroni se ci stanno nel tetto di oggi. */
  reserve(cost: number, limit: number): { ok: boolean; day: string; used: number } {
    const day = utcDay();
    const used = this.used(day);
    if (used + cost > limit) return { ok: false, day, used };
    this.add(day, cost);
    this.ctx.storage.sql.exec("DELETE FROM days WHERE day < ?", utcDay(Date.now() - 30 * 864e5));
    return { ok: true, day, used: used + cost };
  }

  /** Sostituisce la prenotazione con il costo vero (nello stesso giorno della prenotazione). */
  settle(day: string, reserved: number, actual: number): void {
    this.add(day, actual - reserved);
  }

  status(): { day: string; used: number } {
    const day = utcDay();
    return { day, used: this.used(day) };
  }
}
