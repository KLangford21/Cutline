import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAsync, useAuth, useToast } from '../store';
import { Avatar, Sheet, Spinner, StatTile, dayLabel, rands, relativeTime } from '../components/ui';
import { IconChevronRight, IconClock, IconPin, IconTrophy, IconUsers } from '../components/icons';
import type { GameSummary } from '../types';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

function LiveRound({ game }: { game: GameSummary }) {
  return (
    <Link to={`/game/${game.id}`} className="hero" style={{ display: 'block' }}>
      <div className="row between">
        <span className="chip live">Live now</span>
        <span className="chip">{game.formatLabel}</span>
      </div>
      <div className="course" style={{ marginTop: 14 }}>{game.course.name}</div>
      <div className="row tiny muted" style={{ gap: 12, marginTop: 4 }}>
        <span className="row" style={{ gap: 4 }}><IconPin /> {game.course.location}</span>
        <span className="row" style={{ gap: 4 }}><IconUsers /> {game.players.length}</span>
      </div>

      <div className="hero-stats">
        <div>
          <div className="v num">{game.me?.display ?? '–'}</div>
          <div className="k">Your {game.me?.unit ?? 'score'}</div>
        </div>
        <div>
          <div className="v num">{game.thru}<span style={{ fontSize: 14, color: 'var(--muted)' }}>/{game.holeCount}</span></div>
          <div className="k">Holes played</div>
        </div>
        <div>
          <div className="v num">{game.me?.position ? `${game.me.position}` : '–'}</div>
          <div className="k">Position</div>
        </div>
      </div>

      <div className="btn primary block" style={{ marginTop: 18 }}>
        Continue scoring <IconChevronRight size={17} />
      </div>
    </Link>
  );
}

