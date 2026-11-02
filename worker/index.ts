import { FAMILY_TOKEN, randomId } from "../shared/list";
export { FamilyList } from "./family";
export { AiBudget } from "./budget";

// Il Worker serve la web app (cartella dist) e le API della lista.
// Ogni famiglia ha un codice segreto casuale: chi ha il link d'invito può usare la lista.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/famiglie" && request.method === "POST") {
      return json({ token: randomId(16) }, 201);
    }

    const m = url.pathname.match(/^\/api\/famiglie\/([^/]+)\/(ws|lista|leggi)$/);
    if (m) {
      const [, token, what] = m;
      if (!FAMILY_TOKEN.test(token)) return json({ error: "Link d'invito non valido." }, 404);
      if (what === "ws" && request.headers.get("Upgrade") !== "websocket") {
        return json({ error: "Serve una connessione WebSocket." }, 426);
      }
      const stub = env.FAMILY.get(env.FAMILY.idFromName(token));
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Indirizzo non trovato." }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
