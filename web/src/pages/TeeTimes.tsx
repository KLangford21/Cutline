import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAsync, useAuth, useToast } from '../store';
import {
  Avatar, Empty, Sheet, Spinner, dayLabel, rands,
} from '../components/ui';
import {
  IconCheck, IconChevronLeft, IconClock, IconPin, IconSearch, IconUsers,
} from '../components/icons';
import type { Availability, Club, ClubCourse, Slot, User } from '../types';

type Partner = { userId?: string; name: string; handicapIndex?: number; avatarColor?: string };

const isoDays = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString('en-CA');
  });

/* ================================================================== */
/* Browse                                                             */
/* ================================================================== */

export default function TeeTimes() {
  const [province, setProvince] = useState('');
  const [q, setQ] = useState('');

  const provinces = useAsync(() => api.provinces(), []);
  const clubs = useAsync(() => api.clubs({ province, q }), [province, q]);

  return (
    <div className="screen flush">
      <header className="row between" style={{ marginBottom: 14, alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">South Africa</div>
          <h1 style={{ fontSize: 26 }}>Tee times</h1>
        </div>
        <Link to="/bookings" className="btn sm">My bookings</Link>
      </header>

      <div className="row card tight" style={{ gap: 10, marginBottom: 12 }}>
        <IconSearch />
        <input
          className="input"
          style={{ border: 0, background: 'transparent', padding: 0 }}
          placeholder="Search clubs or towns"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="bleed">
        <div className="pill-scroll">
          <button aria-selected={province === ''} onClick={() => setProvince('')}>All provinces</button>
          {(provinces.data?.provinces ?? []).map((p) => (
            <button key={p.province} aria-selected={province === p.province} onClick={() => setProvince(p.province)}>
              {p.province} ({p.clubs})
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {clubs.loading && <Spinner />}
        {!clubs.loading && (clubs.data?.clubs.length ?? 0) === 0 && (
          <Empty glyph="⛳" title="No clubs here yet" hint="Try another province, or clear the search." />
        )}
        <div className="stack">
          {(clubs.data?.clubs ?? []).map((club) => (
            <Link key={club.id} to={`/tee-times/${club.slug}`} className="card club-card">
              <div className="club-strip" style={{ ['--c' as string]: club.brandColor }} />
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{club.name}</div>
                  <div className="tiny muted row" style={{ gap: 4 }}>
                    <IconPin /> {club.city}, {club.province}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="money">{club.fromFeeCents ? rands(club.fromFeeCents) : '—'}</div>
                  <div className="tiny muted">from</div>
                </div>
              </div>

              {club.blurb && <p className="tiny muted" style={{ lineHeight: 1.5 }}>{club.blurb}</p>}

              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="chip">{club.courses.length} {club.courses.length === 1 ? 'course' : 'courses'}</span>
                {club.nextTee
                  ? <span className="chip accent"><IconClock /> next {club.nextTee}</span>
                  : <span className="chip">fully booked today</span>}
                {typeof club.openSlots === 'number' && club.openSlots > 0 && (
                  <span className="chip">{club.openSlots} open today</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Club detail + slot picker                                          */
/* ================================================================== */

export function ClubTeeTimes() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [club, setClub] = useState<Club | null>(null);
  const [course, setCourse] = useState<ClubCourse | null>(null);
  const [date, setDate] = useState(isoDays(1)[0]);
  const [sheet, setSheet] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.club(slug)
      .then(({ club: found }) => {
        if (!live) return;
        setClub(found);
        setCourse(found.courses.find((c) => c.bookable) ?? found.courses[0] ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the club'));
    return () => { live = false; };
  }, [slug]);

  useEffect(() => {
    if (!course) return;
    let live = true;
    setLoading(true);
    api.availability(course.id, date)
      .then((data) => { if (live) setSheet(data); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load tee times'))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [course, date]);

  const days = useMemo(
    () => isoDays(Math.min(14, (course?.bookingWindowDays ?? 14) + 1)),
    [course],
  );

  if (error) {
    return (
      <div className="screen">
        <div className="error-banner">{error}</div>
        <button className="btn block" style={{ marginTop: 14 }} onClick={() => navigate('/tee-times')}>
          Back to tee times
        </button>
      </div>
    );
  }
  if (!club || !course) return <Spinner />;

  return (
    <div className="screen flush">
      <header className="row" style={{ gap: 10, marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => navigate('/tee-times')} aria-label="Back"><IconChevronLeft /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 660, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {club.name}
          </div>
          <div className="tiny muted">{club.city}, {club.province}</div>
        </div>
        <Avatar name={club.name} color={club.brandColor} size={38} variant="outline" />
      </header>

      {club.courses.length > 1 && (
        <div className="segmented" style={{ marginBottom: 14 }}>
          {club.courses.map((c) => (
            <button key={c.id} aria-selected={course.id === c.id} onClick={() => setCourse(c)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="card tight" style={{ marginBottom: 12 }}>
        <div className="row between">
          <div>
            <div style={{ fontWeight: 620 }}>{course.name}</div>
            <div className="tiny muted">
              Par {course.par} · {course.tee} tees · CR {course.rating} / SL {course.slope}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="money">{rands(course.weekdayFeeCents)}</div>
            <div className="tiny muted">weekday</div>
          </div>
        </div>
        <div className="row tiny muted" style={{ gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <span>Weekend {rands(course.weekendFeeCents)}</span>
          <span>Cart {rands(course.cartFeeCents)}</span>
          <span>Free cancellation to {course.cancellationHours}h</span>
        </div>
      </div>

      <div className="bleed">
        <div className="date-strip">
          {days.map((d) => {
            const parsed = new Date(`${d}T12:00:00`);
            return (
              <button key={d} aria-selected={d === date} onClick={() => setDate(d)}>
                <span className="dow">{parsed.toLocaleDateString('en-ZA', { weekday: 'short' })}</span>
                <span className="dom num">{parsed.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="row between" style={{ margin: '16px 0 10px' }}>
        <h2 style={{ fontSize: 17 }}>{dayLabel(date)}</h2>
        <span className="tiny muted">
          {sheet ? `${sheet.slots.filter((s) => s.status === 'open').length} of ${sheet.slots.length} open` : ''}
        </span>
      </div>

      {loading && <Spinner />}
      {!loading && sheet && (
        sheet.slots.every((s) => s.status !== 'open') ? (
          <Empty glyph="🚫" title="Nothing open on this date" hint="Try another day on the strip above." />
        ) : (
          <div className="slot-grid">
            {sheet.slots.map((s) => (
              <button
                key={s.time}
                className="slot"
                data-state={s.status}
                aria-selected={slot?.time === s.time}
                onClick={() => setSlot(s)}
                title={s.blockReason ?? undefined}
              >
                <span className="t num">{s.time}</span>
                <span className="p">{rands(s.pricePerPlayer)}</span>
                <span className="left">
                  {s.status === 'open' ? `${s.remaining} left`
                    : s.status === 'full' ? 'full'
                      : s.status === 'blocked' ? (s.blockReason ?? 'closed') : 'gone'}
                </span>
              </button>
            ))}
          </div>
        )
      )}

      {slot && course && (
        <BookingSheet
          club={club}
          course={course}
          date={date}
          slot={slot}
          organiserName={user?.name ?? 'You'}
          onClose={() => setSlot(null)}
          onBooked={(ref) => {
            toast(`Booked — ${ref}`);
            navigate('/bookings');
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Booking sheet                                                       */
/* ------------------------------------------------------------------ */

function BookingSheet({
  club, course, date, slot, organiserName, onClose, onBooked,
}: {
  club: Club;
  course: ClubCourse;
  date: string;
  slot: Slot;
  organiserName: string;
  onClose: () => void;
  onBooked: (ref: string) => void;
}) {
  const [players, setPlayers] = useState(Math.min(4, slot.remaining));
  const [partners, setPartners] = useState<Partner[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slotIndex, setSlotIndex] = useState(0);
  const [cart, setCart] = useState(false);
  const [format, setFormat] = useState('stableford');
  const [scoring, setScoring] = useState<'net' | 'gross'>('net');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formats = useAsync(() => api.formats(), []);
  const chosen = formats.data?.formats.find((f) => f.key === format);

  // Team formats need an even field; fall back rather than book something broken.
  useEffect(() => {
    if (chosen?.team && players < 2) setFormat('stableford');
  }, [chosen, players]);

  const greenFees = slot.pricePerPlayer * players;
  const cartFees = cart ? course.cartFeeCents * players : 0;
  const total = greenFees + cartFees;
  const share = Math.floor(total / players);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { booking } = await api.createBooking({
        courseId: course.id,
        date,
        time: slot.time,
        players,
        partners: Array.from({ length: players - 1 }, (_, i) =>
          partners[i] ?? { name: `Guest ${i + 2}` }),
        cart,
        format,
        scoring,
      });
      onBooked(booking.ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the booking');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`${slot.time} · ${dayLabel(date)}`}>
      <div className="stack">
        <div className="card tight">
          <div style={{ fontWeight: 620 }}>{club.name}</div>
          <div className="tiny muted">{course.name} · Par {course.par} · {club.city}</div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label>Players</label>
          <div className="segmented">
            {[1, 2, 3, 4].filter((n) => n <= slot.remaining).map((n) => (
              <button key={n} aria-selected={players === n} onClick={() => setPlayers(n)}>{n}</button>
            ))}
          </div>
        </div>

        {players > 1 && (
          <div className="field">
            <label>Playing partners</label>
            <div className="stack" style={{ gap: 8 }}>
              {Array.from({ length: players - 1 }, (_, i) => {
                const partner = partners[i];
                return (
                  <div key={i} className="card tight row" style={{ gap: 10 }}>
                    {partner
                      ? <Avatar name={partner.name} color={partner.avatarColor ?? '#7C8E84'} size={34} />
                      : <span className="avatar" style={{ ['--c' as string]: '#7C8E84', width: 34, height: 34, fontSize: 13 }}>?</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{partner?.name ?? `Guest ${i + 2}`}</div>
                      <div className="tiny muted">
                        {partner?.userId
                          ? `HI ${partner.handicapIndex?.toFixed(1)} · can pay their own share`
                          : 'Guest — the organiser covers their share'}
                      </div>
                    </div>
                    <button
                      className="btn sm"
                      onClick={() => { setSlotIndex(i); setPickerOpen(true); }}
                    >
                      {partner?.userId ? 'Change' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="field">
          <label>Game</label>
          <div className="stack" style={{ gap: 6 }}>
            {(formats.data?.formats ?? []).map((f) => {
              const tooFewPlayers = f.team && players < 2;
              return (
                <button
                  key={f.key}
                  className="card tight row"
                  style={{
                    gap: 10, width: '100%', textAlign: 'left',
                    opacity: tooFewPlayers ? 0.4 : 1,
                    borderColor: format === f.key ? 'rgba(95,214,180,.45)' : undefined,
                    background: format === f.key ? 'rgba(95,214,180,.09)' : undefined,
                  }}
                  disabled={tooFewPlayers}
                  onClick={() => setFormat(f.key)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 620, fontSize: 14 }}>{f.label}</div>
                    <div className="tiny muted">{tooFewPlayers ? 'Needs at least two players' : f.blurb}</div>
                  </div>
                  {f.team && <span className="chip">Teams</span>}
                  {format === f.key && <span style={{ color: 'var(--accent)' }}><IconCheck size={16} /></span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label>Handicaps</label>
          <div className="segmented">
            <button aria-selected={scoring === 'net'} onClick={() => setScoring('net')}>Net</button>
            <button aria-selected={scoring === 'gross'} onClick={() => setScoring('gross')}>Gross</button>
          </div>
        </div>

        <button
          className="card tight row between"
          style={{ width: '100%', textAlign: 'left' }}
          onClick={() => setCart((c) => !c)}
        >
          <div>
            <div style={{ fontWeight: 620, fontSize: 14 }}>Golf cart</div>
            <div className="tiny muted">{rands(course.cartFeeCents)} per player</div>
          </div>
          <span className="chip" style={cart ? { color: 'var(--accent)', background: 'var(--accent-dim)' } : undefined}>
            {cart ? 'Added' : 'Add'}
          </span>
        </button>

        <div className="card tight stack" style={{ gap: 8 }}>
          <div className="row between small">
            <span className="muted">Green fees · {players} × {rands(slot.pricePerPlayer)}</span>
            <span className="money">{rands(greenFees)}</span>
          </div>
          {cart && (
            <div className="row between small">
              <span className="muted">Carts · {players}</span>
              <span className="money">{rands(cartFees)}</span>
            </div>
          )}
          <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <span style={{ fontWeight: 620 }}>Total</span>
            <span className="money" style={{ fontSize: 18 }}>{rands(total)}</span>
          </div>
          {players > 1 && (
            <div className="row between tiny muted">
              <span>Split evenly</span>
              <span>{rands(share)} each</span>
            </div>
          )}
        </div>

        <div className="notice calm">
          Your {chosen?.label ?? 'round'} is set up with the booking — open it on the day and start
          scoring. Nothing is charged now: {organiserName} can pay the whole booking or each player
          can settle their own share. Free cancellation up to {course.cancellationHours} hours
          before tee-off — after that, anything still unpaid is owed by the organiser.
        </div>

        <button className="btn primary block" onClick={confirm} disabled={busy}>
          {busy ? 'Holding your slot…' : `Book ${slot.time} · ${rands(total)}`}
        </button>
        <div className="row tiny muted" style={{ justifyContent: 'center', gap: 6 }}>
          <IconUsers /> {slot.remaining} of {slot.capacity} spaces free at this time
        </div>
      </div>

      {pickerOpen && (
        <PartnerPicker
          taken={partners.filter(Boolean).map((p) => p.userId).filter(Boolean) as string[]}
          onClose={() => setPickerOpen(false)}
          onPick={(partner) => {
            setPartners((list) => {
              const next = [...list];
              next[slotIndex] = partner;
              return next;
            });
            setPickerOpen(false);
          }}
        />
      )}
    </Sheet>
  );
}

/**
 * Partners can be Cutline players — which keeps their handicap and lets them
 * settle their own share — or a plain name for someone without an account.
 */
function PartnerPicker({
  taken, onClose, onPick,
}: { taken: string[]; onClose: () => void; onPick: (p: Partner) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [guest, setGuest] = useState('');

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      api.searchUsers(q).then(({ users }) => { if (live) setResults(users); }).catch(() => {});
    }, 180);
    return () => { live = false; window.clearTimeout(timer); };
  }, [q]);

  return (
    <Sheet open onClose={onClose} title="Add a partner">
      <div className="stack">
        <div className="row card tight" style={{ gap: 10 }}>
          <IconSearch />
          <input
            className="input"
            style={{ border: 0, background: 'transparent', padding: 0 }}
            placeholder="Search Cutline players"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>

        {results.map((u) => {
          const already = taken.includes(u.id);
          return (
            <button
              key={u.id}
              className="card tight row"
              style={{ gap: 10, width: '100%', opacity: already ? 0.45 : 1 }}
              disabled={already}
              onClick={() => onPick({
                userId: u.id, name: u.name, handicapIndex: u.handicapIndex, avatarColor: u.avatarColor,
              })}
            >
              <Avatar name={u.name} color={u.avatarColor} size={36} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 620, fontSize: 14 }}>{u.name}</div>
                <div className="tiny muted">HI {u.handicapIndex.toFixed(1)}{u.homeClub ? ` · ${u.homeClub}` : ''}</div>
              </div>
              {already ? <span className="chip">Added</span> : <IconCheck size={16} />}
            </button>
          );
        })}

        <div className="field" style={{ marginTop: 6 }}>
          <label htmlFor="pg">Or add a guest</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="pg" className="input" placeholder="Visitor's name" value={guest}
              onChange={(e) => setGuest(e.target.value)} />
            <button
              className="btn sm"
              disabled={!guest.trim()}
              onClick={() => onPick({ name: guest.trim() })}
            >
              Add
            </button>
          </div>
          <p className="tiny muted" style={{ paddingLeft: 4 }}>
            Guests play off 18 and cannot pay their own share.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
