#!/usr/bin/env node
/**
 * Drop Date — sincronizzazione notturna da IGDB.
 *
 * Scrive due file nella radice del progetto:
 *   data.json     uscite correnti (riscritto ogni volta)
 *   history.json  serie storica della popolarità (solo accodata, mai riscritta da zero)
 *
 * history.json è l'unica cosa che non si recupera: se un giorno il cron salta,
 * quel punto manca per sempre. Per questo il file esistente viene letto e unito,
 * e in caso di errore lo script esce senza toccarlo.
 *
 * Credenziali, da variabili d'ambiente:
 *   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data.json");
const HIST = path.join(ROOT, "history.json");

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Mancano TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET.");
  process.exit(1);
}

/* Finestra coperta: 400 giorni indietro servono alla classifica annuale,
   540 avanti al calendario. */
const GIORNI_INDIETRO = 400;
const GIORNI_AVANTI = 540;
/* Lo storico tiene 120 giorni: più che sufficiente per finestre da 7 e 14 giorni,
   e tiene il file sotto il megabyte. */
const STORICO_GIORNI = 120;

const PIATTAFORME = {
  pc: "PC (Microsoft Windows)",
  switch2: "Nintendo Switch 2",
  ps5: "PlayStation 5",
};

const oggi = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const OGGI = iso(oggi);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const ts = (d) => Math.floor(d.getTime() / 1000);

/* ---------------------------------------------------------------- IGDB */

