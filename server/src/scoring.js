/**
 * Scoring engine.
 *
 * Everything the app knows about handicaps, points, matches and skins lives here
 * so the routes stay thin and the same maths can be unit-tested in isolation.
 */

export const FORMATS = {
  stroke: { label: 'Stroke Play', team: false, blurb: 'Lowest total score wins.' },
  stableford: { label: 'Stableford', team: false, blurb: 'Points per hole — highest wins.' },
  match: { label: 'Match Play', team: false, blurb: 'Head to head, hole by hole.' },
  fourball: { label: 'Fourball', team: true, blurb: 'Best ball of each pair.' },
  scramble: { label: 'Scramble', team: true, blurb: 'One ball per team, best shot.' },
  skins: { label: 'Skins', team: false, blurb: 'Win the hole outright, or it carries.' },
};

export const isTeamFormat = (format) => Boolean(FORMATS[format]?.team);

/* ------------------------------------------------------------------ */
/* Handicapping                                                        */
/* ------------------------------------------------------------------ */

/**
 * Course/playing handicap: HI x (Slope / 113) + (Rating - Par), halved for 9 holes.
 * `allowance` covers the usual format multipliers (e.g. 90% for fourball).
 */
export function playingHandicap(handicapIndex, course, holeCount = 18, allowance = 1) {
  const courseHandicap =
    handicapIndex * (course.slope / 113) + (course.rating - course.par);
  const scaled = holeCount === 18 ? courseHandicap : courseHandicap / 2;
  return Math.round(scaled * allowance);
}

export const ALLOWANCES = {
  stroke: 1,
  stableford: 0.95,
  match: 1,
  fourball: 0.9,
  scramble: 1,
  skins: 1,
};

/** The holes actually being played (front 9 / back 9 / full 18). */
export function activeHoles(course, holeCount = 18, startHole = 1) {
  const holes = JSON.parse(course.holes_json);
  if (holeCount >= 18) return holes;
  return startHole >= 10 ? holes.slice(9, 18) : holes.slice(0, 9);
}

/**
 * Strokes a player receives on a given hole.
 * Holes are ranked by stroke index within the set actually being played, so a
 * back-nine round allocates shots correctly. Plus handicaps give shots back
 * starting from the easiest hole.
 */
export function strokesOnHole(ph, hole, holes) {
  const ranked = [...holes].sort((a, b) => a.si - b.si);
  const rank = ranked.findIndex((h) => h.hole === hole.hole) + 1;
  const n = holes.length;
  if (rank === 0 || n === 0) return 0;

  if (ph >= 0) {
    return Math.floor(ph / n) + (rank <= ph % n ? 1 : 0);
  }
  const abs = -ph;
  const reverseRank = n - rank + 1;
  return -(Math.floor(abs / n) + (reverseRank <= abs % n ? 1 : 0));
}

/** Stableford: 2 points for a net par, +1 per shot better, 0 for double or worse. */
export function stablefordPoints(par, netStrokes) {
  if (netStrokes == null) return 0;
  return Math.max(0, par - netStrokes + 2);
}

