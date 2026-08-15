import { Router } from 'express';
import { all, get } from '../db.js';
import { requireAuth, publicUser } from '../auth.js';
import { buildLeaderboard } from '../scoring.js';

const router = Router();

/** Player search used when building a game roster. */
router.get('/', requireAuth, (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = all(
    `SELECT * FROM users WHERE (name LIKE ? OR email LIKE ?) AND id != ? ORDER BY name LIMIT 20`,
    q, q, req.user.id,
  );
  res.json({ users: rows.map(publicUser) });
});

function roundsFor(userId) {
  const games = all(
    `SELECT g.* FROM games g
     JOIN game_players p ON p.game_id = g.id
     WHERE p.user_id = ? AND g.status = 'finished'
     ORDER BY g.created_at DESC`,
    userId,
  );

  return games.map((game) => {
    const course = get('SELECT * FROM courses WHERE id = ?', game.course_id);
    const players = all('SELECT * FROM game_players WHERE game_id = ?', game.id);
    const scores = all('SELECT * FROM scores WHERE game_id = ?', game.id);
    const board = buildLeaderboard(game, course, players, scores);
    const me = board.players.find((p) => p.userId === userId);
    const row = board.rows.find((r) => r.userId === userId || r.playerId === `team-${me?.team}`);
    return {
      gameId: game.id,
      name: game.name,
      format: game.format,
      courseName: course.name,
      courseLocation: course.location,
      playedAt: game.finished_at || game.created_at,
      thru: me?.thru ?? 0,
      gross: me?.gross ?? 0,
      net: me?.net ?? 0,
      points: me?.points ?? 0,
      putts: me?.putts ?? 0,
      toPar: me?.toPar ?? 0,
      counts: me?.counts ?? {},
      position: row?.position ?? null,
      fieldSize: board.rows.length,
    };
  });
}

function statsFor(userId) {
  const rounds = roundsFor(userId).filter((r) => r.thru >= 9);
  const complete = rounds.filter((r) => r.thru >= 18);
  const sum = (key) => rounds.reduce((s, r) => s + (r[key] || 0), 0);
  const countTotal = (key) => rounds.reduce((s, r) => s + (r.counts?.[key] || 0), 0);
  const holes = sum('thru');

  return {
    rounds: rounds.length,
    holes,
    wins: rounds.filter((r) => r.position === 1).length,
    podiums: rounds.filter((r) => r.position && r.position <= 3).length,
    bestGross: complete.length ? Math.min(...complete.map((r) => r.gross)) : null,
    bestPoints: rounds.length ? Math.max(...rounds.map((r) => r.points)) : null,
    avgGross: complete.length ? +(complete.reduce((s, r) => s + r.gross, 0) / complete.length).toFixed(1) : null,
    avgPoints: rounds.length ? +(sum('points') / rounds.length).toFixed(1) : null,
    avgPutts: holes ? +((sum('putts') / holes) * 18).toFixed(1) : null,
    eagles: countTotal('eagle') + countTotal('albatross') + countTotal('ace'),
    birdies: countTotal('birdie'),
    pars: countTotal('par'),
    bogeys: countTotal('bogey'),
    scoringSplit: {
      eagle: countTotal('eagle') + countTotal('albatross') + countTotal('ace'),
      birdie: countTotal('birdie'),
      par: countTotal('par'),
      bogey: countTotal('bogey'),
      double: countTotal('double'),
      worse: countTotal('worse'),
    },
    trend: rounds.slice(0, 10).reverse().map((r) => ({ at: r.playedAt, points: r.points, toPar: r.toPar })),
  };
}

router.get('/:id', requireAuth, (req, res) => {
  const id = req.params.id === 'me' ? req.user.id : req.params.id;
  const user = get('SELECT * FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'Player not found' });
  res.json({ user: publicUser(user), stats: statsFor(id), rounds: roundsFor(id).slice(0, 20) });
});

export default router;
