// CSRF guard for state-changing API routes. A browser always sends the Host
// header of the server it reached and the Origin of the page that initiated
// the request; a cross-site page cannot fake either. Comparing them (instead
// of reconstructing the URL from request.url, which framework internals may
// rewrite) keeps the check stable across localhost / 127.0.0.1 / [::1] mixes
// and proxy setups.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function normalize(host: string): string {
  const colon = host.lastIndexOf(":");
  const port = colon > -1 ? host.slice(colon + 1) : "";
  let hostname = (colon > -1 ? host.slice(0, colon) : host).toLowerCase();
  if (LOOPBACK.has(hostname)) hostname = "loopback";
  return `${hostname}:${port}`;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser client, no page to forge
  const host = request.headers.get("host");
  if (!host) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return normalize(originHost) === normalize(host);
}
