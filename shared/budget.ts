// Tetto giornaliero di Workers AI, per restare nella quota gratuita di Cloudflare.
// La quota è di 10.000 "neuroni" al giorno per tutto l'account e si azzera alle 00:00 UTC.
// Prezzi del modello @cf/meta/llama-3.2-11b-vision-instruct (pagina prezzi Workers AI, novembre 2026):
// 4.410 neuroni per milione di token in ingresso, 61.493 per milione di token in uscita.

export const NEURONS_PER_INPUT_TOKEN = 4410 / 1_000_000;
export const NEURONS_PER_OUTPUT_TOKEN = 61493 / 1_000_000;
/** Una foto vale al massimo 4 riquadri da 1.601 token; il testo delle istruzioni circa 400. */
export const MAX_INPUT_TOKENS = 4 * 1601 + 400;
/** Tetto predefinito: 8.000 dei 10.000 neuroni gratuiti, il resto resta di margine. */
export const DEFAULT_DAILY_NEURONS = 8000;

export function neurons(inputTokens: number, outputTokens: number): number {
  return inputTokens * NEURONS_PER_INPUT_TOKEN + outputTokens * NEURONS_PER_OUTPUT_TOKEN;
}

/** Il massimo che una lettura può costare, da prenotare prima di chiamare il modello. */
export function worstCase(maxOutputTokens: number): number {
  return Math.ceil(neurons(MAX_INPUT_TOKENS, maxOutputTokens));
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}
