# Drop Date

Calendario delle uscite videogiochi per **PC, Switch 2, PS5 e Xbox Series X|S**, con vista giornaliera,
tracciamento degli slittamenti e classifica dei titoli in crescita.

Un file HTML autosufficiente più due file di dati. Nessun framework, nessuna build,
nessuna dipendenza da installare.

```
index.html      la pagina: calendario, pannello giorno, classifiche, top 50 ever,
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

**L'attesa misura la grandezza, non il rango.** Era un percentile dentro il gruppo dei
titoli non ancora usciti. Un percentile dice la posizione in fila, non di quanto si è
indietro, e su una distribuzione a coda lunga le due cose divergono brutalmente: il
catalogo è fatto di pochi giganti e migliaia di titoli ignoti, quindi "più atteso del 91%
delle uscite" si otteneva con un *Want to Play* **36 volte più basso** di quello di GTA VI.
Numeri corretti come rango, che a chi legge dicevano una cosa falsa — *Haunted by Femboy*
a 91, *Your Boyfriend* a 95.

Ora il punteggio è la posizione su una **scala logaritmica** del valore: i segnali coprono
quattro ordini di grandezza, e su scala lineare tutto ciò che non è GTA finirebbe
schiacciato a zero. La coda bassa si taglia al 5° percentile, altrimenti un singolo valore
minuscolo allunga la scala e spinge in basso tutti gli altri. Resta relativa al gruppo,
quindi continua ad auto-regolarsi fra un novembre pieno di uscite e un febbraio deserto.

**`Visits` non è attesa.** Contava chi apre la scheda del gioco, cioè curiosità, ed era uno
dei segnali dell'indice. Un titolo con un nome assurdo raccoglie visite proprio perché fa
ridere: *Fart Together* aveva un *Want to Play* **240 volte più basso** di GTA VI ma visite
solo 2,4 volte più basse, e poiché si teneva il segnale più alto arrivava a 100 come GTA VI.
Restano *Want to Play* e `hypes`, che misurano entrambi la stessa cosa: quanta gente vuole
giocarlo. `Visits` sopravvive solo nei *Segnalati*, dove si misura il movimento
dell'attenzione e non il livello dell'attesa.

**Una soglia va riletta ogni volta che cambia la scala sotto.** `AAA` era 90, tarata sui
percentili: con la scala logaritmica sopra 90 restavano tre titoli in tutto e i giorni
dorati sparivano. Ora è 70 — 41 titoli, 12 giorni su 139 — e la lista è esattamente quella
che quel nome significa. Le tre taglie delle card si appoggiano a `AAA` e `REL` invece di
avere una terza soglia propria, che era rimasta a 75 e quindi sopra `AAA`: la taglia media
era diventata irraggiungibile. `REL=50` resta la soglia dei rilevanti in calendario.

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

**I valori di popolarità non sono conteggi.** `popularity_primitives.value` è una
quota normalizzata, dell'ordine di `0,000004`: stamparla come "500 → 800 giocatori"
sarebbe falso, e arrotondata darebbe zero. *Segnalati* mostra quindi la **posizione
percentile** del titolo dentro la sua metrica — `35° → 83° percentile · visite` — che è
esattamente la cosa che la sezione vuole dire: il gioco si è spostato dal fondo del
gruppo verso l'alto. La crescita percentuale resta valida perché è un rapporto, e non
dipende dalla scala.

Sotto il 25° percentile di partenza il titolo resta fuori: le quote più basse sono
quantizzate, e passare dal minimo al gradino successivo è +100% senza che sia accaduto
niente. La soglia è in percentile e non in valore assoluto perché le quattro metriche
vivono su scale diverse, e un numero fisso ne taglierebbe tre male.

**Il giallo in griglia significa una cosa sola: oggi.** Tutte le altre celle sono
contornate di viola, compresa quella selezionata — che si distingue per il doppio filo
interno, non per il colore: due gialli a dire due cose diverse si annullano. Il tripla A
non tocca più la cornice e si riconosce dalla striscia di fondo della sua chip, dentro
la cella.

Il contorno di oggi usa `--amber` e non `--amber-sol`: nel tema chiaro l'ambra accesa dà
2,03 di contrasto sul fondo della cella e il contorno spariva. Così sta a 4,01, e il
viola a 3,55 — sopra il 3,0 richiesto agli elementi non testuali. Il colore da solo non
basterebbe comunque: giallo e viola hanno luminanza simile (1,13 di rapporto fra loro) e
una discromatopsia non li separa. Il secondo segnale è il numero del giorno riempito, che
resta solo per oggi.

**Un solo segnale forte per cella.** La fascia di fondo colorata vale solo per il tripla
A. Averla su tutto ciò che supera attesa 50 la rendeva il colore normale della pagina:
se tre chip su quattro sono evidenziate, nessuna lo è — sopra la soglia resta il filetto
laterale ambra, che basta. Per lo stesso motivo la cella del giorno tripla A ha la
cornice dorata e il doppio filo interno, ma **nessun riempimento**: un fondo colorato su
un quarto delle celle smette di segnalare e diventa sfondo.

**Il giallo del PC è scurito nel tema chiaro.** `#7d7000` dà 5,01 di contrasto su bianco;
il giallo acceso che sarebbe stato naturale si fermava a 3,46, e quelle etichette sono a
7px. Resta comunque un giallo limone e non ambra: l'ambra marca "in evidenza" e l'oro il
tripla A, e tre gialli adiacenti nella stessa pagina non si distinguono più.

