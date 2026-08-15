import crypto from 'node:crypto';
import { db, all, get, run, now } from './db.js';
import { CLUBS, buildHoles, totalPar } from './sa-courses.js';
import { hashPassword } from './auth.js';
import { playingHandicap, ALLOWANCES, activeHoles } from './scoring.js';
import { addDays, quote, splitShares, today } from './teetimes.js';

const id = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/* ------------------------------------------------------------------ */
/* Clubs and courses                                                   */
/* ------------------------------------------------------------------ */

export function seedClubs() {
  for (const club of CLUBS) {
    run(
      `INSERT INTO clubs (id, name, slug, city, province, country, blurb, phone, email, website, brand_color, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'South Africa', ?, ?, ?, ?, ?, 'active', ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, city = excluded.city, province = excluded.province,
         blurb = excluded.blurb, phone = excluded.phone, website = excluded.website,
         brand_color = excluded.brand_color`,
      club.id, club.name, club.slug, club.city, club.province, club.blurb,
      club.phone, club.email, club.website, club.brandColor, now(),
    );

    for (const course of club.courses) {
      const holes = buildHoles(course.id, course.pars);
      run(
        `INSERT INTO courses (id, name, location, country, tee, par, rating, slope, holes_json, club_id,
           interval_minutes, first_tee, last_tee, slot_capacity, weekday_fee_cents, weekend_fee_cents,
           cart_fee_cents, booking_window_days, bookable, cancellation_hours)
         VALUES (?, ?, ?, 'South Africa', ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, ?, ?, ?, 60, 1, 24)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, location = excluded.location, tee = excluded.tee,
           par = excluded.par, rating = excluded.rating, slope = excluded.slope,
           holes_json = excluded.holes_json, club_id = excluded.club_id,
           interval_minutes = excluded.interval_minutes, first_tee = excluded.first_tee,
           last_tee = excluded.last_tee, weekday_fee_cents = excluded.weekday_fee_cents,
           weekend_fee_cents = excluded.weekend_fee_cents, cart_fee_cents = excluded.cart_fee_cents`,
        course.id, course.name, `${club.city}, ${club.province}`, course.tee,
        totalPar(holes), course.rating, course.slope, JSON.stringify(holes), club.id,
        course.interval, course.firstTee, course.lastTee,
        course.weekday, course.weekend, course.cart,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

const GOLFERS = [
  { name: 'Keagan Langford', email: 'demo@cutline.co.za', hcp: 12.4, club: 'Steenberg Golf Club', color: '#1D3B2E' },
  { name: 'Marcus Reid', email: 'marcus@cutline.co.za', hcp: 4.8, club: 'Royal Johannesburg & Kensington', color: '#C2A76A' },
  { name: 'Priya Naidoo', email: 'priya@cutline.co.za', hcp: 18.2, club: 'Durban Country Club', color: '#BE3A2B' },
  { name: 'Tom Bekker', email: 'tom@cutline.co.za', hcp: 9.1, club: 'De Zalze Golf Club', color: '#4A574F' },
  { name: 'Sara Whitfield', email: 'sara@cutline.co.za', hcp: 22.6, club: 'Humewood Golf Club', color: '#7C8E84' },
  { name: 'Danny Okafor', email: 'danny@cutline.co.za', hcp: 6.3, club: 'Glendower Golf Club', color: '#C2A76A' },
  { name: 'Nomsa Dlamini', email: 'nomsa@cutline.co.za', hcp: 14.7, club: 'Zimbali Country Club', color: '#163025' },
  { name: 'Jaco van Wyk', email: 'jaco@cutline.co.za', hcp: 7.9, club: 'Arabella Golf Club', color: '#4A574F' },
];

const STAFF = [
  { name: 'Steenberg Pro Shop', email: 'proshop@steenberg.example', clubId: 'clb_steenberg' },
  { name: 'Fancourt Golf Office', email: 'golf@fancourt.example', clubId: 'clb_fancourt' },
];

function upsertUser({ name, email, hcp = 18, club = null, color = '#1D3B2E' }) {
  const existing = get('SELECT * FROM users WHERE email = ?', email);
  if (existing) return existing;
  const userId = id('usr');
  run(
    `INSERT INTO users (id, name, email, password_hash, handicap_index, home_club, avatar_color, bio, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, name, email, hashPassword('golf1234'), hcp, club, color,
    'Weekend golfer. Chasing that one good shot.', now(),
  );
  return get('SELECT * FROM users WHERE id = ?', userId);
}

function seedPeople() {
  const golfers = GOLFERS.map(upsertUser);
  for (const member of STAFF) {
    const user = upsertUser({ name: member.name, email: member.email, hcp: 15, club: null, color: '#1D3B2E' });
    run(
      'INSERT OR IGNORE INTO club_admins (club_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
      member.clubId, user.id, 'owner', now(),
    );
  }
  return golfers;
}

/** One club left pending so the approval screen has something to act on. */
function seedPendingClub(owner) {
  if (get("SELECT id FROM clubs WHERE status = 'pending'")) return;
  const clubId = id('clb');
  run(
    `INSERT INTO clubs (id, name, slug, city, province, country, blurb, phone, email, website, brand_color, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'South Africa', ?, ?, ?, NULL, '#1D3B2E', 'pending', ?)`,
    clubId, 'Bloemfontein Golf Club', 'bloemfontein-golf-club', 'Bloemfontein', 'Free State',
    'Free State parkland, applying to join Cutline.', '051 522 3311', 'proshop@bloemgolf.example', ago(90),
  );
  run('INSERT INTO club_admins (club_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', clubId, owner.id, 'owner', now());

  const holes = buildHoles('bloemfontein', [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]);
  run(
    `INSERT INTO courses (id, name, location, country, tee, par, rating, slope, holes_json, club_id,
       interval_minutes, first_tee, last_tee, slot_capacity, weekday_fee_cents, weekend_fee_cents,
       cart_fee_cents, booking_window_days, bookable, cancellation_hours)
     VALUES (?, 'Bloemfontein', 'Bloemfontein, Free State', 'South Africa', 'White', ?, 71.4, 126, ?, ?, 10, '06:30', '16:00', 4, 45000, 60000, 30000, 60, 1, 24)`,
    id('crs'), totalPar(holes), JSON.stringify(holes), clubId,
  );
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => `CL-${Array.from({ length: 6 }, () => pick([...REF_ALPHABET])).join('')}`;

/**
 * Two weeks either side of today across a handful of clubs, in a spread of
 * payment states, so the admin console has real numbers to report on.
 */
function seedBookings(golfers) {
  if (get('SELECT COUNT(*) AS n FROM bookings').n > 0) return;

  const courses = all(
    `SELECT c.* FROM courses c JOIN clubs cl ON cl.id = c.club_id
     WHERE cl.status = 'active' AND c.club_id IN ('clb_steenberg','clb_fancourt','clb_dezalze','clb_royaljhb','clb_durbancc')`,
  );

  for (let dayOffset = -12; dayOffset <= 14; dayOffset += 1) {
    const date = addDays(today(), dayOffset);
    const past = dayOffset < 0;
    const groups = 1 + Math.floor(Math.random() * 3);

    for (let g = 0; g < groups; g += 1) {
      const course = pick(courses);
      const organiser = pick(golfers);
      const players = 1 + Math.floor(Math.random() * 4);
      const hour = 7 + Math.floor(Math.random() * 8);
      const minute = pick([0, 10, 20, 30, 40, 50]);
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const cart = Math.random() > 0.65;

      if (get('SELECT id FROM bookings WHERE course_id = ? AND date = ? AND time = ?', course.id, date, time)) continue;

      const pricing = quote(course, date, players, cart);
      const roll = Math.random();
      let status = 'confirmed';
      let paid = 0;
      let lateCancel = 0;

      if (past) {
        if (roll > 0.9) status = 'no_show';
        else if (roll > 0.82) { status = 'cancelled'; lateCancel = 1; }
        else status = 'played';
        paid = status === 'played' ? pricing.totalCents : (status === 'no_show' ? 0 : pricing.totalCents);
      } else if (roll > 0.62) {
        paid = pricing.totalCents;
      } else if (roll > 0.4) {
        paid = splitShares(pricing.totalCents, players)[0];
      }

      const bookingId = id('bkg');
      const stamp = ago(Math.abs(dayOffset) * 1440 + 120);
      run(
        `INSERT INTO bookings (id, ref, club_id, course_id, user_id, date, time, players, guest_names,
           status, fee_cents, paid_cents, payment_status, cart, notes, source, cancellation_hours,
           created_at, updated_at, cancelled_at, late_cancel, checked_in_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, NULL, 'app', 24, ?, ?, ?, ?, ?)`,
        bookingId, newRef(), course.club_id, course.id, organiser.id, date, time, players,
        status, pricing.totalCents, paid,
        paid === 0 ? 'unpaid' : paid >= pricing.totalCents ? 'paid' : 'part_paid',
        cart ? 1 : 0, stamp, stamp,
        status === 'cancelled' ? stamp : null, lateCancel,
        ['played', 'checked_in'].includes(status) ? stamp : null,
      );

      const partners = golfers.filter((p) => p.id !== organiser.id).slice(0, players - 1);
      let remaining = paid;
      pricing.shares.forEach((share, i) => {
        const settled = Math.min(share, remaining);
        remaining -= settled;
        const partner = partners[i - 1];
        run(
          `INSERT INTO booking_players (id, booking_id, user_id, name, share_cents, paid_cents, is_organiser, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          id('bpl'), bookingId,
          i === 0 ? organiser.id : partner?.id ?? null,
          i === 0 ? organiser.name : partner?.name ?? `Guest ${i + 1}`,
          share, settled, i === 0 ? 1 : 0, stamp,
        );
      });

      if (paid > 0) {
        run(
          `INSERT INTO booking_payments (id, booking_id, player_id, user_id, amount_cents, method, status, note, created_at)
           VALUES (?, ?, NULL, ?, ?, ?, 'settled', 'Seeded payment', ?)`,
          id('pay'), bookingId, organiser.id, paid, pick(['card', 'eft', 'pro_shop']), stamp,
        );
      }

      run(
        `INSERT OR IGNORE INTO club_customers (club_id, user_id, notes, tags, marketing_opt_in, first_seen, updated_at)
         VALUES (?, ?, NULL, NULL, ?, ?, ?)`,
        course.club_id, organiser.id, Math.random() > 0.5 ? 1 : 0, stamp, stamp,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Rounds (the scoring side, unchanged in spirit)                      */
/* ------------------------------------------------------------------ */

function simulateStrokes(hole) {
  const spread = Math.random();
  const over = spread > 0.93 ? -1 : spread > 0.55 ? 0 : spread > 0.22 ? 1 : 2;
  return Math.max(1, hole.par + over);
}

function createGame({ name, courseId, format, scoring, players, status, holesPlayed, createdBy, createdAt }) {
  const course = get('SELECT * FROM courses WHERE id = ?', courseId);
  const gid = id('gme');
  run(
    `INSERT INTO games (id, code, name, course_id, format, scoring, hole_count, start_hole, status, stake, created_by, created_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, 18, 1, ?, NULL, ?, ?, ?)`,
    gid, code(), name, courseId, format, scoring, status, createdBy, createdAt,
    status === 'finished' ? createdAt : null,
  );

  const holes = activeHoles(course, 18, 1);
  const created = [];
  players.forEach((u, i) => {
    const ph = playingHandicap(u.handicap_index, course, 18, ALLOWANCES[format] ?? 1);
    const pid = id('ply');
    run(
      `INSERT INTO game_players (id, game_id, user_id, display_name, avatar_color, handicap_index, playing_handicap, team, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      pid, gid, u.id, u.name, u.avatar_color, u.handicap_index, ph,
      ['fourball', 'scramble'].includes(format) ? (i % 2 === 0 ? 'A' : 'B') : null,
      createdAt,
    );
    created.push({ id: pid });
  });

  for (const p of created) {
    for (const hole of holes.slice(0, holesPlayed)) {
      run(
        'INSERT INTO scores (game_id, player_id, hole, strokes, putts, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        gid, p.id, hole.hole, simulateStrokes(hole), 1 + Math.round(Math.random() * 1.6), createdAt,
      );
    }
  }
  return gid;
}

function seedGames(users) {
  if (get('SELECT COUNT(*) AS n FROM games').n > 0) return;
  const [keagan, marcus, priya, tom, sara, danny] = users;

  const live = createGame({
    name: 'Saturday Medal', courseId: 'crs_steenberg', format: 'stableford', scoring: 'net',
    players: [keagan, marcus, priya, tom], status: 'live', holesPlayed: 11,
    createdBy: keagan.id, createdAt: ago(150),
  });

  const finished = createGame({
    name: 'Sunday Fourball', courseId: 'crs_fancourt_montagu', format: 'fourball', scoring: 'net',
    players: [keagan, danny, sara, marcus], status: 'finished', holesPlayed: 18,
    createdBy: marcus.id, createdAt: ago(60 * 26),
  });

  createGame({
    name: 'Skins at Leopard Creek', courseId: 'crs_leopard_creek', format: 'skins', scoring: 'net',
    players: [keagan, tom, danny], status: 'finished', holesPlayed: 18,
    createdBy: tom.id, createdAt: ago(60 * 24 * 6),
  });

  const posts = [
    [finished, marcus.id, 'Danny holed out from 140 on 14. Absolute filth. ðŸ¦', ago(60 * 25)],
    [finished, sara.id, 'First time under 100 net. Drinks at the turn next week.', ago(60 * 24)],
    [live, priya.id, 'Wind coming off False Bay on the back nine, hang onto your hats.', ago(45)],
  ];
  for (const [gameId, userId, body, createdAt] of posts) {
    run(
      'INSERT INTO posts (id, game_id, user_id, kind, body, meta_json, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
      id('pst'), gameId, userId, 'text', body, createdAt,
    );
  }
}

/* ------------------------------------------------------------------ */

export function seed() {
  seedClubs();
  const golfers = seedPeople();
  seedPendingClub(golfers[0]);
  seedBookings(golfers);
  seedGames(golfers);

  return {
    clubs: get('SELECT COUNT(*) AS n FROM clubs').n,
    courses: get('SELECT COUNT(*) AS n FROM courses').n,
    users: get('SELECT COUNT(*) AS n FROM users').n,
    bookings: get('SELECT COUNT(*) AS n FROM bookings').n,
    games: get('SELECT COUNT(*) AS n FROM games').n,
  };
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  console.log('Seeded:', seed());
  db.close();
}
