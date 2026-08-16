import { Router } from 'express';
import crypto from 'node:crypto';
import { all, get, run, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { broadcast } from '../realtime.js';
import { buildHoles, totalPar } from '../sa-courses.js';
import {
  addDays, availability, feePerPlayer, paymentStatus, today, toMinutes,
} from '../teetimes.js';
import { bookingView, blocksFor, liveBookings } from './bookings.js';

const router = Router();
const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Whoever runs the platform approves new clubs. Set in the environment. */
const PLATFORM_ADMINS = (process.env.CUTLINE_PLATFORM_ADMIN || 'demo@cutline.co.za')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const isPlatformAdmin = (user) => PLATFORM_ADMINS.includes(String(user?.email).toLowerCase());

function requirePlatformAdmin(req, res, next) {
  if (!isPlatformAdmin(req.user)) return res.status(403).json({ error: 'Platform admins only' });
  next();
}

/** Guards every /:id/admin route — you must administer that specific club. */
async function requireClubAdmin(req, res, next) {
  try {
    const membership = await get(
      'SELECT * FROM club_admins WHERE club_id = ? AND user_id = ?', req.params.id, req.user.id,
    );
    if (!membership && !isPlatformAdmin(req.user)) {
      return res.status(403).json({ error: 'You do not manage this club' });
    }
    req.club = await get('SELECT * FROM clubs WHERE id = ?', req.params.id);
    if (!req.club) return res.status(404).json({ error: 'Club not found' });
    req.clubRole = membership?.role ?? 'platform';
    next();
  } catch (err) {
    next(err);
  }
}

const courseView = (c) => ({
  id: c.id,
  clubId: c.club_id,
  name: c.name,
  tee: c.tee,
  par: c.par,
  rating: c.rating,
  slope: c.slope,
  holes: JSON.parse(c.holes_json),
  bookable: Boolean(c.bookable),
  intervalMinutes: c.interval_minutes,
  firstTee: c.first_tee,
  lastTee: c.last_tee,
  slotCapacity: c.slot_capacity,
  weekdayFeeCents: c.weekday_fee_cents,
  weekendFeeCents: c.weekend_fee_cents,
  cartFeeCents: c.cart_fee_cents,
  bookingWindowDays: c.booking_window_days,
  cancellationHours: c.cancellation_hours,
});

/** The club's own fields, with no further reads. */
const clubBase = (club) => ({
  id: club.id,
  name: club.name,
  slug: club.slug,
  city: club.city,
  province: club.province,
  country: club.country,
  blurb: club.blurb,
  phone: club.phone,
  email: club.email,
  website: club.website,
  brandColor: club.brand_color,
  status: club.status,
  createdAt: club.created_at,
});

const clubView = async (club, { withCourses = true } = {}) => (
  withCourses
    ? {
        ...clubBase(club),
        courses: (await all('SELECT * FROM courses WHERE club_id = ? ORDER BY name', club.id)).map(courseView),
      }
    : clubBase(club)
);

/* ------------------------------------------------------------------ */
/* Browse (golfer side)                                                */
/* ------------------------------------------------------------------ */

router.get('/', requireAuth, async (req, res) => {
  const { province = '', q = '' } = req.query;
  const like = `%${String(q).trim()}%`;
  // ?::text on the "is this filter set" test: Postgres cannot type a bare
  // parameter compared against a bare literal. ILIKE for case-insensitivity.
  const rows = await all(
    `SELECT * FROM clubs
     WHERE status = 'active'
       AND (?::text = '' OR province = ?)
       AND (name ILIKE ? OR city ILIKE ? OR province ILIKE ?)
     ORDER BY name`,
    province, province, like, like, like,
  );

  const date = String(req.query.date || today());
  const clubs = await Promise.all(rows.map(async (club) => {
    // Loaded once and reused: this route used to re-read each course row twice
    // more, once for availability and again for the fee.
    const courses = await all('SELECT * FROM courses WHERE club_id = ? ORDER BY name', club.id);
    const bookable = courses.filter((c) => c.bookable);

    const openings = await Promise.all(bookable.map(async (course) => {
      const [bookings, blocks] = await Promise.all([
        liveBookings(course.id, date),
        blocksFor(course.id, date),
      ]);
      const slots = availability(course, date, bookings, blocks);
      const open = slots.filter((s) => s.status === 'open');
      return { courseId: course.id, next: open[0]?.time ?? null, open: open.length };
    }));

    return {
      ...clubBase(club),
      courses: courses.map(courseView),
      fromFeeCents: bookable.length ? Math.min(...bookable.map((c) => feePerPlayer(c, date))) : null,
      openSlots: openings.reduce((sum, o) => sum + o.open, 0),
      nextTee: openings.map((o) => o.next).filter(Boolean).sort()[0] ?? null,
    };
  }));

  res.json({ clubs });
});

router.get('/provinces', requireAuth, async (_req, res) => {
  // COUNT(*)::int — an uncast count arrives as a string.
  const rows = await all(
    "SELECT province, COUNT(*)::int AS clubs FROM clubs WHERE status = 'active' GROUP BY province ORDER BY province",
  );
  res.json({ provinces: rows.map((r) => ({ province: r.province, clubs: r.clubs })) });
});

router.get('/mine', requireAuth, async (req, res) => {
  const rows = await all(
    `SELECT c.*, a.role FROM clubs c JOIN club_admins a ON a.club_id = c.id
     WHERE a.user_id = ? ORDER BY c.name`,
    req.user.id,
  );
  res.json({
    clubs: await Promise.all(rows.map(async (c) => ({ ...await clubView(c), role: c.role }))),
    isPlatformAdmin: isPlatformAdmin(req.user),
  });
});

/* ------------------------------------------------------------------ */
/* Signup and approval                                                 */
/* ------------------------------------------------------------------ */

router.post('/register', requireAuth, async (req, res) => {
  const { name, city, province, phone, email, website, blurb, course } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Give the club a name' });
  if (!province?.trim()) return res.status(400).json({ error: 'Pick a province' });

  let slug = slugify(name);
  if (await get('SELECT id FROM clubs WHERE slug = ?', slug)) slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;

  const clubId = uid('clb');
  await run(
    `INSERT INTO clubs (id, name, slug, city, province, country, blurb, phone, email, website, brand_color, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'South Africa', ?, ?, ?, ?, '#1D3B2E', 'pending', ?)`,
    clubId, name.trim(), slug, city?.trim() ?? null, province.trim(), blurb?.trim() ?? null,
    phone?.trim() ?? null, email?.trim() ?? req.user.email, website?.trim() ?? null, now(),
  );
  await run(
    'INSERT INTO club_admins (club_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
    clubId, req.user.id, 'owner', now(),
  );

  // A club with no course cannot publish a tee sheet, so seed a sensible one.
  const pars = course?.pars?.length === 18
    ? course.pars.map(Number)
    : [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  const holes = buildHoles(slug, pars);
  await run(
    `INSERT INTO courses (id, name, location, country, tee, par, rating, slope, holes_json, club_id,
       interval_minutes, first_tee, last_tee, slot_capacity, weekday_fee_cents, weekend_fee_cents,
       cart_fee_cents, booking_window_days, bookable, cancellation_hours)
     VALUES (?, ?, ?, 'South Africa', 'White', ?, ?, ?, ?, ?, 10, '06:30', '16:00', 4, ?, ?, ?, 60, 1, 24)`,
    uid('crs'), course?.name?.trim() || name.trim(), `${city ?? ''}, ${province}`.trim(),
    totalPar(holes), Number(course?.rating) || 72, Number(course?.slope) || 128,
    JSON.stringify(holes), clubId,
    Number(course?.weekdayFeeCents) || 55000, Number(course?.weekendFeeCents) || 75000,
    Number(course?.cartFeeCents) || 35000,
  );

  res.status(201).json({
    club: await clubView(await get('SELECT * FROM clubs WHERE id = ?', clubId)),
    message: 'Club registered. It goes live for bookings once the platform approves it.',
  });
});

router.get('/pending', requireAuth, requirePlatformAdmin, async (_req, res) => {
  const rows = await all("SELECT * FROM clubs WHERE status = 'pending' ORDER BY created_at DESC");
  res.json({
    clubs: await Promise.all(rows.map(async (club) => ({
      ...await clubView(club),
      registeredBy: await get(
        'SELECT u.name, u.email FROM club_admins a JOIN users u ON u.id = a.user_id WHERE a.club_id = ? LIMIT 1',
        club.id,
      ),
    }))),
  });
});

router.post('/:id/approve', requireAuth, requirePlatformAdmin, async (req, res) => {
  await run("UPDATE clubs SET status = 'active' WHERE id = ?", req.params.id);
  res.json({ club: await clubView(await get('SELECT * FROM clubs WHERE id = ?', req.params.id)) });
});

router.post('/:id/reject', requireAuth, requirePlatformAdmin, async (req, res) => {
  await run("UPDATE clubs SET status = 'rejected' WHERE id = ?", req.params.id);
  res.json({ club: await clubView(await get('SELECT * FROM clubs WHERE id = ?', req.params.id)) });
});

/* ------------------------------------------------------------------ */
/* Admin console                                                       */
/* ------------------------------------------------------------------ */

const clubCourses = (clubId) => all('SELECT * FROM courses WHERE club_id = ? ORDER BY name', clubId);

router.get('/:id/admin/dashboard', requireAuth, requireClubAdmin, async (req, res) => {
  const date = String(req.query.date || today());
  const courses = await clubCourses(req.club.id);

  let seats = 0;
  let seatsTaken = 0;
  const sheet = [];
  for (const course of courses) {
    const [bookings, blocks] = await Promise.all([
      liveBookings(course.id, date),
      blocksFor(course.id, date),
    ]);
    const slots = availability(course, date, bookings, blocks);
    seats += slots.filter((s) => s.status !== 'blocked').length * course.slot_capacity;
    seatsTaken += bookings.reduce((sum, b) => sum + b.players, 0);
    sheet.push({
      course: courseView(course),
      slots: slots.length,
      openSlots: slots.filter((s) => s.status === 'open').length,
      bookings: bookings.length,
      players: bookings.reduce((sum, b) => sum + b.players, 0),
    });
  }

  // Every SUM and COUNT below is cast to int. Postgres returns both as bigint,
  // and the driver hands bigint back as a string — uncast, every money figure
  // and count in this dashboard would reach the client as text.
  const money = await get(
    `SELECT COALESCE(SUM(fee_cents),0)::int AS billed, COALESCE(SUM(paid_cents),0)::int AS paid
     FROM bookings WHERE club_id = ? AND date = ? AND status != 'cancelled'`,
    req.club.id, date,
  );

  const outstanding = await get(
    `SELECT COALESCE(SUM(fee_cents - paid_cents),0)::int AS owed FROM bookings
     WHERE club_id = ? AND status != 'cancelled' AND fee_cents > paid_cents`,
    req.club.id,
  );

  const trend = await Promise.all(Array.from({ length: 7 }, async (_, i) => {
    const day = addDays(date, i - 6);
    const row = await get(
      `SELECT COUNT(*)::int AS bookings, COALESCE(SUM(players),0)::int AS players,
              COALESCE(SUM(fee_cents),0)::int AS billed
       FROM bookings WHERE club_id = ? AND date = ? AND status != 'cancelled'`,
      req.club.id, day,
    );
    return { date: day, ...row };
  }));

  const upcomingRows = await all(
    `SELECT id FROM bookings WHERE club_id = ? AND date = ? AND status != 'cancelled'
     ORDER BY time LIMIT 8`,
    req.club.id, date,
  );
  const upcoming = await Promise.all(upcomingRows.map((r) => bookingView(r.id)));

  const [customers, noShows, cancellations] = await Promise.all([
    get('SELECT COUNT(*)::int AS n FROM club_customers WHERE club_id = ?', req.club.id),
    get("SELECT COUNT(*)::int AS n FROM bookings WHERE club_id = ? AND status = 'no_show'", req.club.id),
    get("SELECT COUNT(*)::int AS n FROM bookings WHERE club_id = ? AND status = 'cancelled'", req.club.id),
  ]);

  res.json({
    club: await clubView(req.club),
    date,
    occupancy: seats ? Math.round((seatsTaken / seats) * 100) : 0,
    seats,
    seatsTaken,
    sheet,
    money: {
      currency: 'ZAR',
      billedCents: money.billed,
      paidCents: money.paid,
      outstandingTodayCents: Math.max(0, money.billed - money.paid),
      outstandingAllCents: outstanding.owed,
    },
    counts: {
      customers: customers.n,
      noShows: noShows.n,
      cancellations: cancellations.n,
    },
    trend,
    upcoming,
  });
});

router.get('/:id/admin/teesheet', requireAuth, requireClubAdmin, async (req, res) => {
  const date = String(req.query.date || today());
  const courses = await clubCourses(req.club.id);
  const courseId = req.query.courseId || courses[0]?.id;
  const course = courses.find((c) => c.id === courseId);
  if (!course) return res.status(404).json({ error: 'No course on this club' });

  const [bookings, blocks] = await Promise.all([
    liveBookings(course.id, date),
    blocksFor(course.id, date),
  ]);
  const slots = availability(course, date, bookings, blocks);

  res.json({
    date,
    courses: courses.map(courseView),
    course: courseView(course),
    blocks: blocks.map((b) => ({
      id: b.id, startTime: b.start_time, endTime: b.end_time, reason: b.reason,
    })),
    slots: await Promise.all(slots.map(async (slot) => ({
      ...slot,
      bookings: await Promise.all(slot.bookings.map((b) => bookingView(b.id))),
    }))),
  });
});

router.get('/:id/admin/bookings', requireAuth, requireClubAdmin, async (req, res) => {
  const { from = addDays(today(), -30), to = addDays(today(), 60), status = '' } = req.query;
  const rows = await all(
    `SELECT id FROM bookings WHERE club_id = ? AND date BETWEEN ? AND ?
       AND (?::text = '' OR status = ?)
     ORDER BY date DESC, time DESC LIMIT 300`,
    req.club.id, from, to, status, status,
  );
  res.json({ bookings: await Promise.all(rows.map((r) => bookingView(r.id))) });
});

/** Every desk action a pro shop needs on a booking. */
router.patch('/:id/admin/bookings/:bookingId', requireAuth, requireClubAdmin, async (req, res) => {
  const booking = await get('SELECT * FROM bookings WHERE id = ? AND club_id = ?', req.params.bookingId, req.club.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const { action, amountCents, method = 'pro_shop', reason } = req.body || {};

  if (action === 'check_in') {
    await run("UPDATE bookings SET status = 'checked_in', checked_in_at = ?, updated_at = ? WHERE id = ?", now(), now(), booking.id);
  } else if (action === 'played') {
    await run("UPDATE bookings SET status = 'played', updated_at = ? WHERE id = ?", now(), booking.id);
  } else if (action === 'no_show') {
    await run("UPDATE bookings SET status = 'no_show', updated_at = ? WHERE id = ?", now(), booking.id);
  } else if (action === 'cancel') {
    await run(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, late_cancel = 0, updated_at = ? WHERE id = ?",
      now(), reason || 'Cancelled by the club', now(), booking.id,
    );
  } else if (action === 'record_payment') {
    const owed = Math.max(0, booking.fee_cents - booking.paid_cents);
    const amount = Math.min(owed, Number(amountCents) || owed);
    if (amount <= 0) return res.status(400).json({ error: 'Nothing outstanding' });

    // Settle player shares oldest first so the group's rows stay truthful.
    let left = amount;
    const bookingPlayers = await all(
      'SELECT * FROM booking_players WHERE booking_id = ? ORDER BY is_organiser DESC, created_at', booking.id,
    );
    for (const player of bookingPlayers) {
      if (left <= 0) break;
      const playerOwed = Math.max(0, player.share_cents - player.paid_cents);
      const take = Math.min(playerOwed, left);
      if (take <= 0) continue;
      await run('UPDATE booking_players SET paid_cents = paid_cents + ? WHERE id = ?', take, player.id);
      left -= take;
    }
    await run(
      `INSERT INTO booking_payments (id, booking_id, player_id, user_id, amount_cents, method, status, note, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, 'settled', 'Taken at the club', ?)`,
      uid('pay'), booking.id, req.user.id, amount, method, now(),
    );
    const paid = booking.paid_cents + amount;
    await run(
      'UPDATE bookings SET paid_cents = ?, payment_status = ?, updated_at = ? WHERE id = ?',
      paid, paymentStatus(booking.fee_cents, paid), now(), booking.id,
    );
  } else if (action === 'waive') {
    await run(
      "UPDATE bookings SET payment_status = 'waived', paid_cents = fee_cents, updated_at = ? WHERE id = ?",
      now(), booking.id,
    );
    await run('UPDATE booking_players SET paid_cents = share_cents WHERE booking_id = ?', booking.id);
    await run(
      `INSERT INTO booking_payments (id, booking_id, player_id, user_id, amount_cents, method, status, note, created_at)
       VALUES (?, ?, NULL, ?, ?, 'waived', 'settled', ?, ?)`,
      uid('pay'), booking.id, req.user.id, Math.max(0, booking.fee_cents - booking.paid_cents),
      reason || 'Waived by the club', now(),
    );
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  broadcast(`club:${req.club.id}`, 'teesheet', { date: booking.date, courseId: booking.course_id });
  res.json({ booking: await bookingView(booking.id) });
});

/* ------------------------------------------------------------------ */
/* Customers — the club's own record of its golfers                    */
/* ------------------------------------------------------------------ */

router.get('/:id/admin/customers', requireAuth, requireClubAdmin, async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = await all(
    `SELECT cc.*, u.name, u.email, u.handicap_index, u.avatar_color, u.avatar_url, u.home_club, u.phone
     FROM club_customers cc JOIN users u ON u.id = cc.user_id
     WHERE cc.club_id = ? AND (u.name ILIKE ? OR u.email ILIKE ?)
     ORDER BY u.name`,
    req.club.id, q, q,
  );

  const customers = await Promise.all(rows.map(async (row) => {
    const stats = await get(
      `SELECT
         COUNT(*)::int AS bookings,
         COALESCE(SUM(CASE WHEN status IN ('played','checked_in') THEN 1 ELSE 0 END),0)::int AS visits,
         COALESCE(SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END),0)::int AS no_shows,
         COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END),0)::int AS cancellations,
         COALESCE(SUM(CASE WHEN status != 'cancelled' THEN paid_cents ELSE 0 END),0)::int AS spend,
         COALESCE(SUM(CASE WHEN status != 'cancelled' THEN fee_cents - paid_cents ELSE 0 END),0)::int AS outstanding,
         COALESCE(SUM(players),0)::int AS guests,
         MAX(date) AS last_booking
       FROM bookings WHERE club_id = ? AND user_id = ?`,
      req.club.id, row.user_id,
    );
    return {
      userId: row.user_id,
      name: row.name,
      email: row.email,
      handicapIndex: row.handicap_index,
      avatarColor: row.avatar_color,
      avatarUrl: row.avatar_url ?? null,
      homeClub: row.home_club,
      phone: row.phone ?? null,
      notes: row.notes,
      tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
      marketingOptIn: Boolean(row.marketing_opt_in),
      firstSeen: row.first_seen,
      stats: {
        bookings: stats.bookings,
        visits: stats.visits,
        noShows: stats.no_shows,
        cancellations: stats.cancellations,
        spendCents: stats.spend,
        outstandingCents: Math.max(0, stats.outstanding),
        playersBrought: stats.guests,
        lastBooking: stats.last_booking,
      },
    };
  }));

  res.json({ customers });
});

router.patch('/:id/admin/customers/:userId', requireAuth, requireClubAdmin, async (req, res) => {
  const { notes, tags, marketingOptIn } = req.body || {};
  await run(
    `UPDATE club_customers SET
       notes = COALESCE(?::text, notes),
       tags = COALESCE(?::text, tags),
       marketing_opt_in = COALESCE(?::integer, marketing_opt_in),
       updated_at = ?
     WHERE club_id = ? AND user_id = ?`,
    notes ?? null,
    Array.isArray(tags) ? tags.join(',') : (tags ?? null),
    marketingOptIn === undefined ? null : (marketingOptIn ? 1 : 0),
    now(), req.club.id, req.params.userId,
  );
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Course settings and closures                                        */
/* ------------------------------------------------------------------ */

router.patch('/:id/admin/courses/:courseId', requireAuth, requireClubAdmin, async (req, res) => {
  const course = await get('SELECT * FROM courses WHERE id = ? AND club_id = ?', req.params.courseId, req.club.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const b = req.body || {};
  const num = (value) => (value === undefined || value === null || value === '' ? null : Number(value));
  await run(
    `UPDATE courses SET
       interval_minutes = COALESCE(?::integer, interval_minutes),
       first_tee = COALESCE(?::text, first_tee),
       last_tee = COALESCE(?::text, last_tee),
       slot_capacity = COALESCE(?::integer, slot_capacity),
       weekday_fee_cents = COALESCE(?::integer, weekday_fee_cents),
       weekend_fee_cents = COALESCE(?::integer, weekend_fee_cents),
       cart_fee_cents = COALESCE(?::integer, cart_fee_cents),
       booking_window_days = COALESCE(?::integer, booking_window_days),
       cancellation_hours = COALESCE(?::integer, cancellation_hours),
       bookable = COALESCE(?::integer, bookable)
     WHERE id = ?`,
    num(b.intervalMinutes), b.firstTee ?? null, b.lastTee ?? null, num(b.slotCapacity),
    num(b.weekdayFeeCents), num(b.weekendFeeCents), num(b.cartFeeCents),
    num(b.bookingWindowDays), num(b.cancellationHours),
    b.bookable === undefined ? null : (b.bookable ? 1 : 0),
    course.id,
  );
  res.json({ course: courseView(await get('SELECT * FROM courses WHERE id = ?', course.id)) });
});

router.patch('/:id/admin/profile', requireAuth, requireClubAdmin, async (req, res) => {
  const { name, city, province, blurb, phone, email, website, brandColor } = req.body || {};
  await run(
    `UPDATE clubs SET name = COALESCE(?::text, name), city = COALESCE(?::text, city),
       province = COALESCE(?::text, province), blurb = COALESCE(?::text, blurb),
       phone = COALESCE(?::text, phone), email = COALESCE(?::text, email),
       website = COALESCE(?::text, website), brand_color = COALESCE(?::text, brand_color)
     WHERE id = ?`,
    name ?? null, city ?? null, province ?? null, blurb ?? null, phone ?? null,
    email ?? null, website ?? null, brandColor ?? null, req.club.id,
  );
  res.json({ club: await clubView(await get('SELECT * FROM clubs WHERE id = ?', req.club.id)) });
});

router.post('/:id/admin/blocks', requireAuth, requireClubAdmin, async (req, res) => {
  const { courseId, date, startTime, endTime, reason } = req.body || {};
  const course = await get('SELECT * FROM courses WHERE id = ? AND club_id = ?', courseId, req.club.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  if (toMinutes(endTime) <= toMinutes(startTime)) {
    return res.status(400).json({ error: 'The end time must be after the start time' });
  }

  const id = uid('blk');
  await run(
    'INSERT INTO tee_blocks (id, course_id, date, start_time, end_time, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, course.id, date, startTime, endTime, reason?.trim() || 'Closed', now(),
  );
  broadcast(`club:${req.club.id}`, 'teesheet', { date, courseId: course.id });
  res.status(201).json({ blockId: id });
});

router.delete('/:id/admin/blocks/:blockId', requireAuth, requireClubAdmin, async (req, res) => {
  const block = await get('SELECT * FROM tee_blocks WHERE id = ?', req.params.blockId);
  await run('DELETE FROM tee_blocks WHERE id = ?', req.params.blockId);
  if (block) broadcast(`club:${req.club.id}`, 'teesheet', { date: block.date, courseId: block.course_id });
  res.json({ ok: true });
});

/* Slug lookup last, so it cannot swallow the named routes above. */
router.get('/:slug', requireAuth, async (req, res) => {
  const club = await get('SELECT * FROM clubs WHERE slug = ? OR id = ?', req.params.slug, req.params.slug);
  if (!club) return res.status(404).json({ error: 'Club not found' });
  if (club.status !== 'active'
    && !await get('SELECT 1 AS x FROM club_admins WHERE club_id = ? AND user_id = ?', club.id, req.user.id)) {
    return res.status(404).json({ error: 'Club not found' });
  }
  res.json({ club: await clubView(club) });
});

export default router;
