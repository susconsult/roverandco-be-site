// Tijdelijke brug: alles wat nog geen Astro-pagina is, gaat naar de bestaande Worker-logica.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import oud from "../lib/index.js";

export const prerender = false;
export const ALL: APIRoute = ({ request, locals }) => oud.fetch(request, env, (locals as any).cfContext ?? { waitUntil() {}, passThroughOnException() {} });
