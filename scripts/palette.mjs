/**
 * Playrain — palette del giorno.
 *
 * Per ogni giorno dell'anno (mese-giorno, senza anno) si cerca il gioco con il
 * voto della stampa piu' alto uscito in quella data, in qualsiasi anno e su
 * qualsiasi console, e se ne estraggono i colori dominanti della copertina.
 *
 * Nella pagina finiscono soltanto i colori, in esadecimale: la copertina viene
 * scaricata, letta e buttata qui, durante il giro notturno. I colori non sono
 * un'opera protetta; la copertina si'. Cosi' lo sfondo cambia ogni giorno senza
 * che il sito mostri un'immagine che non e' sua.
 *
 * Il calcolo pesa una sola volta: i giochi del passato non cambiano, quindi a ogni
 * giro si riusano i colori del giro precedente e si ricalcola solo il giorno in cui
 * il vincitore e' cambiato.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const decodeJpeg = require("./vendor/jpeg-decoder.cjs");

const IMG = "https://images.igdb.com/igdb/image/upload/t_cover_small/";

/* Generatore pseudo-casuale con seme: lo stesso gioco da' sempre gli stessi
   colori, anche se il calcolo viene rifatto. Un risultato che cambia a ogni giro
   farebbe tremare lo sfondo da un giorno all'altro senza motivo. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/**
 * Colori dominanti di un'immagine RGBA, dal piu' rappresentativo al meno.
 *
 * k-means su un campione di pixel. Il peso di un colore non e' solo quanti pixel
 * copre: un fondo nero o grigio occupa meta' delle copertine e non dice niente
 * del gioco. Per questo la popolosita' si moltiplica per la vivacita' (quanto il
 * colore e' saturo e lontano dal nero e dal bianco), con una base minima perche'
 * una copertina tutta scura resti scura invece di inventarsi un colore.
 */
export function coloriDominanti(data, width, height, seed = 1, quanti = 4) {
  const px = [];
  const totale = width * height;
  const passo = Math.max(1, Math.floor(totale / 4000));
  for (let i = 0; i < totale; i += passo) {
    const o = i * 4;
    if (data[o + 3] !== undefined && data[o + 3] < 128) continue;
    px.push([data[o], data[o + 1], data[o + 2]]);
  }
  if (px.length < 16) return [];

  const K = 6;
  const rnd = mulberry(seed);
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  /* k-means++: centri iniziali lontani fra loro, altrimenti due centri finiscono
     sullo stesso nero e un colore minoritario ma vivo non ottiene un gruppo. */
  const centri = [px[Math.floor(rnd() * px.length)].slice()];
  while (centri.length < K) {
    const d = px.map((p) => Math.min(...centri.map((c) => dist2(p, c))));
    const somma = d.reduce((a, b) => a + b, 0);
    if (somma === 0) break;
    let x = rnd() * somma, i = 0;
    while (x > d[i] && i < d.length - 1) { x -= d[i]; i++; }
    centri.push(px[i].slice());
  }

  let gruppo = new Array(px.length).fill(0);
  for (let it = 0; it < 12; it++) {
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < centri.length; k++) {
        const dd = dist2(px[i], centri[k]);
        if (dd < bd) { bd = dd; best = k; }
      }
      gruppo[i] = best;
    }
    const acc = centri.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      const a = acc[gruppo[i]];
      a[0] += px[i][0]; a[1] += px[i][1]; a[2] += px[i][2]; a[3]++;
    }
    for (let k = 0; k < centri.length; k++)
      if (acc[k][3]) centri[k] = [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]];
  }

  const conta = centri.map(() => 0);
  for (const g of gruppo) conta[g]++;
  const candidati = centri.map((c, k) => {
    const { s, l } = hsl(...c);
    const vivacita = s * (1 - Math.abs(2 * l - 1));
    return { c, peso: (conta[k] / px.length) * (0.2 + vivacita) };
  }).filter((x) => x.peso > 0).sort((a, b) => b.peso - a.peso);

  /* Due toni quasi uguali sprecano un posto: si tengono solo colori distinti. */
  const scelti = [];
  for (const x of candidati) {
    if (scelti.every((y) => dist2(x.c, y.c) > 28 * 28)) scelti.push(x);
    if (scelti.length === quanti) break;
  }
  return scelti.map((x) => hex(...x.c));
}

async function coloriCopertina(imageId) {
  const r = await fetch(IMG + imageId + ".jpg");
  if (!r.ok) throw new Error(`copertina ${imageId}: HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const img = decodeJpeg(buf, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4 });
  let seme = 0;
  for (const ch of imageId) seme = (Math.imul(seme, 31) + ch.charCodeAt(0)) >>> 0;
  return coloriDominanti(img.data, img.width, img.height, seme);
}

const mmdd = (ts) => {
  const d = new Date(ts * 1000);
  return String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
};

/**
 * Tabella "MM-GG" -> { g: id IGDB, t: titolo, y: anno, c: [colori] }.
 *
 * candidati: giochi IGDB con first_release_date, cover.image_id e voto stampa.
 * punteggio: funzione che ordina i candidati (la stessa media bayesiana della
 *            classifica di sempre, cosi' due recensioni fortunate non vincono).
 * precedente: la tabella del giro prima, da cui si riusano i colori gia' calcolati.
 */
export async function paletteDelGiorno(candidati, punteggio, precedente = {}) {
  const vincitore = new Map();
  for (const g of candidati) {
    if (!g.first_release_date || !g.cover?.image_id) continue;
    const k = mmdd(g.first_release_date);
    const v = vincitore.get(k);
    if (!v || punteggio(g) > punteggio(v)) vincitore.set(k, g);
  }

  const tabella = {};
  const daCalcolare = [];
  for (const [k, g] of vincitore) {
    const p = precedente[k];
    if (p && p.g === g.id && Array.isArray(p.c) && p.c.length) tabella[k] = p;
    else daCalcolare.push([k, g]);
  }

  /* Quattro scaricamenti alla volta: il server delle immagini non e' l'API e non
     ha il limite di quattro richieste al secondo, ma non serve martellarlo. */
  let falliti = 0;
  for (let i = 0; i < daCalcolare.length; i += 4) {
    await Promise.all(daCalcolare.slice(i, i + 4).map(async ([k, g]) => {
      try {
        const c = await coloriCopertina(g.cover.image_id);
        if (!c.length) throw new Error("nessun colore estratto");
        tabella[k] = {
          g: g.id, t: g.name,
          y: new Date(g.first_release_date * 1000).getUTCFullYear(),
          c,
        };
      } catch (e) {
        falliti++;
        /* Un giorno senza colori non e' un guasto: la pagina usa la palette del
           sito. Se pero' falliscono tutti, qualcosa e' cambiato nel formato delle
           immagini, e va detto forte. */
        if (falliti <= 3) console.warn(`palette ${k} (${g.name}): ${e.message}`);
        if (precedente[k]) tabella[k] = precedente[k];
      }
    }));
  }

  const giorni = Object.keys(tabella).length;
  console.log(`palette del giorno: ${giorni} giorni su 366, ${daCalcolare.length} ricalcolati, ${falliti} falliti`);
  if (daCalcolare.length && falliti === daCalcolare.length)
    console.warn("ATTENZIONE: nessuna copertina e' stata letta. Le palette restano quelle di prima.");
  return Object.fromEntries(Object.keys(tabella).sort().map((k) => [k, tabella[k]]));
}