export function scoreLabel(strokes, par) {
  if (strokes == null) return null;
  const diff = strokes - par;
  if (strokes === 1) return 'ace';
  if (diff <= -3) return 'albatross';
  if (diff === -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  if (diff === 2) return 'double';
  return 'worse';
}

/* ------------------------------------------------------------------ */
/* Card building                                                       */
/* ------------------------------------------------------------------ */

/**
 * Per-hole card for one player: gross, net, points and stroke dots.
 */
export function buildCard(player, holes, scoreMap) {
  return holes.map((hole) => {
    const raw = scoreMap.get(`${player.id}:${hole.hole}`);
    const strokes = raw?.strokes ?? null;
    const shots = strokesOnHole(player.playing_handicap, hole, holes);
    const net = strokes == null ? null : strokes - shots;
    return {
      hole: hole.hole,
      par: hole.par,
      si: hole.si,
      metres: hole.metres,
      strokes,
      putts: raw?.putts ?? null,
      shots,
      net,
      points: strokes == null ? null : stablefordPoints(hole.par, net),
      label: scoreLabel(strokes, hole.par),
    };
  });
}

function totals(card) {
  const played = card.filter((h) => h.strokes != null);
  return {
    thru: played.length,
    lastHole: played.length ? played[played.length - 1].hole : null,
    gross: played.reduce((s, h) => s + h.strokes, 0),
    net: played.reduce((s, h) => s + h.net, 0),
    points: played.reduce((s, h) => s + h.points, 0),
    putts: played.reduce((s, h) => s + (h.putts || 0), 0),
    parOfPlayed: played.reduce((s, h) => s + h.par, 0),
  };
}

function tally(card) {
  const counts = { ace: 0, albatross: 0, eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, worse: 0 };
  for (const h of card) if (h.label) counts[h.label] += 1;
  return counts;
}

/* ------------------------------------------------------------------ */
/* Leaderboards                                                        */
/* ------------------------------------------------------------------ */

function rank(rows, compare) {
  const sorted = [...rows].sort(compare);
  let lastKey = null;
  let lastPos = 0;
  return sorted.map((row, i) => {
    const key = JSON.stringify([row.total, row.thru === 0]);
    const position = key === lastKey ? lastPos : i + 1;
    lastKey = key;
    lastPos = position;
    return { ...row, position, tied: false };
  }).map((row, _i, arr) => ({
    ...row,
    tied: arr.filter((r) => r.position === row.position).length > 1,
  }));
}

/** Skins: lowest net on a hole wins it; ties carry the skin forward. */
export function computeSkins(players, cards, holes) {
  const results = [];
  let carry = 0;
  for (const hole of holes) {
    const entries = players
      .map((p) => ({ player: p, cell: cards.get(p.id).find((c) => c.hole === hole.hole) }))
      .filter((e) => e.cell?.strokes != null);

    if (entries.length < 2) {
      results.push({ hole: hole.hole, winner: null, value: 0, carry, played: false });
      continue;
    }
    const best = Math.min(...entries.map((e) => e.cell.net));
    const winners = entries.filter((e) => e.cell.net === best);
    if (winners.length === 1) {
      const value = 1 + carry;
      results.push({
        hole: hole.hole,
        winner: { id: winners[0].player.id, name: winners[0].player.display_name },
        value,
        carry: 0,
        played: true,
      });
      carry = 0;
    } else {
      carry += 1;
      results.push({ hole: hole.hole, winner: null, value: 0, carry, played: true });
    }
  }
  const byPlayer = new Map(players.map((p) => [p.id, 0]));
  for (const r of results) if (r.winner) byPlayer.set(r.winner.id, byPlayer.get(r.winner.id) + r.value);
  return { holes: results, carry, totals: Object.fromEntries(byPlayer) };
}

/** Match play between two sides (players or teams). */
export function computeMatch(sideA, sideB, holes) {
  let diff = 0; // positive = side A up
  const holeResults = [];
  let played = 0;

  for (const hole of holes) {
    const a = Math.min(...sideA.cards.map((c) => c.find((x) => x.hole === hole.hole)?.net ?? Infinity));
    const b = Math.min(...sideB.cards.map((c) => c.find((x) => x.hole === hole.hole)?.net ?? Infinity));
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      holeResults.push({ hole: hole.hole, result: null });
      continue;
    }
    played += 1;
    if (a < b) diff += 1;
    else if (b < a) diff -= 1;
    holeResults.push({ hole: hole.hole, result: a < b ? 'A' : b < a ? 'B' : 'halved', diff });
  }

  const remaining = holes.length - played;
  const leader = diff === 0 ? null : diff > 0 ? sideA : sideB;
  const margin = Math.abs(diff);
  const closed = margin > remaining && remaining >= 0 && played > 0;

  let statusText = 'All square';
  if (margin > 0) statusText = `${leader.name} ${margin} up`;
  if (closed) {
    statusText = remaining === 0
      ? `${leader.name} won ${margin} up`
      : `${leader.name} won ${margin}&${remaining}`;
  }
  if (played === holes.length && margin === 0) statusText = 'Match halved';

  return {
    diff,
    margin,
    remaining,
    closed,
    statusText,
    leaderId: leader?.id ?? null,
    holes: holeResults,
    sides: [
      { id: sideA.id, name: sideA.name, players: sideA.players },
      { id: sideB.id, name: sideB.name, players: sideB.players },
    ],
  };
}

/**
 * The one entry point routes use: turns a game + players + scores into
 * everything the UI needs to render a live leaderboard.
 */
