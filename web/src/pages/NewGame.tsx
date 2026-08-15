import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAsync, useAuth, useToast } from '../store';
import { Avatar, Sheet, Spinner } from '../components/ui';
import { IconCheck, IconChevronLeft, IconPin, IconPlus, IconSearch, IconX } from '../components/icons';
import type { Course, Format, User } from '../types';

type Entrant = { key: string; userId?: string; name: string; handicapIndex: number; avatarColor: string; team: string };

export default function NewGame() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState<Course | null>(null);
  const [format, setFormat] = useState('stableford');
  const [scoring, setScoring] = useState<'net' | 'gross'>('net');
  const [holeCount, setHoleCount] = useState(18);
  const [startHole, setStartHole] = useState(1);
  const [name, setName] = useState('');
  const [stake, setStake] = useState('');
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courses = useAsync(() => api.courses(), []);
  const formats = useAsync(() => api.formats(), []);

  useEffect(() => {
    if (user && entrants.length === 0) {
      setEntrants([{
        key: user.id, userId: user.id, name: user.name,
        handicapIndex: user.handicapIndex, avatarColor: user.avatarColor, team: 'A',
      }]);
    }
  }, [user, entrants.length]);


  const teamFormat = useMemo(
    () => formats.data?.formats.find((f) => f.key === format)?.team ?? false,
    [formats.data, format],
  );

  const filtered = (courses.data?.courses ?? []).filter((c) =>
    `${c.name} ${c.location} ${c.country}`.toLowerCase().includes(query.toLowerCase()),
  );

  const create = async () => {
    if (!course) return;
    setCreating(true);
    setError(null);
    try {
      const { game } = await api.createGame({
        name: name.trim() || `${course.name} round`,
        courseId: course.id,
        format,
        scoring,
        holeCount,
        startHole,
        stake: stake.trim() || null,
        players: entrants.map((e) => ({
          userId: e.userId,
          name: e.userId ? undefined : e.name,
          handicapIndex: e.handicapIndex,
          team: teamFormat ? e.team : undefined,
        })),
      });
      toast('Round created — good luck out there');
      navigate(`/game/${game.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the round');
    } finally {
      setCreating(false);
    }
  };

  if (courses.loading || formats.loading) return <Spinner />;

  const steps = ['Course', 'Format', 'Players'];

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <header className="topbar">
        <button className="icon-btn" onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))} aria-label="Back">
          <IconChevronLeft />
        </button>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Step {step + 1} of 3</div>
          <h1 style={{ fontSize: 22 }}>{steps[step]}</h1>
        </div>
      </header>

      <div className="row" style={{ gap: 6, marginBottom: 20 }}>
        {steps.map((s, i) => (
          <div key={s} className="bar-track" style={{ flex: 1 }}>
            <div className="bar-fill" style={{ width: i <= step ? '100%' : '0%', background: 'var(--accent)' }} />
          </div>
        ))}
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

      {step === 0 && (
        <div className="stack">
          <p className="tiny muted" style={{ padding: '0 4px' }}>
            For a round you have not booked through Cutline. Booking a tee time sets the round up
            for you — pick your game there.
          </p>
          <div className="row card tight" style={{ gap: 10 }}>
            <IconSearch />
            <input
              className="input"
              style={{ border: 0, background: 'transparent', padding: 0 }}
              placeholder="Search courses"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {filtered.map((c) => {
            const selected = course?.id === c.id;
            return (
              <button
                key={c.id}
                className="card tight row"
                style={{
                  gap: 12, textAlign: 'left', width: '100%',
                  borderColor: selected ? 'rgba(95,214,180,.45)' : undefined,
                }}
                onClick={() => { setCourse(c); setName((n) => n || `${c.name} round`); setStep(1); }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 640 }}>{c.name}</div>
                  <div className="tiny muted row" style={{ gap: 4 }}>
                    <IconPin /> {c.location} · Par {c.par} · {c.tee} tees
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tiny muted">CR {c.rating}</div>
                  <div className="tiny muted">SL {c.slope}</div>
                </div>
                {selected && <span style={{ color: 'var(--accent)' }}><IconCheck /></span>}
              </button>
            );
          })}
        </div>
      )}

      {step === 1 && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="stack">
            {(formats.data?.formats ?? []).map((f: Format) => (
              <button
                key={f.key}
                className="card tight row"
                style={{
                  gap: 12, textAlign: 'left', width: '100%',
                  borderColor: format === f.key ? 'rgba(95,214,180,.45)' : undefined,
                  background: format === f.key ? 'rgba(95,214,180,.09)' : undefined,
                }}
                onClick={() => setFormat(f.key)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 640 }}>{f.label}</div>
                  <div className="tiny muted">{f.blurb}</div>
                </div>
                {f.team && <span className="chip">Teams</span>}
                {format === f.key && <span style={{ color: 'var(--accent)' }}><IconCheck /></span>}
              </button>
            ))}
          </div>

          <div className="field">
            <label>Handicaps</label>
            <div className="segmented">
              <button aria-selected={scoring === 'net'} onClick={() => setScoring('net')}>Net</button>
              <button aria-selected={scoring === 'gross'} onClick={() => setScoring('gross')}>Gross</button>
            </div>
          </div>

          <div className="field">
            <label>Holes</label>
            <div className="segmented">
              <button aria-selected={holeCount === 18} onClick={() => { setHoleCount(18); setStartHole(1); }}>18 holes</button>
              <button aria-selected={holeCount === 9 && startHole === 1} onClick={() => { setHoleCount(9); setStartHole(1); }}>Front 9</button>
              <button aria-selected={holeCount === 9 && startHole === 10} onClick={() => { setHoleCount(9); setStartHole(10); }}>Back 9</button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="gname">Round name</label>
            <input id="gname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Saturday Medal" />
          </div>

          <div className="field">
            <label htmlFor="stake">Playing for (optional)</label>
            <input id="stake" className="input" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="Loser buys the first round" />
          </div>

          <button className="btn primary block" onClick={() => setStep(2)}>Pick the players</button>
        </div>
      )}

      {step === 2 && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="stack">
            {entrants.map((e) => (
              <div key={e.key} className="card tight row" style={{ gap: 12 }}>
                <Avatar name={e.name} color={e.avatarColor} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 620 }}>{e.name}{e.userId === user?.id && <span className="muted tiny"> · you</span>}</div>
                  <div className="tiny muted">HI {e.handicapIndex.toFixed(1)}</div>
                </div>
                {teamFormat && (
                  <div className="segmented" style={{ width: 96 }}>
                    {['A', 'B'].map((t) => (
                      <button
                        key={t}
                        aria-selected={e.team === t}
                        onClick={() => setEntrants((list) => list.map((x) => (x.key === e.key ? { ...x, team: t } : x)))}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {e.userId !== user?.id && (
                  <button className="icon-btn" onClick={() => setEntrants((l) => l.filter((x) => x.key !== e.key))} aria-label={`Remove ${e.name}`}>
                    <IconX />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button className="btn block" onClick={() => setAddOpen(true)}>
            <IconPlus size={18} /> Add player
          </button>

          <div className="card flat">
            <div className="row between small">
              <span className="muted">Course</span>
              <span>{course?.name}</span>
            </div>
            <div className="row between small" style={{ marginTop: 6 }}>
              <span className="muted">Format</span>
              <span>{formats.data?.formats.find((f) => f.key === format)?.label} · {scoring}</span>
            </div>
            <div className="row between small" style={{ marginTop: 6 }}>
              <span className="muted">Holes</span>
              <span>{holeCount === 18 ? '18' : startHole === 10 ? 'Back 9' : 'Front 9'}</span>
            </div>
          </div>

          <button className="btn primary block" onClick={create} disabled={creating || !course || entrants.length === 0}>
            {creating ? 'Setting up…' : 'Tee it up'}
          </button>
        </div>
      )}

      <AddPlayerSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existing={entrants}
        onAdd={(entrant) => {
          setEntrants((list) => [...list, { ...entrant, team: list.length % 2 === 0 ? 'A' : 'B' }]);
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function AddPlayerSheet({
  open, onClose, onAdd, existing,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (entrant: Omit<Entrant, 'team'>) => void;
  existing: Entrant[];
}) {
  const [tab, setTab] = useState<'friends' | 'guest'>('friends');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [guest, setGuest] = useState({ name: '', handicapIndex: '18' });

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const { users } = await api.searchUsers(q);
        if (active) setResults(users);
      } catch { /* search is best effort */ }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [q, open]);

  return (
    <Sheet open={open} onClose={onClose} title="Add a player">
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button aria-selected={tab === 'friends'} onClick={() => setTab('friends')}>Cutline players</button>
        <button aria-selected={tab === 'guest'} onClick={() => setTab('guest')}>Guest</button>
      </div>

      {tab === 'friends' ? (
        <div className="stack">
          <div className="row card tight" style={{ gap: 10 }}>
            <IconSearch />
            <input
              className="input"
              style={{ border: 0, background: 'transparent', padding: 0 }}
              placeholder="Search by name or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {results.length === 0 && <p className="muted small center" style={{ padding: 12 }}>No players found.</p>}
          {results.map((u) => {
            const added = existing.some((e) => e.userId === u.id);
            return (
              <button
                key={u.id}
                className="card tight row"
                style={{ gap: 12, width: '100%', opacity: added ? 0.45 : 1 }}
                disabled={added}
                onClick={() => onAdd({ key: u.id, userId: u.id, name: u.name, handicapIndex: u.handicapIndex, avatarColor: u.avatarColor })}
              >
                <Avatar name={u.name} color={u.avatarColor} size={38} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 620 }}>{u.name}</div>
                  <div className="tiny muted">HI {u.handicapIndex.toFixed(1)}{u.homeClub ? ` · ${u.homeClub}` : ''}</div>
                </div>
                {added ? <span className="chip">Added</span> : <IconPlus size={18} />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="stack">
          <div className="field">
            <label htmlFor="gn">Name</label>
            <input id="gn" className="input" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} placeholder="Visitor" />
          </div>
          <div className="field">
            <label htmlFor="gh">Handicap index</label>
            <input id="gh" className="input num" inputMode="decimal" value={guest.handicapIndex} onChange={(e) => setGuest({ ...guest, handicapIndex: e.target.value })} />
          </div>
          <button
            className="btn primary block"
            disabled={!guest.name.trim()}
            onClick={() => {
              onAdd({
                key: `guest-${Date.now()}`,
                name: guest.name.trim(),
                handicapIndex: Number(guest.handicapIndex) || 18,
                avatarColor: '#7C8E84',
              });
              setGuest({ name: '', handicapIndex: '18' });
            }}
          >
            Add guest
          </button>
        </div>
      )}
    </Sheet>
  );
}
