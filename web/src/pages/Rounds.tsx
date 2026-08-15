import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../store';
import { Avatar, Empty, Spinner, ordinal, relativeTime } from '../components/ui';
import { IconPin } from '../components/icons';

type Filter = 'all' | 'scheduled' | 'live' | 'finished';

/** Team rows already read as a unit ("Team A"); people get their first name. */
const shortName = (name: string) => (name.startsWith('Team ') ? name : name.split(' ')[0]);

export default function Rounds() {
  const [filter, setFilter] = useState<Filter>('all');
  const games = useAsync(() => api.games(), []);

  if (games.loading) return <Spinner />;

  const list = (games.data?.games ?? []).filter((g) => filter === 'all' || g.status === filter);

  return (
    <div className="screen">
      <header className="topbar">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Your golf</div>
          <h1>Rounds</h1>
        </div>
      </header>

      <div className="segmented" style={{ marginBottom: 16 }}>
        {(['all', 'scheduled', 'live', 'finished'] as Filter[]).map((f) => (
          <button key={f} aria-selected={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'scheduled' ? 'Booked' : f === 'live' ? 'In play' : 'Finished'}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty glyph="🏌️" title="No rounds here yet" hint="Start a round from the button below." />
      ) : (
        <div className="stack">
          {list.map((game) => (
            <Link key={game.id} to={`/game/${game.id}`} className="card">
              <div className="row between">
                <span className={`chip ${game.status === 'live' ? 'live' : ''}`}>
                  {game.status === 'live' ? 'Live'
                    : game.status === 'scheduled' ? 'Booked'
                      : relativeTime(game.finishedAt || game.createdAt)}
                </span>
                <span className="chip">{game.formatLabel}</span>
              </div>

              <div style={{ marginTop: 12, fontWeight: 660, fontSize: 17 }}>{game.course.name}</div>
              <div className="tiny muted row" style={{ gap: 4 }}>
                <IconPin /> {game.course.location} · Par {game.course.par} · {game.holeCount} holes
              </div>

              <div className="row between" style={{ marginTop: 14 }}>
                <div className="row" style={{ gap: 0 }}>
                  {game.players.slice(0, 4).map((p, i) => (
                    <span key={p.id} style={{ marginLeft: i ? -10 : 0 }}>
                      <Avatar name={p.name} color={p.avatarColor} size={30} variant="ring" />
                    </span>
                  ))}
                  {game.players.length > 4 && <span className="tiny muted" style={{ marginLeft: 8 }}>+{game.players.length - 4}</span>}
                </div>

                {game.me && (
                  <div className="row" style={{ gap: 14 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div className="num" style={{ fontWeight: 700, fontSize: 17 }}>{game.me.display}</div>
                      <div className="tiny muted">{game.me.unit}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="num" style={{ fontWeight: 700, fontSize: 17, color: 'var(--accent)' }}>
                        {game.me.position ? ordinal(game.me.position) : '–'}
                      </div>
                      <div className="tiny muted">place</div>
                    </div>
                  </div>
                )}
              </div>

              {game.top.length > 0 && (
                <div className="tiny muted" style={{ marginTop: 10 }}>
                  Leading: {game.top.map((t) => `${shortName(t.name)} ${t.display}`).join(' · ')}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
