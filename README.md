# Spesa di casa

Web app (PWA) per la spesa di famiglia: una lista condivisa che si aggiorna in tempo reale su tutti i telefoni e funziona anche senza rete. Gira su Cloudflare (un Worker che serve l'app e un Durable Object per ogni famiglia).

Fasi pronte: **1** lista condivisa, **2** prezzi dalle foto dei cartellini e degli scontrini (letti con Workers AI). Ripartizione tra negozi, volantini e carte fedeltà arrivano nelle fasi successive.

## Cosa fa la fase 1

- Crea la lista di famiglia e la condivide con un link d'invito (chi ha il link usa la lista).
- Aggiungi, spunta, modifica e sposta gli articoli tra Lidl, Eurospin, Conad e Oasi.
- "Negozi di oggi": scegli dove vai e la lista mette prima quelle sezioni.
- Senza rete le modifiche restano sul telefono e partono appena torna la connessione.
- Si installa sulla schermata Home (Android: menu ⋮ → Installa app; iPhone: Condividi → Aggiungi alla schermata Home).

## Scontrini

In fotocamera scegli "Scontrino" invece di "Etichetta". Uno scontrino lungo si fotografa in più pezzi dall'alto in basso: le righe ripetute dove le foto si sovrappongono si tolgono da sole. Nella revisione ogni riga mostra il testo stampato e il nome capito; gli sconti si tolgono dal prodotto sopra, la busta non si salva, e gli articoli ancora da prendere che compaiono nello scontrino vengono spuntati.

## Tetto alle letture con l'AI

Per restare nel piano gratuito di Workers AI (10.000 "neuroni" al giorno per tutto l'account Cloudflare, azzerati a mezzanotte UTC) l'app si ferma a **8.000 neuroni al giorno** (`AI_DAILY_NEURONS` in `wrangler.jsonc`). Un contatore unico per l'account prenota il costo massimo di ogni lettura e poi registra quello vero. Al massimo un cartellino costa 49 neuroni e una foto di scontrino 184: nel peggiore dei casi sono circa 160 cartellini o 43 foto di scontrino al giorno, di solito di più. Quando il tetto è raggiunto l'app lo dice e si può scrivere il prezzo a mano.

## Listino online

Ogni notte alle 2:00 UTC un cron legge il catalogo di spesaonline.conad.it per circa 95 parole della spesa comune, una pagina ogni 3 secondi (prezzi nazionali Conad, non del singolo punto vendita). I prezzi stanno in un Durable Object unico (`Catalog`) e la lista li usa per il confronto quando la famiglia non ha un prezzo suo recente. Stato dell'ultimo giro: `/api/listino`; per avviarlo a mano: `/api/listino/aggiorna`.

## Pasti

La prima scheda genera i pasti del giorno dalle diete di casa: una striscia con i prossimi sette giorni, un filtro per persona e, per pranzi e cene, una ricetta con la preparazione presa dal ricettario (`shared/recipes.ts`, scritto a mano, senza AI). Le grammature vengono solo dalle diete; la cena è una ricetta sola con una porzione per ciascuno. Dall'ingranaggio si scelgono i giorni di mensa, lo scambio riso → patate (con il rapporto), la farina "fuori piano" e quanti giorni copre la spesa.

Segnare un pasto come mangiato toglie gli alimenti dalla dispensa; nella scheda Spesa la sezione "Per i pasti" mostra cosa manca per i prossimi giorni, e spuntare una riga lo aggiunge alla dispensa.

Le diete sono dati personali e il repository è pubblico, quindi non sono nel codice. Stanno in due secret del Worker:

```sh
npx wrangler secret put DIETE           # JSON compatto, vedi parseDiets in shared/meals.ts
npx wrangler secret put DIETE_FAMIGLIE  # id dei Durable Object delle famiglie che le ricevono, separati da virgola
```

## Requisiti

- Node.js 20 o più recente
- Un account Cloudflare (va bene il piano gratuito)

## Provarla sul computer

```bash
npm install
npm run dev        # compila l'app e avvia il Worker in locale su http://localhost:8787
```

Per lavorare solo sulla grafica: `npm run dev:ui` (senza sincronizzazione).

## Pubblicarla su Cloudflare

```bash
npx wrangler login   # si apre il browser: accedi a Cloudflare e consenti
npm run deploy       # compila e pubblica
```

Alla fine Wrangler stampa l'indirizzo, del tipo `https://spesa-app.<tuo-sottodominio>.workers.dev`. Aprilo sul telefono, tocca "Crea la lista di famiglia", poi "Invita" per mandare il link agli altri.

Non servono chiavi o segreti nel repository: tutto resta nel tuo account Cloudflare.

## Controlli

```bash
npm test           # test della sincronizzazione e della lista
npm run typecheck  # controllo dei tipi di app e Worker
```

## Struttura

| Cartella | Contenuto |
| --- | --- |
| `shared/` | Regole comuni ad app e server: articoli, operazioni, unione delle modifiche |
| `worker/` | Worker Cloudflare (API) e Durable Object della famiglia (SQLite + WebSocket + lettura foto con Workers AI) |
| `src/` | App Preact: schermate, stile Scontrino, sincronizzazione offline |
| `public/` | Manifest, service worker e icone della PWA |
| `tests/` | Test con Vitest |

## Come funziona la sincronizzazione

Ogni modifica è un'operazione che porta l'articolo intero con l'orario della modifica. Vince la versione più recente, quindi rimandare la stessa operazione non cambia nulla. Il telefono tiene in coda le operazioni finché il server non le conferma; quando si collega riceve l'istantanea della lista e riapplica sopra le sue modifiche non ancora confermate. Gli articoli eliminati restano come "cancellati" per 30 giorni, così anche un telefono rimasto offline a lungo li vede sparire.
