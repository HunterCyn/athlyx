/* ATHLYX edge worker: static assets + one server-side Gemini route.
   The API key lives in the host's secret store and never reaches the browser. */

const DEFAULT_MODEL = 'gemini-3.8-flash';

const SYSTEM = `You are a careful sports-rehabilitation assistant. You are given measured numbers from a drop-landing screen and you write ONE short paragraph (3 sentences, 60 words max) for the athlete who just did it.

Rules you must never break:
- Never diagnose, never say an injury is or is not present.
- Never estimate force, shock absorption or ligament load. This screen measures joint geometry only.
- Never say the athlete is cleared to play or safe to return to sport.
- The 90 percent symmetry line is a clinical reference, not a pass mark. Say so if you mention it.
- Plain English a 15 year old understands. No jargon like valgus, kinematics or frontal plane.
- If symmetry is below 90 percent, end by suggesting they show the report to a physiotherapist or doctor.
- Do not repeat every number. Pick the one that matters and say what it means in practice.
- No bullet points, no headings, no greeting, no sign-off. One paragraph.`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

// crude per-isolate throttle so a public endpoint cannot drain the owner's key
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 1000) hits.clear();
  return recent.length > 8;
}

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

async function summary(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden_origin' }, 403);

  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (throttled(ip)) return json({ error: 'rate_limited' }, 429);

  if (!env.GEMINI_API_KEY) return json({ error: 'not_configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const index = clamp(body.index, 0, 100, 0);
  const left = clamp(body.left, 0, 60, 0);
  const right = clamp(body.right, 0, 60, 0);
  const kneeSep = clamp(body.kneeSep, 0, 4, 0);
  const trunk = clamp(body.trunk, 0, 60, 0);
  const pelvic = clamp(body.pelvic, 0, 60, 0);
  const lowImpact = body.lowImpact === true;
  const involved = ['left', 'right', 'unsure'].includes(body.involved) ? body.involved : 'unsure';

  const facts = [
    `Task: ${lowImpact ? 'low-impact step-down (no jumping)' : 'bilateral drop landing from a box'}.`,
    `Symmetry index: ${index.toFixed(0)} out of 100 (100 means both legs moved identically).`,
    `Left knee inward angle at landing: ${left.toFixed(1)} degrees.`,
    `Right knee inward angle at landing: ${right.toFixed(1)} degrees.`,
    `Knee separation ratio: ${kneeSep.toFixed(2)} (below 0.6 means the knees collapse toward each other).`,
    `Trunk lean from vertical at peak: ${trunk.toFixed(1)} degrees.`,
    `Pelvic drop: ${pelvic.toFixed(1)} degrees (how much one hip sits lower than the other).`,
    `Which leg had surgery: ${involved}.`,
    involved === 'unsure'
      ? 'The athlete did not say which leg was operated on, so do not assume.'
      : 'The athlete named the surgical leg, so you may refer to it.',
  ].join('\n');

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: facts }] }],
          generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 400 },
        }),
      }
    );
  } catch (err) {
    return json({ error: 'upstream_unreachable' }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.log('gemini_failed', res.status, detail.slice(0, 300));
    return json({ error: 'upstream', status: res.status }, 502);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return json({ error: 'upstream_shape' }, 502);
  }

  if (data.promptFeedback?.blockReason) return json({ error: 'blocked' }, 422);

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p?.text || '')
    .join(' ')
    .trim();

  if (!text) return json({ error: 'empty' }, 502);

  return json({ summary: text, model });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/summary') return summary(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