function RoundRow({ game }: { game: GameSummary }) {
  const winner = game.top[0];
  return (
    <Link to={`/game/${game.id}`} className="card tight row" style={{ gap: 12 }}>
      <Avatar name={winner?.name ?? game.name} color={winner?.avatarColor ?? '#7C8E84'} size={40} variant="outline" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 620, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {game.course.name}
        </div>
        <div className="tiny muted">
          {game.formatLabel} · {winner ? `${winner.name} won` : 'No scores'} · {relativeTime(game.finishedAt || game.createdAt)}
        </div>
      </div>
      {game.me && (
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontWeight: 700, fontSize: 18 }}>{game.me.display}</div>
          <div className="tiny muted">{game.me.unit}</div>
        </div>
      )}
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const games = useAsync(() => api.games(), []);
  const profile = useAsync(() => api.profile('me'), []);
  const bookings = useAsync(() => api.myBookings('upcoming'), []);
  const myClubs = useAsync(() => api.myClubs(), []);

  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const { game } = await api.joinGame(code.trim());
      toast(`Joined ${game.course.name}`);
      setJoinOpen(false);
      navigate(`/game/${game.id}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join');
    } finally {
      setJoining(false);
    }
  };

  if (games.loading) return <Spinner />;

  const list = games.data?.games ?? [];
  const live = list.filter((g) => g.status === 'live');
  const done = list.filter((g) => g.status === 'finished');
  const stats = profile.data?.stats;
  const nextBooking = (bookings.data?.bookings ?? []).find((b) => b.status === 'confirmed');
  const managedClub = myClubs.data?.clubs[0];

  return (
    <div className="screen">
      <header className="topbar">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{greeting()}</div>
          <h1>{user?.name.split(' ')[0]}</h1>
        </div>
        <Link to="/profile">
          <Avatar name={user?.name ?? '?'} color={user?.avatarColor ?? '#1D3B2E'} src={user?.avatarUrl} size={42} variant="ring" />
        </Link>
      </header>

      {live.length > 0 ? (
        <div className="stack">{live.map((g) => <LiveRound key={g.id} game={g} />)}</div>
      ) : (
        <div className="hero">
          <div className="eyebrow">No round in play</div>
          <div className="course" style={{ marginTop: 10 }}>Ready when you are.</div>
          <p className="muted small" style={{ marginTop: 6 }}>
            Set up a game, pick your format and invite the fourball.
          </p>
          <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => navigate('/new')}>
            Start a round
          </button>
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => navigate('/new')}>New round</button>
        <button className="btn" onClick={() => setJoinOpen(true)}>Join by code</button>
      </div>

      {nextBooking && (
        <>
          <div className="section-head">
            <h2>Next tee time</h2>
            <Link to="/bookings">All bookings</Link>
          </div>
          <Link to="/bookings" className="card club-card">
            <div className="club-strip" style={{ ['--c' as string]: nextBooking.club.brandColor }} />
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div className="name">{nextBooking.club.name}</div>
                <div className="tiny muted row" style={{ gap: 4 }}>
                  <IconPin /> {nextBooking.course.name} · {nextBooking.club.city}
                </div>
              </div>
              <span className="chip accent"><IconClock /> {nextBooking.time}</span>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="chip">{nextBooking.formatLabel}</span>
              <span className="chip">{nextBooking.players} players</span>
            </div>
            <div className="row between">
              <span className="tiny muted">{dayLabel(nextBooking.date)} · {nextBooking.ref}</span>
              <span className={`money ${nextBooking.money.outstandingCents > 0 ? 'owing' : 'settled'}`}>
                {nextBooking.money.outstandingCents > 0
                  ? `${rands(nextBooking.money.outstandingCents)} due`
                  : 'Paid'}
              </span>
            </div>
          </Link>
        </>
      )}

      {managedClub && (
        <>
          <div className="section-head"><h2>Your club</h2></div>
          <Link to="/club" className="card row" style={{ gap: 12 }}>
            <Avatar name={managedClub.name} color={managedClub.brandColor} size={42} variant="outline" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 640 }}>{managedClub.name}</div>
              <div className="tiny muted">
                {managedClub.status === 'active'
                  ? 'Manage the tee sheet, bookings and customers'
                  : `Awaiting approval — ${managedClub.status}`}
              </div>
            </div>
            <IconChevronRight size={18} />
          </Link>
        </>
      )}

      {stats && stats.rounds > 0 && (
        <>
          <div className="section-head">
            <h2>Your form</h2>
            <Link to="/profile">All stats</Link>
          </div>
          <div className="grid-3">
            <StatTile value={stats.rounds} label="Rounds" />
            <StatTile value={stats.avgPoints ?? '–'} label="Avg points" accent="var(--accent)" />
            <StatTile value={stats.birdies} label="Birdies" accent="var(--under)" />
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Recent rounds</h2>
        <Link to="/rounds">See all</Link>
      </div>

      {done.length === 0 ? (
        <div className="card flat">
          <p className="muted small">Your finished rounds will show up here with the full card and result.</p>
        </div>
      ) : (
        <div className="stack">{done.slice(0, 4).map((g) => <RoundRow key={g.id} game={g} />)}</div>
      )}

      {stats && stats.rounds > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row between">
            <div className="row" style={{ gap: 10 }}>
              <span className="icon-btn" style={{ color: 'var(--gold)' }}><IconTrophy /></span>
              <div>
                <div style={{ fontWeight: 620 }}>{stats.wins} {stats.wins === 1 ? 'win' : 'wins'}</div>
                <div className="tiny muted">from {stats.rounds} recorded rounds</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontWeight: 700 }}>{stats.bestGross ?? '–'}</div>
              <div className="tiny muted">best gross</div>
            </div>
          </div>
        </div>
      )}

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} title="Join a round">
        <div className="stack">
          <p className="muted small">Ask the host for the six-character code shown on their game screen.</p>
          {joinError && <div className="error-banner">{joinError}</div>}
          <input
            className="input code-display"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            autoFocus
          />
          <button className="btn primary block" onClick={join} disabled={code.length < 4 || joining}>
            {joining ? 'Joining…' : 'Join round'}
          </button>
          <div className="row tiny muted" style={{ justifyContent: 'center', gap: 6 }}>
            <IconClock /> You can join any round that has not been closed.
          </div>
        </div>
      </Sheet>
    </div>
  );
}
