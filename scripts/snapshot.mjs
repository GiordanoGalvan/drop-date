#!/usr/bin/env node
/**
 * Playrain — rigenera lo snapshot di riserva dentro index.html.
 *
 * La pagina lo usa solo se data.json non e' raggiungibile. E' un estratto dei
 * dati IGDB del giorno: uscite vicine abbastanza attese, le date da definire piu'
 * attese, i migliori dell'anno, i 50 di sempre. Non serve rilanciarlo spesso:
 * basta quando lo snapshot e' diventato troppo vecchio per essere utile.
 *
 *   node scripts/snapshot.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PAGE = path.join(ROOT, "index.html");
const DATA = path.join(ROOT, "data.json");

const KEYS = ["igdb", "t", "plat", "hype", "date", "vague", "genres", "score", "scoreN", "scoreKind", "cov"];
const pick = (g) => Object.fromEntries(KEYS.filter((k) => g[k] != null && g[k] !== "" &&
  !(Array.isArray(g[k]) && !g[k].length)).map((k) => [k, g[k]]));

const d = JSON.parse(await readFile(DATA, "utf8"));
const oggi = new Date(d.generated + "T00:00:00Z");
const giorni = (s) => (new Date(s + "T00:00:00Z") - oggi) / 86400000;

const scelti = new Map();
for (const g of d.games)
  if (g.date && giorni(g.date) >= -35 && giorni(g.date) <= 150 && (g.hype || 0) >= 40) scelti.set(g.igdb, g);
for (const g of d.games.filter((g) => g.vague).sort((a, b) => (b.hype || 0) - (a.hype || 0)).slice(0, 60))
  scelti.set(g.igdb, g);
for (const g of d.games.filter((g) => g.score && g.date && giorni(g.date) > -365 && giorni(g.date) <= 0)
  .sort((a, b) => b.score - a.score || (b.scoreN || 0) - (a.scoreN || 0)).slice(0, 40))
  scelti.set(g.igdb, g);

const fb = { generated: d.generated, games: [...scelti.values()].map(pick), allTime: d.allTime || [] };
/* "</" chiuderebbe lo <script> se comparisse in un titolo. */
const js = JSON.stringify(fb).replace(/<\//g, "<\\/");

const html = await readFile(PAGE, "utf8");
const inizio = html.indexOf("var FALLBACK=");
const fine = html.indexOf(";\n", inizio);
if (inizio < 0 || fine < 0) throw new Error("Segnaposto var FALLBACK=...; non trovato in index.html");
await writeFile(PAGE, html.slice(0, inizio) + "var FALLBACK=" + js + html.slice(fine));
console.log(`snapshot del ${d.generated}: ${fb.games.length} titoli e ${fb.allTime.length} di sempre, ` +
            `${(js.length / 1024).toFixed(0)} KB`);
