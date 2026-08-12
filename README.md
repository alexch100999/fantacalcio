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

## Amichevoli precampionato (opzionale)

`scripts/update_friendlies.py` raccoglie gol e assist delle amichevoli estive
delle squadre di Serie A, sempre da API-Football. Non entrano nel calcolo della
fantamedia (le amichevoli non contano nel regolamento ufficiale): compaiono solo
come piccolo badge accanto al nome del giocatore nella tabella, es. "2⚽ 1👟".

**Perché è manuale e non schedulato:** analizzare tutte le amichevoli di 20
squadre può superare le 100 chiamate/giorno del piano gratuito. Lo script salva
in `data/_friendlies_cache.json` quali partite ha già analizzato, quindi puoi
lanciarlo più giorni di fila (Actions → "Aggiorna statistiche amichevoli" →
Run workflow) e la copertura si costruisce in modo incrementale, senza sprecare
chiamate su partite già viste. Lo script stesso ti dice a fine esecuzione se
restano amichevoli da analizzare.

Puoi anche cambiare quante chiamate usare per esecuzione (default 80) inserendo
un valore diverso nel campo "max_calls" quando lanci la Action manualmente.

### Se preferisci farlo comunque a mano

Puoi sempre modificare `data/players.json` direttamente (stessa struttura di
`data/fvm_quotazioni.json` più i campi statistici), utile se vuoi correggere un
singolo valore senza aspettare la prossima esecuzione automatica.

## Coppie (portieri per calendario + titolare-riserva)

Nuova tab "Coppie" nel sito, con due classifiche.

### Coppie di portieri per calendario

`scripts/update_calendar.py` scarica il calendario completo di Serie A da
API-Football e stima una difficoltà per ogni partita, basata sul FVM medio
della rosa avversaria (con una piccola correzione casa/trasferta). È
un'approssimazione dichiarata, non un modello statistico calibrato — ma utile
per farsi un'idea.

Il sito poi calcola in automatico, per ogni possibile coppia di portieri, la
difficoltà media che affronteresti se giocassi sempre il portiere con
l'impegno più facile di giornata, e mostra le 25 coppie migliori.

Esegui manualmente da **Actions → "Aggiorna calendario e difficoltà" → Run
workflow**. Il calendario cambia raramente durante la stagione, quindi non
serve rilanciarlo spesso — una volta a inizio anno e dopo eventuali rinvii/
recuperi importanti basta.

### Coppie titolare-riserva

Queste **non** sono calcolabili da un'API: chi gioca titolare e chi è la
riserva in un reparto cambia settimana per settimana in base a forma,
infortuni e scelte tattiche — è l'informazione che si trova nelle "probabili
formazioni" o nei depth chart di siti come Transfermarkt.

Mantieni tu il file `data/gerarchie.json`, con questo formato per ogni riga:
```json
{
  "squadra": "Inter",
  "ruolo": "A",
  "titolare": "Thuram",
  "riserva": "Taremi"
}
```
`ruolo` è `D`, `C` o `A`. Nome squadra e nomi giocatori devono corrispondere
esattamente a quelli nel listone (`data/fvm_quotazioni.json`), altrimenti
l'abbinamento non trova il giocatore e la riga viene ignorata silenziosamente
— se una coppia non compare sul sito, è il primo posto dove controllare.
Il sito calcola da solo il costo combinato (Qt.A titolare + riserva) e ordina
le coppie dalla più economica.

## Allenatori e giocatori chiave (manuale)

Un altro file che mantieni tu, `data/allenatori.json`: modulo, allenatore e
giocatori considerati "chiave" per ogni squadra (chi calcia rigori/punizioni,
chi è insostituibile nel modulo, ecc.) — informazioni che raccogli da fonti
come le probabili formazioni o le analisi tattiche.

Formato per ogni squadra:
```json
{
  "squadra": "Inter",
  "allenatore": "Nome Allenatore",
  "modulo": "3-5-2",
  "attacco": 4.5,
  "difesa": 4.5,
  "puntiChiave": ["Valorizzazione esterni", "Fase difensiva organizzata"],
  "probabileFormazione": ["Nome1", "Nome2", "..."],
  "giocatoriChiave": [
    { "nome": "Barella", "motivo": "Fulcro del centrocampo" },
    { "nome": "Thuram", "motivo": "Riferimento offensivo" }
  ],
  "nomiNascosti": [
    { "nome": "NomeRiserva", "motivo": "Perché ha potenziale inespresso" }
  ]
}
```
`attacco` e `difesa` sono valutazioni da 0 a 5 (anche a step di 0.5), mostrate
come stelline nella pagina Formazioni.
Nome squadra e nomi giocatori devono corrispondere esattamente al listone,
stessa regola di `gerarchie.json`. I giocatori in `giocatoriChiave` mostrano
una stellina ★ accanto al nome nella tabella, nel pannello "Migliori liberi" e
nel confronto testa a testa (dove compaiono anche allenatore e modulo).

## Filtro giocatori chiave, nomi nascosti e pagina Formazioni

Aggiornamenti che sfruttano `data/allenatori.json` in modo più completo:

- **Filtro "Solo chiave ★"** nella toolbar di ogni tab per ruolo: mostra solo i
  giocatori segnalati come chiave nel modulo del loro allenatore.
- **Motivo del badge**: passando il mouse sulla ★ (o tenendo premuto su
  mobile) vedi perché quel giocatore è considerato chiave — il testo viene da
  `giocatoriChiave[].motivo` in `allenatori.json`.
- **Nomi nascosti 💎**: stesso meccanismo per `nomiNascosti[]`, i giocatori ad
  alto potenziale ancora poco considerati secondo l'analisi tattica.
- **Nuova tab "Formazioni"**: selezioni una squadra e vedi in un colpo d'occhio
  allenatore, modulo, valutazione attacco/difesa a stelle, punti chiave
  dell'allenatore, probabile formazione (con ruolo Fantacalcio corretto preso
  dal listone, non dalla posizione tattica) e l'elenco di giocatori chiave e
  nomi nascosti con la spiegazione per ciascuno.
- **Ordinamento più "intelligente" nei suggerimenti**: il pannello "Migliori
  liberi" ora ordina per FVM ma dà una spinta (+15%) ai giocatori ★ chiave e
  (+8%) ai nomi nascosti 💎, così tra due giocatori di valore simile emerge
  prima quello con più probabilità di rendere secondo l'analisi tattica. È
  un'euristica dichiarata, non un modello predittivo.

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