**Le due classifiche condividono `.ritem`.** "Migliori del periodo" e "Top 50 ever"
usano la stessa classe, quindi crescono insieme ed è giusto che restino identiche fra
loro: sono la stessa cosa su periodi diversi. Copertina a 76px (60px su mobile), servita
in `t_cover_big` — a quella misura una `t_cover_small`, che ha il lato lungo di 90px, si
sgrana sugli schermi a densità doppia. Le date da definire crescono in proporzione, a
44px.

**Su mobile la barra è rimpicciolita di un gradino, non sfoltita.** Nessun comando
scompare: si riducono padding, corpi e icone, e si nascondono le due etichette
decorative. "Badge" via del tutto, perché il gruppo ha già il suo `aria-label`; "Genere"
è un `<label for>` e resta leggibile dagli screen reader pur uscendo dalla vista —
togliere l'etichetta a una select è un'altra cosa che rimpicciolire una barra. Stimata a
390px di larghezza: da ~142px a ~102px di altezza, più ~15px recuperati fra padding
della pagina e intestazione del mese.

**La data di oggi viene dall'orologio, non da una costante.** Era scritta a mano
(`var TODAY="2026-10-29"`) e il giorno dopo era già sbagliata: la cella "oggi", la
finestra della classifica del periodo e il filtro degli usciti seguivano una data ferma.
Lo stesso valeva per il mese di apertura, fisso a novembre 2026.

Su schermo largo la colonna del giorno parte aperta su oggi: sta accanto al calendario e
non copre niente, quindi la pagina risponde subito a "cosa esce oggi". Su mobile no — lì
il pannello è a tutto schermo e si presenterebbe davanti al calendario.

A mezzanotte la pagina si aggiorna da sé: un solo risveglio programmato sul confine, non
un controllo a ripetizione, con due secondi di margine perché un timer che scatta un
istante prima calcolerebbe ancora la data di ieri. Il giorno mostrato si sposta **solo se
si stava guardando "oggi"**: se chi legge è andato su un'altra data, strappargliela
sarebbe sbagliato.

**Lo spazio in pagina è la gerarchia.** Nel pannello del giorno le card hanno tre
taglie secondo l'attesa: sopra 90 la copertina è a 140px, sopra 75 a 104px, sotto a
72px. Se il titolo più atteso dell'anno occupa quanto un indie sconosciuto, la pagina
sta affermando che valgono uguale.

**Le copertine sono quelle vere.** `cover.image_id` da IGDB, servito da
`images.igdb.com`. Il disegno procedurale a pixel resta solo per i titoli che su IGDB
non hanno copertina, e si riconosce a vista: un segnaposto inventato spacciato per
copertina reale è fuorviante.

**Il nome della piattaforma su IGDB è una lista di candidati.** Ogni piattaforma porta
più scritture possibili (`Xbox Series X|S`, `Xbox Series X/S`, `Xbox Series`) e si
risolve per nome. Se nessuna corrisponde lo script si ferma con un errore esplicito,
invece di scaricare il vuoto: è lo stesso principio per cui `category` è stato un guasto
silenzioso per settimane.

