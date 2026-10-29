const CID = process.env.TWITCH_CLIENT_ID, CS = process.env.TWITCH_CLIENT_SECRET;
const u = new URL("https://id.twitch.tv/oauth2/token");
u.searchParams.set("client_id", CID); u.searchParams.set("client_secret", CS);
u.searchParams.set("grant_type", "client_credentials");
const tok = (await (await fetch(u, { method: "POST" })).json()).access_token;
let last = 0;
async function q(ep, body) {
  const w = 300 - (Date.now() - last); if (w > 0) await new Promise(r => setTimeout(r, w));
  last = Date.now();
  const r = await fetch(`https://api.igdb.com/v4/${ep}`, { method: "POST",
    headers: { "Client-ID": CID, Authorization: `Bearer ${tok}`, Accept: "application/json" }, body });
  return `${r.status} ${(await r.text()).slice(0, 500)}`;
}
async function cnt(label, where) {
  console.log(`conteggio | ${label}\n  -> ${await q("games/count", `where ${where};`)}`);
}
console.log("tipi di gioco:", await q("game_types", "fields id,type; limit 30;"));
await cnt("solo recensioni >= 40", "aggregated_rating_count >= 40 & aggregated_rating != null");
await cnt("recensioni >= 40 + game_type = 0", "aggregated_rating_count >= 40 & aggregated_rating != null & game_type = 0");
await cnt("recensioni >= 40 + version_parent = null", "aggregated_rating_count >= 40 & aggregated_rating != null & version_parent = null");
await cnt("recensioni >= 20 + game_type = 0", "aggregated_rating_count >= 20 & aggregated_rating != null & game_type = 0");
await cnt("recensioni >= 10 + game_type = 0", "aggregated_rating_count >= 10 & aggregated_rating != null & game_type = 0");
await cnt("solo game_type = 0", "game_type = 0");
console.log("top5 game_type=0 soglia 20:", await q("games",
  "fields name,aggregated_rating,aggregated_rating_count; where aggregated_rating_count >= 20 & aggregated_rating != null & game_type = 0; sort aggregated_rating desc; limit 5;"));
