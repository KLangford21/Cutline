import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store';

const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape',
];

export default function Welcome() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'in' | 'up' | 'club'>('in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', email: '', password: '', handicapIndex: '18.0', homeClub: '',
  });
  const [clubForm, setClubForm] = useState({
    clubName: '', city: '', province: 'Western Cape', phone: '',
  });

  if (user) return <Navigate to="/" replace />;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'in') {
        await signIn(form.email, form.password);
      } else if (mode === 'up') {
        await signUp({
          name: form.name,
          email: form.email,
          password: form.password,
          handicapIndex: Number(form.handicapIndex) || 18,
          homeClub: form.homeClub || undefined,
        });
      } else {
        // Club signup creates the manager's account, then registers the club
        // itself. It stays pending until the platform approves it.
        await signUp({
          name: form.name,
          email: form.email,
          password: form.password,
          handicapIndex: 18,
          homeClub: clubForm.clubName || undefined,
        });
        await api.registerClub({
          name: clubForm.clubName,
          city: clubForm.city,
          province: clubForm.province,
          phone: clubForm.phone || undefined,
          email: form.email,
        });
        setNotice('Club registered — it goes live once the platform approves it.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in');
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn('demo@cutline.co.za', 'golf1234');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo unavailable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ paddingBottom: 40, minHeight: '100dvh', display: 'grid', alignContent: 'center' }}>
      <div style={{ marginBottom: 28 }}>
        <div className="eyebrow">Golf · South Africa</div>
        <h1 className="wordmark">Cutline</h1>
        <div className="cutline">
          <div className="bar" style={{ background: 'var(--fescue)' }} />
          <div className="tag" style={{ color: 'var(--fescue)' }}>The field ends here</div>
        </div>
        <p className="muted" style={{ marginTop: 14, fontSize: 15, maxWidth: 330, lineHeight: 1.5 }}>
          Tee times at South African clubs, rounds scored hole by hole, and every rand
          accounted for against a name.
        </p>
      </div>

      <form className="card stack" onSubmit={submit} style={{ gap: 14 }}>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'in'} onClick={() => setMode('in')}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'up'} onClick={() => setMode('up')}>
            Golfer
          </button>
          <button type="button" role="tab" aria-selected={mode === 'club'} onClick={() => setMode('club')}>
            Club
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {notice && <div className="notice calm">{notice}</div>}

        {mode === 'club' && (
          <p className="tiny muted">
            Register your club to publish a tee sheet and take bookings. We check that you run the
            club before it goes live.
          </p>
        )}

        {mode !== 'in' && (
          <div className="field">
            <label htmlFor="name">{mode === 'club' ? 'Your name' : 'Name'}</label>
            <input id="name" className="input" value={form.name} onChange={set('name')} placeholder="Sam Torrance" required />
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@club.com" required />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} placeholder="••••••••" required />
        </div>

        {mode === 'up' && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="hcp">Handicap index</label>
              <input id="hcp" className="input num" inputMode="decimal" value={form.handicapIndex} onChange={set('handicapIndex')} />
            </div>
            <div className="field">
              <label htmlFor="club">Home club</label>
              <input id="club" className="input" value={form.homeClub} onChange={set('homeClub')} placeholder="Optional" />
            </div>
          </div>
        )}

        {mode === 'club' && (
          <>
            <div className="field">
              <label htmlFor="cname">Club name</label>
              <input id="cname" className="input" required value={clubForm.clubName}
                onChange={(e) => setClubForm({ ...clubForm, clubName: e.target.value })}
                placeholder="Mossel Bay Golf Club" />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ccity">Town</label>
                <input id="ccity" className="input" value={clubForm.city}
                  onChange={(e) => setClubForm({ ...clubForm, city: e.target.value })} placeholder="Mossel Bay" />
              </div>
              <div className="field">
                <label htmlFor="cphone">Phone</label>
                <input id="cphone" className="input" value={clubForm.phone}
                  onChange={(e) => setClubForm({ ...clubForm, phone: e.target.value })} placeholder="044 111 2222" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cprov">Province</label>
              <select id="cprov" className="input" value={clubForm.province}
                onChange={(e) => setClubForm({ ...clubForm, province: e.target.value })}>
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </>
        )}

        <button className="btn primary block" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Tee off' : mode === 'club' ? 'Register the club' : 'Create account'}
        </button>
      </form>

      <button className="btn ghost block" style={{ marginTop: 12 }} onClick={demo} disabled={busy}>
        Explore the demo round
      </button>
    </div>
  );
}
