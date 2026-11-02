import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

// Pezzi comuni a tutte le schermate: icone, fogli dal basso, codice a barre.

export function useSheet(open: boolean): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      // un fotogramma dopo, così la transizione parte dalla posizione chiusa
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 400);
    return () => clearTimeout(t);
  }, [open]);
  return { mounted, shown };
}

export function Sheet(props: { open: boolean; title: string; onClose: () => void; action?: ComponentChildren; children: ComponentChildren }) {
  const { mounted, shown } = useSheet(props.open);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!props.open) return;
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [props.open]);

  useEffect(() => {
    if (shown) box.current?.querySelector<HTMLElement>("[data-autofocus], button")?.focus();
  }, [shown]);

  if (!mounted) return null;
  return (
    <>
      <div class={`scrim${shown ? " on" : ""}`} onClick={props.onClose} aria-hidden="true" />
      <div ref={box} class={`sheet${shown ? " on" : ""}`} role="dialog" aria-modal="true" aria-label={props.title}>
        <div class="grab" aria-hidden="true" />
        <div class="sh">
          <button class="link" onClick={props.onClose}>
            Annulla
          </button>
          <b>{props.title}</b>
          <span class="sh-action">{props.action}</span>
        </div>
        {props.children}
      </div>
    </>
  );
}

export const ICONS = {
  lista: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  prezzi: "M3 12l9-9h8v8l-9 9zM16 8h.01",
  offerte: "M4 4h16v16H4zM4 9h16M9 4v16",
  negozi: "M3 9l2-5h14l2 5M4 9v11h16V9M3 9h18",
  cerca: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  invite: "M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M16 11h6",
};

export function Icon({ d }: { d: string }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const BARS = (() => {
  let x = 0;
  let r = 7;
  const out: [number, number][] = [];
  for (let i = 0; i < 40; i++) {
    r = (r * 9301 + 49297) % 233280;
    const w = 1 + (r % 3);
    if (i % 2 === 0) out.push([x, w]);
    x += w * 1.15;
  }
  return out;
})();

export function Barcode({ label }: { label: string }) {
  return (
    <div class="barcode" aria-hidden="true">
      <svg viewBox="0 0 120 30" preserveAspectRatio="none">
        {BARS.map(([x, w]) => (
          <rect key={x} x={x} y={0} width={w} height={30} fill="currentColor" />
        ))}
      </svg>
      <span>{label}</span>
    </div>
  );
}
