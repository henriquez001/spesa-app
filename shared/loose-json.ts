// Il modello di visione non sempre risponde con JSON valido: a volte scrive i prezzi con la
// virgola italiana (1,29), aggiunge ```json, usa apici singoli o lascia una virgola in fondo.
// Qui si prova a capirlo lo stesso, prima di arrendersi.

function extract(text: string): string | null {
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  return start >= 0 && end > start ? t.slice(start, end + 1) : null;
}

function repair(s: string): string {
  return (
    s
      .replace(/[“”„]/g, '"')
      .replace(/[‘’]/g, "'")
      // 'chiave': 'valore' → "chiave": "valore"
      .replace(/'([^'\n]*)'(?=\s*[:,}\]])/g, (_, x: string) => JSON.stringify(x))
      // : 1,29 → : 1.29 (anche dentro le liste)
      .replace(/([:[,]\s*)(-?\d+),(\d{1,2})(?=\s*[,}\]\n])/g, "$1$2.$3")
      // € 1.29 senza virgolette
      .replace(/([:[,]\s*)€\s*(-?\d+(?:\.\d+)?)/g, "$1$2")
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g, "null")
      // virgola prima della chiusura
      .replace(/,\s*([}\]])/g, "$1")
  );
}

/** L'oggetto JSON nella risposta del modello, anche se scritto in modo imperfetto. */
export function looseJson(text: string): Record<string, unknown> | null {
  const raw = extract(text);
  if (!raw) return null;
  for (const s of [raw, repair(raw)]) {
    try {
      const o = JSON.parse(s) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) return o as Record<string, unknown>;
    } catch {
      // si prova la versione riparata
    }
  }
  return null;
}

/** Ultima spiaggia: legge i campi "chiave": valore uno per uno, anche da JSON rotto. */
export function looseFields(text: string, keys: string[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const m = text.match(new RegExp(`["']?${k}["']?\\s*:\\s*("([^"]*)"|'([^']*)'|[^,}\\n]+)`, "i"));
    if (!m) continue;
    const v = (m[2] ?? m[3] ?? m[1]).trim();
    out[k] = /^(true|false)$/i.test(v) ? v.toLowerCase() === "true" : /^null$/i.test(v) ? null : v;
  }
  return Object.keys(out).length ? out : null;
}
