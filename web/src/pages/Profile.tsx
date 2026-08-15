import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync, useAuth, useToast } from '../store';
import { Avatar, Empty, Sheet, Spinner, StatTile, ordinal, relativeTime, toPar } from '../components/ui';
import { IconCheck, IconLogout, IconPlus, IconSettings, IconTrophy } from '../components/icons';
import type { Stats, User } from '../types';

const COLORS = ['#1D3B2E', '#C2A76A', '#BE3A2B', '#4A574F', '#C2A76A', '#163025', '#7C8E84', '#4A574F'];
const TEES = ['Red', 'Yellow', 'White', 'Blue', 'Championship'];
const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape',
];

/**
 * Downscales and centre-crops to a 256px square before upload — keeps the data
 * URL small enough to live in the user row without a file store.
 */
async function fileToAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image');

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function Sparkline({ stats }: { stats: Stats }) {
  const points = stats.trend;
  if (points.length < 2) return null;

  const width = 300;
  const height = 66;
  const values = points.map((p) => p.points);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.points - min) / range) * (height - 10) - 5;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(95,214,180,.32)" />
          <stop offset="100%" stopColor="rgba(95,214,180,0)" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill="url(#fade)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3.5 : 2} fill="var(--accent)" />
      ))}
    </svg>
  );
}

/** Milestones off the stats already being computed — nothing extra to track. */
function achievements(stats: Stats) {
  return [
    { glyph: '⛳', label: 'First round', earned: stats.rounds >= 1 },
    { glyph: '🐦', label: 'Birdie', earned: stats.birdies >= 1 },
    { glyph: '🦅', label: 'Eagle', earned: stats.eagles >= 1 },
    { glyph: '🏆', label: 'Winner', earned: stats.wins >= 1 },
    { glyph: '9️⃣', label: 'Sub 90', earned: Boolean(stats.bestGross && stats.bestGross < 90) },
    { glyph: '8️⃣', label: 'Sub 80', earned: Boolean(stats.bestGross && stats.bestGross < 80) },
    { glyph: '🔟', label: '10 rounds', earned: stats.rounds >= 10 },
    { glyph: '💯', label: '100 holes', earned: stats.holes >= 100 },
  ];
}

