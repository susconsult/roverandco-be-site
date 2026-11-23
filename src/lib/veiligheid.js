// Beveiligingsheaders op elke dynamische pagina (statische bestanden krijgen ze via public/_headers).
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");
export const HEADERS = {
  "content-security-policy": CSP,
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(self), geolocation=(self), payment=(), usb=(), microphone=(self)",
  "cross-origin-opener-policy": "same-origin",
};
export function veiligheid(res) {
  if (!res || res.status === 101) return res;
  try {
    const r = new Response(res.body, res);
    for (const [k, v] of Object.entries(HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
    return r;
  } catch { return res; }
}
