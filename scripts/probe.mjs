const CID = process.env.TWITCH_CLIENT_ID, CS = process.env.TWITCH_CLIENT_SECRET;
const u = new URL("https://id.twitch.tv/oauth2/token");
u.searchParams.set("client_id", CID); u.searchParams.set("client_secret", CS);
u.searchParams.set("grant_type", "client_credentials");
const tok = (await (await fetch(u, { method: "POST" })).json()).access_token;
async function q(ep, body) {
  const r = await fetch(`https://api.igdb.com/v4/${ep}`, { method: "POST",
    headers: { "Client-ID": CID, Authorization: `Bearer ${tok}`, Accept: "application/json" }, body });
  return JSON.parse(await r.text());
}
const ids = { 421011: "Fart Together", 52189: "GTA VI", 322835: "Haunted by Femboy",
  397648: "Anime Fart Simulator", 117170: "Stellar Blade", 81249: "Elder Scrolls VI" };
const TIPO = { 1: "Visits", 2: "WantToPlay", 3: "Playing", 5: "Picco24h" };
const rows = await q("popularity_primitives",
  `fields game_id,value,popularity_type; where game_id = (${Object.keys(ids).join(",")}); limit 100;`);
const giochi = await q("games", `fields id,name,hypes; where id = (${Object.keys(ids).join(",")}); limit 20;`);
const per = {};
for (const r of rows) { (per[r.game_id] = per[r.game_id] || {})[r.popularity_type] = r.value; }
console.log("titolo".padEnd(22) + "hypes".padStart(7) + "  WantToPlay      Visits        Playing");
for (const [id, nome] of Object.entries(ids)) {
  const p = per[id] || {};
  const gg = giochi.find((x) => x.id === +id) || {};
  const f = (v) => (v === undefined ? "        —" : v.toExponential(2).padStart(9));
  console.log(nome.padEnd(22) + String(gg.hypes ?? 0).padStart(7) + "  " + f(p[2]) + "  " + f(p[1]) + "  " + f(p[3]));
}
