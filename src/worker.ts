// Eigen ingang van de Worker: eerst de onderhoudspoort (src/lib/onderhoud.js), daarna Astro.
// Daarvoor staat assets.run_worker_first op true in wrangler.jsonc: elk verzoek komt hier langs,
// ook statische pagina's; Astro serveert die daarna zelf uit de ASSETS-binding.
import { handle } from "@astrojs/cloudflare/handler";
import { onderhoud } from "./lib/onderhoud.js";
import { huidigLid, stopBekijkAls } from "./lib/leden.js";
import { veiligheid } from "./lib/veiligheid.js";

export default {
  async fetch(request: Request, env: any, ctx: any) {
    const u = new URL(request.url);
    if (u.hostname === "www.roverandco.be") {
      u.hostname = "roverandco.be";
      return Response.redirect(u.href, 301);
    }
    // "Bekijk als" (vanuit /beheer/leden): alleen lezen, met een balk bovenaan om te stoppen.
    const als = /(?:^|;\s*)rc_als=1/.test(request.headers.get("cookie") || "");
    let alsLid: any = null;
    if (als) {
      if (u.pathname === "/account/bekijk-stop") return stopBekijkAls(request, env);
      alsLid = await huidigLid(request, env).catch(() => null);
      if (alsLid?.bekijkAls && !["GET", "HEAD"].includes(request.method) && !u.pathname.startsWith("/beheer")) {
        return new Response("Je bekijkt de site als een ander lid: alleen lezen. Stop eerst via /account/bekijk-stop.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    }
    const poort = alsLid?.bekijkAls ? null : await onderhoud(request, env);
    if (poort) return poort;
    let res = veiligheid(await handle(request, env, ctx));
    if (alsLid?.bekijkAls && (res.headers.get("content-type") || "").includes("text/html")) {
      const naam = String(alsLid.gebruikersnaam || alsLid.naam || alsLid.email).replace(/[<>&"]/g, "");
      res = new HTMLRewriter().on("body", { element(el) {
        el.prepend(`<div style="position:sticky;top:0;z-index:9999;background:#B3261E;color:#fff;font:600 14px Inter,system-ui,sans-serif;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap">Je bekijkt de site als <b>${naam}</b> (alleen lezen) <a href="/account/bekijk-stop" style="color:#fff;background:rgba(0,0,0,.25);padding:4px 10px;border-radius:6px;text-decoration:none">Stoppen</a></div>`, { html: true });
      } }).transform(res);
    }
    // Testadres nooit indexeren (ook als _headers niet meegaat via de ASSETS-binding).
    if (new URL(request.url).hostname.endsWith(".workers.dev")) {
      try { res.headers.set("x-robots-tag", "noindex, nofollow"); } catch {}
    }
    return res;
  },
};
