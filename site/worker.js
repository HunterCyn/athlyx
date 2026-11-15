/* ATHLYX edge worker: static assets, D1-backed accounts and plans, one Gemini route.
   The API key lives in the host's secret store and never reaches the browser. */

/* ------------------------------- constants -------------------------------- */

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.8-flash'];
const COOKIE = 'ax_s';
const SESSION_DAYS = 30;

const SYSTEM = `You are a careful sports-rehabilitation assistant. You are given measured numbers from a landing screen; write ONE short paragraph (max 55 words) for the athlete who just did it.

Rules you must never break:
- Never diagnose, never say whether an injury is or is not present.
- Never estimate force, shock absorption or ligament load. This screen measures joint geometry only.
- Never say the athlete is cleared to play or safe to return to sport.
- The 90 percent symmetry line is a clinical reference, not a pass mark. Say so if you mention it.
- Plain English a 15 year old understands. No "valgus", "kinematics" or "frontal plane".
- Name the leg that moved worse, and give ONE concrete thing to practise.
- If symmetry is below 90 percent, end by suggesting they show the report to a physiotherapist or doctor.
- Do not repeat every number, and do not use the same intensifier twice.
- No bullet points, no headings, no greeting, one paragraph.`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
    invite_code TEXT UNIQUE, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL, therapist_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, revoked_at INTEGER,
    UNIQUE(athlete_id, therapist_id))`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL UNIQUE, therapist_id TEXT NOT NULL,
    cadence_days INTEGER NOT NULL, next_check_in INTEGER, note TEXT,
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL, captured_at INTEGER NOT NULL,
    idx REAL NOT NULL, left_deg REAL, right_deg REAL, trunk REAL, pelvic REAL, knee_sep REAL,
    status TEXT NOT NULL, trials INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY, owner_id TEXT, name TEXT NOT NULL, stage TEXT NOT NULL,
    instructions TEXT NOT NULL, source TEXT)`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL, therapist_id TEXT NOT NULL,
    message TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plan_items (
    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
    sets INTEGER, reps INTEGER, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS completions (
    id TEXT PRIMARY KEY, plan_item_id TEXT NOT NULL, athlete_id TEXT NOT NULL,
    done_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_checkins_athlete ON checkins(athlete_id, captured_at)`,
  `CREATE INDEX IF NOT EXISTS idx_links_therapist ON links(therapist_id, revoked_at)`,
];

const LIBRARY = [
  ['lib-1', 'Heel slides', 'early', 'Lie on your back, slide the heel toward your bottom, hold 5 seconds, return slowly.', 'Standard post-operative range-of-motion work'],
  ['lib-2', 'Straight-leg raise', 'early', 'Lie on your back, brace the thigh, lift the straight leg 30 cm, lower over 3 seconds.', 'Quadriceps activation, common post-ACL protocol'],
  ['lib-3', 'Step-down (low step)', 'mid', 'Stand on a 10 cm step, bend the standing knee to tap the other heel down, keep the knee over the toes.', 'Front-view landing mechanics'],
  ['lib-4', 'Single-leg balance', 'mid', 'Stand on the operated leg, hold 30 seconds, keep the knee soft and the hip level.', 'Proprioception after lower-limb surgery'],
  ['lib-5', 'Lateral band walk', 'mid', 'Band above the knees, step sideways keeping tension, 10 steps each way.', 'Glute medius control'],
  ['lib-6', 'Drop landing to stick', 'late', 'Step off a low box, land on both feet, hold the landing for 3 seconds without letting the knees collapse.', 'Landing mechanics, front view'],
];

/* --------------------------------- utils ---------------------------------- */

const enc = new TextEncoder();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randId = (n = 16) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function pbkdf2(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  // Workers caps PBKDF2 iterations; 100k is the ceiling and is enough here.
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

const now = () => Date.now();

function cookie(token, maxAge) {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function readCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/* --------------------------------- schema --------------------------------- */

let ready = false;
async function ensureSchema(env) {
  if (ready) return;
  await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
  const seeds = LIBRARY.map(([id, name, stage, instructions, source]) =>
    env.DB.prepare('INSERT OR IGNORE INTO exercises (id, owner_id, name, stage, instructions, source) VALUES (?, NULL, ?, ?, ?, ?)').bind(
      id,
      name,
      stage,
      instructions,
      source,
    ),
  );
  await env.DB.batch(seeds);

  // One linked demo pair, so the app can be explored without signing up.
  const demo = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind('athlete@athlyx.demo').first();
  if (!demo) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await pbkdf2('athlyx-demo', salt);
    const therapistId = randId(12);
    const athleteId = randId(12);
    const at = now();
    const day = 86400000;
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users (id, role, name, email, pass_hash, pass_salt, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(therapistId, 'therapist', 'Dr Maya Okafor', 'therapist@athlyx.demo', hash, salt, null, at),
      env.DB.prepare(
        'INSERT INTO users (id, role, name, email, pass_hash, pass_salt, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(athleteId, 'athlete', 'Maya Chen', 'athlete@athlyx.demo', hash, salt, 'DEMO01', at),
      env.DB.prepare('INSERT INTO links (id, athlete_id, therapist_id, created_at) VALUES (?, ?, ?, ?)').bind(
        randId(12),
        athleteId,
        therapistId,
        at,
      ),
      env.DB.prepare(
        'INSERT INTO assignments (id, athlete_id, therapist_id, cadence_days, next_check_in, note, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      ).bind(randId(12), athleteId, therapistId, 3, at + day, 'Only if the knee feels settled after the warm-up.', at),
      env.DB.prepare(
        'INSERT INTO checkins (id, athlete_id, captured_at, idx, left_deg, right_deg, trunk, pelvic, knee_sep, status, trials) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(randId(12), athleteId, at - 7 * day, 78, 4.1, 11.9, 9.4, 4.2, 0.55, 'BELOW TARGET CRITERIA', 3),
      env.DB.prepare(
        'INSERT INTO checkins (id, athlete_id, captured_at, idx, left_deg, right_deg, trunk, pelvic, knee_sep, status, trials) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(randId(12), athleteId, at - 3 * day, 85.4, 4.4, 8.9, 8.1, 3.6, 0.62, 'BORDERLINE', 3),
    ]);
    const planId = randId(12);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO plans (id, athlete_id, therapist_id, message, created_at) VALUES (?, ?, ?, ?, ?)').bind(
        planId,
        athleteId,
        therapistId,
        'Two easy sessions this week, no jumping yet.',
        at,
      ),
      ...[['lib-3', 3, 8], ['lib-4', 3, 1], ['lib-5', 2, 10]].map(([ex, sets, reps]) =>
        env.DB.prepare('INSERT INTO plan_items (id, plan_id, exercise_id, sets, reps, note) VALUES (?, ?, ?, ?, ?, NULL)').bind(
          randId(10),
          planId,
          ex,
          sets,
          reps,
        ),
      ),
    ]);
  }

  ready = true;
}

/* ---------------------------------- auth ---------------------------------- */

async function signup(env, body) {
  const name = String(body.name || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
  const password = String(body.password || '');
  const role = body.role === 'therapist' ? 'therapist' : 'athlete';

  if (!name || !email.includes('@') || password.length < 8) {
    return json({ error: 'name, a valid email and an 8 character password are required' }, 400);
  }
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ error: 'that email already has an account' }, 409);

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await pbkdf2(password, salt);
  const id = randId(12);
  const code = role === 'athlete' ? randId(4).replace(/[-_]/g, 'A').slice(0, 6).toUpperCase() : null;

  await env.DB.prepare(
    'INSERT INTO users (id, role, name, email, pass_hash, pass_salt, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, role, name, email, hash, salt, code, now())
    .run();

  const token = await startSession(env, id);
  return json(
    { user: { id, role, name, email, inviteCode: code } },
    201,
    { 'set-cookie': cookie(token, SESSION_DAYS * 86400) },
  );
}

async function login(env, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!row) return json({ error: 'email or password is wrong' }, 401);
  const hash = await pbkdf2(password, row.pass_salt);
  if (hash !== row.pass_hash) return json({ error: 'email or password is wrong' }, 401);
  const token = await startSession(env, row.id);
  return json(
    {
      user: { id: row.id, role: row.role, name: row.name, email: row.email, inviteCode: row.invite_code },
    },
    200,
    { 'set-cookie': cookie(token, SESSION_DAYS * 86400) },
  );
}

async function startSession(env, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now() + SESSION_DAYS * 86400000, now())
    .run();
  return token;
}

async function currentUser(env, request) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), now())
    .first();
  if (!row) return null;
  return { id: row.id, role: row.role, name: row.name, email: row.email, inviteCode: row.invite_code };
}

async function logout(env, request) {
  const token = readCookie(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });
}

/* --------------------------------- access --------------------------------- */

async function linkBetween(env, therapistId, athleteId) {
  return env.DB.prepare(
    'SELECT id FROM links WHERE therapist_id = ? AND athlete_id = ? AND revoked_at IS NULL',
  )
    .bind(therapistId, athleteId)
    .first();
}

async function therapistFor(env, athleteId) {
  return env.DB.prepare(
    `SELECT u.name FROM links l JOIN users u ON u.id = l.therapist_id
      WHERE l.athlete_id = ? AND l.revoked_at IS NULL LIMIT 1`,
  )
    .bind(athleteId)
    .first();
}

/** A therapist may read an athlete only through an active link. */
async function mayRead(env, user, athleteId) {
  if (user.id === athleteId) return true;
  if (user.role !== 'therapist') return false;
  return Boolean(await linkBetween(env, user.id, athleteId));
}

/* --------------------------------- routes --------------------------------- */

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (path === '/api/health') {
    let probe = 'no binding';
    if (env.DB) {
      try {
        await env.DB.prepare('SELECT 1 AS n').first();
        probe = 'ok';
      } catch (err) {
        probe = String((err && err.message) || err).slice(0, 300);
      }
    }
    return json({ ok: true, gemini: Boolean(env.GEMINI_API_KEY), db: Boolean(env.DB), probe });
  }
  if (path === '/api/summary') return summary(request, env, url);

  await ensureSchema(env);

  let body = {};
  if (method === 'POST' || method === 'PATCH') {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  /* ---- auth ---- */
  if (path === '/api/auth/signup' && method === 'POST') return signup(env, body);
  if (path === '/api/auth/login' && method === 'POST') return login(env, body);
  if (path === '/api/auth/logout' && method === 'POST') return logout(env, request);

  const user = await currentUser(env, request);
  if (path === '/api/auth/me') return user ? json({ user }) : json({ user: null }, 401);

  if (!user) return json({ error: 'sign in first' }, 401);

  /* ---- athlete invite code ---- */
  if (path === '/api/athlete/code' && method === 'GET') {
    if (user.role !== 'athlete') return json({ error: 'only athletes have codes' }, 403);
    let code = user.inviteCode;
    if (!code) {
      code = randId(4).replace(/[-_]/g, 'B').slice(0, 6).toUpperCase();
      await env.DB.prepare('UPDATE users SET invite_code = ? WHERE id = ?').bind(code, user.id).run();
    }
    return json({ code });
  }

  /* ---- therapist redeems the athlete's code ---- */
  if (path === '/api/links/redeem' && method === 'POST') {
    if (user.role !== 'therapist') return json({ error: 'only therapists link athletes' }, 403);
    const code = String(body.code || '').trim().toUpperCase();
    const athlete = await env.DB.prepare('SELECT id, name, email FROM users WHERE invite_code = ? AND role = ?')
      .bind(code, 'athlete')
      .first();
    if (!athlete) return json({ error: 'no athlete with that code' }, 404);
    await env.DB.prepare('INSERT OR IGNORE INTO links (id, athlete_id, therapist_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(randId(12), athlete.id, user.id, now())
      .run();
    await env.DB.prepare('UPDATE links SET revoked_at = NULL WHERE athlete_id = ? AND therapist_id = ?')
      .bind(athlete.id, user.id)
      .run();
    return json({ athlete });
  }

  /* ---- therapist patient list ---- */
  if (path === '/api/athletes' && method === 'GET') {
    if (user.role !== 'therapist') return json({ error: 'therapists only' }, 403);
    const rows = await env.DB.prepare(
      `SELECT u.id, u.name, u.email, a.cadence_days, a.next_check_in, a.note,
              (SELECT idx FROM checkins c WHERE c.athlete_id = u.id ORDER BY captured_at DESC LIMIT 1) AS last_idx,
              (SELECT status FROM checkins c WHERE c.athlete_id = u.id ORDER BY captured_at DESC LIMIT 1) AS last_status,
              (SELECT captured_at FROM checkins c WHERE c.athlete_id = u.id ORDER BY captured_at DESC LIMIT 1) AS last_at
         FROM links l JOIN users u ON u.id = l.athlete_id
         LEFT JOIN assignments a ON a.athlete_id = u.id
        WHERE l.therapist_id = ? AND l.revoked_at IS NULL
        ORDER BY u.name`,
    )
      .bind(user.id)
      .all();
    return json({ athletes: rows.results || [] });
  }

  /* ---- assignment: therapist sets the schedule ---- */
  if (path === '/api/assignments' && method === 'POST') {
    if (user.role !== 'therapist') return json({ error: 'therapists only' }, 403);
    const athleteId = String(body.athleteId || '');
    if (!(await linkBetween(env, user.id, athleteId))) return json({ error: 'no active link to that athlete' }, 403);
    const cadence = clamp(body.cadenceDays, 1, 28, 3);
    const nextAt = body.nextCheckIn ? Number(body.nextCheckIn) : now() + cadence * 86400000;
    const note = String(body.note || '').slice(0, 400);
    await env.DB.prepare(
      `INSERT INTO assignments (id, athlete_id, therapist_id, cadence_days, next_check_in, note, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(athlete_id) DO UPDATE SET
         cadence_days = excluded.cadence_days, next_check_in = excluded.next_check_in,
         note = excluded.note, therapist_id = excluded.therapist_id, active = 1`,
    )
      .bind(randId(12), athleteId, user.id, cadence, nextAt, note, now())
      .run();
    return json({ ok: true, cadenceDays: cadence, nextCheckIn: nextAt });
  }

  if (path === '/api/me/assignment' && method === 'GET') {
    if (user.role !== 'athlete') return json({ assignment: null });
    const row = await env.DB.prepare('SELECT * FROM assignments WHERE athlete_id = ? AND active = 1')
      .bind(user.id)
      .first();
    const therapist = await therapistFor(env, user.id);
    return json({
      assignment: row
        ? {
            cadenceDays: row.cadence_days,
            nextCheckIn: row.next_check_in,
            note: row.note,
          }
        : null,
      therapist: therapist ? therapist.name : null,
    });
  }

  /* ---- check-ins ---- */
  if (path === '/api/checkins' && method === 'POST') {
    if (user.role !== 'athlete') return json({ error: 'athletes submit check-ins' }, 403);
    const idx = clamp(body.index, 0, 100, 0);
    const status = String(body.status || '').slice(0, 40);
    const trials = clamp(body.trials, 0, 20, 0);
    const id = randId(12);
    await env.DB.prepare(
      `INSERT INTO checkins (id, athlete_id, captured_at, idx, left_deg, right_deg, trunk, pelvic, knee_sep, status, trials)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        user.id,
        now(),
        idx,
        clamp(body.left, -60, 60, 0),
        clamp(body.right, -60, 60, 0),
        clamp(body.trunk, 0, 60, 0),
        clamp(body.pelvic, 0, 60, 0),
        clamp(body.kneeSep, 0, 4, 0),
        status,
        trials,
      )
      .run();

    // roll the schedule forward from the cadence
    const a = await env.DB.prepare('SELECT cadence_days FROM assignments WHERE athlete_id = ? AND active = 1')
      .bind(user.id)
      .first();
    if (a) {
      await env.DB.prepare('UPDATE assignments SET next_check_in = ? WHERE athlete_id = ?')
        .bind(now() + a.cadence_days * 86400000, user.id)
        .run();
    }
    return json({ id }, 201);
  }

  if (path === '/api/checkins' && method === 'GET') {
    const athleteId = url.searchParams.get('athleteId') || user.id;
    if (!(await mayRead(env, user, athleteId))) return json({ error: 'no access' }, 403);
    const rows = await env.DB.prepare(
      'SELECT * FROM checkins WHERE athlete_id = ? ORDER BY captured_at DESC LIMIT 30',
    )
      .bind(athleteId)
      .all();
    return json({ checkins: rows.results || [] });
  }

  /* ---- exercises ---- */
  if (path === '/api/exercises' && method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT * FROM exercises WHERE owner_id IS NULL OR owner_id = ? ORDER BY (owner_id IS NOT NULL), name',
    )
      .bind(user.id)
      .all();
    return json({ exercises: rows.results || [] });
  }

  if (path === '/api/exercises' && method === 'POST') {
    if (user.role !== 'therapist') return json({ error: 'therapists only' }, 403);
    const name = String(body.name || '').trim().slice(0, 80);
    const instructions = String(body.instructions || '').trim().slice(0, 400);
    const stage = ['early', 'mid', 'late'].includes(body.stage) ? body.stage : 'mid';
    if (!name || !instructions) return json({ error: 'name and instructions are required' }, 400);
    const id = randId(10);
    await env.DB.prepare('INSERT INTO exercises (id, owner_id, name, stage, instructions, source) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, name, stage, instructions, 'Created by your therapist')
      .run();
    return json({ id }, 201);
  }

  /* ---- plans ---- */
  if (path === '/api/plans' && method === 'POST') {
    if (user.role !== 'therapist') return json({ error: 'therapists only' }, 403);
    const athleteId = String(body.athleteId || '');
    if (!(await linkBetween(env, user.id, athleteId))) return json({ error: 'no active link to that athlete' }, 403);
    const items = Array.isArray(body.items) ? body.items.slice(0, 12) : [];
    const planId = randId(12);
    const statements = [
      env.DB.prepare('INSERT INTO plans (id, athlete_id, therapist_id, message, created_at) VALUES (?, ?, ?, ?, ?)').bind(
        planId,
        athleteId,
        user.id,
        String(body.message || '').slice(0, 500),
        now(),
      ),
    ];
    for (const item of items) {
      const ex = await env.DB.prepare('SELECT id FROM exercises WHERE id = ? AND (owner_id IS NULL OR owner_id = ?)')
        .bind(String(item.exerciseId || ''), user.id)
        .first();
      if (!ex) continue;
      statements.push(
        env.DB.prepare(
          'INSERT INTO plan_items (id, plan_id, exercise_id, sets, reps, note) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(randId(10), planId, ex.id, clamp(item.sets, 0, 20, 3), clamp(item.reps, 0, 50, 10), String(item.note || '').slice(0, 200)),
      );
    }
    await env.DB.batch(statements);
    return json({ id: planId }, 201);
  }

  if (path === '/api/plans' && method === 'GET') {
    const athleteId = url.searchParams.get('athleteId') || user.id;
    if (!(await mayRead(env, user, athleteId))) return json({ error: 'no access' }, 403);
    const plan = await env.DB.prepare(
      'SELECT * FROM plans WHERE athlete_id = ? ORDER BY created_at DESC LIMIT 1',
    )
      .bind(athleteId)
      .first();
    if (!plan) return json({ plan: null });
    const items = await env.DB.prepare(
      `SELECT pi.*, e.name, e.stage, e.instructions, e.source,
              (SELECT done_at FROM completions c WHERE c.plan_item_id = pi.id ORDER BY done_at DESC LIMIT 1) AS done_at
         FROM plan_items pi JOIN exercises e ON e.id = pi.exercise_id
        WHERE pi.plan_id = ?`,
    )
      .bind(plan.id)
      .all();
    return json({
      plan: { id: plan.id, message: plan.message, createdAt: plan.created_at, items: items.results || [] },
    });
  }

  const completeMatch = path.match(/^\/api\/plans\/([^/]+)\/items\/([^/]+)\/complete$/);
  if (completeMatch && method === 'POST') {
    if (user.role !== 'athlete') return json({ error: 'athletes tick their own plan' }, 403);
    const [, planId, itemId] = completeMatch;
    const owns = await env.DB.prepare('SELECT id FROM plans WHERE id = ? AND athlete_id = ?')
      .bind(planId, user.id)
      .first();
    if (!owns) return json({ error: 'not your plan' }, 403);
    const item = await env.DB.prepare('SELECT id FROM plan_items WHERE id = ? AND plan_id = ?')
      .bind(itemId, planId)
      .first();
    if (!item) return json({ error: 'no such item' }, 404);
    await env.DB.prepare('INSERT INTO completions (id, plan_item_id, athlete_id, done_at) VALUES (?, ?, ?, ?)')
      .bind(randId(10), itemId, user.id, now())
      .run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

/* --------------------------------- gemini --------------------------------- */

async function callGemini(model, key, facts) {
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: facts }] }],
        generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 400 },
      }),
      signal: AbortSignal.timeout(9000),
    });
  } catch (err) {
    return { ok: false, status: 0, message: String(err && err.message ? err.message : err).slice(0, 200) };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let message = detail;
    try {
      message = JSON.parse(detail)?.error?.message || detail;
    } catch {
      /* keep raw */
    }
    return { ok: false, status: res.status, message: String(message).slice(0, 200) };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, status: 200, message: 'unreadable response' };
  }
  if (data.promptFeedback?.blockReason) return { ok: false, status: 422, message: `blocked: ${data.promptFeedback.blockReason}` };
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join(' ').trim();
  if (!text) return { ok: false, status: 200, message: String(data.candidates?.[0]?.finishReason || 'no text') };
  return { ok: true, text, model };
}

