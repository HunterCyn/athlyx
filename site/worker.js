/* ATHLYX edge worker: static assets + one server-side Gemini route.
   The API key lives in the host's secret store and never reaches the browser. */

// The lite model answers in a couple of seconds from an edge runtime; the
// flagship model was timing out at 12 s. Override with GEMINI_MODEL if wanted.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.8-flash'];

const SYSTEM = `You are a careful sports-rehabilitation assistant. You are given measured numbers from a drop-landing screen; write ONE short paragraph (max 55 words) for the athlete who just did it.

Rules you must never break:
- Never diagnose, never say whether an injury is or is not present.
- Never estimate force, shock absorption or ligament load. This screen measures joint geometry only.
- Never say the athlete is cleared to play or safe to return to sport.
- The 90 percent symmetry line is a clinical reference, not a pass mark. Say so if you mention it.
- Plain English a 15 year old understands. No "valgus", "kinematics" or "frontal plane".
- Name the leg that moved worse, and give ONE concrete thing to practise (for example keeping the knee lined up over the toes, or landing more slowly and softly).
- If symmetry is below 90 percent, end by suggesting they show the report to a physiotherapist or doctor.
- Do not repeat every number, and do not use the same intensifier ("quite", "very") twice.
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

async function callGemini(model, key, facts) {
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: facts }] }],
        generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 400 },
      }),
      signal: AbortSignal.timeout(9_000),
    });
  } catch (err) {
    return { ok: false, status: 0, message: String(err && err.message ? err.message : err).slice(0, 200) };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let message = detail;
    try {
      const parsed = JSON.parse(detail);
      message = parsed?.error?.message || detail;
    } catch {
      /* keep the raw text */
    }
    return { ok: false, status: res.status, message: String(message).slice(0, 200) };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, status: 200, message: 'unreadable response' };
  }

  if (data.promptFeedback?.blockReason) {
    return { ok: false, status: 422, message: `blocked: ${data.promptFeedback.blockReason}` };
  }

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p?.text || '')
    .join(' ')
    .trim();

  if (!text) {
    const why = data.candidates?.[0]?.finishReason || 'no text in response';
    return { ok: false, status: 200, message: String(why).slice(0, 200) };
  }

  return { ok: true, text, model };
}

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

  const primary = env.GEMINI_MODEL || DEFAULT_MODEL;
  const queue = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  const tried = [];
  let last = { status: 0, message: 'no attempt' };

  for (const model of queue) {
    const attempt = await callGemini(model, env.GEMINI_API_KEY, facts);
    if (attempt.ok) {
      return json({ summary: attempt.text, model: attempt.model, tried });
    }
    tried.push({ model, status: attempt.status, message: attempt.message });
    last = attempt;
    // A rejected key or a malformed request will fail the same way on every model.
    if (attempt.status === 400 || attempt.status === 401 || attempt.status === 403) break;
  }

  console.log('gemini_failed', JSON.stringify(tried).slice(0, 600));
  return json({ error: 'upstream', status: last.status, message: last.message, tried }, 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/summary') return summary(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
