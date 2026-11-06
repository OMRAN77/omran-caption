// Rotates across multiple free Groq API keys so the app keeps working even
// after one free account hits its daily rate limit (429). Add more keys as
// GROQ_API_KEY_2, GROQ_API_KEY_3, ... in Vercel env vars — no code change needed.
function getGroqKeys() {
  const keys = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  for (let i = 2; i <= 9; i++) {
    const k = process.env['GROQ_API_KEY_' + i];
    if (k) keys.push(k);
  }
  return keys;
}

// Remembered between requests (same warm serverless instance), so a caption
// does not pay extra round trips to keys that just failed:
//  - a key Groq rejected (401/403: wrong or revoked) is skipped for 30 min;
//  - a key that hit its limit (429) for a model is skipped for that model
//    until Groq's retry-after.
const BAD_KEY_MS = 30 * 60 * 1000;
const badKeyUntil = new Map();
const busyUntil = new Map(); // `${key}|${tag}` -> time
const retryAfterMs = (res) => {
  const s = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
  return (Number.isFinite(s) && s > 0 ? Math.min(s, 3600) : 10) * 1000;
};

// Tries each key in order for a given fetch call. `buildRequest(key)` must
// return { url, options }. Moves to the next key only on 429 (rate limit) or
// 401/403 (bad/exhausted key); any other error/response is returned as-is.
// `tag` (the model) scopes the 429 memory: limits are per model.
async function fetchWithGroqFallback(keys, buildRequest, tag = '') {
  const now = Date.now();
  const all = keys.map((_, i) => i);
  const good = all.filter((i) => !(badKeyUntil.get(keys[i]) > now));
  const pool = good.length ? good : all; // every key rejected: config may have changed, try them
  const ready = pool.filter((i) => !(busyUntil.get(keys[i] + '|' + tag) > now));
  // All keys still rate-limited for this model: one try on the key that frees
  // up first (the caller then moves on to the next model), not a round trip each.
  const order = ready.length ? ready
    : [pool.reduce((a, b) => ((busyUntil.get(keys[a] + '|' + tag) || 0) <= (busyUntil.get(keys[b] + '|' + tag) || 0) ? a : b))];
  let lastRes = null;
  let lastErr = null;
  for (let j = 0; j < order.length; j++) {
    const i = order[j];
    const last = j === order.length - 1;
    try {
      const { url, options } = buildRequest(keys[i]);
      const res = await fetch(url, options);
      if (res.ok) {
        badKeyUntil.delete(keys[i]);
        return { res, keyIndex: i };
      }
      if (res.status === 401 || res.status === 403) badKeyUntil.set(keys[i], Date.now() + BAD_KEY_MS);
      if (res.status === 429) busyUntil.set(keys[i] + '|' + tag, Date.now() + retryAfterMs(res));
      if ((res.status === 429 || res.status === 401 || res.status === 403) && !last) {
        lastRes = res;
        try { await res.body.cancel(); } catch (e) {}
        continue; // try next key
      }
      return { res, keyIndex: i }; // final answer (error or last key)
    } catch (e) {
      lastErr = e;
      if (last) throw e;
    }
  }
  if (lastRes) return { res: lastRes, keyIndex: order[order.length - 1] };
  throw lastErr || new Error('All Groq keys failed');
}

module.exports = { getGroqKeys, fetchWithGroqFallback };