async function token() {
  const u = new URL("https://id.twitch.tv/oauth2/token");
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("client_secret", CLIENT_SECRET);
  u.searchParams.set("grant_type", "client_credentials");
  const r = await fetch(u, { method: "POST" });
  if (!r.ok) throw new Error(`OAuth Twitch fallito: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

/* IGDB consente 4 richieste al secondo. Teniamo un margine. */
let ultima = 0;
async function igdb(tok, endpoint, query, tentativo = 0) {
  const attesa = 280 - (Date.now() - ultima);
  if (attesa > 0) await new Promise((r) => setTimeout(r, attesa));
  ultima = Date.now();
  const r = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: { "Client-ID": CLIENT_ID, Authorization: `Bearer ${tok}`, Accept: "application/json" },
    body: query,
  });
  if (r.status === 429 || r.status >= 500) {
    if (tentativo >= 4) throw new Error(`${endpoint}: ${r.status} dopo 5 tentativi`);
    await new Promise((res) => setTimeout(res, 1000 * 2 ** tentativo));
    return igdb(tok, endpoint, query, tentativo + 1);
  }
  if (!r.ok) throw new Error(`${endpoint}: ${r.status} ${await r.text()}\nquery: ${query}`);
  return r.json();
}

async function paginato(tok, endpoint, campi, dove, max = 200000) {
  const out = [];
  let troncato = true;
  for (let offset = 0; offset < max; offset += 500) {
    const q = `fields ${campi}; where ${dove}; sort id asc; limit 500; offset ${offset};`;
    const page = await igdb(tok, endpoint, q);
    out.push(...page);
    if (page.length < 500) { troncato = false; break; }
  }
  /* Il tetto esiste solo per non girare a vuoto se una query impazzisce. Toccarlo
     vuol dire che i dati sono incompleti, e un elenco incompleto spacciato per
     intero e' peggio di un errore: va detto. */
  if (troncato) console.warn(`ATTENZIONE: ${endpoint} ha raggiunto il tetto di ${max} righe, i dati sono troncati.`);
  return out;
}

/* Gli ID piattaforma vengono risolti per nome: se IGDB ne cambia uno,
   lo script continua a funzionare invece di scaricare il vuoto. */
async function idPiattaforme(tok) {
  const nomi = Object.values(PIATTAFORME).map((n) => `"${n}"`).join(",");
  const righe = await igdb(tok, "platforms", `fields id,name; where name = (${nomi}); limit 50;`);
  const map = {};
  for (const [chiave, nome] of Object.entries(PIATTAFORME)) {
    const t = righe.find((r) => r.name === nome);
    if (!t) throw new Error(`Piattaforma non trovata su IGDB: ${nome}`);
    map[chiave] = t.id;
  }
  return map;
}

/* ------------------------------------------------------- trasformazione */

/* date_format di release_dates = precisione della data annunciata.
   0 giorno esatto · 1 mese · 2 anno · 3-6 trimestre · 7 da definire
   Era `category`: IGDB l'ha dismesso e oggi non lo restituisce affatto. Letto con
   `?? 0` diventava "giorno esatto" per tutti, cosi' le date a precisione anno
   finivano tutte sul 31 dicembre: 1705 giochi ammucchiati su un giorno solo. */
const FINESTRA = { 1: "m", 2: "a", 3: "Q1", 4: "Q2", 5: "Q3", 6: "Q4", 7: "TBA" };
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function etichettaVaga(cat, d) {
  const f = FINESTRA[cat];
  if (!f || !d) return "TBA";
  const anno = d.getUTCFullYear();
  if (f === "m") return `${MESI[d.getUTCMonth()]} ${anno}`;
  if (f === "a") return String(anno);
  if (f === "TBA") return "TBA";
  return `${f} ${anno}`;
}

/* Gli id dei tipi di sito si risolvono per nome, come quelli delle piattaforme:
   se IGDB ne rinumera uno lo script continua a funzionare. Prima erano costanti
   confrontate con `websites.category`, campo dismesso che IGDB non restituisce
   piu': nessuna corrispondenza scattava mai, nessun errore veniva alzato, e tutti
   i 28.715 titoli finivano con i soli link di ricerca costruiti dal titolo. Zero
   pagine store vere, zero siti ufficiali. */
async function idSiti(tok) {
  const righe = await igdb(tok, "website_types", "fields id,type; limit 100;");
  const m = {};
  for (const r of righe) m[r.type] = r.id;
  console.log(`tipi di sito noti a IGDB: ${righe.map((r) => r.type).sort().join(", ")}`);
  return m;
}

/* Un link di ricerca e' un ripiego: porta su una lista di risultati, non sul gioco.
   Quando IGDB ha la pagina vera si usa quella, e l'etichetta lo dice, cosi' si
   distingue a colpo d'occhio cosa si sta per aprire. */
function linkDi(gioco, piattaforme, tipo) {
  const out = [];
  const siti = gioco.websites || [];
  const di = (...nomi) => {
    for (const n of nomi) {
      const t = tipo[n];
      const s = t ? siti.find((x) => x.type === t) : null;
      if (s) return s;
    }
    return null;
  };
  const q = encodeURIComponent(gioco.name);

  const steam = di("Steam");
  if (steam) out.push({ k: "steam", u: steam.url, n: "Pagina Steam" });
  else if (piattaforme.includes("pc"))
    out.push({ k: "steam", u: `https://store.steampowered.com/search/?term=${q}`, n: "Cerca su Steam" });

  if (piattaforme.includes("ps5")) {
    const ps = di("Playstation", "PlayStation");
    if (ps) out.push({ k: "bag", u: ps.url, n: "Pagina PlayStation Store" });
    else out.push({ k: "bag", u: `https://store.playstation.com/it-it/search/${q}`, n: "Cerca su PlayStation Store" });
  }
  if (piattaforme.includes("switch2")) {
    const nin = di("Nintendo", "Nintendo eShop");
    if (nin) out.push({ k: "bag", u: nin.url, n: "Pagina Nintendo" });
    else out.push({ k: "bag", u: `https://www.nintendo.com/search/?q=${q}`, n: "Cerca su Nintendo" });
  }

  const uff = di("Official Website");
  if (uff) out.push({ k: "globe", u: uff.url, n: "Sito ufficiale" });
  else {
    const alt = di("Epic", "GOG", "Itch");
    if (alt) out.push({ k: "globe", u: alt.url, n: "Altro store" });
  }
  return out;
}

/* I generi IGDB sono in inglese e alcuni sono prolissi: si accorciano e si traducono. */
const GENERE_IT = {
  "Point-and-click": "Punta e clicca", "Fighting": "Picchiaduro", "Shooter": "Sparatutto",
  "Music": "Musicale", "Platform": "Platform", "Puzzle": "Puzzle", "Racing": "Corse",
  "Real Time Strategy (RTS)": "Strategia", "Role-playing (RPG)": "GDR", "Simulator": "Simulazione",
  "Sport": "Sport", "Strategy": "Strategia", "Turn-based strategy (TBS)": "Strategia a turni",
  "Tactical": "Tattico", "Hack and slash/Beat 'em up": "Azione", "Quiz/Trivia": "Quiz",
  "Pinball": "Flipper", "Adventure": "Avventura", "Indie": "Indie", "Arcade": "Arcade",
  "Visual Novel": "Visual novel", "Card & Board Game": "Carte e tavolo", "MOBA": "MOBA",
};

/* Voto della stampa. aggregated_rating è la media delle testate raccolta da IGDB.
   Sotto le 4 recensioni il dato è rumore: in quel caso si ripiega sul voto utenti,
   marcandolo, così la pagina può dirlo invece di spacciarlo per voto stampa. */
function votoDi(gioco) {
  if (!gioco) return {};
  const nStampa = gioco.aggregated_rating_count || 0;
  if (gioco.aggregated_rating && nStampa >= 4)
    return { score: Math.round(gioco.aggregated_rating), scoreN: nStampa, scoreKind: "stampa" };
  if (gioco.rating && (gioco.rating_count || 0) >= 20)
    return { score: Math.round(gioco.rating), scoreN: gioco.rating_count, scoreKind: "utenti" };
  return {};
}

/* Quanta attesa c'e' attorno a un gioco. IGDB ha dismesso `follows`: oggi quel
   campo arriva vuoto su tutto il catalogo, e un percentile calcolato su una colonna
   di zeri ordina a caso - era il motivo per cui GTA VI finiva sotto a titoli ignoti.
   Restano due fonti vive, con scale e coperture diverse:
     popularity_primitives   "Want to Play" e "Visits": precise, ma solo sui titoli noti
     games.hypes             quanti utenti IGDB hanno segnato il gioco fra gli attesi
   Si fondono per rango, non per valore: ogni segnale diventa un percentile fra i
   giochi che quel segnale copre, e si tiene il piu' alto. Cosi' scale incompatibili
   non si sommano a vanvera, e un titolo coperto da una sola fonte non viene punito. */
const POP_TIPI = { 2: "Want to Play", 1: "Visits", 3: "Playing", 5: "24hr Peak Players" };

async function popolarita(tok) {
  const out = new Map();
  for (const tipo of Object.keys(POP_TIPI)) {
    let n = 0;
    for (let offset = 0; offset < 10000; offset += 500) {
      const page = await igdb(tok, "popularity_primitives",
        `fields game_id,value; where popularity_type = ${tipo}; sort value desc; limit 500; offset ${offset};`);
      for (const r of page) {
        if (!out.has(r.game_id)) out.set(r.game_id, {});
        out.get(r.game_id)[tipo] = r.value;
      }
      n += page.length;
      if (page.length < 500) break;
    }
    console.log(`popolarita "${POP_TIPI[tipo]}": ${n} titoli`);
  }
  return out;
}

/* Percentile dentro un gruppo. A parita' di valore, stesso punteggio: senza questo
   un pareggio verrebbe spezzato dall'ordine di arrivo, cioe' dal nulla. */
function percentili(gruppo) {
  /* Solo segnali di anticipazione: "Playing" misura quanto un gioco e' vivo
     adesso, non quanto e' atteso, e nel percentile dell'attesa non ci entra. */
  const segnali = [(g) => g._pop?.[2] || 0, (g) => g._pop?.[1] || 0, (g) => g.hypes || 0];
  for (const leggi of segnali) {
    const con = gruppo.filter((g) => leggi(g) > 0).sort((a, b) => leggi(a) - leggi(b));
    if (!con.length) continue;
    let i = 0;
    while (i < con.length) {
      let j = i;
      while (j + 1 < con.length && leggi(con[j + 1]) === leggi(con[i])) j++;
      const p = Math.round(((j + 1) / con.length) * 100);
      for (let k = i; k <= j; k++) if (p > con[k].hype) con[k].hype = p;
      i = j + 1;
    }
  }
}

/* Quale numero si segue nel tempo per un dato gioco. Per un titolo non ancora
   uscito l'unica cosa misurabile e' l'attesa; per uno uscito conta quanta gente
   ci sta giocando davvero. Sono grandezze diverse, quindi il punto storico porta
   con se' l'id della metrica: senza quello, il giorno dell'uscita il confronto
   passerebbe da "quanti lo vogliono" a "quanti ci giocano" e produrrebbe
   un'impennata inventata, cioe' l'errore piu' visibile che questa sezione possa
   fare. Chi confronta, poi, usa solo punti con la stessa metrica. */
function metrica(g, uscito) {
  const p = g._pop || {};
  const scelte = uscito ? [3, 5, 1] : [2, 1];
  for (const m of scelte) if (p[m]) return { m, v: p[m] };
  return { m: 0, v: g.hypes || 0 };
}

/* Il percentile si calcola separatamente fra non-usciti e usciti: un valore assoluto
   non si confronta fra novembre, pieno di uscite, e febbraio che e' deserto. */
function assegnaAttesa(giochi) {
  for (const g of giochi) g.hype = 0;
  percentili(giochi.filter((g) => !g.date || g.date >= OGGI));
  percentili(giochi.filter((g) => g.date && g.date < OGGI));
}

/* ------------------------------------------------------------------ main */

async function main() {
  const tok = await token();
  const tipoSito = await idSiti(tok);
  const pop = await popolarita(tok);
  const plat = await idPiattaforme(tok);
  const idToKey = Object.fromEntries(Object.entries(plat).map(([k, v]) => [v, k]));
  const ids = Object.values(plat).join(",");
  console.log("Piattaforme:", plat);

  const da = ts(addDays(oggi, -GIORNI_INDIETRO));
  const a = ts(addDays(oggi, GIORNI_AVANTI));

  const campi = [
    "date", "date_format", "platform",
    "game.id", "game.name", "game.hypes", "game.cover.image_id",
    "game.websites.url", "game.websites.type",
    "game.genres.name",
    /* aggregated_rating = media della stampa raccolta da IGDB, su 100.
       rating = voto degli utenti IGDB: usato solo come ripiego, e dichiarato come tale. */
    "game.aggregated_rating", "game.aggregated_rating_count",
    "game.rating", "game.rating_count",
  ].join(",");

  const righe = await paginato(tok, "release_dates", campi,
    `platform = (${ids}) & date >= ${da} & date <= ${a}`);
  console.log(`release_dates scaricate: ${righe.length}`);

  /* Titoli senza alcuna data annunciata: non compaiono fra le release_dates,
     ma sono proprio quelli della sezione "date da definire". */
  const senzaData = await paginato(tok, "games",
    "id,name,hypes,cover.image_id,websites.url,websites.type,platforms",
    `platforms = (${ids}) & first_release_date = null & hypes > 10`, 3000);
  console.log(`titoli senza data: ${senzaData.length}`);

  /* Un gioco ha una riga per piattaforma e a volte per regione: si accorpa,
     tenendo la data più precisa e, a parità, la più vicina. */
  const perGioco = new Map();
  for (const r of righe) {
    if (!r.game || !r.game.name) continue;
    const key = r.game.id;
    const piatt = idToKey[r.platform];
    if (!piatt) continue;
    const d = r.date ? new Date(r.date * 1000) : null;
    let g = perGioco.get(key);
    if (!g) {
      g = { igdb: key, t: r.game.name, hypes: r.game.hypes || 0, plat: [],
            cov: r.game.cover?.image_id || null,
            _cat: 99, _d: null, _siti: r.game.websites || [], _gioco: r.game };
      perGioco.set(key, g);
    }
    if (!g.plat.includes(piatt)) g.plat.push(piatt);
    /* Nessun date_format: la data e' inutilizzabile come giorno esatto, si
       degrada a "da definire" invece di inventare una precisione che non c'e'. */
    const cat = r.date_format ?? 7;
    if (cat < g._cat || (cat === g._cat && d && (!g._d || d < g._d))) { g._cat = cat; g._d = d; }
  }
  for (const s of senzaData) {
    if (perGioco.has(s.id)) continue;
    const piatt = (s.platforms || []).map((p) => idToKey[p]).filter(Boolean);
    if (!piatt.length) continue;
    perGioco.set(s.id, { igdb: s.id, t: s.name, hypes: s.hypes || 0, plat: piatt,
                         cov: s.cover?.image_id || null,
                         _cat: 7, _d: null, _siti: s.websites || [], _gioco: s });
  }

  const giochi = [...perGioco.values()];
  for (const g of giochi) {
    g.plat.sort((a, b) => ["pc", "switch2", "ps5"].indexOf(a) - ["pc", "switch2", "ps5"].indexOf(b));
    if (g._cat === 0 && g._d) g.date = iso(g._d);
    else g.vague = etichettaVaga(g._cat, g._d);
    g.links = linkDi({ name: g.t, websites: g._siti }, g.plat, tipoSito);
    g.genres = (g._gioco?.genres || []).map((x) => GENERE_IT[x.name] || x.name).filter(Boolean);
    Object.assign(g, votoDi(g._gioco));
    g._pop = pop.get(g.igdb);
  }
  assegnaAttesa(giochi);

  /* ---------- i 50 di sempre, su qualsiasi console ----------
     Nessun filtro di piattaforma: restringerla alle tre del sito taglierebbe
     meta' dei classici. game_type = 0 tiene fuori DLC, espansioni, port e
     riedizioni, che altrimenti occupano la classifica con doppioni dello stesso
     gioco. Era `category`, campo che IGDB ha dismesso: non da' errore,
     restituisce zero righe.

     La soglia di recensioni era a 40, e corrisponde a un solo gioco in tutto
     IGDB: la classifica usciva vuota. A 10 i candidati sono circa 740, un bacino
     vero. Ma a quel punto ordinare per media premierebbe chi ha pochi voti
     fortunati, cosi' l'ordine usa una media bayesiana: la media del titolo
     tirata verso quella generale con un peso pari a PRIOR recensioni. Chi ne ha
     poche deve essere molto piu' alto della media per salire, chi ne ha tante
     resta dov'e'. Il voto mostrato resta quello vero, non il corretto: serve a
     ordinare, non a essere letto. */
  const CAND_MIN = 10;
  const PRIOR = 25;
  const candidati = [];
  for (let offset = 0; offset < 2000; offset += 500) {
    const page = await igdb(tok, "games",
      `fields name,aggregated_rating,aggregated_rating_count,first_release_date,genres.name,platforms.name,cover.image_id;
       where aggregated_rating_count >= ${CAND_MIN} & aggregated_rating != null & game_type = 0 & version_parent = null;
       sort aggregated_rating desc; limit 500; offset ${offset};`);
    candidati.push(...page);
    if (page.length < 500) break;
  }
  const mediaGen = candidati.reduce((a, g) => a + g.aggregated_rating, 0) / (candidati.length || 1);
  const bayes = (g) => {
    const n = g.aggregated_rating_count;
    return (n * g.aggregated_rating + PRIOR * mediaGen) / (n + PRIOR);
  };
  const diSempre = [...candidati].sort((a, b) => bayes(b) - bayes(a)).slice(0, 50);
  const allTime = diSempre.map((g) => ({
    t: g.name,
    cov: g.cover?.image_id || null,
    score: Math.round(g.aggregated_rating),
    scoreN: g.aggregated_rating_count,
    platName: (g.platforms || []).slice(0, 2).map((p) => p.name).join(" \u00b7 ") || "\u2014",
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    genres: (g.genres || []).map((x) => GENERE_IT[x.name] || x.name),
  }));
  console.log(`di sempre: ${allTime.length} titoli su ${candidati.length} candidati, ` +
              `da ${allTime[0]?.score} a ${allTime.at(-1)?.score}, media generale ${mediaGen.toFixed(1)}`);

  /* ------- storico: si legge, si accoda, non si riscrive mai da capo ------- */
  let storico = {};
  if (existsSync(HIST)) {
    try { storico = JSON.parse(await readFile(HIST, "utf8")); }
    catch (e) { throw new Error(`history.json illeggibile, mi fermo per non perderlo: ${e.message}`); }
  }
  const limite = iso(addDays(oggi, -STORICO_GIORNI));
  /* Un titolo resta seguito per questi giorni dopo l'uscita: e' la finestra in cui
     un gioco sconosciuto puo' impennarsi e la sezione "Segnalati" ha senso. Oltre,
     non e' piu' una novita' e la serie viene potata. */
  const DOPO_USCITA = 120;
  const sogliaUscita = iso(addDays(oggi, -DOPO_USCITA));
  const seguito = (g) => !g.date || g.date >= sogliaUscita;
  let nuovi = 0;
  for (const g of giochi) {
    if (!seguito(g)) continue;
    const uscito = !!(g.date && g.date < OGGI);
    const { m, v } = metrica(g, uscito);
    const k = String(g.igdb);
    const serie = storico[k] || (storico[k] = []);
    const ultimo = serie[serie.length - 1];
    if (ultimo && ultimo.d === OGGI) { ultimo.f = v; ultimo.m = m; }
    else { serie.push({ d: OGGI, f: v, m }); nuovi++; }
    while (serie.length && serie[0].d < limite) serie.shift();
  }
  /* Potatura: via le serie dei titoli spariti dal listino o usciti da troppo. */
  const vivi = new Set(giochi.filter(seguito).map((g) => String(g.igdb)));
  for (const k of Object.keys(storico)) if (!vivi.has(k)) delete storico[k];

  /* --------- data.json: solo i campi che servono alla pagina --------- */
  const uscita = {
    generated: OGGI,
    source: "IGDB",
    allTime,
    allTimeSource: "IGDB, media stampa, minimo 10 recensioni, ordine a media bayesiana",
    games: giochi.map((g) => {
      const o = { igdb: g.igdb, t: g.t, plat: g.plat, hype: g.hype, links: g.links };
      if (g.cov) o.cov = g.cov;
      if (g.date) o.date = g.date; else o.vague = g.vague;
      if (g.genres?.length) o.genres = g.genres;
      if (g.score) { o.score = g.score; o.scoreN = g.scoreN; o.scoreKind = g.scoreKind; }
      return o;
    }),
  };

  /* Lo slittamento si ricava confrontando con la data del giro precedente:
     l'unico punto in cui questo dato esiste. */
  if (existsSync(DATA)) {
    try {
      const prec = JSON.parse(await readFile(DATA, "utf8"));
      const vecchie = new Map((prec.games || []).filter((g) => g.date).map((g) => [g.igdb, g.date]));
      let slittati = 0;
      for (const g of uscita.games) {
        const v = vecchie.get(g.igdb);
        if (v && g.date && v !== g.date) { g.was = v; slittati++; }
      }
      console.log(`date cambiate dal giro precedente: ${slittati}`);
    } catch { /* primo giro o file corrotto: nessuno slittamento da calcolare */ }
  }

  await writeFile(DATA, JSON.stringify(uscita));
  await writeFile(HIST, JSON.stringify(storico));
  console.log(`data.json: ${uscita.games.length} titoli`);
  console.log(`history.json: ${Object.keys(storico).length} serie, ${nuovi} punti nuovi`);
}

main().catch((e) => { console.error(e); process.exit(1); });
