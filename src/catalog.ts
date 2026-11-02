import { useEffect, useMemo, useState } from "preact/hooks";
import { asPrice, type CatalogPrice } from "../shared/catalog";
import type { Item, StoreId } from "../shared/list";
import type { PriceState } from "../shared/prices";
import { safeStorage } from "./sync";

// Prezzi del listino online per gli articoli della lista. Si chiedono al server quando
// la lista cambia e si tengono nel telefono, così il confronto c'è anche senza rete.

const KEY = "spesa:listino";
type Found = Record<string, Partial<Record<StoreId, CatalogPrice>>>;

function load(): Found {
  try {
    return (JSON.parse(safeStorage()?.getItem(KEY) ?? "{}") as Found) ?? {};
  } catch {
    return {};
  }
}

export function useCatalog(token: string, items: Record<string, Item>): PriceState {
  const [found, setFound] = useState<Found>(load);
  const names = [...new Set(Object.values(items).filter((i) => !i.deleted && !i.done).map((i) => i.name))].sort();
  const key = names.join("\n");

  useEffect(() => {
    if (names.length === 0) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/famiglie/${token}/listino`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nomi: names }) });
        if (!res.ok) return;
        const body = (await res.json()) as { prezzi?: Found };
        const next = body.prezzi ?? {};
        setFound(next);
        try {
          safeStorage()?.setItem(KEY, JSON.stringify(next));
        } catch {
          // spazio pieno: resta in memoria finché l'app è aperta
        }
      } catch {
        // senza rete: restano quelli salvati
      }
    }, 800);
    return () => clearTimeout(t);
  }, [token, key]);

  return useMemo(() => {
    const out: PriceState = {};
    for (const byStore of Object.values(found)) for (const p of Object.values(byStore)) if (p) out[`cat-${p.key}`] = asPrice(p);
    return out;
  }, [found]);
}
