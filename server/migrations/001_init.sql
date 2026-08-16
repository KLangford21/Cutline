-- Cutline base schema.
--
-- This consolidates what used to be the CREATE TABLE block plus the run-time
-- addColumn() calls in db.js. Timestamps stay TEXT holding ISO-8601 strings and
-- booleans stay INTEGER 0/1, matching what the application code already reads
-- and writes — this migration changes the engine, not the data model.

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  handicap_index   DOUBLE PRECISION NOT NULL DEFAULT 18.0,
  home_club        TEXT,
  avatar_color     TEXT NOT NULL DEFAULT '#1D3B2E',
  bio              TEXT,
  created_at       TEXT NOT NULL,
  avatar_url       TEXT,
  phone            TEXT,
  city             TEXT,
  province         TEXT,
  preferred_tee    TEXT NOT NULL DEFAULT 'White',
  dominant_hand    TEXT NOT NULL DEFAULT 'right',
  ride_preference  TEXT NOT NULL DEFAULT 'either',
  goal_handicap    DOUBLE PRECISION,
  playing_since    INTEGER,
  favourite_course TEXT
);

-- Clubs are created before courses because courses.club_id references them.
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

CREATE TABLE IF NOT EXISTS courses (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  location            TEXT,
  country             TEXT,
  tee                 TEXT NOT NULL DEFAULT 'White',
  par                 INTEGER NOT NULL,
  rating              DOUBLE PRECISION NOT NULL,
  slope               INTEGER NOT NULL,
  holes_json          TEXT NOT NULL,
  club_id             TEXT REFERENCES clubs(id),
  interval_minutes    INTEGER NOT NULL DEFAULT 10,
  first_tee           TEXT NOT NULL DEFAULT '06:30',
  last_tee            TEXT NOT NULL DEFAULT '16:30',
  slot_capacity       INTEGER NOT NULL DEFAULT 4,
  weekday_fee_cents   INTEGER NOT NULL DEFAULT 55000,
  weekend_fee_cents   INTEGER NOT NULL DEFAULT 75000,
  cart_fee_cents      INTEGER NOT NULL DEFAULT 35000,
  booking_window_days INTEGER NOT NULL DEFAULT 60,
  bookable            INTEGER NOT NULL DEFAULT 1,
  cancellation_hours  INTEGER NOT NULL DEFAULT 24
);

CREATE TABLE IF NOT EXISTS club_admins (
  club_id    TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  course_id   TEXT NOT NULL REFERENCES courses(id),
  format      TEXT NOT NULL,
  scoring     TEXT NOT NULL DEFAULT 'net',
  hole_count  INTEGER NOT NULL DEFAULT 18,
  start_hole  INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'live',
  stake       TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS game_players (
  id               TEXT PRIMARY KEY,
  game_id          TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES users(id),
  display_name     TEXT NOT NULL,
  avatar_color     TEXT NOT NULL DEFAULT '#1D3B2E',
  handicap_index   DOUBLE PRECISION NOT NULL DEFAULT 18.0,
  playing_handicap INTEGER NOT NULL DEFAULT 18,
  team             TEXT,
  joined_at        TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS bookings (
  id                 TEXT PRIMARY KEY,
  ref                TEXT NOT NULL UNIQUE,
  club_id            TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  course_id          TEXT NOT NULL REFERENCES courses(id),
  user_id            TEXT NOT NULL REFERENCES users(id),
  date               TEXT NOT NULL,
  time               TEXT NOT NULL,
  players            INTEGER NOT NULL DEFAULT 1,
  guest_names        TEXT,
  status             TEXT NOT NULL DEFAULT 'confirmed',
  fee_cents          INTEGER NOT NULL DEFAULT 0,
  cart               INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  source             TEXT NOT NULL DEFAULT 'app',
  game_id            TEXT REFERENCES games(id),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  payment_status     TEXT NOT NULL DEFAULT 'unpaid',
  paid_cents         INTEGER NOT NULL DEFAULT 0,
  cancelled_at       TEXT,
  cancel_reason      TEXT,
  late_cancel        INTEGER NOT NULL DEFAULT 0,
  checked_in_at      TEXT,
  -- Snapshot of the policy at the time of booking, so changing the club's
  -- setting later never rewrites the terms an existing booking was made under.
  cancellation_hours INTEGER NOT NULL DEFAULT 24,
  -- The game the group intends to play, chosen when the tee time is booked.
  format             TEXT NOT NULL DEFAULT 'stableford',
  scoring            TEXT NOT NULL DEFAULT 'net'
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

-- The club's own record of a golfer — this is what a club keeps and owns.
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

-- Who is in the group and what each of them owes.
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

-- Append-only money ledger. Never mutated, so the club's books reconcile.
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

CREATE INDEX IF NOT EXISTS idx_players_game        ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_user        ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_game         ON scores(game_id);
CREATE INDEX IF NOT EXISTS idx_posts_game          ON posts(game_id);
CREATE INDEX IF NOT EXISTS idx_bplayers_booking    ON booking_players(booking_id);
CREATE INDEX IF NOT EXISTS idx_bpayments_booking   ON booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_bookings_course_date ON bookings(course_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_club_date   ON bookings(club_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_user        ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_course_date   ON tee_blocks(course_id, date);
CREATE INDEX IF NOT EXISTS idx_courses_club         ON courses(club_id);
