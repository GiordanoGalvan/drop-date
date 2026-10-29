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
  return `${r.status} ${(await r.text()).slice(0, 700)}`;
}
console.log("formati data disponibili:", await q("date_formats", "fields id,format; limit 20;"));
console.log("\nrelease_dates con category:", await q("release_dates",
  "fields game.name,date,category,human; where date > 1793000000 & date < 1798000000; limit 4;"));
console.log("\nrelease_dates con date_format:", await q("release_dates",
  "fields game.name,date,date_format,human; where date > 1793000000 & date < 1798000000; limit 4;"));
console.log("\nquante date hanno date_format != 0 (precisione non giornaliera):", await q("release_dates/count",
  "where date_format != 0;"));
console.log("\nquante date hanno date_format = 0:", await q("release_dates/count", "where date_format = 0;"));
console.log("\nquante date hanno category = 0:", await q("release_dates/count", "where category = 0;"));
console.log("\nquante date hanno category != 0:", await q("release_dates/count", "where category != 0;"));
