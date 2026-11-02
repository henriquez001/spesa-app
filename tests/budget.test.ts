import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_NEURONS, neurons, utcDay, worstCase } from "../shared/budget";

describe("tetto dell'AI", () => {
  it("costo massimo di una lettura", () => {
    expect(worstCase(300)).toBe(49); // cartellino
    expect(worstCase(2500)).toBe(184); // foto di scontrino
  });
  it("nel tetto stanno almeno 160 cartellini o 40 foto di scontrino al giorno", () => {
    expect(Math.floor(DEFAULT_DAILY_NEURONS / worstCase(300))).toBeGreaterThanOrEqual(160);
    expect(Math.floor(DEFAULT_DAILY_NEURONS / worstCase(2500))).toBeGreaterThanOrEqual(40);
    expect(DEFAULT_DAILY_NEURONS).toBeLessThan(10_000);
  });
  it("costo vero dai token", () => {
    expect(neurons(1_000_000, 0)).toBeCloseTo(4410);
    expect(neurons(0, 1_000_000)).toBeCloseTo(61493);
  });
  it("il giorno è quello UTC, come la quota di Cloudflare", () => {
    expect(utcDay(Date.UTC(2026, 10, 2, 23, 30))).toBe("2026-11-02");
  });
});
