import { DurableObject } from "cloudflare:workers";
import {
  MAX_OPS_PER_MESSAGE,
  validateOp,
  wins,
  type Item,
  type Op,
  type ServerMessage,
} from "../shared/list";

const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000; // gli articoli eliminati si tengono 30 giorni, per i telefoni rimasti offline
const MAX_MESSAGE_BYTES = 256 * 1024;

/**
 * La lista di una famiglia. Un Durable Object per famiglia: tiene gli articoli in SQLite
 * e manda i cambiamenti a tutti i telefoni collegati via WebSocket (con ibernazione,
 * quindi non costa nulla quando nessuno sta usando l'app).
 */
export class FamilyList extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)",
      );
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      this.send(server, { t: "snapshot", items: this.allItems() });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response(JSON.stringify({ items: this.allItems() }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

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
      if (this.upsert(op.item)) applied.push(op);
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

  private upsert(item: Item): boolean {
    const row = this.ctx.storage.sql.exec<{ data: string }>("SELECT data FROM items WHERE id = ?", item.id).toArray()[0];
    const current = row ? (JSON.parse(row.data) as Item) : undefined;
    if (!wins(current, item)) return false;
    this.ctx.storage.sql.exec(
      "INSERT INTO items (id, data, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated",
      item.id,
      JSON.stringify(item),
      item.updatedAt,
    );
    return true;
  }

  private allItems(): Item[] {
    return this.ctx.storage.sql
      .exec<{ data: string }>("SELECT data FROM items")
      .toArray()
      .map((r) => JSON.parse(r.data) as Item);
  }

  private purgeTombstones(): void {
    this.ctx.storage.sql.exec(
      "DELETE FROM items WHERE updated < ? AND json_extract(data, '$.deleted') = 1",
      Date.now() - TOMBSTONE_TTL,
    );
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // il telefono si è scollegato: riceverà tutto con la prossima istantanea
    }
  }
}
