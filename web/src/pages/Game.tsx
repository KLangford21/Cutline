import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, subscribeToGame } from '../api';
import { useAuth, useToast } from '../store';
import { Avatar, Empty, ScoreMark, Sheet, Spinner, relativeTime, toPar } from '../components/ui';
import {
  IconChevronLeft, IconChevronRight, IconHeart, IconPlus, IconShare, IconTrophy, IconUsers, IconX,
} from '../components/icons';
import type { BoardRow, CardCell, Game, Hole, PlayerBoard, Post } from '../types';

type Tab = 'score' | 'card' | 'board' | 'book';

const QUICK = [
  { delta: -2, label: 'Eagle' },
  { delta: -1, label: 'Birdie' },
  { delta: 0, label: 'Par' },
  { delta: 1, label: 'Bogey' },
  { delta: 2, label: 'Double' },
];

export default function GameScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('score');
  const [holeIndex, setHoleIndex] = useState(0);
  const [pending, setPending] = useState<Record<string, number | null>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const startedAt = useRef(false);

  const load = useCallback(async () => {
    try {
      const { game: fetched } = await api.game(id);
      setGame(fetched);
      if (!startedAt.current) {
        startedAt.current = true;
        const played = Math.max(0, ...fetched.leaderboard.players.map((p) => p.thru));
        setHoleIndex(Math.min(played, fetched.holes.length - 1));
        if (fetched.status === 'finished') setTab('board');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the round');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /* live updates from everyone else's phones */
  useEffect(() => {
    if (!id) return;
    return subscribeToGame(id, (event) => {
      if (['leaderboard', 'players', 'status', 'post'].includes(event.type)) void load();
    });
  }, [id, load]);

  const hole = game?.holes[holeIndex];

  const cellFor = (playerId: string, holeNumber: number): CardCell | undefined =>
    game?.leaderboard.players.find((p) => p.playerId === playerId)?.card.find((c) => c.hole === holeNumber);

  const setScore = async (playerId: string, strokes: number | null) => {
    if (!game || !hole) return;
    const key = `${playerId}:${hole.hole}`;
    setPending((p) => ({ ...p, [key]: strokes }));
    try {
      const { game: updated } = await api.saveScore(game.id, { playerId, hole: hole.hole, strokes });
      setGame(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Score not saved');
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  /** Quick entry writes the whole group in one request so the board can't race itself. */
  const setScoreForAll = async (strokes: number | null) => {
    if (!game || !hole) return;
    const entries = game.players.map((p) => ({ playerId: p.id, hole: hole.hole, strokes }));
    setPending((p) => ({ ...p, ...Object.fromEntries(entries.map((e) => [`${e.playerId}:${e.hole}`, strokes])) }));
    try {
      const { game: updated } = await api.saveScores(game.id, entries);
      setGame(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Scores not saved');
    } finally {
      setPending((p) => {
        const next = { ...p };
        for (const e of entries) delete next[`${e.playerId}:${e.hole}`];
        return next;
      });
    }
  };

  const displayed = (playerId: string): number | null => {
    if (!hole) return null;
    const key = `${playerId}:${hole.hole}`;
    if (key in pending) return pending[key];
    return cellFor(playerId, hole.hole)?.strokes ?? null;
  };

  if (error) {
    return (
      <div className="screen">
        <div className="error-banner">{error}</div>
        <button className="btn block" style={{ marginTop: 14 }} onClick={() => navigate('/')}>Back home</button>
      </div>
    );
  }
  if (!game || !hole) return <Spinner />;

  const isHost = game.createdBy === user?.id;
  const allScored = game.players.every((p) => displayed(p.id) != null);

  return (
    <div className="screen flush">
      <header className="sticky-head">
        <div className="row" style={{ gap: 10 }}>
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><IconChevronLeft /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 660, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {game.course.name}
            </div>
            <div className="tiny muted">
              {game.formatLabel} · {game.scoring} ·{' '}
              {game.status === 'live' ? 'in play' : game.status === 'scheduled' ? 'ready to play' : 'finished'}
            </div>
          </div>
          <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Round options"><IconUsers size={18} /></button>
        </div>

        <div className="row" style={{ gap: 6, marginTop: 12, overflowX: 'auto' }}>
          {(['score', 'card', 'board', 'book'] as Tab[]).map((t) => (
            <button
              key={t}
              className="chip"
              aria-selected={tab === t}
              style={tab === t
                ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' }
                : undefined}
              onClick={() => setTab(t)}
            >
              {{ score: 'Enter scores', card: 'Scorecard', board: 'Leaderboard', book: 'The book' }[t]}
            </button>
          ))}
        </div>
      </header>

      {tab === 'score' && game.status === 'scheduled' && (
        <div className="notice calm" style={{ marginBottom: 12 }}>
          This round came with your tee time and is ready to go — the field and handicaps are set.
          Entering a score starts it.
        </div>
      )}

      {tab === 'score' && (
        <ScoreTab
          game={game}
          hole={hole}
          holeIndex={holeIndex}
          setHoleIndex={setHoleIndex}
          displayed={displayed}
          setScore={setScore}
          setScoreForAll={setScoreForAll}
          cellFor={cellFor}
          allScored={allScored}
        />
      )}
      {tab === 'card' && <CardTab game={game} />}
      {tab === 'board' && <BoardTab game={game} meId={user?.id ?? null} />}
      {tab === 'book' && <BookTab gameId={game.id} />}

      <RoundSheet
        game={game}
        open={menuOpen}
        isHost={isHost}
        onClose={() => setMenuOpen(false)}
        onChanged={setGame}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Score entry                                                         */
/* ------------------------------------------------------------------ */

function ScoreTab({
  game, hole, holeIndex, setHoleIndex, displayed, setScore, setScoreForAll, cellFor, allScored,
}: {
  game: Game;
  hole: Hole;
  holeIndex: number;
  setHoleIndex: (i: number) => void;
  displayed: (playerId: string) => number | null;
  setScore: (playerId: string, strokes: number | null) => void;
  setScoreForAll: (strokes: number | null) => void;
  cellFor: (playerId: string, hole: number) => CardCell | undefined;
  allScored: boolean;
}) {
  const closed = game.status === 'finished';

  return (
    <>
      <div className="bleed">
        <div className="pill-scroll" style={{ paddingBottom: 4 }}>
          {game.holes.map((h, i) => {
            const done = game.leaderboard.players.every((p) => p.card.find((c) => c.hole === h.hole)?.strokes != null);
            return (
              <button
                key={h.hole}
                aria-selected={i === holeIndex}
                onClick={() => setHoleIndex(i)}
                style={i !== holeIndex && done ? { color: 'var(--accent)', borderColor: 'rgba(95,214,180,.3)' } : undefined}
              >
                {h.hole}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hole-head">
        <div>
          <div className="eyebrow">Hole</div>
          <div className="hole-num num">{hole.hole}</div>
        </div>
        <div className="hole-meta">
          <span className="chip">Par {hole.par}</span>
          <span className="chip">SI {hole.si}</span>
          <span className="chip">{hole.metres} m</span>
        </div>
      </div>

      <div className="stack">
        {game.players.map((player) => {
          const value = displayed(player.id);
          const cell = cellFor(player.id, hole.hole);
          const shots = cell?.shots ?? 0;
          const points = value == null ? null : Math.max(0, hole.par - (value - shots) + 2);

          return (
            <div key={player.id} className={`player-score ${value != null ? 'done' : ''}`}>
              <Avatar name={player.name} color={player.avatarColor} src={player.avatarUrl} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {player.name}
                </div>
                <div className="sub">
                  PH {player.playingHandicap}
                  {shots > 0 && <span style={{ color: 'var(--accent)' }}> · {'•'.repeat(Math.min(shots, 3))}</span>}
                  {points != null && <span> · {points} pts</span>}
                </div>
              </div>
              <div className="stepper">
                <button
                  onClick={() => setScore(player.id, value == null ? hole.par : Math.max(1, value - 1))}
                  disabled={closed}
                  aria-label={`Fewer strokes for ${player.name}`}
                >
                  −
                </button>
                <span className={`val num ${value == null ? 'empty' : ''}`}>{value ?? '–'}</span>
                <button
                  onClick={() => setScore(player.id, value == null ? hole.par : Math.min(20, value + 1))}
                  disabled={closed}
                  aria-label={`More strokes for ${player.name}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!closed && (
        <>
          <div className="eyebrow" style={{ margin: '20px 0 8px' }}>Quick entry — everyone</div>
          <div className="quick-scores">
            {QUICK.map((q) => {
              const strokes = hole.par + q.delta;
              return (
                <button
                  key={q.label}
                  onClick={() => setScoreForAll(strokes)}
                  title={`Give everyone a ${q.label.toLowerCase()}`}
                >
                  {strokes}
                  <span>{q.label}</span>
                </button>
              );
            })}
            <button onClick={() => setScoreForAll(null)}>
              <IconX size={16} />
              <span>Clear</span>
            </button>
          </div>
        </>
      )}

      <div className="hole-nav">
        <button className="btn" style={{ flex: 1 }} disabled={holeIndex === 0} onClick={() => setHoleIndex(holeIndex - 1)}>
          <IconChevronLeft size={18} /> Hole {game.holes[Math.max(0, holeIndex - 1)].hole}
        </button>
        <button
          className={`btn ${allScored ? 'primary' : ''}`}
          style={{ flex: 1 }}
          disabled={holeIndex >= game.holes.length - 1}
          onClick={() => setHoleIndex(holeIndex + 1)}
        >
          Hole {game.holes[Math.min(game.holes.length - 1, holeIndex + 1)].hole} <IconChevronRight size={18} />
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Full scorecard                                                      */
/* ------------------------------------------------------------------ */

function CardTab({ game }: { game: Game }) {
  const holes = game.holes;
  const front = holes.filter((h) => h.hole <= 9);
  const back = holes.filter((h) => h.hole > 9);

  const sumFor = (player: PlayerBoard, subset: Hole[], key: 'strokes' | 'points') =>
    subset.reduce((sum, h) => {
      const cell = player.card.find((c) => c.hole === h.hole);
      return sum + (cell?.[key] ?? 0);
    }, 0);

  const section = (label: string, subset: Hole[]) => {
    if (subset.length === 0) return null;
    return (
      <div className="card tight" style={{ marginTop: 12, padding: '12px 0 4px' }} key={label}>
        <div className="eyebrow" style={{ padding: '0 14px 8px' }}>{label}</div>
        <div className="cardgrid">
          <table>
            <thead>
              <tr>
                <th className="who">Hole</th>
                {subset.map((h) => <th key={h.hole}>{h.hole}</th>)}
                <th className="tot">{label === 'Front nine' ? 'OUT' : label === 'Back nine' ? 'IN' : 'TOT'}</th>
              </tr>
              <tr className="par-row">
                <th className="who">Par</th>
                {subset.map((h) => <th key={h.hole}>{h.par}</th>)}
                <th className="tot" style={{ color: 'var(--muted)' }}>{subset.reduce((s, h) => s + h.par, 0)}</th>
              </tr>
            </thead>
            <tbody>
              {game.leaderboard.players.map((player) => (
                <tr key={player.playerId}>
                  <td className="who">{player.name}</td>
                  {subset.map((h) => {
                    const cell = player.card.find((c) => c.hole === h.hole);
                    return (
                      <td key={h.hole}>
                        <ScoreMark strokes={cell?.strokes ?? null} label={cell?.label ?? null} />
                      </td>
                    );
                  })}
                  <td className="tot num">{sumFor(player, subset, 'strokes') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      {section('Front nine', front)}
      {section('Back nine', back)}

      <div className="card tight" style={{ marginTop: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Totals</div>
        <div className="stack">
          {game.leaderboard.players.map((p) => (
            <div key={p.playerId} className="row between">
              <div className="row" style={{ gap: 10 }}>
                <Avatar name={p.name} color={p.avatarColor} size={30} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div className="tiny muted">PH {p.playingHandicap} · thru {p.thru}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 16 }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontWeight: 700 }}>{p.gross || '–'}</div>
                  <div className="tiny muted">gross</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontWeight: 700, color: 'var(--sky)' }}>{p.net || '–'}</div>
                  <div className="tiny muted">net</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontWeight: 700, color: 'var(--accent)' }}>{p.points}</div>
                  <div className="tiny muted">pts</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="row wrap tiny muted" style={{ gap: 14, marginTop: 14, justifyContent: 'center' }}>
        <span className="row" style={{ gap: 6 }}><span className="mark eagle num">2</span> eagle</span>
        <span className="row" style={{ gap: 6 }}><span className="mark birdie num">3</span> birdie</span>
        <span className="row" style={{ gap: 6 }}><span className="mark bogey num">5</span> bogey</span>
        <span className="row" style={{ gap: 6 }}><span className="mark double num">6</span> double</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

function BoardTab({ game, meId }: { game: Game; meId: string | null }) {
  const board = game.leaderboard;
  const anyScores = board.players.some((p) => p.thru > 0);

  if (!anyScores) {
    return <Empty glyph="🏌️" title="No scores yet" hint="Head to Enter scores and start the round." />;
  }

  return (
    <div className="stack" style={{ marginTop: 6 }}>
      {board.match && (
        <div className="card" style={{ borderColor: 'rgba(95,214,180,.28)' }}>
          <div className="eyebrow">Match</div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em', marginTop: 4 }}>
            {board.match.statusText}
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {board.match.remaining} to play · {board.match.sides.map((s) => s.name).join(' v ')}
          </div>
          <div className="row" style={{ gap: 3, marginTop: 12, flexWrap: 'wrap' }}>
            {board.match.holes.map((h) => (
              <span
                key={h.hole}
                title={`Hole ${h.hole}`}
                style={{
                  width: 15, height: 15, borderRadius: 5, fontSize: 8,
                  display: 'grid', placeItems: 'center', fontWeight: 700,
                  background:
                    h.result === 'A' ? 'var(--accent)'
                      : h.result === 'B' ? 'var(--sand)'
                        : h.result === 'halved' ? 'var(--surface-3)' : 'rgba(255,255,255,.05)',
                  color: h.result === 'A' || h.result === 'B' ? 'var(--accent-ink)' : 'var(--faint)',
                }}
              >
                {h.hole}
              </span>
            ))}
          </div>
        </div>
      )}

      {board.skins && (
        <div className="card tight">
          <div className="row between">
            <div className="eyebrow">Skins</div>
            {board.skins.carry > 0 && <span className="chip accent">{board.skins.carry} carrying</span>}
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {board.skins.holes.filter((h) => h.winner).map((h) => (
              <span key={h.hole} className="chip">
                {h.hole}: {h.winner!.name.split(' ')[0]} {h.value > 1 && `×${h.value}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {board.rows.map((row: BoardRow) => {
        const mine = row.userId === meId || row.players?.some((p) => board.players.find((x) => x.playerId === p.id)?.userId === meId);
        return (
          <div key={row.playerId} className={`lb-row ${mine ? 'me' : ''} ${row.position === 1 ? 'lead' : ''}`}>
            <span className="pos num">
              {row.position === 1 && !row.tied ? <IconTrophy size={17} /> : `${row.tied ? 'T' : ''}${row.position}`}
            </span>
            {row.players ? (
              <div style={{ display: 'flex' }}>
                {row.players.map((p, i) => (
                  <span key={p.id} style={{ marginLeft: i ? -10 : 0 }}>
                    <Avatar name={p.name} color={p.avatarColor} size={34} variant="ring" />
                  </span>
                ))}
              </div>
            ) : (
              <Avatar name={row.name} color={row.avatarColor} size={36} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 630, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.name}
              </div>
              <div className="tiny muted">
                thru {row.thru}
                {row.playingHandicap != null && ` · PH ${row.playingHandicap}`}
                {row.gross > 0 && ` · ${toPar(row.toPar)}`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="total num">{row.display}</div>
              <div className="unit">{row.unit}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The book (game chat)                                                */
/* ------------------------------------------------------------------ */

function BookTab({ gameId }: { gameId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { posts: list } = await api.gameFeed(gameId);
    setPosts(list);
  }, [gameId]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post({ gameId, body: text });
      setText('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ marginTop: 6 }}>
      <div className="card tight row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ border: 0, background: 'transparent', padding: 0 }}
          placeholder="Add to the book…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn sm primary" onClick={send} disabled={busy || !text.trim()}>Post</button>
      </div>

      {posts.length === 0 && <Empty glyph="📖" title="Nothing written yet" hint="Birdies and banter land here." />}

      {posts.map((post) => (
        <div key={post.id} className={`card tight post ${post.kind === 'event' ? 'event-post' : ''}`}>
          <div className="row" style={{ gap: 10 }}>
            <Avatar name={post.author.name} color={post.author.avatarColor} size={32} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 620, fontSize: 13.5 }}>{post.author.name}</div>
              <div className="meta">{relativeTime(post.createdAt)}</div>
            </div>
          </div>
          <div className="body">{post.body}</div>
          <div className="post-actions">
            <button
              className={post.liked ? 'on' : ''}
              onClick={async () => {
                const { post: updated } = await api.like(post.id);
                setPosts((list) => list.map((p) => (p.id === post.id ? updated : p)));
              }}
            >
              <IconHeart /> {post.likes || ''}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Round options                                                       */
/* ------------------------------------------------------------------ */

function RoundSheet({
  game, open, onClose, isHost, onChanged,
}: {
  game: Game;
  open: boolean;
  onClose: () => void;
  isHost: boolean;
  onChanged: (game: Game) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [guest, setGuest] = useState('');

  const share = async () => {
    const text = `Join my round at ${game.course.name} on Cutline — code ${game.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Cutline', text });
      else {
        await navigator.clipboard.writeText(game.code);
        toast('Code copied');
      }
    } catch { /* user dismissed the share sheet */ }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Round">
      <div className="stack">
        <div className="card tight center">
          <div className="eyebrow">Invite code</div>
          <div className="code-display" style={{ margin: '8px 0' }}>{game.code}</div>
          <button className="btn sm" onClick={share}><IconShare size={16} /> Share</button>
        </div>

        <div className="eyebrow" style={{ marginTop: 6 }}>Players</div>
        {game.players.map((p) => (
          <div key={p.id} className="row" style={{ gap: 10 }}>
            <Avatar name={p.name} color={p.avatarColor} size={34} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}{p.team ? ` · Team ${p.team}` : ''}</div>
              <div className="tiny muted">HI {p.handicapIndex.toFixed(1)} · PH {p.playingHandicap}</div>
            </div>
            {isHost && game.players.length > 1 && (
              <button
                className="icon-btn"
                aria-label={`Remove ${p.name}`}
                onClick={async () => {
                  const { game: updated } = await api.removePlayer(game.id, p.id);
                  onChanged(updated);
                }}
              >
                <IconX size={16} />
              </button>
            )}
          </div>
        ))}

        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="Add a guest" value={guest} onChange={(e) => setGuest(e.target.value)} />
          <button
            className="btn sm"
            disabled={!guest.trim()}
            onClick={async () => {
              const { game: updated } = await api.addPlayer(game.id, { name: guest.trim(), handicapIndex: 18 });
              onChanged(updated);
              setGuest('');
            }}
          >
            <IconPlus size={16} />
          </button>
        </div>

        {isHost && (
          game.status === 'live' ? (
            <button
              className="btn danger block"
              style={{ marginTop: 10 }}
              onClick={async () => {
                const { game: updated } = await api.finishGame(game.id);
                onChanged(updated);
                onClose();
                toast('Round closed — nice playing');
              }}
            >
              Finish the round
            </button>
          ) : (
            <button
              className="btn block"
              style={{ marginTop: 10 }}
              onClick={async () => {
                const { game: updated } = await api.reopenGame(game.id);
                onChanged(updated);
                onClose();
              }}
            >
              Reopen the round
            </button>
          )
        )}

        <button className="btn ghost block" onClick={() => navigate('/')}>Back to home</button>
      </div>
    </Sheet>
  );
}
