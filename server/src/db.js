import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'cutline.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  handicap_index REAL NOT NULL DEFAULT 18.0,
  home_club      TEXT,
  avatar_color   TEXT NOT NULL DEFAULT '#1D3B2E',
  bio            TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  location   TEXT,
  country    TEXT,
  tee        TEXT NOT NULL DEFAULT 'White',
  par        INTEGER NOT NULL,
  rating     REAL NOT NULL,
  slope      INTEGER NOT NULL,
  holes_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  course_id     TEXT NOT NULL REFERENCES courses(id),
  format        TEXT NOT NULL,
  scoring       TEXT NOT NULL DEFAULT 'net',
  hole_count    INTEGER NOT NULL DEFAULT 18,
  start_hole    INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'live',
  stake         TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL,
  finished_at   TEXT
);

CREATE TABLE IF NOT EXISTS game_players (
  id                TEXT PRIMARY KEY,
  game_id           TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(id),
  display_name      TEXT NOT NULL,
  avatar_color      TEXT NOT NULL DEFAULT '#1D3B2E',
  handicap_index    REAL NOT NULL DEFAULT 18.0,
  playing_handicap  INTEGER NOT NULL DEFAULT 18,
  team              TEXT,
  joined_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  hole       INTEGER NOT NULL,
  strokes    INTEGER,
  putts      INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (game_id, player_id, hole)
);

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  game_id    TEXT REFERENCES games(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id),
  kind       TEXT NOT NULL DEFAULT 'text',
  body       TEXT NOT NULL,
  meta_json  TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_game ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_game  ON scores(game_id);
CREATE INDEX IF NOT EXISTS idx_posts_game   ON posts(game_id);
`);

/* ------------------------------------------------------------------ */
/* Clubs, tee sheets and bookings                                      */
/* ------------------------------------------------------------------ */

db.exec(`
CREATE TABLE IF NOT EXISTS clubs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  city        TEXT,
  province    TEXT,
  country     TEXT NOT NULL DEFAULT 'South Africa',
  blurb       TEXT,
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  brand_color TEXT NOT NULL DEFAULT '#1D3B2E',
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_admins (
  club_id    TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id           TEXT PRIMARY KEY,
  ref          TEXT NOT NULL UNIQUE,
  club_id      TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  date         TEXT NOT NULL,
  time         TEXT NOT NULL,
  players      INTEGER NOT NULL DEFAULT 1,
  guest_names  TEXT,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  fee_cents    INTEGER NOT NULL DEFAULT 0,
  cart         INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  source       TEXT NOT NULL DEFAULT 'app',
  game_id      TEXT REFERENCES games(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tee_blocks (
  id         TEXT PRIMARY KEY,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL,
  reason     TEXT,
  created_at TEXT NOT NULL
);

/* The club's own record of a golfer — this is what a club keeps and owns. */
CREATE TABLE IF NOT EXISTS club_customers (
  club_id          TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notes            TEXT,
  tags             TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  first_seen       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (club_id, user_id)
);

/* Who is in the group and what each of them owes. */
CREATE TABLE IF NOT EXISTS booking_players (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id),
  name         TEXT NOT NULL,
  share_cents  INTEGER NOT NULL DEFAULT 0,
  paid_cents   INTEGER NOT NULL DEFAULT 0,
  is_organiser INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

/* Append-only money ledger. Never mutated, so the club's books reconcile. */
CREATE TABLE IF NOT EXISTS booking_payments (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  player_id    TEXT REFERENCES booking_players(id),
  user_id      TEXT REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  method       TEXT NOT NULL DEFAULT 'card',
  status       TEXT NOT NULL DEFAULT 'settled',
  note         TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bplayers_booking  ON booking_players(booking_id);
CREATE INDEX IF NOT EXISTS idx_bpayments_booking ON booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_bookings_course_date ON bookings(course_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_club_date   ON bookings(club_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_user        ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_course_date   ON tee_blocks(course_id, date);
`);

/**
 * Tee-sheet configuration hangs off the course. Added by migration so an
 * existing database picks the columns up without being rebuilt.
 */
function addColumn(table, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}

/* Richer player profile. Avatars are stored as small data URLs — see the
   size guard in routes/auth.js — so there is no file store to run. */
addColumn('users', 'avatar_url TEXT');
addColumn('users', 'phone TEXT');
addColumn('users', 'city TEXT');
addColumn('users', 'province TEXT');
addColumn('users', "preferred_tee TEXT NOT NULL DEFAULT 'White'");
addColumn('users', "dominant_hand TEXT NOT NULL DEFAULT 'right'");
addColumn('users', "ride_preference TEXT NOT NULL DEFAULT 'either'");
addColumn('users', 'goal_handicap REAL');
addColumn('users', 'playing_since INTEGER');
addColumn('users', 'favourite_course TEXT');

addColumn('courses', 'club_id TEXT REFERENCES clubs(id)');
addColumn('courses', "interval_minutes INTEGER NOT NULL DEFAULT 10");
addColumn('courses', "first_tee TEXT NOT NULL DEFAULT '06:30'");
addColumn('courses', "last_tee TEXT NOT NULL DEFAULT '16:30'");
addColumn('courses', 'slot_capacity INTEGER NOT NULL DEFAULT 4');
addColumn('courses', 'weekday_fee_cents INTEGER NOT NULL DEFAULT 55000');
addColumn('courses', 'weekend_fee_cents INTEGER NOT NULL DEFAULT 75000');
addColumn('courses', 'cart_fee_cents INTEGER NOT NULL DEFAULT 35000');
addColumn('courses', 'booking_window_days INTEGER NOT NULL DEFAULT 60');
addColumn('courses', 'bookable INTEGER NOT NULL DEFAULT 1');
addColumn('courses', 'cancellation_hours INTEGER NOT NULL DEFAULT 24');

addColumn('bookings', "payment_status TEXT NOT NULL DEFAULT 'unpaid'");
addColumn('bookings', 'paid_cents INTEGER NOT NULL DEFAULT 0');
addColumn('bookings', 'cancelled_at TEXT');
addColumn('bookings', 'cancel_reason TEXT');
addColumn('bookings', 'late_cancel INTEGER NOT NULL DEFAULT 0');
addColumn('bookings', 'checked_in_at TEXT');
// Snapshot of the policy at the time of booking, so changing the club's
// setting later never rewrites the terms an existing booking was made under.
addColumn('bookings', 'cancellation_hours INTEGER NOT NULL DEFAULT 24');
// The game the group intends to play, chosen when the tee time is booked.
addColumn('bookings', "format TEXT NOT NULL DEFAULT 'stableford'");
addColumn('bookings', "scoring TEXT NOT NULL DEFAULT 'net'");

// Indexed after the migration above, since it depends on a migrated column.
db.exec('CREATE INDEX IF NOT EXISTS idx_courses_club ON courses(club_id)');

/** Small helpers so route code stays readable. */
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const get = (sql, ...params) => db.prepare(sql).get(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);
export const now = () => new Date().toISOString();
