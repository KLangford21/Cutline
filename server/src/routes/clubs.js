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
function requireClubAdmin(req, res, next) {
  const membership = get(
    'SELECT * FROM club_admins WHERE club_id = ? AND user_id = ?', req.params.id, req.user.id,
  );
  if (!membership && !isPlatformAdmin(req.user)) {
    return res.status(403).json({ error: 'You do not manage this club' });
  }
  req.club = get('SELECT * FROM clubs WHERE id = ?', req.params.id);
  if (!req.club) return res.status(404).json({ error: 'Club not found' });
  req.clubRole = membership?.role ?? 'platform';
  next();
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

const clubView = (club, { withCourses = true } = {}) => ({
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
  ...(withCourses
    ? { courses: all('SELECT * FROM courses WHERE club_id = ? ORDER BY name', club.id).map(courseView) }
    : {}),
});

/* ------------------------------------------------------------------ */
/* Browse (golfer side)                                                */
/* ------------------------------------------------------------------ */

router.get('/', requireAuth, (req, res) => {
  const { province = '', q = '' } = req.query;
  const like = `%${String(q).trim()}%`;
  const rows = all(
    `SELECT * FROM clubs
     WHERE status = 'active'
       AND (? = '' OR province = ?)
       AND (name LIKE ? OR city LIKE ? OR province LIKE ?)
     ORDER BY name`,
    province, province, like, like, like,
  );

  const date = String(req.query.date || today());
  res.json({
    clubs: rows.map((club) => {
      const view = clubView(club);
      const bookable = view.courses.filter((c) => c.bookable);
      const openings = bookable.map((course) => {
        const raw = get('SELECT * FROM courses WHERE id = ?', course.id);
        const slots = availability(raw, date, liveBookings(course.id, date), blocksFor(course.id, date));
        const open = slots.filter((s) => s.status === 'open');
        return { courseId: course.id, next: open[0]?.time ?? null, open: open.length };
      });
      return {
        ...view,
        fromFeeCents: bookable.length ? Math.min(...bookable.map((c) => feePerPlayer(get('SELECT * FROM courses WHERE id = ?', c.id), date))) : null,
        openSlots: openings.reduce((sum, o) => sum + o.open, 0),
        nextTee: openings.map((o) => o.next).filter(Boolean).sort()[0] ?? null,
      };
    }),
  });
});

router.get('/provinces', requireAuth, (_req, res) => {
  const rows = all("SELECT province, COUNT(*) AS clubs FROM clubs WHERE status = 'active' GROUP BY province ORDER BY province");
  res.json({ provinces: rows.map((r) => ({ province: r.province, clubs: r.clubs })) });
});

router.get('/mine', requireAuth, (req, res) => {
  const rows = all(
    `SELECT c.*, a.role FROM clubs c JOIN club_admins a ON a.club_id = c.id
     WHERE a.user_id = ? ORDER BY c.name`,
    req.user.id,
  );
  res.json({
    clubs: rows.map((c) => ({ ...clubView(c), role: c.role })),
    isPlatformAdmin: isPlatformAdmin(req.user),
  });
});

/* ------------------------------------------------------------------ */
/* Signup and approval                                                 */
/* ------------------------------------------------------------------ */

router.post('/register', requireAuth, (req, res) => {
  const { name, city, province, phone, email, website, blurb, course } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Give the club a name' });
  if (!province?.trim()) return res.status(400).json({ error: 'Pick a province' });

  let slug = slugify(name);
  if (get('SELECT id FROM clubs WHERE slug = ?', slug)) slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;

  const clubId = uid('clb');
  run(
    `INSERT INTO clubs (id, name, slug, city, province, country, blurb, phone, email, website, brand_color, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'South Africa', ?, ?, ?, ?, '#1D3B2E', 'pending', ?)`,
    clubId, name.trim(), slug, city?.trim() ?? null, province.trim(), blurb?.trim() ?? null,
    phone?.trim() ?? null, email?.trim() ?? req.user.email, website?.trim() ?? null, now(),
  );
  run(
    'INSERT INTO club_admins (club_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
    clubId, req.user.id, 'owner', now(),
  );

  // A club with no course cannot publish a tee sheet, so seed a sensible one.
  const pars = course?.pars?.length === 18
    ? course.pars.map(Number)
    : [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
  const holes = buildHoles(slug, pars);
  run(
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
    club: clubView(get('SELECT * FROM clubs WHERE id = ?', clubId)),
    message: 'Club registered. It goes live for bookings once the platform approves it.',
  });
});

router.get('/pending', requireAuth, requirePlatformAdmin, (_req, res) => {
  const rows = all("SELECT * FROM clubs WHERE status = 'pending' ORDER BY created_at DESC");
  res.json({
    clubs: rows.map((club) => ({
      ...clubView(club),
      registeredBy: get(
        'SELECT u.name, u.email FROM club_admins a JOIN users u ON u.id = a.user_id WHERE a.club_id = ? LIMIT 1',
        club.id,
      ),
    })),
  });
});

router.post('/:id/approve', requireAuth, requirePlatformAdmin, (req, res) => {
  run("UPDATE clubs SET status = 'active' WHERE id = ?", req.params.id);
  res.json({ club: clubView(get('SELECT * FROM clubs WHERE id = ?', req.params.id)) });
});

router.post('/:id/reject', requireAuth, requirePlatformAdmin, (req, res) => {
  run("UPDATE clubs SET status = 'rejected' WHERE id = ?", req.params.id);
  res.json({ club: clubView(get('SELECT * FROM clubs WHERE id = ?', req.params.id)) });
});

/* ------------------------------------------------------------------ */
/* Admin console                                                       */
/* ------------------------------------------------------------------ */

const clubCourses = (clubId) => all('SELECT * FROM courses WHERE club_id = ? ORDER BY name', clubId);

router.get('/:id/admin/dashboard', requireAuth, requireClubAdmin, (req, res) => {
  const date = String(req.query.date || today());
  const courses = clubCourses(req.club.id);

  let seats = 0;
  let seatsTaken = 0;
  const sheet = courses.map((course) => {
    const bookings = liveBookings(course.id, date);
    const slots = availability(course, date, bookings, blocksFor(course.id, date));
    seats += slots.filter((s) => s.status !== 'blocked').length * course.slot_capacity;
    seatsTaken += bookings.reduce((sum, b) => sum + b.players, 0);
    return {
      course: courseView(course),
      slots: slots.length,
      openSlots: slots.filter((s) => s.status === 'open').length,
      bookings: bookings.length,
      players: bookings.reduce((sum, b) => sum + b.players, 0),
    };
  });

  const money = get(
    `SELECT COALESCE(SUM(fee_cents),0) AS billed, COALESCE(SUM(paid_cents),0) AS paid
     FROM bookings WHERE club_id = ? AND date = ? AND status != 'cancelled'`,
    req.club.id, date,
  );

  const outstanding = get(
    `SELECT COALESCE(SUM(fee_cents - paid_cents),0) AS owed FROM bookings
     WHERE club_id = ? AND status != 'cancelled' AND fee_cents > paid_cents`,
    req.club.id,
  );

  const trend = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(date, i - 6);
    const row = get(
      `SELECT COUNT(*) AS bookings, COALESCE(SUM(players),0) AS players, COALESCE(SUM(fee_cents),0) AS billed
       FROM bookings WHERE club_id = ? AND date = ? AND status != 'cancelled'`,
      req.club.id, day,
    );
    return { date: day, ...row };
  });

  const upcoming = all(
    `SELECT id FROM bookings WHERE club_id = ? AND date = ? AND status != 'cancelled'
     ORDER BY time LIMIT 8`,
    req.club.id, date,
  ).map((r) => bookingView(r.id));

  res.json({
    club: clubView(req.club),
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
      customers: get('SELECT COUNT(*) AS n FROM club_customers WHERE club_id = ?', req.club.id).n,
      noShows: get("SELECT COUNT(*) AS n FROM bookings WHERE club_id = ? AND status = 'no_show'", req.club.id).n,
      cancellations: get("SELECT COUNT(*) AS n FROM bookings WHERE club_id = ? AND status = 'cancelled'", req.club.id).n,
    },
    trend,
    upcoming,
  });
});

