import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, fmtWhen, type Athlete, type Checkin, type Exercise, type Plan, type Role, type User } from './api';

/* ---------------------------------- auth ---------------------------------- */

const DEMO = { email: 'athlete@athlyx.demo', password: 'athlyx-demo' };
const DEMO_T = { email: 'therapist@athlyx.demo', password: 'athlyx-demo' };

function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(
    new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'signin',
  );
  const [role, setRole] = useState<Role>('athlete');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const user = mode === 'signup' ? await api.signup({ name, email, password, role }) : await api.login({ email, password });
      onAuth(user);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const demo = async (which: { email: string; password: string }) => {
    setBusy(true);
    setErr('');
    try {
      onAuth(await api.login(which));
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'demo sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ax-auth">
      <div className="ax-auth-card">
        <a className="ax-back" href="/">
          ← ATHLYX
        </a>
        <h1>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
        <p className="ax-sub">
          {mode === 'signup'
            ? 'Athletes run check-ins. Physiotherapists set the schedule and the plan.'
            : 'Athlete and physiotherapist accounts sign in here.'}
        </p>

        <div className="ax-tabs">
          <button className={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')} type="button">
            Sign in
          </button>
          <button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')} type="button">
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="ax-form">
          {mode === 'signup' ? (
            <>
              <div className="ax-roles">
                <button
                  type="button"
                  className={role === 'athlete' ? 'on' : ''}
                  onClick={() => setRole('athlete')}
                >
                  I'm an athlete
                </button>
                <button
                  type="button"
                  className={role === 'therapist' ? 'on' : ''}
                  onClick={() => setRole('therapist')}
                >
                  I'm a physiotherapist
                </button>
              </div>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </label>
            </>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
            />
          </label>

          {err ? <p className="ax-err">{err}</p> : null}

          <button className="ax-btn ax-btn--mint" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="ax-demo">
          <p>Demo accounts</p>
          <div className="ax-demo-row">
            <button type="button" onClick={() => demo(DEMO)} disabled={busy}>
              Athlete demo
            </button>
            <button type="button" onClick={() => demo(DEMO_T)} disabled={busy}>
              Therapist demo
            </button>
          </div>
          <code>athlete@athlyx.demo · therapist@athlyx.demo · athlyx-demo</code>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- athlete --------------------------------- */

function AthleteHome({ user, onOut }: { user: User; onOut: () => void }) {
  const [assignment, setAssignment] = useState<{ cadenceDays: number; nextCheckIn: number; note: string | null } | null>(null);
  const [therapist, setTherapist] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, p, c] = await Promise.all([api.assignment(), api.plan(), api.checkins()]);
      setAssignment(a.assignment);
      setTherapist(a.therapist);
      setPlan(p);
      setCheckins(c);
      if (!a.therapist) setCode(await api.code().catch(() => ''));
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'could not load');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tick = async (itemId: string) => {
    if (!plan) return;
    await api.complete(plan.id, itemId);
    setPlan(await api.plan());
  };

  return (
    <Shell user={user} onOut={onOut}>
      {err ? <p className="ax-err">{err}</p> : null}

      <div className="ax-grid">
        <section className="ax-card">
          <div className="ax-card-head">
            <h2>Next check-in</h2>
            <span className={`ax-pill ${assignment ? 'on' : ''}`}>{assignment ? fmtWhen(assignment.nextCheckIn) : 'not scheduled'}</span>
          </div>
          {assignment ? (
            <>
              <p className="ax-big">{fmtDate(assignment.nextCheckIn)}</p>
              <p className="ax-muted">Every {assignment.cadenceDays} days{therapist ? ` · set by ${therapist}` : ''}</p>
              {assignment.note ? <p className="ax-note">“{assignment.note}”</p> : null}
              <a className="ax-btn ax-btn--mint" href="/rtp">
                Start the check-in
              </a>
            </>
          ) : (
            <p className="ax-muted">
              Your physiotherapist hasn't scheduled a check-in yet. You can still run the screen on your own — the numbers
              stay on this device unless you save them.
            </p>
          )}
          <a className="ax-link" href="/rtp">
            Run the screen anyway →
          </a>
        </section>

        <section className="ax-card">
          <div className="ax-card-head">
            <h2>Your plan</h2>
            {plan ? <span className="ax-pill">{plan.items.filter((i) => i.done_at).length}/{plan.items.length} done</span> : null}
          </div>
          {plan ? (
            <>
              {plan.message ? <p className="ax-note">“{plan.message}”</p> : null}
              <ul className="ax-list">
                {plan.items.map((item) => (
                  <li key={item.id} className={item.done_at ? 'done' : ''}>
                    <div>
                      <b>{item.name}</b>
                      <em>
                        {item.sets} × {item.reps} · {item.stage}
                      </em>
                      <p>{item.instructions}</p>
                      {item.source ? <small>{item.source}</small> : null}
                    </div>
                    {item.done_at ? (
                      <span className="ax-tick">✓ {fmtDate(item.done_at)}</span>
                    ) : (
                      <button className="ax-btn ax-btn--ghost sm" onClick={() => tick(item.id)}>
                        Mark done
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="ax-muted">No plan yet. Your physiotherapist can send one after linking your account.</p>
          )}
        </section>

        <section className="ax-card">
          <div className="ax-card-head">
            <h2>Your history</h2>
            <span className="ax-pill">{checkins.length}</span>
          </div>
          {checkins.length ? (
            <table className="ax-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Symmetry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate(c.captured_at)}</td>
                    <td>{Math.round(c.idx)}%</td>
                    <td className="ax-muted">{c.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ax-muted">Nothing saved yet. Finish a check-in and press “Save to my record”.</p>
          )}
        </section>

        {!therapist ? (
          <section className="ax-card">
            <h2>Connect your physiotherapist</h2>
            <p className="ax-muted">Give them this code. They enter it once and can then see your check-ins and send plans.</p>
            <p className="ax-code">{code || '······'}</p>
            <p className="ax-muted">You can revoke access at any time by asking them to unlink, or by creating a new account.</p>
          </section>
        ) : (
          <section className="ax-card">
            <h2>Linked</h2>
            <p className="ax-muted">
              {therapist} can see your check-ins and plans. Video never leaves your device — only the numbers are saved.
            </p>
          </section>
        )}
      </div>
    </Shell>
  );
}

/* ------------------------------- therapist -------------------------------- */

function TherapistHome({ user, onOut }: { user: User; onOut: () => void }) {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selected, setSelected] = useState('');
  const [code, setCode] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [plan, setPlan] = useState<Plan>(null);
  const [cadence, setCadence] = useState(3);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState<Record<string, { sets: number; reps: number }>>({});
  const [newName, setNewName] = useState('');
  const [newHow, setNewHow] = useState('');
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');

  const loadAthletes = useCallback(async () => {
    try {
      const list = await api.athletes();
      setAthletes(list);
      if (list.length && !list.some((a) => a.id === selected)) setSelected(list[0].id);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'could not load patients');
    }
  }, [selected]);

  useEffect(() => {
    void loadAthletes();
    void api.exercises().then(setExercises).catch(() => undefined);
  }, [loadAthletes]);

  const loadPatient = useCallback(async (id: string) => {
    if (!id) return;
    const [c, p] = await Promise.all([api.checkins(id), api.plan(id)]);
    setCheckins(c);
    setPlan(p);
  }, []);

  useEffect(() => {
    void loadPatient(selected);
  }, [selected, loadPatient]);

  const redeem = async () => {
    setErr('');
    setFlash('');
    try {
      const { athlete } = await api.redeem(code.trim());
      setCode('');
      setFlash(`Linked ${athlete.name}`);
      await loadAthletes();
      setSelected(athlete.id);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'could not link');
    }
  };

  const saveSchedule = async () => {
    setFlash('');
    try {
      await api.assign({ athleteId: selected, cadenceDays: cadence, note });
      setFlash('Schedule saved');
      await loadAthletes();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'could not save');
    }
  };

  const sendPlan = async () => {
    setFlash('');
    const items = Object.entries(picked).map(([exerciseId, v]) => ({ exerciseId, sets: v.sets, reps: v.reps }));
    if (!items.length) {
      setErr('Pick at least one exercise');
      return;
    }
    try {
      await api.savePlan({ athleteId: selected, message, items });
      setPicked({});
      setMessage('');
      setFlash('Plan sent');
      await loadPatient(selected);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'could not send');
    }
  };

  const addExercise = async () => {
    if (!newName.trim() || !newHow.trim()) return;
    await api.createExercise({ name: newName, instructions: newHow, stage: 'mid' });
    setNewName('');
    setNewHow('');
    setExercises(await api.exercises());
  };

  const patient = athletes.find((a) => a.id === selected);

  return (
    <Shell user={user} onOut={onOut}>
      {err ? <p className="ax-err">{err}</p> : null}
      {flash ? <p className="ax-flash">{flash}</p> : null}

      <div className="ax-grid">
        <section className="ax-card">
          <div className="ax-card-head">
            <h2>Patients</h2>
            <span className="ax-pill">{athletes.length}</span>
          </div>
          <div className="ax-inline">
            <input placeholder="Athlete invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button className="ax-btn ax-btn--mint sm" onClick={redeem} disabled={!code.trim()}>
              Link
            </button>
          </div>
          {athletes.length ? (
            <ul className="ax-patients">
              {athletes.map((a) => (
                <li key={a.id}>
                  <button className={a.id === selected ? 'on' : ''} onClick={() => setSelected(a.id)}>
                    <b>{a.name}</b>
                    <span>
                      {a.last_idx != null ? `${Math.round(a.last_idx)}%` : 'no data'} · {fmtDate(a.last_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ax-muted">No athletes yet. Ask them for the code on their home screen.</p>
          )}
        </section>

        {patient ? (
          <>
            <section className="ax-card">
              <div className="ax-card-head">
                <h2>Schedule · {patient.name}</h2>
                <span className="ax-pill">{patient.next_check_in ? fmtWhen(patient.next_check_in) : 'not set'}</span>
              </div>
              <div className="ax-inline">
                <label className="ax-field">
                  Every
                  <input type="number" min={1} max={28} value={cadence} onChange={(e) => setCadence(Number(e.target.value))} />
                  days
                </label>
                <button className="ax-btn ax-btn--mint sm" onClick={saveSchedule}>
                  Save schedule
                </button>
              </div>
              <label className="ax-field wide">
                Note to the athlete
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only do this if the knee feels settled." />
              </label>
            </section>

            <section className="ax-card">
              <div className="ax-card-head">
                <h2>Build a plan</h2>
                <span className="ax-pill">{Object.keys(picked).length} selected</span>
              </div>
              <ul className="ax-pick">
                {exercises.map((ex) => {
                  const on = Boolean(picked[ex.id]);
                  return (
                    <li key={ex.id} className={on ? 'on' : ''}>
                      <label>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setPicked((prev) => {
                              const next = { ...prev };
                              if (e.target.checked) next[ex.id] = { sets: 3, reps: 10 };
                              else delete next[ex.id];
                              return next;
                            })
                          }
                        />
                        <b>{ex.name}</b>
                        <em>{ex.stage}</em>
                      </label>
                      {on ? (
                        <div className="ax-inline tight">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={picked[ex.id].sets}
                            onChange={(e) =>
                              setPicked((prev) => ({ ...prev, [ex.id]: { ...prev[ex.id], sets: Number(e.target.value) } }))
                            }
                          />
                          ×
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={picked[ex.id].reps}
                            onChange={(e) =>
                              setPicked((prev) => ({ ...prev, [ex.id]: { ...prev[ex.id], reps: Number(e.target.value) } }))
                            }
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <label className="ax-field wide">
                Message
                <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Two easy sessions this week." />
              </label>
              <button className="ax-btn ax-btn--mint sm" onClick={sendPlan}>
                Send plan
              </button>
              <p className="ax-muted tiny">Exercises are chosen by you, never by the model.</p>
            </section>

            <section className="ax-card">
              <h2>Add an exercise</h2>
              <div className="ax-stack">
                <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input placeholder="How to do it" value={newHow} onChange={(e) => setNewHow(e.target.value)} />
                <button className="ax-btn ax-btn--ghost sm" onClick={addExercise}>
                  Add to my library
                </button>
              </div>
            </section>

            <section className="ax-card">
              <div className="ax-card-head">
                <h2>Check-ins · {patient.name}</h2>
                <span className="ax-pill">{checkins.length}</span>
              </div>
              {checkins.length ? (
                <table className="ax-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Symmetry</th>
                      <th>L / R knee</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkins.map((c) => (
                      <tr key={c.id}>
                        <td>{fmtDate(c.captured_at)}</td>
                        <td>{Math.round(c.idx)}%</td>
                        <td>
                          {Math.abs(c.left_deg).toFixed(1)}° / {Math.abs(c.right_deg).toFixed(1)}°
                        </td>
                        <td className="ax-muted">{c.status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="ax-muted">No check-ins saved by this athlete yet.</p>
              )}
            </section>

            {plan ? (
              <section className="ax-card">
                <div className="ax-card-head">
                  <h2>Current plan</h2>
                  <span className="ax-pill">
                    {plan.items.filter((i) => i.done_at).length}/{plan.items.length} done
                  </span>
                </div>
                {plan.message ? <p className="ax-note">“{plan.message}”</p> : null}
                <ul className="ax-list plain">
                  {plan.items.map((i) => (
                    <li key={i.id} className={i.done_at ? 'done' : ''}>
                      <div>
                        <b>{i.name}</b>
                        <em>
                          {i.sets} × {i.reps}
                        </em>
                      </div>
                      {i.done_at ? <span className="ax-tick">✓ {fmtDate(i.done_at)}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Shell>
  );
}

/* --------------------------------- shell ---------------------------------- */

function Shell({ user, onOut, children }: { user: User; onOut: () => void; children: React.ReactNode }) {
  return (
    <div className="ax">
      <header className="ax-top">
        <div className="ax-top-in">
          <a className="ax-brand" href="/">
            <span className="ax-mark">AX</span>
            <span>
              <b>ATHLYX</b>
              <em>{user.role === 'therapist' ? 'physiotherapist' : 'athlete'}</em>
            </span>
          </a>
          <div className="ax-nav">
            <span className="ax-who">{user.name}</span>
            <a href="/rtp">Check-in</a>
            <button
              onClick={async () => {
                await api.logout().catch(() => undefined);
                onOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="ax-main">{children}</main>
      <footer className="ax-foot">
        Monitoring aid only — not a diagnosis and not a return-to-sport clearance. Video is processed in the browser and
        never uploaded.
      </footer>
    </div>
  );
}

/* ---------------------------------- root ---------------------------------- */

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .me()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="ax-loading">
        <span className="ax-mark">AX</span>
      </div>
    );
  }

  if (!user) return <Auth onAuth={setUser} />;

  const out = () => {
    setUser(null);
    location.href = '/app';
  };

  return user.role === 'therapist' ? <TherapistHome user={user} onOut={out} /> : <AthleteHome user={user} onOut={out} />;
}
