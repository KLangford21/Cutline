/**
 * Round creation, shared by the two ways a round comes into being: booking a
 * tee time (the round is set up with the booking) and starting an ad-hoc round
 * from the app. Both must allocate handicaps and teams identically, so the
 * logic lives here rather than in either route.
 */

import crypto from 'node:crypto';
import { get, run, now } from './db.js';
import { ALLOWANCES, isTeamFormat, playingHandicap } from './scoring.js';

const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;

/** Short, unambiguous join code — no O/0 or I/1 confusion. */
export async function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (await get('SELECT id FROM games WHERE code = ?', code));
  return code;
}

/**
 * Adds one player to a round. `entry` may name a registered user by id or be a
 * guest with just a name and handicap.
 */
export async function addRoundPlayer(gameId, course, format, holeCount, entry, index) {
  const user = entry.userId ? await get('SELECT * FROM users WHERE id = ?', entry.userId) : null;
  if (entry.userId && !user) return null;
  if (user && await get('SELECT id FROM game_players WHERE game_id = ? AND user_id = ?', gameId, user.id)) return null;

  const handicapIndex = Number(entry.handicapIndex ?? user?.handicap_index ?? 18);
  const ph = playingHandicap(handicapIndex, course, holeCount, ALLOWANCES[format] ?? 1);
  const playerId = uid('ply');
  const team = isTeamFormat(format) ? (entry.team || (index % 2 === 0 ? 'A' : 'B')) : null;

  await run(
    `INSERT INTO game_players (id, game_id, user_id, display_name, avatar_color, handicap_index, playing_handicap, team, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    playerId, gameId, user?.id ?? null,
    user?.name ?? entry.name?.trim() ?? `Guest ${index + 1}`,
    user?.avatar_color ?? entry.avatarColor ?? '#7C8E84',
    handicapIndex, ph, team, now(),
  );
  return playerId;
}

/**
 * Creates a round and its field.
 *
 * `status` is 'live' for a round starting now, or 'scheduled' for one attached
 * to a future tee time — a scheduled round waits quietly until the first score
 * is entered rather than pretending to be in play.
 */
export async function createRound({
  courseId, name, format = 'stableford', scoring = 'net',
  holeCount = 18, startHole = 1, stake = null, status = 'live',
  createdBy, players = [], createdAt = now(),
}) {
  const course = await get('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return null;

  const holes = Number(holeCount) === 9 ? 9 : 18;
  const gameId = uid('gme');
  await run(
    `INSERT INTO games (id, code, name, course_id, format, scoring, hole_count, start_hole, status, stake, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    gameId, await newCode(), name?.trim() || `${course.name} round`, course.id, format, scoring,
    holes, Number(startHole) === 10 ? 10 : 1, status, stake, createdBy, createdAt,
  );

  // Sequential, not concurrent: addRoundPlayer checks whether the user is
  // already in the field, and that check has to see the preceding inserts.
  for (const [index, entry] of players.entries()) {
    await addRoundPlayer(gameId, course, format, holes, entry, index);
  }
  return gameId;
}
