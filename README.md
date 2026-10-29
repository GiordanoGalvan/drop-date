# Drop Date

Calendario delle uscite videogiochi per **PC, Switch 2 e PS5**, con vista giornaliera,
tracciamento degli slittamenti e classifica dei titoli in crescita.

Un file HTML autosufficiente più due file di dati. Nessun framework, nessuna build,
nessuna dipendenza da installare.

```
index.html      la pagina: calendario, pannello giorno, classifiche, i 50 di sempre,
                crescita, date da definire
data.json       uscite correnti — riscritto a ogni giro del cron
history.json    serie storica della popolarità — solo accodato, mai riscritto
scripts/sync.mjs            scarica da IGDB e aggiorna i due JSON
.github/workflows/sync.yml  cron notturno che esegue il sync e committa
```

La pagina carica `data.json` a runtime. Se non lo trova — aperta da sola, senza rete,
in anteprima — ripiega su uno snapshot incorporato del 29 ottobre 2026 e lo dichiara nel
piè di pagina. Non si rompe mai, al massimo mostra dati vecchi dicendolo.

## Attivazione

### 1. Credenziali IGDB

IGDB appartiene a Twitch, quindi le credenziali si prendono da lì. È gratuito.

1. Su `dev.twitch.tv/console/apps` registra una nuova applicazione.
   Come OAuth Redirect URL va bene `http://localhost` — non viene usato.
   Categoria: *Application Integration*.
2. Prendi il **Client ID** e genera il **Client Secret**. Il secret si vede una volta sola.

### 2. Secret su GitHub

Nel repository, *Settings → Secrets and variables → Actions → New repository secret*:

| Nome | Valore |
|---|---|
| `TWITCH_CLIENT_ID` | il Client ID |
| `TWITCH_CLIENT_SECRET` | il Client Secret |

### 3. Primo giro

*Actions → Sync IGDB → Run workflow*. Da lì in poi parte da solo ogni notte alle 04:23 UTC.

Il primo giro riempie `data.json` con i dati veri e crea `history.json` con un solo punto
per titolo. La sezione "In crescita" resta vuota per circa due settimane: serve lo storico,
e lo storico si accumula un giorno alla volta. È previsto, non è un guasto.

### 4. Pubblicazione

Attiva: **GitHub Pages**, da `main`, directory `.` — nessun comando di build.
Il sito sta su `https://<utente>.github.io/<repo>/`.

Qualsiasi altro hosting statico va uguale: Netlify vuole il repository collegato,
comando di build vuoto, directory di pubblicazione `.`.

Il deploy si riattiva da sé a ogni commit del bot, quindi il sito segue il cron
senza altri passaggi.

## Prova in locale

```bash
TWITCH_CLIENT_ID=xxx TWITCH_CLIENT_SECRET=yyy npm run sync
python3 -m http.server 8080      # poi apri http://localhost:8080
```

Aprire `index.html` con doppio clic non basta: `fetch` sui file locali viene bloccato
dal browser e la pagina ripiega sullo snapshot. Serve un server, anche banale.

## Scelte da sapere

**L'attesa è un percentile, non un numero assoluto.** Ogni titolo non ancora uscito riceve
un punteggio 0-100 in base al suo rango di popolarità fra gli altri titoli non ancora usciti.
Un valore assoluto non si confronta fra novembre, pieno di uscite, e febbraio che è deserto:
il percentile si auto-regola. La soglia dei "rilevanti" in calendario è a 50 e si cambia
da una riga sola in `index.html` (`var REL=50`).

**La popolarità non viene da `follows`.** IGDB ha dismesso quel campo: oggi risponde
vuoto su tutto il catalogo, senza dare errore. Un percentile calcolato su una colonna
di zeri ordina a caso, ed è il motivo per cui nei primi giri GTA VI finiva sotto a
titoli ignoti. Al suo posto si usano due fonti ancora vive — l'endpoint
`popularity_primitives` (*Want to Play* e *Visits*) e il campo `hypes` — fuse **per
rango e non per valore**: ogni segnale diventa un percentile fra i giochi che copre e
si tiene il più alto. Scale incompatibili così non si sommano a vanvera, e un titolo
coperto da una sola fonte non viene punito. A parità di valore il punteggio è lo
stesso: un pareggio spezzato dall'ordine di arrivo è esattamente il bug di prima.

**Una soglia sola per "tripla A".** Attesa a 90 — in `index.html`, `var AAA=90` —
e la usano due cose insieme: la card grande nel pannello del giorno e la cornice
dorata della cella in calendario. Sono 36 giorni su 140 con uscite, un quarto: visibile
senza diventare decorazione. Nella cella si dora anche la chip del titolo che ha fatto
scattare la regola, così si vede di chi è il merito invece di dover indovinare.

**Lo spazio in pagina è la gerarchia.** Nel pannello del giorno le card hanno tre
taglie secondo l'attesa: sopra 90 la copertina è a 140px, sopra 75 a 104px, sotto a
72px. Se il titolo più atteso dell'anno occupa quanto un indie sconosciuto, la pagina
sta affermando che valgono uguale.

**Le copertine sono quelle vere.** `cover.image_id` da IGDB, servito da
`images.igdb.com`. Il disegno procedurale a pixel resta solo per i titoli che su IGDB
non hanno copertina, e si riconosce a vista: un segnaposto inventato spacciato per
copertina reale è fuorviante.

