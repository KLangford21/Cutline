import { Router } from 'express';
import crypto from 'node:crypto';
import { all, get, run, now, transaction } from '../db.js';
import { requireAuth } from '../auth.js';
import { broadcast } from '../realtime.js';
import {
  availability, cancellationState, paymentStatus, quote, splitShares, today, validateBooking,
} from '../teetimes.js';
import { FORMATS, isTeamFormat } from '../scoring.js';
import { createRound } from '../rounds.js';

const router = Router();
const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;

/** Raised when a slot is taken. Carries the message the client should see. */
class SlotConflict extends Error {}

/** `getFn` lets this run either on the pool or inside an open transaction. */
const newRef = async (getFn = get) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref;
  do {
    ref = `CL-${Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')}`;
  } while (await getFn('SELECT id FROM bookings WHERE ref = ?', ref));
  return ref;
};

const ACTIVE = "status IN ('confirmed','checked_in','played')";

export const liveBookings = (courseId, date) =>
  all(`SELECT * FROM bookings WHERE course_id = ? AND date = ? AND ${ACTIVE}`, courseId, date);

export const blocksFor = (courseId, date) =>
  all('SELECT * FROM tee_blocks WHERE course_id = ? AND date = ?', courseId, date);

/** Everything the UI needs about one booking, including the money. */
export async function bookingView(id, viewerId = null) {
  const booking = await get('SELECT * FROM bookings WHERE id = ?', id);
  if (!booking) return null;

  const [course, club, players, payments, round] = await Promise.all([
    get('SELECT * FROM courses WHERE id = ?', booking.course_id),
    get('SELECT * FROM clubs WHERE id = ?', booking.club_id),
    all('SELECT * FROM booking_players WHERE booking_id = ? ORDER BY is_organiser DESC, created_at', id),
    all('SELECT * FROM booking_payments WHERE booking_id = ? ORDER BY created_at', id),
    booking.game_id ? get('SELECT status FROM games WHERE id = ?', booking.game_id) : null,
  ]);

  const organiser = players.find((p) => p.is_organiser);
  const outstanding = Math.max(0, booking.fee_cents - booking.paid_cents);
  const mine = viewerId ? players.find((p) => p.user_id === viewerId) : null;

  return {
    id: booking.id,
    ref: booking.ref,
    status: booking.status,
    date: booking.date,
    time: booking.time,
    players: booking.players,
    cart: Boolean(booking.cart),
    notes: booking.notes,
    source: booking.source,
    gameId: booking.game_id,
    format: booking.format,
    formatLabel: FORMATS[booking.format]?.label ?? booking.format,
    scoring: booking.scoring,
    roundStatus: round?.status ?? null,
    createdAt: booking.created_at,
    checkedInAt: booking.checked_in_at,
    cancelledAt: booking.cancelled_at,
    cancelReason: booking.cancel_reason,
    lateCancel: Boolean(booking.late_cancel),
    club: club && { id: club.id, name: club.name, slug: club.slug, city: club.city, province: club.province, brandColor: club.brand_color, phone: club.phone },
    course: course && { id: course.id, name: course.name, par: course.par },
    money: {
      currency: 'ZAR',
      totalCents: booking.fee_cents,
      paidCents: booking.paid_cents,
      outstandingCents: outstanding,
      status: booking.payment_status,
      organiserOwesCents: booking.status === 'cancelled' && !booking.late_cancel ? 0 : outstanding,
    },
    organiser: organiser && { id: organiser.user_id, name: organiser.name },
    isOrganiser: Boolean(organiser && viewerId && organiser.user_id === viewerId),
    myShare: mine && {
      playerId: mine.id,
      shareCents: mine.share_cents,
      paidCents: mine.paid_cents,
      outstandingCents: Math.max(0, mine.share_cents - mine.paid_cents),
    },
    group: players.map((p) => ({
      id: p.id,
      userId: p.user_id,
      name: p.name,
      isOrganiser: Boolean(p.is_organiser),
      shareCents: p.share_cents,
      paidCents: p.paid_cents,
      outstandingCents: Math.max(0, p.share_cents - p.paid_cents),
    })),
    payments: payments.map((p) => ({
      id: p.id, amountCents: p.amount_cents, method: p.method,
      status: p.status, note: p.note, createdAt: p.created_at,
    })),
    cancellation: cancellationState(booking, course),
  };
}

