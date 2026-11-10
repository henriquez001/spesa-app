// Secret impostati con `wrangler secret put` (non sono in wrangler.jsonc, quindi `npm run types` non li vede).
interface Env {
  /** diete della famiglia, formato compatto letto da parseDiets in shared/meals.ts */
  DIETE?: string;
  /** id dei Durable Object (famiglie) che possono ricevere le diete, separati da virgola */
  DIETE_FAMIGLIE?: string;
}