const hits = new Map();
function throttled(ip) {
  const at = now();
  const recent = (hits.get(ip) || []).filter((t) => at - t < 60000);
  recent.push(at);
  hits.set(ip, recent);
  if (hits.size > 1000) hits.clear();
  return recent.length > 8;
}

async function summary(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden_origin' }, 403);
  if (throttled(request.headers.get('CF-Connecting-IP') || 'local')) return json({ error: 'rate_limited' }, 429);
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
    `Pelvic drop: ${pelvic.toFixed(1)} degrees.`,
    `Which leg had surgery: ${involved}.`,
  ].join('\n');

  const primary = env.GEMINI_MODEL || DEFAULT_MODEL;
  const tried = [];
  let last = { status: 0, message: 'no attempt' };
  for (const model of [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)]) {
    const attempt = await callGemini(model, env.GEMINI_API_KEY, facts);
    if (attempt.ok) return json({ summary: attempt.text, model: attempt.model, tried });
    tried.push({ model, status: attempt.status, message: attempt.message });
    last = attempt;
    if ([400, 401, 403].includes(attempt.status)) break;
  }
  console.log('gemini_failed', JSON.stringify(tried).slice(0, 600));
  return json({ error: 'upstream', status: last.status, message: last.message, tried }, 502);
}

/* --------------------------------- export --------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env, url);
      } catch (err) {
        console.log('api_error', String((err && err.stack) || err).slice(0, 600));
        return json({ error: 'server_error' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