/** The club's own customer record, created the first time a golfer books. */
async function touchCustomer(clubId, userId) {
  await run(
    `INSERT INTO club_customers (club_id, user_id, notes, tags, marketing_opt_in, first_seen, updated_at)
     VALUES (?, ?, NULL, NULL, 0, ?, ?)
     ON CONFLICT (club_id, user_id) DO UPDATE SET updated_at = excluded.updated_at`,
    clubId, userId, now(), now(),
  );
}

/** Recomputes the booking's paid total and status from its player rows. */
async function rollUpPayments(bookingId) {
  const players = await all('SELECT * FROM booking_players WHERE booking_id = ?', bookingId);
  const paid = players.reduce((sum, p) => sum + p.paid_cents, 0);
  const booking = await get('SELECT fee_cents FROM bookings WHERE id = ?', bookingId);
  await run(
    'UPDATE bookings SET paid_cents = ?, payment_status = ?, updated_at = ? WHERE id = ?',
    paid, paymentStatus(booking.fee_cents, paid), now(), bookingId,
  );
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

router.get('/availability', requireAuth, async (req, res) => {
  const { courseId, date = today() } = req.query;
  const course = await get('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const [bookings, blocks] = await Promise.all([
    liveBookings(course.id, date),
    blocksFor(course.id, date),
  ]);
  const slots = availability(course, date, bookings, blocks);
  res.json({
    date,
    course: {
      id: course.id, name: course.name, par: course.par,
      capacity: course.slot_capacity, intervalMinutes: course.interval_minutes,
      bookingWindowDays: course.booking_window_days,
      cancellationHours: course.cancellation_hours,
      cartFeeCents: course.cart_fee_cents,
    },
    slots: slots.map(({ bookings: slotBookings, ...slot }) => ({ ...slot, groups: slotBookings.length })),
  });
});

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

