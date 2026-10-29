/* Sonda diagnostica temporanea: capisce quali campi IGDB sono ancora vivi.
   Non scrive nulla, stampa e basta. Da cancellare dopo l'uso. */
const CID = process.env.TWITCH_CLIENT_ID, CS = process.env.TWITCH_CLIENT_SECRET;
const u = new URL("https://id.twitch.tv/oauth2/token");
u.searchParams.set("client_id", CID); u.searchParams.set("client_secret", CS);
u.searchParams.set("grant_type", "client_credentials");
const tok = (await (await fetch(u, { method: "POST" })).json()).access_token;

let last = 0;
async function q(ep, body) {
  const w = 300 - (Date.now() - last); if (w > 0) await new Promise(r => setTimeout(r, w));
  last = Date.now();
  const r = await fetch(`https://api.igdb.com/v4/${ep}`, {
    method: "POST", headers: { "Client-ID": CID, Authorization: `Bearer ${tok}`, Accept: "application/json" }, body });
  const t = await r.text();
  return { ok: r.ok, status: r.status, body: t };
}
async function show(label, ep, body) {
  const r = await q(ep, body);
  console.log(`\n### ${label}\n  stato: ${r.status}\n  ${r.body.slice(0, 900)}`);
}

await show("tipi di popolarita disponibili", "popularity_types", "fields id,name,external_popularity_source; limit 50;");
await show("popolarita, primi 10 globali", "popularity_primitives",
  "fields game_id,value,popularity_type; sort value desc; limit 10;");
await show("GTA VI: campi popolarita", "games",
  "fields name,follows,hypes,total_rating_count,cover.image_id; where id = 52189;");
await show("allTime con game_type", "games",
  "fields name,aggregated_rating; where aggregated_rating_count >= 40 & aggregated_rating != null & game_type = 0 & version_parent = null; sort aggregated_rating desc; limit 5;");
await show("allTime con category (attuale)", "games",
  "fields name,aggregated_rating; where aggregated_rating_count >= 40 & aggregated_rating != null & category = 0 & version_parent = null; sort aggregated_rating desc; limit 5;");
await show("quanti giochi hanno follows valorizzato", "games", "fields id; where follows > 40; limit 5;");
await show("quanti giochi hanno hypes valorizzato", "games", "fields id,name,hypes; where hypes > 40; sort hypes desc; limit 5;");
