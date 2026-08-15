import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../store';
import { Empty, Sheet, Spinner, dayLabel, rands } from '../components/ui';
import { IconCheck, IconClock, IconPin, IconUsers } from '../components/icons';
import type { Booking } from '../types';

const STATUS_PILL: Record<Booking['status'], { label: string; cls: string }> = {
  confirmed: { label: 'Confirmed', cls: 'paid' },
  checked_in: { label: 'Checked in', cls: 'done' },
  played: { label: 'Played', cls: 'done' },
  no_show: { label: 'No show', cls: 'noshow' },
  cancelled: { label: 'Cancelled', cls: 'cancelled' },
};

const PAYMENT_PILL: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'paid' },
  part_paid: { label: 'Part paid', cls: 'part' },
  unpaid: { label: 'Unpaid', cls: 'unpaid' },
  refunded: { label: 'Refunded', cls: 'cancelled' },
  waived: { label: 'Waived', cls: 'waived' },
};

export default function Bookings() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setBookings(null);
    const { bookings: list } = await api.myBookings(scope);
    setBookings(list);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const replace = (updated: Booking) =>
    setBookings((list) => (list ?? []).map((b) => (b.id === updated.id ? updated : b)));

  return (
    <div className="screen">
      <header style={{ marginBottom: 14 }}>
        <div className="eyebrow">Your tee times</div>
        <h1 style={{ fontSize: 26 }}>Bookings</h1>
      </header>

      <div className="segmented" style={{ marginBottom: 16 }}>
        <button aria-selected={scope === 'upcoming'} onClick={() => setScope('upcoming')}>Upcoming</button>
        <button aria-selected={scope === 'past'} onClick={() => setScope('past')}>Past</button>
      </div>

      {bookings === null && <Spinner />}
      {bookings?.length === 0 && (
        <Empty
          glyph="📅"
          title={scope === 'upcoming' ? 'No tee times booked' : 'Nothing played yet'}
          hint={scope === 'upcoming' ? 'Find a slot under Tee times.' : undefined}
        />
      )}

      <div className="stack">
        {(bookings ?? []).map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            onChanged={replace}
            onCancel={() => setCancelling(booking)}
            toast={toast}
          />
        ))}
      </div>

      {cancelling && (
        <CancelSheet
          booking={cancelling}
          onClose={() => setCancelling(null)}
          onDone={(updated) => {
            replace(updated);
            setCancelling(null);
            toast(updated.lateCancel ? 'Cancelled — balance still owing' : 'Cancelled and refunded');
          }}
        />
      )}
    </div>
  );
}