router.post('/', requireAuth, async (req, res) => {
  const {
    courseId, date, time, players = 1, guestNames = [], partners = [],
    cart = false, notes = null, format = 'stableford', scoring = 'net',
  } = req.body || {};
  if (!FORMATS[format]) return res.status(400).json({ error: 'Unknown game format' });

  const course = await get('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const club = await get('SELECT * FROM clubs WHERE id = ?', course.club_id);
  if (!club || club.status !== 'active') {
    return res.status(400).json({ error: 'That club is not taking bookings yet' });
  }

  const count = Number(players);
  const pricing = quote(course, date, count, Boolean(cart));
  const bookingId = uid('bkg');
  const stamp = now();

  // Partners may be Cutline players (so they keep their handicap and can pay
  // their own share) or plain guest names. guestNames stays supported.
  // Resolved before the transaction: these are reads with no bearing on the slot.
  const entries = partners.length ? partners : guestNames.map((name) => ({ name }));
  const resolved = await Promise.all(entries.map(async (entry) => {
    const user = entry.userId ? await get('SELECT * FROM users WHERE id = ?', entry.userId) : null;
    return { userId: user?.id ?? null, name: user?.name ?? entry.name };
  }));
  const roster = [{ userId: req.user.id, name: req.user.name }, ...resolved];

  try {
    await transaction(async (tx) => {
      // Serialises every booking attempt for this course on this date. The
      // synchronous SQLite driver gave this for free — nothing could interleave
      // between the availability check and the insert. Postgres is async and
      // pooled, so without this lock two concurrent requests can both pass the
      // check and oversell the slot.
      await tx.run('SELECT pg_advisory_xact_lock(hashtext(?::text))', `${course.id}:${date}`);

      const existing = await tx.all(
        `SELECT * FROM bookings WHERE course_id = ? AND date = ? AND ${ACTIVE}`, course.id, date,
      );
      const blocks = await tx.all('SELECT * FROM tee_blocks WHERE course_id = ? AND date = ?', course.id, date);
      const slots = availability(course, date, existing, blocks);
      const problem = validateBooking({
        course, date, time, players, slots, userId: req.user.id, existing,
      });
      if (problem) throw new SlotConflict(problem);

      await tx.run(
        `INSERT INTO bookings (id, ref, club_id, course_id, user_id, date, time, players, guest_names,
           status, fee_cents, paid_cents, payment_status, cart, notes, source, cancellation_hours,
           format, scoring, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, 0, 'unpaid', ?, ?, 'app', ?, ?, ?, ?, ?)`,
        bookingId, await newRef(tx.get), club.id, course.id, req.user.id, date, time, count,
        JSON.stringify(guestNames), pricing.totalCents, cart ? 1 : 0, notes,
        course.cancellation_hours ?? 24, format, scoring, stamp, stamp,
      );

      for (const [i, share] of pricing.shares.entries()) {
        const entry = roster[i] ?? {};
        await tx.run(
          `INSERT INTO booking_players (id, booking_id, user_id, name, share_cents, paid_cents, is_organiser, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          uid('bpl'), bookingId, entry.userId ?? null,
          entry.name?.trim() || `Guest ${i + 1}`, share, i === 0 ? 1 : 0, stamp,
        );
      }
    });
  } catch (err) {
    if (err instanceof SlotConflict) return res.status(409).json({ error: err.message });
    throw err;
  }

  // The round is set up with the tee time, not as a separate chore afterwards.
  // It sits 'scheduled' until someone enters a score on the day. Outside the
  // transaction: it holds no slot capacity, so it need not block other bookings.
  const bookingPlayers = await all(
    'SELECT * FROM booking_players WHERE booking_id = ? ORDER BY is_organiser DESC, created_at', bookingId,
  );
  const gameId = await createRound({
    courseId: course.id,
    name: `${course.name} · ${date}`,
    format,
    scoring,
    status: 'scheduled',
    createdBy: req.user.id,
    players: bookingPlayers.map((p, i) => ({
      userId: p.user_id ?? undefined,
      name: p.name,
      team: isTeamFormat(format) ? (i % 2 === 0 ? 'A' : 'B') : undefined,
    })),
  });
  await run('UPDATE bookings SET game_id = ?, updated_at = ? WHERE id = ?', gameId, now(), bookingId);

  await touchCustomer(club.id, req.user.id);
  broadcast(`club:${club.id}`, 'teesheet', { date, courseId: course.id });
  res.status(201).json({ booking: await bookingView(bookingId, req.user.id) });
});

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

router.get('/', requireAuth, async (req, res) => {
  const scope = req.query.scope === 'past' ? 'past' : 'upcoming';
  const rows = await all(
    `SELECT b.id FROM bookings b
     WHERE b.user_id = ? AND (b.date ${scope === 'upcoming' ? '>=' : '<'} ?)
     ORDER BY b.date ${scope === 'upcoming' ? 'ASC' : 'DESC'}, b.time ASC`,
    req.user.id, today(),
  );
  const bookings = await Promise.all(rows.map((r) => bookingView(r.id, req.user.id)));
  res.json({ bookings });
});

router.get('/:id', requireAuth, async (req, res) => {
  const view = await bookingView(req.params.id, req.user.id);
  if (!view) return res.status(404).json({ error: 'Booking not found' });
  res.json({ booking: view });
});

/* ------------------------------------------------------------------ */
/* Pay                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Settles a share or the whole balance.
 *
 * This records a payment — it does not move money. Wiring a real card charge
 * needs a South African PSP (PayFast, Yoco or Peach) and credentials.
 */
router.post('/:id/pay', requireAuth, async (req, res) => {
  const booking = await get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const players = await all('SELECT * FROM booking_players WHERE booking_id = ?', booking.id);
  const organiser = players.find((p) => p.is_organiser);
  const isOrganiser = organiser?.user_id === req.user.id;
  if (!isOrganiser && !players.some((p) => p.user_id === req.user.id)) {
    return res.status(403).json({ error: 'You are not on this booking' });
  }
  if (booking.status === 'cancelled' && !booking.late_cancel) {
    return res.status(400).json({ error: 'That booking was cancelled' });
  }

  const { scope = 'share', method = 'card' } = req.body || {};
  // The organiser carries the group's liability, so they can settle everything.
  const targets = scope === 'balance'
    ? (isOrganiser ? players : players.filter((p) => p.user_id === req.user.id))
    : players.filter((p) => p.user_id === req.user.id || (isOrganiser && p.id === req.body?.playerId));

  if (!targets.length) return res.status(400).json({ error: 'Nothing to pay' });

  let total = 0;
  for (const player of targets) {
    const owed = Math.max(0, player.share_cents - player.paid_cents);
    if (owed <= 0) continue;
    await run('UPDATE booking_players SET paid_cents = share_cents WHERE id = ?', player.id);
    await run(
      `INSERT INTO booking_payments (id, booking_id, player_id, user_id, amount_cents, method, status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'settled', ?, ?)`,
      uid('pay'), booking.id, player.id, req.user.id, owed, method,
      `Recorded payment for ${player.name}`, now(),
    );
    total += owed;
  }

  if (total === 0) return res.status(400).json({ error: 'That is already paid' });
  await rollUpPayments(booking.id);
  broadcast(`club:${booking.club_id}`, 'teesheet', { date: booking.date, courseId: booking.course_id });
  res.json({ booking: await bookingView(booking.id, req.user.id), settledCents: total });
});

/* ------------------------------------------------------------------ */
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

router.post('/:id/cancel', requireAuth, async (req, res) => {
  const booking = await get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the organiser can cancel this booking' });
  }
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });

  const course = await get('SELECT * FROM courses WHERE id = ?', booking.course_id);
  const state = cancellationState(booking, course);

  if (state.free && booking.paid_cents > 0) {
    await run(
      `INSERT INTO booking_payments (id, booking_id, player_id, user_id, amount_cents, method, status, note, created_at)
       VALUES (?, ?, NULL, ?, ?, 'refund', 'refunded', 'Cancelled outside the window', ?)`,
      uid('pay'), booking.id, req.user.id, -booking.paid_cents, now(),
    );
    await run('UPDATE booking_players SET paid_cents = 0 WHERE booking_id = ?', booking.id);
  }

  // Drop the round that came with the booking, but only if nobody has scored
  // on it — a round already under way is never thrown away silently.
  if (booking.game_id) {
    // COUNT(*) is bigint and the driver returns bigint as a string, so this is
    // cast to int. Without it the comparison below is "0" === 0, always false,
    // and the round would never be cleaned up.
    const scored = (await get('SELECT COUNT(*)::int AS n FROM scores WHERE game_id = ?', booking.game_id)).n;
    if (scored === 0) {
      // Clear the reference before deleting, or the foreign key rejects it.
      await run('UPDATE bookings SET game_id = NULL WHERE id = ?', booking.id);
      await run('DELETE FROM games WHERE id = ?', booking.game_id);
    }
  }

  await run(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?,
       late_cancel = ?, paid_cents = ?, payment_status = ?, updated_at = ?
     WHERE id = ?`,
    now(), req.body?.reason || null, state.free ? 0 : 1,
    state.free ? 0 : booking.paid_cents,
    state.free ? 'refunded' : booking.payment_status,
    now(), booking.id,
  );

  broadcast(`club:${booking.club_id}`, 'teesheet', { date: booking.date, courseId: booking.course_id });
  res.json({ booking: await bookingView(booking.id, req.user.id), cancellation: state });
});

/* ------------------------------------------------------------------ */
/* Turn a booking into a scored round                                  */
/* ------------------------------------------------------------------ */

/**
 * The round for a booking. Normally it already exists — it is created with the
 * booking — so this just hands back its id. Bookings made before rounds were
 * attached (and any whose round was dropped on cancellation) get one built now.
 */
router.post('/:id/round', requireAuth, async (req, res) => {
  const booking = await get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'That booking was cancelled' });
  if (booking.game_id) return res.json({ gameId: booking.game_id });

  const course = await get('SELECT * FROM courses WHERE id = ?', booking.course_id);
  const format = booking.format || 'stableford';
  const bookingPlayers = await all(
    'SELECT * FROM booking_players WHERE booking_id = ? ORDER BY is_organiser DESC, created_at', booking.id,
  );
  const gameId = await createRound({
    courseId: booking.course_id,
    name: `${course.name} · ${booking.date}`,
    format,
    scoring: booking.scoring || 'net',
    status: booking.date > today() ? 'scheduled' : 'live',
    createdBy: booking.user_id,
    players: bookingPlayers.map((p, i) => ({
      userId: p.user_id ?? undefined,
      name: p.name,
      team: isTeamFormat(format) ? (i % 2 === 0 ? 'A' : 'B') : undefined,
    })),
  });
  await run('UPDATE bookings SET game_id = ?, updated_at = ? WHERE id = ?', gameId, now(), booking.id);
  res.json({ gameId });
});

router.patch('/:id/round', requireAuth, async (req, res) => {
  const booking = await get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  await run('UPDATE bookings SET game_id = ?, updated_at = ? WHERE id = ?', req.body?.gameId ?? null, now(), booking.id);
  res.json({ booking: await bookingView(booking.id, req.user.id) });
});

export { rollUpPayments, touchCustomer, uid as bookingUid };
export default router;
