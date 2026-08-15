/**
 * Tee-sheet logic: slot generation, availability, pricing and the cancellation
 * window. Kept apart from the routes the same way scoring.js is, so the rules
 * can be reasoned about — and tested — on their own.
 *
 * Dates are 'YYYY-MM-DD' and times 'HH:MM', both local. South Africa runs a
 * single timezone with no daylight saving, so there is no conversion to do.
 */

export const toMinutes = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
};

export const toTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local

/** Midday parse avoids any edge where a date string lands on the wrong day. */
export const dayOfWeek = (date) => new Date(`${date}T12:00:00`).getDay();

export const isWeekend = (date) => [0, 6].includes(dayOfWeek(date));

export const teeDateTime = (date, time) => new Date(`${date}T${time}:00`);

export const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);

export const addDays = (date, days) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
};

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

/** Green fee per player, in cents, for the date being played. */
export const feePerPlayer = (course, date) =>
  isWeekend(date) ? course.weekend_fee_cents : course.weekday_fee_cents;

/**
 * Splits a total into whole cents across n players. The remainder lands on the
 * first players so the shares always add back up to the total exactly.
 */
export function splitShares(totalCents, players) {
  const base = Math.floor(totalCents / players);
  const remainder = totalCents - base * players;
  return Array.from({ length: players }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function quote(course, date, players, cart = false) {
  const perPlayer = feePerPlayer(course, date);
  const greenFees = perPlayer * players;
  const cartFees = cart ? course.cart_fee_cents * players : 0;
  const total = greenFees + cartFees;
  return {
    perPlayerFee: perPlayer,
    cartFeePerPlayer: cart ? course.cart_fee_cents : 0,
    greenFeeCents: greenFees,
    cartCents: cartFees,
    totalCents: total,
    shares: splitShares(total, players),
    weekend: isWeekend(date),
  };
}

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

/** Every tee time the course publishes on a given date, before demand. */
export function generateSlots(course, date) {
  const start = toMinutes(course.first_tee);
  const end = toMinutes(course.last_tee);
  const step = Math.max(5, course.interval_minutes);
  const price = feePerPlayer(course, date);

  const slots = [];
  for (let t = start; t <= end; t += step) {
    slots.push({
      time: toTime(t),
      minutes: t,
      capacity: course.slot_capacity,
      booked: 0,
      remaining: course.slot_capacity,
      pricePerPlayer: price,
      status: 'open',
      blockReason: null,
      bookings: [],
    });
  }
  return slots;
}

const blocks = (block, minutes) =>
  minutes >= toMinutes(block.start_time) && minutes < toMinutes(block.end_time);

/**
 * Slots with live demand applied: seats taken by confirmed bookings, ranges the
 * club has closed, and — for today — times that have already gone.
 *
 * `bookingRows` should already exclude cancelled bookings.
 */
export function availability(course, date, bookingRows = [], blockRows = [], now = new Date()) {
  const slots = generateSlots(course, date);
  const byTime = new Map(slots.map((s) => [s.time, s]));

  for (const booking of bookingRows) {
    const slot = byTime.get(booking.time);
    if (!slot) continue;
    slot.booked += booking.players;
    slot.remaining = Math.max(0, slot.capacity - slot.booked);
    slot.bookings.push(booking);
  }

  const nowDate = now.toLocaleDateString('en-CA');
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const slot of slots) {
    const block = blockRows.find((b) => blocks(b, slot.minutes));
    if (block) {
      slot.status = 'blocked';
      slot.blockReason = block.reason || 'Closed';
      slot.remaining = 0;
      continue;
    }
    if (date < nowDate || (date === nowDate && slot.minutes <= nowMinutes)) {
      slot.status = 'past';
      slot.remaining = 0;
      continue;
    }
    slot.status = slot.remaining === 0 ? 'full' : 'open';
  }

  return slots;
}

/* ------------------------------------------------------------------ */
/* Booking rules                                                       */
/* ------------------------------------------------------------------ */

/**
 * Returns an error string when a booking must be refused, or null when it may
 * proceed. Every rule that protects the tee sheet lives here.
 */
export function validateBooking({ course, date, time, players, slots, userId, existing = [] }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick a valid date';
  if (!course.bookable) return 'This course is not taking online bookings';

  const daysOut = daysBetween(today(), date);
  if (daysOut < 0) return 'That date has already passed';
  if (daysOut > course.booking_window_days) {
    return `${course.name} only opens its sheet ${course.booking_window_days} days ahead`;
  }

  const slot = slots.find((s) => s.time === time);
  if (!slot) return 'That tee time is not on the sheet';
  if (slot.status === 'past') return 'That tee time has already gone';
  if (slot.status === 'blocked') return `That time is closed — ${slot.blockReason}`;

  const wanted = Number(players);
  if (!Number.isInteger(wanted) || wanted < 1 || wanted > slot.capacity) {
    return `Groups can be 1 to ${slot.capacity} players`;
  }
  if (wanted > slot.remaining) {
    return slot.remaining === 0
      ? 'That tee time just filled up'
      : `Only ${slot.remaining} ${slot.remaining === 1 ? 'space' : 'spaces'} left at that time`;
  }
  if (existing.some((b) => b.user_id === userId && b.time === time)) {
    return 'You already have a booking at that time';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Cancellation                                                        */
/* ------------------------------------------------------------------ */

/**
 * The 24-hour rule (per-course setting). Outside the window a cancellation is
 * free and anything settled is refunded. Inside it, money already paid is
 * retained and the balance stays owing — from the organiser, who made the
 * booking and carries the group's liability.
 */
export function cancellationState(booking, course, now = new Date()) {
  const teeAt = teeDateTime(booking.date, booking.time);
  const hoursUntil = (teeAt - now) / 3600000;
  // The terms the booking was made under win over the club's current setting.
  const windowHours = booking.cancellation_hours ?? course?.cancellation_hours ?? 24;
  const free = hoursUntil >= windowHours;
  const outstanding = Math.max(0, booking.fee_cents - booking.paid_cents);

  return {
    free,
    windowHours,
    hoursUntil: Math.round(hoursUntil * 10) / 10,
    deadline: new Date(teeAt.getTime() - windowHours * 3600000).toISOString(),
    refundCents: free ? booking.paid_cents : 0,
    liabilityCents: free ? 0 : outstanding,
    message: free
      ? 'Free cancellation — anything paid is refunded in full.'
      : `Inside the ${windowHours}-hour window. Payments already made are retained and the outstanding balance stays payable by the organiser.`,
  };
}

/** Rolls per-player payments up into the booking's headline payment status. */
export function paymentStatus(feeCents, paidCents) {
  if (paidCents <= 0) return 'unpaid';
  if (paidCents >= feeCents) return 'paid';
  return 'part_paid';
}
