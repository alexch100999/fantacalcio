# Il Listone — Fantacalcio 2026/27

Sito statico (nessun backend, nessun account) per consultare quotazioni e statistiche
dei calciatori di Serie A durante l'asta del fantacalcio, diviso per ruolo, con un
assistente che suggerisce i migliori giocatori ancora liberi e uno strumento di
confronto testa a testa.

## Contenuto del repo

```
index.html                        pagina unica dell'app
css/style.css                     stile
js/app.js                         logica (tabelle, ordinamento, stato asta, confronto)
data/players.json                 dati letti dal sito (quotazioni + statistiche)
data/fvm_quotazioni.json          base statica: FVM e quotazioni (non toccata dall'automazione)
scripts/update_stats.py           script che aggiorna players.json da API-Football
.github/workflows/update_stats.yml  GitHub Action che esegue lo script ogni settimana
```

## Come pubblicarlo su GitHub Pages

1. Crea un nuovo repository su GitHub (es. `listone-fantacalcio`), oppure usa uno che hai già.
2. Carica tutti i file di questa cartella mantenendo la struttura (`index.html` nella
   root, `css/`, `js/`, `data/` come sottocartelle). Puoi trascinarli nell'interfaccia
   web di GitHub ("Add file" → "Upload files") oppure con git:
   ```bash
   git clone https://github.com/TUO-UTENTE/listone-fantacalcio.git
   cd listone-fantacalcio
   # copia qui dentro index.html, css/, js/, data/
   git add .
   git commit -m "Prima versione del listone"
   git push
   ```
3. Nel repository su GitHub vai su **Settings → Pages**.
4. In "Build and deployment" scegli **Source: Deploy from a branch**, poi seleziona
   il branch `main` e la cartella `/ (root)`.
5. Salva. Dopo un paio di minuti il sito sarà live all'indirizzo
   `https://TUO-UTENTE.github.io/listone-fantacalcio/`.

Nessuna build, nessuna dipendenza da installare: sono solo file statici.

## Come funziona lo stato dell'asta (Libero / Preso da me / Preso da avversario)

Lo stato di ogni giocatore è salvato nel `localStorage` del browser che stai usando,
**non** su un server. Questo significa:

- Va bene per usarlo da solo durante l'asta, sullo stesso dispositivo/browser dall'inizio alla fine.
- Se apri il sito da un altro dispositivo o in incognito, riparte da zero.
- Il pulsante "Nuova asta ↺" cancella tutte le marcature per ricominciare l'anno dopo.

## Come si aggiornano i dati (`data/players.json`)

**Perché non uno scraper:** fantacalcio.it, fotmob.com e Sofascore vietano tutti
esplicitamente lo scraping automatizzato nei loro Termini di Servizio. Questo
repository quindi **non** contiene (e non deve contenere) uno script che scarica
dati da questi siti in automatico.

**La soluzione legittima:** `scripts/update_stats.py` usa invece
[API-Football](https://www.api-football.com) (api-sports.io), un'API pensata
apposta per essere usata da sviluppatori — i suoi termini permettono l'accesso
programmatico, a differenza dei siti sopra. Ha un piano gratuito da 100 richieste
al giorno, più che sufficiente per aggiornare ~500 giocatori una volta a settimana
(bastano circa 20-25 richieste per l'intero listone di Serie A).

Una `.github/workflows/update_stats.yml` esegue lo script automaticamente ogni
martedì (dopo il turno di campionato) e ogni volta che vuoi manualmente.

### Impostare la chiave API (una tantum)

1. Vai su [api-football.com](https://www.api-football.com), crea un account
   gratuito e copia la tua API key dalla dashboard.
2. Nel tuo repository GitHub vai su **Settings → Secrets and variables → Actions
   → New repository secret**.
3. Nome: `API_FOOTBALL_KEY`, valore: la chiave copiata. Salva.
4. Fatto — da questo momento la GitHub Action ha accesso alla chiave in modo
   sicuro (non è mai visibile nel codice o nei log).

### Come funziona l'aggiornamento

1. Lo script scarica le statistiche stagionali di tutti i giocatori di Serie A
   dall'endpoint `/players` di API-Football (voti, gol, assist, cartellini,
   rigori, minutaggio).
2. Applica il regolamento classico (gol +3, assist +1, rigore parato +3, rigore
   sbagliato -3, gol subito -1 per portieri/difensori, ammonizione -0.5,
   espulsione -1) per calcolare una **fantamedia stimata** — non è quella
   ufficiale di fantacalcio.it, è calcolata da noi con la stessa formula sui dati
   grezzi dell'API, quindi può discostarsi leggermente nei decimali.
3. Abbina ogni giocatore trovato al listone base (`data/fvm_quotazioni.json`,
   che contiene FVM e quotazioni e non viene mai toccato dall'automazione) tramite
   il nome.
4. Scrive il risultato in `data/players.json`. Se qualcosa cambia, la Action fa
   commit e push da sola; GitHub Pages/Netlify pubblicano la nuova versione in
   un paio di minuti.

### Aggiornamento manuale (senza aspettare il martedì)

Vai nel repository su GitHub → tab **Actions** → seleziona "Aggiorna statistiche
Serie A" → **Run workflow**. Parte subito.

### Se preferisci farlo comunque a mano

Puoi sempre modificare `data/players.json` direttamente (stessa struttura di
`data/fvm_quotazioni.json` più i campi statistici), utile se vuoi correggere un
singolo valore senza aspettare la prossima esecuzione automatica.

## Copertura dei dati in questa prima versione

- 497 giocatori totali (quotazioni e FVM dal listone ufficiale 2026/27).
- 141 di questi hanno anche statistiche reali della stagione 2025/26 (media voto,
  fantamedia, gol, assist, cartellini) raccolte da fantacalcio.it: sono i giocatori
  di prima fascia, quelli con fantamedia più alta.
- Per gli altri (soprattutto portieri e riserve) sono mostrati solo FVM e quotazione:
  il valore di mercato riflette comunque le aspettative sulla loro stagione.

## Licenza dei dati

Quotazioni, FVM e statistiche provengono da fantacalcio.it. Questo repository li
raccoglie per uso personale/non commerciale nell'ambito di una lega privata; non
ridistribuirli su larga scala o per scopi commerciali.
