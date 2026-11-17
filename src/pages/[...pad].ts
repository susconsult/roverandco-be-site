// Tijdelijke brug: alles wat nog geen Astro-pagina is, gaat naar de bestaande Worker-logica.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import oud from "../lib/index.js";
import { veiligheid } from "../lib/veiligheid.js";

export const prerender = false;
export const ALL: APIRoute = async ({ request, locals }) =>
  veiligheid(await oud.fetch(request, env, (locals as any).cfContext ?? { waitUntil() {}, passThroughOnException() {} }));