export default function Profile() {
  const { user, signOut, patchUser } = useAuth();
  const toast = useToast();
  const profile = useAsync(() => api.profile('me'), []);
  const [editOpen, setEditOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (profile.loading || !user) return <Spinner />;

  const stats = profile.data?.stats;
  const rounds = profile.data?.rounds ?? [];

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const avatarUrl = await fileToAvatar(file);
      const { user: updated } = await api.updateMe({ avatarUrl });
      patchUser(updated);
      toast('Photo updated');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not use that photo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toGoal = user.goalHandicap == null ? null : user.handicapIndex - user.goalHandicap;

  return (
    <div className="screen">
      <header className="topbar">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Player card</div>
          <h1>You</h1>
        </div>
        <button className="icon-btn" onClick={() => setEditOpen(true)} aria-label="Edit profile"><IconSettings /></button>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pickPhoto(e.target.files?.[0])}
      />

      <div className="hero">
        <div className="row" style={{ gap: 14 }}>
          <button
            className="avatar-edit"
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile photo"
            disabled={uploading}
          >
            <Avatar name={user.name} color={user.avatarColor} src={user.avatarUrl} size={72} />
            <span className="badge">{uploading ? '…' : <IconPlus size={15} />}</span>
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 680, letterSpacing: '-0.035em' }}>{user.name}</div>
            <div className="tiny muted">{user.homeClub || 'No home club yet'}</div>
            {(user.city || user.province) && (
              <div className="tiny muted">{[user.city, user.province].filter(Boolean).join(', ')}</div>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 30, fontWeight: 730, letterSpacing: '-0.04em', color: 'var(--accent)' }}>
              {user.handicapIndex.toFixed(1)}
            </div>
            <div className="tiny muted">handicap</div>
          </div>
        </div>

        <button
          className="small muted"
          style={{ marginTop: 14, textAlign: 'left', width: '100%', lineHeight: 1.5 }}
          onClick={() => setEditOpen(true)}
        >
          {user.bio || <span style={{ color: 'var(--faint)' }}>Add a line about your game…</span>}
        </button>
      </div>

      {/* Goal handicap — the one number a golfer actually chases */}
      <div className="card tight" style={{ marginTop: 12 }}>
        {user.goalHandicap == null ? (
          <button className="row between" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditOpen(true)}>
            <div>
              <div style={{ fontWeight: 620, fontSize: 14 }}>Set a target handicap</div>
              <div className="tiny muted">Track how far you have to go</div>
            </div>
            <span className="chip accent">Set</span>
          </button>
        ) : (
          <>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 620, fontSize: 14 }}>Target {user.goalHandicap.toFixed(1)}</div>
                <div className="tiny muted">
                  {toGoal !== null && toGoal <= 0
                    ? 'Target reached — time to lower it'
                    : `${toGoal?.toFixed(1)} to go from ${user.handicapIndex.toFixed(1)}`}
                </div>
              </div>
              <span className="chip accent">{toGoal !== null && toGoal <= 0 ? 'Done' : 'In progress'}</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${Math.max(4, Math.min(100, (user.goalHandicap / Math.max(user.handicapIndex, 0.1)) * 100))}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
          </>
        )}
      </div>

      {!stats || stats.rounds === 0 ? (
        <Empty glyph="📊" title="No stats yet" hint="Finish a round and your numbers appear here." />
      ) : (
        <>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <StatTile value={stats.rounds} label="Rounds" />
            <StatTile value={stats.wins} label="Wins" accent="var(--gold)" />
            <StatTile value={stats.holes} label="Holes" />
          </div>
          <div className="grid-3" style={{ marginTop: 10 }}>
            <StatTile value={stats.avgGross ?? '–'} label="Avg gross" />
            <StatTile value={stats.bestGross ?? '–'} label="Best gross" accent="var(--accent)" />
            <StatTile value={stats.avgPutts ?? '–'} label="Putts / rd" accent="var(--sky)" />
          </div>

          <div className="section-head"><h2>Form</h2><span className="tiny muted">last {stats.trend.length} rounds</span></div>
          <div className="card tight">
            <div className="row between" style={{ marginBottom: 6 }}>
              <div>
                <div className="num" style={{ fontSize: 24, fontWeight: 720 }}>{stats.avgPoints ?? '–'}</div>
                <div className="tiny muted">average stableford points</div>
              </div>
              <span className="chip accent">Best {stats.bestPoints ?? '–'}</span>
            </div>
            <Sparkline stats={stats} />
          </div>

          <div className="section-head">
            <h2>Milestones</h2>
            <span className="tiny muted">
              {achievements(stats).filter((a) => a.earned).length} of {achievements(stats).length}
            </span>
          </div>
          <div className="badge-grid">
            {achievements(stats).map((a) => (
              <div key={a.label} className="badge-tile" data-earned={a.earned} title={a.label}>
                <span className="glyph">{a.glyph}</span>
                <span className="cap">{a.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Details</h2>
        <button onClick={() => setEditOpen(true)}>Edit</button>
      </div>
      <div className="card tight">
        {([
          ['Home club', user.homeClub],
          ['Town', user.city],
          ['Province', user.province],
          ['Usual tee', user.preferredTee],
          ['Plays', user.dominantHand === 'left' ? 'Left handed' : 'Right handed'],
          ['Prefers', { walk: 'Walking', ride: 'Riding', either: 'Either' }[user.ridePreference]],
          ['Playing since', user.playingSince],
          ['Favourite course', user.favouriteCourse],
          ['Phone', user.phone],
        ] as [string, string | number | null][]).map(([k, v]) => (
          <div key={k} className="detail-row">
            <span className="k">{k}</span>
            <span className={`v ${v ? '' : 'empty'}`}>{v || 'Not set'}</span>
          </div>
        ))}
      </div>

      <div className="section-head"><h2>Round history</h2></div>
      {rounds.length === 0 ? (
        <div className="card flat"><p className="muted small">Nothing recorded yet.</p></div>
      ) : (
        <div className="stack">
          {rounds.map((r) => (
            <Link key={r.gameId} to={`/game/${r.gameId}`} className="card tight row" style={{ gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 620, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.courseName}
                </div>
                <div className="tiny muted">
                  {relativeTime(r.playedAt)} · {r.position ? `${ordinal(r.position)} of ${r.fieldSize}` : 'unplaced'}
                </div>
              </div>
              {r.position === 1 && <span style={{ color: 'var(--gold)' }}><IconTrophy size={16} /></span>}
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontWeight: 700 }}>{r.gross}</div>
                <div className="tiny muted">{toPar(r.toPar)} · {r.points} pts</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <button className="btn danger block" style={{ marginTop: 22 }} onClick={signOut}>
        <IconLogout size={17} /> Sign out
      </button>

      {editOpen && (
        <EditSheet
          user={user}
          onClose={() => setEditOpen(false)}
          onChangePhoto={() => fileRef.current?.click()}
          onSaved={(updated) => {
            patchUser(updated);
            setEditOpen(false);
            toast('Profile updated');
          }}
        />
      )}
    </div>
  );
}

function EditSheet({
  user, onClose, onSaved, onChangePhoto,
}: {
  user: User;
  onClose: () => void;
  onSaved: (u: User) => void;
  onChangePhoto: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: user.name,
    bio: user.bio ?? '',
    handicapIndex: String(user.handicapIndex),
    goalHandicap: user.goalHandicap == null ? '' : String(user.goalHandicap),
    homeClub: user.homeClub ?? '',
    city: user.city ?? '',
    province: user.province ?? '',
    phone: user.phone ?? '',
    preferredTee: user.preferredTee,
    dominantHand: user.dominantHand,
    ridePreference: user.ridePreference,
    playingSince: user.playingSince == null ? '' : String(user.playingSince),
    favouriteCourse: user.favouriteCourse ?? '',
    avatarColor: user.avatarColor,
  });

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const { user: updated } = await api.updateMe({
        name: form.name,
        bio: form.bio,
        handicapIndex: Number(form.handicapIndex),
        goalHandicap: form.goalHandicap === '' ? null : Number(form.goalHandicap),
        homeClub: form.homeClub,
        city: form.city,
        province: form.province,
        phone: form.phone,
        preferredTee: form.preferredTee,
        dominantHand: form.dominantHand,
        ridePreference: form.ridePreference,
        playingSince: form.playingSince === '' ? null : Number(form.playingSince),
        favouriteCourse: form.favouriteCourse,
        avatarColor: form.avatarColor,
      });
      onSaved(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    const { user: updated } = await api.updateMe({ avatarUrl: '' });
    onSaved(updated);
  };

  return (
    <Sheet open onClose={onClose} title="Edit profile">
      <div className="stack" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={user.name} color={form.avatarColor} src={user.avatarUrl} size={56} />
          <div className="row" style={{ gap: 8, flex: 1, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={onChangePhoto}>
              {user.avatarUrl ? 'Change photo' : 'Add photo'}
            </button>
            {user.avatarUrl && <button className="btn sm ghost" onClick={removePhoto}>Remove</button>}
          </div>
        </div>

        <div className="field">
          <label>Card colour</label>
          <div className="row wrap" style={{ gap: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Colour ${c}`}
                onClick={() => setForm({ ...form, avatarColor: c })}
                style={{
                  width: 32, height: 32, borderRadius: '50%', background: c,
                  display: 'grid', placeItems: 'center', color: '#06202a',
                  boxShadow: form.avatarColor === c ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)' : 'none',
                }}
              >
                {form.avatarColor === c && <IconCheck size={15} />}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="pn">Name</label>
          <input id="pn" className="input" value={form.name} onChange={set('name')} />
        </div>

        <div className="field">
          <label htmlFor="pb">Bio</label>
          <textarea id="pb" className="input" value={form.bio} onChange={set('bio')}
            placeholder="Weekend golfer. Chasing that one good shot." />
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="ph">Handicap index</label>
            <input id="ph" className="input num" inputMode="decimal" value={form.handicapIndex} onChange={set('handicapIndex')} />
          </div>
          <div className="field">
            <label htmlFor="pg">Target handicap</label>
            <input id="pg" className="input num" inputMode="decimal" value={form.goalHandicap}
              onChange={set('goalHandicap')} placeholder="e.g. 9.0" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="pc">Home club</label>
          <input id="pc" className="input" value={form.homeClub} onChange={set('homeClub')} />
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="pt">Town</label>
            <input id="pt" className="input" value={form.city} onChange={set('city')} />
          </div>
          <div className="field">
            <label htmlFor="pp">Province</label>
            <select id="pp" className="input" value={form.province} onChange={set('province')}>
              <option value="">Not set</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Usual tee</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {TEES.map((t) => (
              <button
                key={t}
                className="chip"
                style={form.preferredTee === t
                  ? { color: 'var(--accent)', background: 'var(--accent-dim)', borderColor: 'rgba(95,214,180,.35)' }
                  : undefined}
                onClick={() => setForm({ ...form, preferredTee: t })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Plays</label>
          <div className="segmented">
            {(['right', 'left'] as const).map((h) => (
              <button key={h} aria-selected={form.dominantHand === h}
                onClick={() => setForm({ ...form, dominantHand: h })}>
                {h === 'right' ? 'Right handed' : 'Left handed'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Walk or ride</label>
          <div className="segmented">
            {(['walk', 'ride', 'either'] as const).map((r) => (
              <button key={r} aria-selected={form.ridePreference === r}
                onClick={() => setForm({ ...form, ridePreference: r })}>
                {r === 'walk' ? 'Walk' : r === 'ride' ? 'Ride' : 'Either'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="ps">Playing since</label>
            <input id="ps" className="input num" inputMode="numeric" value={form.playingSince}
              onChange={set('playingSince')} placeholder="2014" />
          </div>
          <div className="field">
            <label htmlFor="pphone">Phone</label>
            <input id="pphone" className="input" value={form.phone} onChange={set('phone')}
              placeholder="082 000 0000" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="pf">Favourite course</label>
          <input id="pf" className="input" value={form.favouriteCourse} onChange={set('favouriteCourse')}
            placeholder="Leopard Creek" />
        </div>

        <p className="tiny muted">
          Your phone number is shared with a club only when you book a tee time there.
        </p>

        <button className="btn primary block" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </Sheet>
  );
}