router.get('/:id/admin/teesheet', requireAuth, requireClubAdmin, (req, res) => {
  const date = String(req.query.date || today());
  const courses = clubCourses(req.club.id);
  const courseId = req.query.courseId || courses[0]?.id;
  const course = courses.find((c) => c.id === courseId);
  if (!course) return res.status(404).json({ error: 'No course on this club' });

  const bookings = liveBookings(course.id, date);
  const slots = availability(course, date, bookings, blocksFor(course.id, date));

  res.json({
    date,
    courses: courses.map(courseView),
    course: courseView(course),
    blocks: blocksFor(course.id, date).map((b) => ({
      id: b.id, startTime: b.start_time, endTime: b.end_time, reason: b.reason,
    })),
    slots: slots.map((slot) => ({
      ...slot,
      bookings: slot.bookings.map((b) => bookingView(b.id)),
    })),
  });
});

router.get('/:id/admin/bookings', requireAuth, requireClubAdmin, (req, res) => {
  const { from = addDays(today(), -30), to = addDays(today(), 60), status = '' } = req.query;
  const rows = all(
    `SELECT id FROM bookings WHERE club_id = ? AND date BETWEEN ? AND ?
       AND (? = '' OR status = ?)
     ORDER BY date DESC, time DESC LIMIT 300`,
    req.club.id, from, to, status, status,
  );
  res.json({ bookings: rows.map((r) => bookingView(r.id)) });
});