function BookingCard({
  booking, onChanged, onCancel, toast,
}: {
  booking: Booking;
  onChanged: (b: Booking) => void;
  onCancel: () => void;
  toast: (m: string) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const status = STATUS_PILL[booking.status];
  const payment = PAYMENT_PILL[booking.money.status] ?? PAYMENT_PILL.unpaid;
  const active = booking.status !== 'cancelled';
  const owes = booking.money.outstandingCents > 0;

  const pay = async (scope: 'share' | 'balance') => {
    setBusy(true);
    try {
      const { booking: updated, settledCents } = await api.payBooking(booking.id, scope);
      onChanged(updated);
      toast(`Payment recorded — ${rands(settledCents)}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setBusy(false);
    }
  };

  const openRound = async () => {
    setBusy(true);
    try {
      const { gameId } = await api.bookingRound(booking.id);
      navigate(`/game/${gameId}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open the round');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack" style={{ gap: 12, opacity: active ? 1 : 0.62 }}>
      <div className="row between">
        <span className={`pill ${status.cls}`}>{status.label}</span>
        <span className="tiny muted num">{booking.ref}</span>
      </div>

      <div>
        <div style={{ fontWeight: 660, fontSize: 17, letterSpacing: '-0.03em' }}>{booking.club.name}</div>
        <div className="tiny muted row" style={{ gap: 4 }}>
          <IconPin /> {booking.course.name} · {booking.club.city}
        </div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="chip accent"><IconClock /> {dayLabel(booking.date)} · {booking.time}</span>
        <span className="chip"><IconUsers /> {booking.players}</span>
        <span className="chip">{booking.formatLabel} · {booking.scoring}</span>
        {booking.cart && <span className="chip">Cart</span>}
      </div>

      {active && (
        <div className="card flat tight stack" style={{ gap: 7 }}>
          <div className="row between small">
            <span className="muted">Total</span>
            <span className="money">{rands(booking.money.totalCents)}</span>
          </div>
          <div className="row between small">
            <span className="muted">Paid</span>
            <span className="money settled">{rands(booking.money.paidCents)}</span>
          </div>
          <div className="row between small">
            <span className="muted">Outstanding</span>
            <span className={`money ${owes ? 'owing' : 'settled'}`}>{rands(booking.money.outstandingCents)}</span>
          </div>
          <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 7 }}>
            <span className={`pill ${payment.cls}`}>{payment.label}</span>
            {owes && booking.isOrganiser && (
              <span className="tiny muted">You carry the balance</span>
            )}
          </div>
        </div>
      )}

      {booking.group.length > 1 && active && (
        <div className="stack" style={{ gap: 6 }}>
          {booking.group.map((p) => (
            <div key={p.id} className="row between tiny">
              <span className={p.outstandingCents > 0 ? 'muted' : ''}>
                {p.name}{p.isOrganiser ? ' · organiser' : ''}
              </span>
              <span className={p.outstandingCents > 0 ? 'money owing' : 'money settled'}>
                {p.outstandingCents > 0 ? `${rands(p.outstandingCents)} due` : <><IconCheck size={12} /> paid</>}
              </span>
            </div>
          ))}
        </div>
      )}

      {booking.status === 'cancelled' && (
        <div className={booking.lateCancel ? 'notice' : 'notice calm'}>
          {booking.lateCancel
            ? `Cancelled inside the ${booking.cancellation.windowHours}-hour window${booking.money.outstandingCents > 0 ? ` — ${rands(booking.money.outstandingCents)} still payable.` : '.'}`
            : 'Cancelled in good time — anything paid was refunded in full.'}
        </div>
      )}

      {active && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {owes && booking.myShare && booking.myShare.outstandingCents > 0 && (
            <button className="btn sm primary" disabled={busy} onClick={() => pay('share')}>
              Pay my {rands(booking.myShare.outstandingCents)}
            </button>
          )}
          {owes && booking.isOrganiser && (
            <button className="btn sm" disabled={busy} onClick={() => pay('balance')}>
              Pay balance {rands(booking.money.outstandingCents)}
            </button>
          )}
          {['confirmed', 'checked_in'].includes(booking.status) && (
            <button className="btn sm" disabled={busy} onClick={openRound}>
              {booking.roundStatus === 'live' ? 'Continue scoring' : 'Open round'}
            </button>
          )}
          {booking.isOrganiser && booking.status === 'confirmed' && (
            <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
          )}
        </div>
      )}
    </div>
  );
}

/** The consequence is stated before the golfer commits, never after. */
function CancelSheet({
  booking, onClose, onDone,
}: {
  booking: Booking;
  onClose: () => void;
  onDone: (b: Booking) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const { cancellation: rule } = booking;

  return (
    <Sheet open onClose={onClose} title="Cancel this booking?">
      <div className="stack">
        <div className="card tight">
          <div style={{ fontWeight: 620 }}>{booking.club.name}</div>
          <div className="tiny muted">
            {booking.course.name} · {dayLabel(booking.date)} at {booking.time} · {booking.players} players
          </div>
        </div>

        <div className={rule.free ? 'notice calm' : 'notice'}>{rule.message}</div>

        <div className="card flat tight stack" style={{ gap: 6 }}>
          <div className="row between small">
            <span className="muted">Tee-off in</span>
            <span className="num">{rule.hoursUntil} hours</span>
          </div>
          <div className="row between small">
            <span className="muted">Free cancellation window</span>
            <span className="num">{rule.windowHours} hours</span>
          </div>
          <div className="row between small">
            <span className="muted">Refund</span>
            <span className="money settled">{rands(rule.refundCents)}</span>
          </div>
          <div className="row between small">
            <span className="muted">You would still owe</span>
            <span className={`money ${rule.liabilityCents > 0 ? 'owing' : 'settled'}`}>
              {rands(rule.liabilityCents)}
            </span>
          </div>
        </div>

        <input
          className="input"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <button
          className={`btn block ${rule.free ? '' : 'danger'}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { booking: updated } = await api.cancelBooking(booking.id, reason || undefined);
              onDone(updated);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Cancelling…' : rule.free ? 'Cancel and refund' : `Cancel anyway — ${rands(rule.liabilityCents)} still owed`}
        </button>
        <button className="btn ghost block" onClick={onClose}>Keep the booking</button>
      </div>
    </Sheet>
  );
}
