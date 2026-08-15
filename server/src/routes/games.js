import { Router } from 'express';
import crypto from 'node:crypto';
import { all, get, run, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { broadcast } from '../realtime.js';
import { FORMATS, activeHoles, buildLeaderboard, scoreLabel } from '../scoring.js';
import { addRoundPlayer, createRound } from '../rounds.js';

const router = Router();

const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;

function loadGame(gameId) {
  const game = get('SELECT * FROM games WHERE id = ?', gameId);
  if (!game) return null;
  const course = get('SELECT * FROM courses WHERE id = ?', game.course_id);
  const players = all(
    `SELECT p.*, u.avatar_url FROM game_players p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.game_id = ? ORDER BY p.joined_at`,
    gameId,
  );
  const scores = all('SELECT * FROM scores WHERE game_id = ?', gameId);
  return { game, course, players, scores };
}

const courseView = (c) => ({
  id: c.id, name: c.name, location: c.location, country: c.country, tee: c.tee,
  par: c.par, rating: c.rating, slope: c.slope, holes: JSON.parse(c.holes_json),
});

function gameView(gameId) {
  const data = loadGame(gameId);
  if (!data) return null;
  const leaderboard = buildLeaderboard(data.game, data.course, data.players, data.scores);
  return {
    id: data.game.id,
    code: data.game.code,
    name: data.game.name,
    format: data.game.format,
    formatLabel: FORMATS[data.game.format]?.label ?? data.game.format,
    scoring: data.game.scoring,
    holeCount: data.game.hole_count,
    startHole: data.game.start_hole,
    status: data.game.status,
    stake: data.game.stake,
    createdBy: data.game.created_by,
    createdAt: data.game.created_at,
    finishedAt: data.game.finished_at,
    course: courseView(data.course),
    holes: activeHoles(data.course, data.game.hole_count, data.game.start_hole),
    players: data.players.map((p) => ({
      id: p.id,
      userId: p.user_id,
      name: p.display_name,
      avatarColor: p.avatar_color,
      avatarUrl: p.avatar_url ?? null,
      handicapIndex: p.handicap_index,
      playingHandicap: p.playing_handicap,
      team: p.team,
    })),
    leaderboard,
  };
}

/* ------------------------------------------------------------------ */
/* Listing                                                             */
/* ------------------------------------------------------------------ */

router.get('/', requireAuth, (req, res) => {
  const rows = all(
    `SELECT g.* FROM games g
     JOIN game_players p ON p.game_id = g.id
     WHERE p.user_id = ?
     GROUP BY g.id
     ORDER BY CASE g.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
              g.created_at DESC`,
    req.user.id,
  );
  res.json({
    games: rows.map((g) => {
      const view = gameView(g.id);
      const mine = view.leaderboard.players.find((p) => p.userId === req.user.id);
      // Team formats rank teams, so fall back to the row holding my team.
      const myRow = view.leaderboard.rows.find((r) => r.userId === req.user.id)
        ?? (mine ? view.leaderboard.rows.find((r) => r.playerId === `team-${mine.team}`) : undefined);
      return {
        ...view,
        leaderboard: undefined,
        top: view.leaderboard.rows.slice(0, 3).map((r) => ({
          name: r.name, display: r.display, unit: r.unit, position: r.position, avatarColor: r.avatarColor,
        })),
        me: myRow
          ? { thru: myRow.thru, display: myRow.display, unit: myRow.unit, position: myRow.position }
          : mine && { thru: mine.thru, display: `${mine.points}`, unit: 'pts', position: null },
        thru: Math.max(0, ...view.leaderboard.players.map((p) => p.thru)),
      };
    }),
  });
});

/* ------------------------------------------------------------------ */
/* Create / join                                                       */
/* ------------------------------------------------------------------ */

router.post('/', requireAuth, (req, res) => {
  const {
    name, courseId, format = 'stableford', scoring = 'net',
    holeCount = 18, startHole = 1, stake = null, players = [],
  } = req.body || {};

  const course = get('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return res.status(400).json({ error: 'Pick a course to play' });
  if (!FORMATS[format]) return res.status(400).json({ error: 'Unknown game format' });

  const roster = [
    { userId: req.user.id, team: players.find((p) => p.userId === req.user.id)?.team },
    ...players.filter((p) => p.userId !== req.user.id),
  ];
  const gameId = createRound({
    courseId: course.id, name, format, scoring, holeCount, startHole,
    stake, status: 'live', createdBy: req.user.id, players: roster,
  });

  res.status(201).json({ game: gameView(gameId) });
});

router.post('/join', requireAuth, (req, res) => {
  const game = get('SELECT * FROM games WHERE code = ?', String(req.body?.code || '').trim().toUpperCase());
  if (!game) return res.status(404).json({ error: 'No game with that code' });
  if (game.status === 'finished') return res.status(400).json({ error: 'That game has already finished' });

  const course = get('SELECT * FROM courses WHERE id = ?', game.course_id);
  const count = all('SELECT id FROM game_players WHERE game_id = ?', game.id).length;
  addRoundPlayer(game.id, course, game.format, game.hole_count, { userId: req.user.id }, count);

  const view = gameView(game.id);
  broadcast(game.id, 'players', view.players);
  res.json({ game: view });
});

router.get('/:id', requireAuth, (req, res) => {
  const view = gameView(req.params.id);
  if (!view) return res.status(404).json({ error: 'Game not found' });
  res.json({ game: view });
});

router.post('/:id/players', requireAuth, (req, res) => {
  const game = get('SELECT * FROM games WHERE id = ?', req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const course = get('SELECT * FROM courses WHERE id = ?', game.course_id);
  const count = all('SELECT id FROM game_players WHERE game_id = ?', game.id).length;
  const playerId = addRoundPlayer(game.id, course, game.format, game.hole_count, req.body || {}, count);
  if (!playerId) return res.status(409).json({ error: 'That player is already in the game' });

  const view = gameView(game.id);
  broadcast(game.id, 'players', view.players);
  res.status(201).json({ game: view });
});

router.delete('/:id/players/:playerId', requireAuth, (req, res) => {
  const game = get('SELECT * FROM games WHERE id = ?', req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.created_by !== req.user.id) return res.status(403).json({ error: 'Only the host can remove players' });
  run('DELETE FROM game_players WHERE id = ? AND game_id = ?', req.params.playerId, game.id);
  const view = gameView(game.id);
  broadcast(game.id, 'players', view.players);
  res.json({ game: view });
});

router.patch('/:id/players/:playerId', requireAuth, (req, res) => {
  const game = get('SELECT * FROM games WHERE id = ?', req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const course = get('SELECT * FROM courses WHERE id = ?', game.course_id);
  const { team, handicapIndex } = req.body || {};

  if (handicapIndex !== undefined) {
    const ph = playingHandicap(Number(handicapIndex), course, game.hole_count, ALLOWANCES[game.format] ?? 1);
    run('UPDATE game_players SET handicap_index = ?, playing_handicap = ? WHERE id = ? AND game_id = ?',
      Number(handicapIndex), ph, req.params.playerId, game.id);
  }
  if (team !== undefined) {
    run('UPDATE game_players SET team = ? WHERE id = ? AND game_id = ?', team, req.params.playerId, game.id);
  }

  const view = gameView(game.id);
  broadcast(game.id, 'players', view.players);
  res.json({ game: view });
});

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

function saveScore(game, holes, { playerId, hole, strokes, putts }) {
  const holeInfo = holes.find((h) => h.hole === Number(hole));
  const player = get('SELECT * FROM game_players WHERE id = ? AND game_id = ?', playerId, game.id);
  if (!holeInfo || !player) return null;

  if (strokes == null) {
    run('DELETE FROM scores WHERE game_id = ? AND player_id = ? AND hole = ?', game.id, playerId, holeInfo.hole);
    return { player, holeInfo, strokes: null };
  }

  const value = Math.max(1, Math.min(20, Number(strokes)));
  run(
    `INSERT INTO scores (game_id, player_id, hole, strokes, putts, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(game_id, player_id, hole) DO UPDATE SET
       strokes = excluded.strokes, putts = excluded.putts, updated_at = excluded.updated_at`,
    game.id, playerId, holeInfo.hole, value, putts == null ? null : Number(putts), now(),
  );
  return { player, holeInfo, strokes: value };
}

/** Birdies and better get an automatic post in the game's book. */
function maybePostHighlight(game, player, holeInfo, strokes) {
  const label = scoreLabel(strokes, holeInfo.par);
  if (!['ace', 'albatross', 'eagle', 'birdie'].includes(label)) return;
  const wording = {
    ace: `${player.display_name} made a HOLE IN ONE on ${holeInfo.hole}! 🕳️⛳`,
    albatross: `${player.display_name} made an albatross on ${holeInfo.hole}. Unreal. 🦅`,
    eagle: `${player.display_name} eagled hole ${holeInfo.hole}. 🦅`,
    birdie: `${player.display_name} birdied hole ${holeInfo.hole}. 🐦`,
  }[label];

  const existing = get(
    `SELECT id FROM posts WHERE game_id = ? AND kind = 'event' AND meta_json = ?`,
    game.id, JSON.stringify({ playerId: player.id, hole: holeInfo.hole }),
  );
  if (existing) {
    run('UPDATE posts SET body = ? WHERE id = ?', wording, existing.id);
    return;
  }
  run(
    'INSERT INTO posts (id, game_id, user_id, kind, body, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uid('pst'), game.id, player.user_id, 'event', wording,
    JSON.stringify({ playerId: player.id, hole: holeInfo.hole }), now(),
  );
}

router.put('/:id/scores', requireAuth, (req, res) => {
  const game = get('SELECT * FROM games WHERE id = ?', req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'finished') return res.status(400).json({ error: 'This round is closed' });

  const course = get('SELECT * FROM courses WHERE id = ?', game.course_id);
  const holes = activeHoles(course, game.hole_count, game.start_hole);
  const entries = Array.isArray(req.body?.scores) ? req.body.scores : [req.body];

  for (const entry of entries) {
    const saved = saveScore(game, holes, entry || {});
    if (saved?.strokes != null) maybePostHighlight(game, saved.player, saved.holeInfo, saved.strokes);
  }

  // A round booked for a future tee time goes live the moment it is scored.
  if (game.status === 'scheduled') {
    run("UPDATE games SET status = 'live' WHERE id = ?", game.id);
  }

  const view = gameView(game.id);
  broadcast(game.id, 'leaderboard', view.leaderboard);
  res.json({ game: view });
});

router.get('/:id/leaderboard', requireAuth, (req, res) => {
  const view = gameView(req.params.id);
  if (!view) return res.status(404).json({ error: 'Game not found' });
  res.json({ leaderboard: view.leaderboard });
});

router.post('/:id/finish', requireAuth, (req, res) => {
  const game = get('SELECT * FROM games WHERE id = ?', req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.created_by !== req.user.id) return res.status(403).json({ error: 'Only the host can close the round' });

  run('UPDATE games SET status = ?, finished_at = ? WHERE id = ?', 'finished', now(), game.id);
  const view = gameView(game.id);
  const winner = view.leaderboard.rows[0];
  if (winner) {
    run(
      'INSERT INTO posts (id, game_id, user_id, kind, body, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('pst'), game.id, req.user.id, 'event',
      `Round finished at ${view.course.name} — ${winner.name} takes it with ${winner.display} ${winner.unit}.`,
      null, now(),
    );
  }
  broadcast(game.id, 'status', { status: 'finished' });
  res.json({ game: gameView(game.id) });
});

router.post('/:id/reopen', requireAuth, (req, res) => {
  const game = get('SELECT * FROM games WHERE id = ?', req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.created_by !== req.user.id) return res.status(403).json({ error: 'Only the host can reopen the round' });
  run('UPDATE games SET status = ?, finished_at = NULL WHERE id = ?', 'live', game.id);
  broadcast(game.id, 'status', { status: 'live' });
  res.json({ game: gameView(game.id) });
});

export { gameView };
export default router;