/** Every desk action a pro shop needs on a booking. */
router.patch('/:id/admin/bookings/:bookingId', requireAuth, requireClubAdmin, (req, res) => {
  const booking = get('SELECT * FROM bookings WHERE id = ? AND club_id = ?', req.params.bookingId, req.club.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const { action, amountCents, method = 'pro_shop', reason } = req.body || {};

  if (action === 'check_in') {
    run("UPDATE bookings SET status = 'checked_in', checked_in_at = ?, updated_at = ? WHERE id = ?", now(), now(), booking.id);
  } else if (action === 'played') {
    run("UPDATE bookings SET status = 'played', updated_at = ? WHERE id = ?", now(), booking.id);
  } else if (action === 'no_show') {
    run("UPDATE bookings SET status = 'no_show', updated_at = ? WHERE id = ?", now(), booking.id);
  } else if (action === 'cancel') {
    run(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, late_cancel = 0, updated_at = ? WHERE id = ?",
      now(), reason || 'Cancelled by the club', now(), booking.id,
    );
  } else if (action === 'record_payment') {
    const owed = Math.max(0, booking.fee_cents - booking.paid_cents);
    const amount = Math.min(owed, Number(amountCents) || owed);
    if (amount <= 0) return res.status(400).json({ error: 'Nothing outstanding' });

    // Settle player shares oldest first so the group's rows stay truthful.
    let left = amount;
    for (const player of all('SELECT * FROM booking_players WHERE booking_id = ? ORDER BY is_organiser DESC, created_at', booking.id)) {
      if (left <= 0) break;
      const playerOwed = Math.max(0, player.share_cents - player.paid_cents);
      const take = Math.min(playerOwed, left);
      if (take <= 0) continue;
      run('UPDATE booking_players SET paid_cents = paid_cents + ? WHERE id = ?', take, player.id);
      left -= take;
    }
    run(
      `INSERT INTO booking_payments (id, booking_id, player_id, user_id, amount_cents, method, status, note, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, 'settled', 'Taken at the club', ?)`,
      uid('pay'), booking.id, req.user.id, amount, method, now(),
    );
    const paid = booking.paid_cents + amount;
    run(
      'UPDATE bookings SET paid_cents = ?, payment_status = ?, updated_at = ? WHERE id = ?',
      paid, paymentStatus(booking.fee_cents, paid), now(), booking.id,
    );
  } else if (action === 'waive') {
    run(
      "UPDATE bookings SET payment_status = 'waived', paid_cents = fee_cents, updated_at = ? WHERE id = ?",
      now(), booking.id,
    );
    run('UPDATE booking_players SET paid_cents = share_cents WHERE booking_id = ?', booking.id);
    run(
      `INSERT INTO booking_payments (id, booking_id, player_id, user_id, amount_cents, method, status, note, created_at)
       VALUES (?, ?, NULL, ?, ?, 'waived', 'settled', ?, ?)`,
      uid('pay'), booking.id, req.user.id, Math.max(0, booking.fee_cents - booking.paid_cents),
      reason || 'Waived by the club', now(),
    );
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  broadcast(`club:${req.club.id}`, 'teesheet', { date: booking.date, courseId: booking.course_id });
  res.json({ booking: bookingView(booking.id) });
});

/* ------------------------------------------------------------------ */
/* Customers — the club's own record of its golfers                    */
/* ------------------------------------------------------------------ */

router.get('/:id/admin/customers', requireAuth, requireClubAdmin, (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = all(
    `SELECT cc.*, u.name, u.email, u.handicap_index, u.avatar_color, u.avatar_url, u.home_club, u.phone
     FROM club_customers cc JOIN users u ON u.id = cc.user_id
     WHERE cc.club_id = ? AND (u.name LIKE ? OR u.email LIKE ?)
     ORDER BY u.name`,
    req.club.id, q, q,
  );

  res.json({
    customers: rows.map((row) => {
      const stats = get(
        `SELECT
           COUNT(*) AS bookings,
           COALESCE(SUM(CASE WHEN status IN ('played','checked_in') THEN 1 ELSE 0 END),0) AS visits,
           COALESCE(SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END),0) AS no_shows,
           COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END),0) AS cancellations,
           COALESCE(SUM(CASE WHEN status != 'cancelled' THEN paid_cents ELSE 0 END),0) AS spend,
           COALESCE(SUM(CASE WHEN status != 'cancelled' THEN fee_cents - paid_cents ELSE 0 END),0) AS outstanding,
           COALESCE(SUM(players),0) AS guests,
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
    }),
  });
});

router.patch('/:id/admin/customers/:userId', requireAuth, requireClubAdmin, (req, res) => {
  const { notes, tags, marketingOptIn } = req.body || {};
  run(
    `UPDATE club_customers SET
       notes = COALESCE(?, notes),
       tags = COALESCE(?, tags),
       marketing_opt_in = COALESCE(?, marketing_opt_in),
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

router.patch('/:id/admin/courses/:courseId', requireAuth, requireClubAdmin, (req, res) => {
  const course = get('SELECT * FROM courses WHERE id = ? AND club_id = ?', req.params.courseId, req.club.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const b = req.body || {};
  const num = (value) => (value === undefined || value === null || value === '' ? null : Number(value));
  run(
    `UPDATE courses SET
       interval_minutes = COALESCE(?, interval_minutes),
       first_tee = COALESCE(?, first_tee),
       last_tee = COALESCE(?, last_tee),
       slot_capacity = COALESCE(?, slot_capacity),
       weekday_fee_cents = COALESCE(?, weekday_fee_cents),
       weekend_fee_cents = COALESCE(?, weekend_fee_cents),
       cart_fee_cents = COALESCE(?, cart_fee_cents),
       booking_window_days = COALESCE(?, booking_window_days),
       cancellation_hours = COALESCE(?, cancellation_hours),
       bookable = COALESCE(?, bookable)
     WHERE id = ?`,
    num(b.intervalMinutes), b.firstTee ?? null, b.lastTee ?? null, num(b.slotCapacity),
    num(b.weekdayFeeCents), num(b.weekendFeeCents), num(b.cartFeeCents),
    num(b.bookingWindowDays), num(b.cancellationHours),
    b.bookable === undefined ? null : (b.bookable ? 1 : 0),
    course.id,
  );
  res.json({ course: courseView(get('SELECT * FROM courses WHERE id = ?', course.id)) });
});

router.patch('/:id/admin/profile', requireAuth, requireClubAdmin, (req, res) => {
  const { name, city, province, blurb, phone, email, website, brandColor } = req.body || {};
  run(
    `UPDATE clubs SET name = COALESCE(?, name), city = COALESCE(?, city), province = COALESCE(?, province),
       blurb = COALESCE(?, blurb), phone = COALESCE(?, phone), email = COALESCE(?, email),
       website = COALESCE(?, website), brand_color = COALESCE(?, brand_color)
     WHERE id = ?`,
    name ?? null, city ?? null, province ?? null, blurb ?? null, phone ?? null,
    email ?? null, website ?? null, brandColor ?? null, req.club.id,
  );
  res.json({ club: clubView(get('SELECT * FROM clubs WHERE id = ?', req.club.id)) });
});

router.post('/:id/admin/blocks', requireAuth, requireClubAdmin, (req, res) => {
  const { courseId, date, startTime, endTime, reason } = req.body || {};
  const course = get('SELECT * FROM courses WHERE id = ? AND club_id = ?', courseId, req.club.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  if (toMinutes(endTime) <= toMinutes(startTime)) {
    return res.status(400).json({ error: 'The end time must be after the start time' });
  }

  const id = uid('blk');
  run(
    'INSERT INTO tee_blocks (id, course_id, date, start_time, end_time, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, course.id, date, startTime, endTime, reason?.trim() || 'Closed', now(),
  );
  broadcast(`club:${req.club.id}`, 'teesheet', { date, courseId: course.id });
  res.status(201).json({ blockId: id });
});

router.delete('/:id/admin/blocks/:blockId', requireAuth, requireClubAdmin, (req, res) => {
  const block = get('SELECT * FROM tee_blocks WHERE id = ?', req.params.blockId);
  run('DELETE FROM tee_blocks WHERE id = ?', req.params.blockId);
  if (block) broadcast(`club:${req.club.id}`, 'teesheet', { date: block.date, courseId: block.course_id });
  res.json({ ok: true });
});

/* Slug lookup last, so it cannot swallow the named routes above. */
router.get('/:slug', requireAuth, (req, res) => {
  const club = get('SELECT * FROM clubs WHERE slug = ? OR id = ?', req.params.slug, req.params.slug);
  if (!club) return res.status(404).json({ error: 'Club not found' });
  if (club.status !== 'active' && !get('SELECT 1 AS x FROM club_admins WHERE club_id = ? AND user_id = ?', club.id, req.user.id)) {
    return res.status(404).json({ error: 'Club not found' });
  }
  res.json({ club: clubView(club) });
});

export default router;
