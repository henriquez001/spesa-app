import { FAMILY_TOKEN, randomId } from "../shared/list";
export { FamilyList } from "./family";
export { AiBudget } from "./budget";
export { Catalog } from "./catalog";

const catalog = (env: Env) => env.CATALOG.get(env.CATALOG.idFromName("listino"));

// Il Worker serve la web app (cartella dist) e le API della lista.
// Ogni famiglia ha un codice segreto casuale: chi ha il link d'invito può usare la lista.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/famiglie" && request.method === "POST") {
      return json({ token: randomId(16) }, 201);
    }

    // listino online: stato dell'ultimo aggiornamento, e avvio a mano se non è già stato fatto oggi
    if (url.pathname === "/api/listino" && request.method === "GET") return json(await catalog(env).status());
    if (url.pathname === "/api/listino/aggiorna") {
      const st = (await catalog(env).status()) as { lastRun: { started: number; saved: number } | null };
      // si può ripartire a mano solo se l'ultimo giro non ha salvato nulla o è vecchio
      if (st.lastRun && st.lastRun.saved > 0 && Date.now() - st.lastRun.started < 20 * 3600_000) return json({ started: false, reason: "Già aggiornato nelle ultime 20 ore." });
      return json(await catalog(env).start());
    }

    const m = url.pathname.match(/^\/api\/famiglie\/([^/]+)\/(ws|lista|leggi|listino)$/);
    if (m) {
      const [, token, what] = m;
      if (!FAMILY_TOKEN.test(token)) return json({ error: "Link d'invito non valido." }, 404);
      if (what === "listino") {
        if (request.method !== "POST") return json({ error: "Usa POST." }, 405);
        const body = (await request.json().catch(() => null)) as { nomi?: unknown } | null;
        const names = Array.isArray(body?.nomi) ? body.nomi.filter((n): n is string => typeof n === "string" && n.length <= 80) : [];
        return json({ prezzi: await catalog(env).lookup(names) });
      }
      if (what === "ws" && request.headers.get("Upgrade") !== "websocket") {
        return json({ error: "Serve una connessione WebSocket." }, 426);
      }
      const stub = env.FAMILY.get(env.FAMILY.idFromName(token));
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Indirizzo non trovato." }, 404);
    return env.ASSETS.fetch(request);
  },

  // ogni notte: aggiornamento del listino online
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(catalog(env).start());
  },
} satisfies ExportedHandler<Env>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
