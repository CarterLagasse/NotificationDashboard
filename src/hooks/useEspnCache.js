const CACHE_TTL_MS = 60000;
const cache = new Map(); // url -> { data, ts }
const inflight = new Map(); // url -> promise

export async function cachedFetchJson(url, signal) {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.ts < CACHE_TTL_MS) return hit.data;
  if (inflight.has(url)) {
    try { return await inflight.get(url); } catch { /* fall through to refetch */ }
  }
  const p = (async () => {
    const res = await fetch(url, { signal });
    const data = await res.json();
    cache.set(url, { data, ts: Date.now() });
    return data;
  })();
  inflight.set(url, p);
  try { return await p; } finally { inflight.delete(url); }
}

export function clearEspnCache() { cache.clear(); inflight.clear(); }
