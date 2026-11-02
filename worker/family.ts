import { DurableObject } from "cloudflare:workers";
import { MAX_OPS_PER_MESSAGE, validateOp, wins, type Item, type Op, type ServerMessage } from "../shared/list";
import { parseReading, READING_PROMPT, type Price, type Reading } from "../shared/prices";

const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000; // gli elementi eliminati si tengono 30 giorni, per i telefoni rimasti offline
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const READINGS_PER_DAY = 300; // tetto per famiglia, così un link finito in mani sbagliate non consuma l'AI
const DEFAULT_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

type Table = "items" | "prices";

/**
 * Lo spazio di una famiglia. Un Durable Object per famiglia: tiene lista e prezzi in SQLite,
 * manda i cambiamenti a tutti i telefoni collegati via WebSocket (con ibernazione, quindi
 * non costa nulla quando nessuno usa l'app) e legge le foto dei cartellini con Workers AI.
 */
export class FamilyList extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS prices (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, readings INTEGER NOT NULL)");
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      this.send(server, { t: "snapshot", items: this.all<Item>("items"), prices: this.all<Price>("prices") });
      return new Response(null, { status: 101, webSocket: client });
    }
    const url = new URL(request.url);
    if (url.pathname.endsWith("/leggi") && request.method === "POST") return this.read(request);
    return json({ items: this.all<Item>("items"), prices: this.all<Price>("prices") });
  }

  // ---- lettura delle foto

  private async read(request: Request): Promise<Response> {
    const type = request.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return json({ error: "Serve una foto." }, 415);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return json({ error: "La foto è troppo grande." }, 413);

    const day = new Date().toISOString().slice(0, 10);
    const used = this.ctx.storage.sql.exec<{ readings: number }>("SELECT readings FROM usage WHERE day = ?", day).toArray()[0]?.readings ?? 0;
    if (used >= READINGS_PER_DAY) return json({ error: "Oggi sono state lette già tante foto. Riprova domani o scrivi il prezzo a mano." }, 429);
    this.ctx.storage.sql.exec(
      "INSERT INTO usage (day, readings) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET readings = readings + 1",
      day,
    );
    this.ctx.storage.sql.exec("DELETE FROM usage WHERE day < ?", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));

    try {
      const reading = await readLabel(this.env, bytes);
      return json({ reading });
    } catch (e) {
      console.error("lettura non riuscita", e);
      return json({ reading: null, error: "Non sono riuscito a leggere la foto." });
    }
  }

  // ---- sincronizzazione

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_BYTES) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    const msg = parsed as { t?: unknown; ops?: unknown };
    if (msg.t !== "ops" || !Array.isArray(msg.ops) || msg.ops.length > MAX_OPS_PER_MESSAGE) return;

    const received: string[] = [];
    const applied: Op[] = [];
    for (const raw of msg.ops) {
      const op = validateOp(raw);
      if (!op) continue;
      received.push(op.opId);
      const changed = op.item ? this.upsert("items", op.item) : this.upsert("prices", op.price);
      if (changed) applied.push(op);
    }
    if (received.length) this.send(ws, { t: "ack", opIds: received });
    if (applied.length) {
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws) this.send(other, { t: "ops", ops: applied });
      }
      this.purgeTombstones();
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "chiusa");
    } catch {
      // già chiusa
    }
  }

  private upsert(table: Table, record: { id: string; updatedAt: number }): boolean {
    const row = this.ctx.storage.sql.exec<{ data: string }>(`SELECT data FROM ${table} WHERE id = ?`, record.id).toArray()[0];
    const current = row ? (JSON.parse(row.data) as { updatedAt: number }) : undefined;
    if (!wins(current, record)) return false;
    this.ctx.storage.sql.exec(
      `INSERT INTO ${table} (id, data, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated`,
      record.id,
      JSON.stringify(record),
      record.updatedAt,
    );
    return true;
  }

  private all<T>(table: Table): T[] {
    return this.ctx.storage.sql
      .exec<{ data: string }>(`SELECT data FROM ${table}`)
      .toArray()
      .map((r) => JSON.parse(r.data) as T);
  }

  private purgeTombstones(): void {
    for (const table of ["items", "prices"] as const) {
      this.ctx.storage.sql.exec(
        `DELETE FROM ${table} WHERE updated < ? AND json_extract(data, '$.deleted') = 1`,
        Date.now() - TOMBSTONE_TTL,
      );
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // il telefono si è scollegato: riceverà tutto con la prossima istantanea
    }
  }
}

/** Chiede al modello di visione di leggere il cartellino. */
export async function readLabel(env: Env, bytes: Uint8Array): Promise<Reading | null> {
  const model = (env.VISION_MODEL || DEFAULT_MODEL) as Parameters<Ai["run"]>[0];
  const input = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: READING_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64(bytes)}` } },
        ],
      },
    ],
    max_tokens: 300,
    temperature: 0,
  };
  let out: unknown;
  try {
    out = await env.AI.run(model, input as never);
  } catch (e) {
    // i modelli Llama 3.2 chiedono di accettare la licenza una volta per account
    if (!String(e).toLowerCase().includes("agree")) throw e;
    await env.AI.run(model, { prompt: "agree" } as never);
    out = await env.AI.run(model, input as never);
  }
  const text = typeof out === "object" && out && "response" in out ? String((out as { response: unknown }).response) : String(out ?? "");
  return parseReading(text);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
