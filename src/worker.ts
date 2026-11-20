// Eigen ingang van de Worker: eerst de onderhoudspoort (src/lib/onderhoud.js), daarna Astro.
// Daarvoor staat assets.run_worker_first op true in wrangler.jsonc: elk verzoek komt hier langs,
// ook statische pagina's; Astro serveert die daarna zelf uit de ASSETS-binding.
import { handle } from "@astrojs/cloudflare/handler";
import { onderhoud } from "./lib/onderhoud.js";
import { veiligheid } from "./lib/veiligheid.js";

export default {
  async fetch(request: Request, env: any, ctx: any) {
    const u = new URL(request.url);
    if (u.hostname === "www.roverandco.be") {
      u.hostname = "roverandco.be";
      return Response.redirect(u.href, 301);
    }
    const poort = await onderhoud(request, env);
    if (poort) return poort;
    const res = veiligheid(await handle(request, env, ctx));
    // Testadres nooit indexeren (ook als _headers niet meegaat via de ASSETS-binding).
    if (new URL(request.url).hostname.endsWith(".workers.dev")) {
      try { res.headers.set("x-robots-tag", "noindex, nofollow"); } catch {}
    }
    return res;
  },
};