export function buildLeaderboard(game, course, players, scoreRows) {
  const holes = activeHoles(course, game.hole_count, game.start_hole);
  const scoreMap = new Map(scoreRows.map((s) => [`${s.player_id}:${s.hole}`, s]));
  const cards = new Map(players.map((p) => [p.id, buildCard(p, holes, scoreMap)]));
  const coursePar = holes.reduce((s, h) => s + h.par, 0);

  const base = players.map((p) => {
    const card = cards.get(p.id);
    const t = totals(card);
    return {
      playerId: p.id,
      userId: p.user_id,
      name: p.display_name,
      avatarColor: p.avatar_color,
      handicapIndex: p.handicap_index,
      playingHandicap: p.playing_handicap,
      team: p.team,
      card,
      counts: tally(card),
      ...t,
      toPar: t.gross - t.parOfPlayed,
      netToPar: t.net - t.parOfPlayed,
    };
  });

  const useNet = game.scoring !== 'gross';
  const teamNames = [...new Set(players.map((p) => p.team).filter(Boolean))].sort();

  const result = {
    gameId: game.id,
    format: game.format,
    scoring: game.scoring,
    coursePar,
    holes,
    players: base,
    rows: [],
    teams: [],
    match: null,
    skins: null,
  };

  /* --- team aggregation for fourball / scramble --- */
  if (isTeamFormat(game.format)) {
    result.teams = teamNames.map((team) => {
      const members = base.filter((p) => p.team === team);
      const perHole = holes.map((hole) => {
        const cells = members
          .map((m) => m.card.find((c) => c.hole === hole.hole))
          .filter((c) => c.strokes != null);
        if (!cells.length) return { hole: hole.hole, par: hole.par, gross: null, net: null, points: null };
        const bestNet = Math.min(...cells.map((c) => c.net));
        const best = cells.find((c) => c.net === bestNet);
        return {
          hole: hole.hole,
          par: hole.par,
          gross: best.strokes,
          net: best.net,
          points: stablefordPoints(hole.par, bestNet),
          label: best.label,
        };
      });
      const done = perHole.filter((h) => h.net != null);
      return {
        team,
        name: `Team ${team}`,
        players: members.map((m) => ({ id: m.playerId, name: m.name, avatarColor: m.avatarColor })),
        card: perHole,
        thru: done.length,
        gross: done.reduce((s, h) => s + h.gross, 0),
        net: done.reduce((s, h) => s + h.net, 0),
        points: done.reduce((s, h) => s + h.points, 0),
        parOfPlayed: done.reduce((s, h) => s + h.par, 0),
      };
    }).map((t) => ({ ...t, toPar: t.gross - t.parOfPlayed, netToPar: t.net - t.parOfPlayed }));
  }

  /* --- ordering per format --- */
  const lower = (a, b) => (a.thru === 0) - (b.thru === 0) || a.total - b.total || b.thru - a.thru;
  const higher = (a, b) => (a.thru === 0) - (b.thru === 0) || b.total - a.total || b.thru - a.thru;

  if (game.format === 'stableford') {
    result.rows = rank(base.map((p) => ({ ...p, total: p.points, display: `${p.points}`, unit: 'pts' })), higher);
  } else if (game.format === 'skins') {
    const skins = computeSkins(players, cards, holes);
    result.skins = skins;
    result.rows = rank(
      base.map((p) => ({ ...p, total: skins.totals[p.playerId] || 0, display: `${skins.totals[p.playerId] || 0}`, unit: 'skins' })),
      higher,
    );
  } else if (game.format === 'fourball' || game.format === 'scramble') {
    const key = game.format === 'fourball' ? 'points' : useNet ? 'net' : 'gross';
    const compare = game.format === 'fourball' ? higher : lower;
    result.rows = rank(
      result.teams.map((t) => ({
        ...t,
        playerId: `team-${t.team}`,
        total: t[key],
        display: game.format === 'fourball' ? `${t.points}` : `${t[key]}`,
        unit: game.format === 'fourball' ? 'pts' : 'shots',
      })),
      compare,
    );
    if (result.teams.length === 2) {
      result.match = computeMatch(
        {
          id: result.teams[0].team,
          name: result.teams[0].name,
          players: result.teams[0].players,
          cards: result.teams[0].players.map((p) => cards.get(p.id)),
        },
        {
          id: result.teams[1].team,
          name: result.teams[1].name,
          players: result.teams[1].players,
          cards: result.teams[1].players.map((p) => cards.get(p.id)),
        },
        holes,
      );
    }
  } else if (game.format === 'match') {
    result.rows = rank(
      base.map((p) => ({ ...p, total: useNet ? p.net : p.gross, display: `${useNet ? p.net : p.gross}`, unit: 'shots' })),
      lower,
    );
    if (base.length === 2) {
      result.match = computeMatch(
        { id: base[0].playerId, name: base[0].name, players: [base[0]], cards: [cards.get(base[0].playerId)] },
        { id: base[1].playerId, name: base[1].name, players: [base[1]], cards: [cards.get(base[1].playerId)] },
        holes,
      );
    }
  } else {
    result.rows = rank(
      base.map((p) => ({ ...p, total: useNet ? p.net : p.gross, display: `${useNet ? p.net : p.gross}`, unit: 'shots' })),
      lower,
    );
  }

  return result;
}
