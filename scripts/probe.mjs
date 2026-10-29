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
  return `${r.status} ${(await r.text()).slice(0, 1400)}`;
}
console.log("tipi di sito:", await q("website_types", "fields id,type; limit 40;"));
console.log("\nGTA VI con websites.category:", await q("games",
  "fields name,url,websites.url,websites.category; where id = 52189;"));
console.log("\nGTA VI con websites.type:", await q("games",
  "fields name,url,websites.url,websites.type; where id = 52189;"));