Il colore della piattaforma stava in un ternario a tre rami ripetuto in quattro punti:
aggiungere la quarta piattaforma voleva dire ricordarsi di tutti e quattro. Ora è una
mappa sola (`PCOL`), e chi manca si vede subito.

**"Segnalati" guarda i titoli usciti, non quelli attesi.** La sezione elenca giochi
usciti negli ultimi quattro mesi che stanno impennando: è il posto dove un titolo
sconosciuto si fa notare dopo l'uscita. Prima seguiva i non-usciti, cioè accumulo di
attesa, che è un'altra cosa e la sezione *In evidenza* già la copre.

Il numero seguito cambia col gioco: per un titolo non ancora uscito l'unica cosa
misurabile è l'attesa (*Want to Play*), per uno uscito conta quanta gente ci sta
giocando (*Playing*, poi *24hr Peak Players*, poi *Visits*). Sono grandezze diverse,
quindi **ogni punto storico porta con sé l'id della metrica** e il confronto usa solo
punti omogenei: senza quello, il giorno dell'uscita il paragone passerebbe da "quanti
lo vogliono" a "quanti ci giocano" e inventerebbe un'impennata esattamente lì — l'errore
più visibile che questa sezione possa fare.

**"Date da definire" parte chiusa.** Sono migliaia di titoli e la sezione li stampava
tutti: una pagina che non finisce mai, e qualche migliaio di nodi ricostruiti a ogni
cambio di filtro. Ora l'intestazione porta il conteggio, si apre con un clic e mostra i
primi 48; il resto solo su richiesta esplicita. L'ordine è dal più chiacchierato al meno,
per attesa decrescente.

**La ricerca tollera gli errori di battitura, e lo dichiara.** Prima la corrispondenza
esatta per sottostringa; solo se trova meno di cinque risultati parte la passata
tollerante, sotto un'intestazione separata *"forse cercavi"* — un risultato approssimato
presentato come esatto fa credere che il titolo si chiami così. La distanza di edit ha un
tetto (1 errore fino a 4 caratteri, 2 fino a 8, poi 3) e si interrompe appena lo supera.

Il prefiltro è a pezzi di tre lettere: un errore rovina il pezzo che lo contiene ma
lascia intatti quelli accanto, quindi il titolo giusto passa comunque e la distanza si
calcola su poche decine di candidati invece che su 28.717 titoli a ogni tasto premuto —
misurato, 7-14 ms per ricerca. Ogni errore costa 25 punti di attesa: un titolo molto
atteso con una lettera sbagliata resta davanti a uno ignoto scritto giusto, ma non di
fronte a due errori.

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

**La ricerca ordina per attesa, non per qualità della corrispondenza.** Cerca su
tutto il catalogo — non su quello che i filtri lasciano passare: chi scrive un titolo
vuole trovare quel titolo, non sentirsi dire che non esiste perché è di una piattaforma
che ha spento. Il punteggio è `attesa + bonus`: +15 se il titolo comincia col testo
cercato, +8 se una sua parola comincia così, +0 se capita in mezzo a una parola. Con
livelli rigidi invece — prima tutti i prefissi, poi il resto — cercando "knight" usciva
*Knight's Path* sopra *Hollow Knight*, e "auto" metteva *Autotag* sopra GTA VI. Il bonus
diventa decisivo proprio dove l'attesa non dice niente, cioè sui quattro quinti del
catalogo che stanno a zero.

Il confronto è su minuscole senza accenti, così "pokemon" trova *Pokémon*. Le sigle non
si trovano per sottostringa — nessun titolo contiene "gta" — quindi c'è una lista di
abbreviazioni, tenuta corta di proposito: un elenco lungo diventa una tassonomia da
mantenere a mano e invecchia male. Andando su un risultato nascosto dai filtri attivi,
i filtri si aprono quanto basta: portare a un giorno dove il titolo cercato non compare
sarebbe una risposta sbagliata.

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

**"Top 50 ever" ignora il filtro piattaforme.** La classifica storica si calcola su
qualsiasi console: restringerla alle quattro piattaforme del sito taglierebbe metà dei classici, e un
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
