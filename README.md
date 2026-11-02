# Spesa di casa

Web app (PWA) per la spesa di famiglia: una lista condivisa che si aggiorna in tempo reale su tutti i telefoni e funziona anche senza rete. Gira su Cloudflare (un Worker che serve l'app e un Durable Object per ogni famiglia).

Fasi pronte: **1** lista condivisa, **2** prezzi dalle foto dei cartellini (letti con Workers AI). Ripartizione tra negozi, volantini e carte fedeltà arrivano nelle fasi successive.

## Cosa fa la fase 1

- Crea la lista di famiglia e la condivide con un link d'invito (chi ha il link usa la lista).
- Aggiungi, spunta, modifica e sposta gli articoli tra Lidl, Eurospin, Conad e Oasi.
- "Negozi di oggi": scegli dove vai e la lista mette prima quelle sezioni.
- Senza rete le modifiche restano sul telefono e partono appena torna la connessione.
- Si installa sulla schermata Home (Android: menu ⋮ → Installa app; iPhone: Condividi → Aggiungi alla schermata Home).

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