**La crescita si calcola sulle date, non sulle posizioni.** Se una notte il cron salta,
la finestra a 7 giorni resta di 7 giorni veri invece di diventare di 8. Un giro mancato
degrada il dato, non lo falsa.

**I link puntano alla pagina vera quando esiste.** `websites.type` da IGDB: pagina
Steam, pagina PlayStation Store, pagina Nintendo, sito ufficiale. Gli id dei tipi si
risolvono **per nome**, come quelli delle piattaforme, così una rinumerazione a monte
non rompe niente. Dove IGDB non ha la pagina si ripiega sulla ricerca nello store, e
l'etichetta del link dice sempre quale dei due stai per aprire: una ricerca spacciata
per scheda prodotto fa perdere tempo a chi clicca.

Il campo era `websites.category`, dismesso: non dava errore, semplicemente non
corrispondeva mai, e **tutti i titoli finivano con i soli link di ricerca** — zero
pagine store, zero siti ufficiali, su 28.715 giochi.

**Niente entra in HTML senza `esc()`.** I titoli arrivano da IGDB e contengono di
tutto: 69 hanno doppi apici, 2 hanno `<` o `>`, 466 una `&`. Un apice dentro un
attributo lo chiude in anticipo, il browser legge il resto come spazzatura e l'ancora
perde l'`href` — erano i link morti su alcune card in evidenza, visibili solo nei giorni
con poche uscite, dove anche un titolo ad attesa zero finisce in evidenza. La pagina
costruisce HTML concatenando stringhe, che è legittimo; non mettere in sicurezza quello
che ci si concatena non lo è.

**Gli slittamenti escono dal confronto fra giri.** `sync.mjs` legge il `data.json` del
giorno prima e, se una data è cambiata, scrive la precedente nel campo `was`. È l'unico
momento in cui quel dato esiste: IGDB espone la data corrente, non la storia delle date.
Per questo il `data.json` va committato e non rigenerato da zero.

**I voti vengono da IGDB, non da Metacritic.** IGDB espone `aggregated_rating`, la media
delle testate, nella stessa chiamata del resto: nessuna seconda API, nessuna credenziale
in più. Metacritic non ha API pubblica e OpenCritic ne richiederebbe una a parte.
Sotto le quattro recensioni il valore è rumore e il titolo resta fuori dalla classifica;
se mancano i voti stampa ma ci sono almeno venti voti utenti si usa quello, e la pagina
lo dichiara con l'etichetta `UTENTI` invece del numero di recensioni.

**"I 50 di sempre" ignora il filtro piattaforme.** La classifica storica si calcola su
qualsiasi console: restringerla a PC, Switch 2 e PS5 taglierebbe metà dei classici, e un
Ocarina of Time assente da una classifica di sempre è un errore, non una scelta di campo.
Il filtro generi invece si applica. La lista la costruisce IGDB con `game_type = 0`,
che tiene fuori DLC, espansioni, port e riedizioni — altrimenti la classifica si
riempie di doppioni dello stesso gioco. Senza `data.json` la sezione resta vuota e lo
dichiara: non esiste una classifica di scorta incorporata nella pagina.

**La soglia di recensioni era irrealistica, e la classifica usciva vuota.**
`aggregated_rating_count >= 40` corrisponde a **un solo gioco in tutto IGDB**. A 10 i
candidati sono circa 740. Ma a quel punto l'ordine per media premierebbe chi ha pochi
voti fortunati, così si ordina per **media bayesiana**: la media del titolo tirata
verso quella generale con un peso pari a 25 recensioni. Chi ne ha dieci deve stare
molto sopra la media per salire; chi ne ha ottanta resta dov'è. Il voto mostrato resta
quello vero — la correzione serve a ordinare, non a essere letta, e accanto compare il
numero di recensioni: e' il dato che spiega perche' un 92 su 39 recensioni stia sopra un
97 su 17, e nasconderlo faceva sembrare arbitrario l'ordine.

Per la stessa ragione il colore del riquadro voto segue la **posizione** (primi dieci,
primi venticinque, resto) e non il voto grezzo: con soglie fisse sul voto contraddiceva
l'ordinamento bayesiano, e il terzo in classifica usciva nel colore piu' spento mentre
il sesto era dorato. Due scale nella stessa colonna si leggono come un errore.

**I generi arrivano da IGDB, tradotti.** Nello snapshot ne sono compilati circa 135 su 330,
quelli riconoscibili a mano; col primo giro del cron li hanno tutti. Un titolo senza genere
sparisce quando il filtro è attivo — è il comportamento giusto, ma spiega perché oggi
filtrando si vede meno del previsto.

**`history.json` non è ricostruibile.** Le date di uscita si riallineano quando si vuole,
la popolarità di ieri no. Lo script lo legge, accoda e pota a 120 giorni; se il file risulta
illeggibile si ferma invece di sovrascriverlo.

## Da fare

- Soglia dei rilevanti da ritarare quando si vedono i volumi veri di IGDB.
- Se i voti IGDB risultassero troppo radi, OpenCritic ha un'API vera via RapidAPI:
  si aggancia come seconda fonte di `score` senza toccare il resto della pipeline.
