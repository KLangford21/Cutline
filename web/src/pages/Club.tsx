import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../store';
import { Avatar, Empty, Sheet, Spinner, dayLabel, rands, relativeTime } from '../components/ui';
import { IconCheck, IconChevronLeft, IconPlus, IconSearch, IconX } from '../components/icons';
import type { Booking, Club, ClubCourse, ClubCustomer, ClubDashboard, TeeSheet } from '../types';

type Section = 'dashboard' | 'teesheet' | 'bookings' | 'customers' | 'settings' | 'approvals';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'teesheet', label: 'Tee sheet' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'customers', label: 'Customers' },
  { key: 'settings', label: 'Settings' },
];

const isoDays = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + from);
    return d.toLocaleDateString('en-CA');
  });

export default function ClubConsole() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [club, setClub] = useState<Club | null>(null);
  const [section, setSection] = useState<Section>('dashboard');

  useEffect(() => {
    api.myClubs().then(({ clubs: mine, isPlatformAdmin }) => {
      setClubs(mine);
      setPlatformAdmin(isPlatformAdmin);
      setClub(mine[0] ?? null);
    });
  }, []);

  if (clubs === null) return <Spinner />;

  if (!club) {
    return (
      <div className="screen">
        <header className="row" style={{ gap: 10, marginBottom: 16 }}>
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><IconChevronLeft /></button>
          <h1 style={{ fontSize: 22 }}>Club console</h1>
        </header>
        <Empty glyph="🏌️" title="You don't manage a club yet" hint="Register one from your profile to publish a tee sheet." />
        {platformAdmin && <Approvals />}
      </div>
    );
  }

  const tabs = platformAdmin ? [...SECTIONS, { key: 'approvals' as Section, label: 'Approvals' }] : SECTIONS;

  return (
    <div className="screen flush">
      <header className="row" style={{ gap: 10, marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><IconChevronLeft /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">Club console</div>
          <div style={{ fontWeight: 660, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {club.name}
          </div>
        </div>
        <Avatar name={club.name} color={club.brandColor} size={36} variant="outline" />
      </header>

      {clubs.length > 1 && (
        <div className="segmented" style={{ marginBottom: 12 }}>
          {clubs.map((c) => (
            <button key={c.id} aria-selected={club.id === c.id} onClick={() => setClub(c)}>{c.name}</button>
          ))}
        </div>
      )}

      {club.status !== 'active' && (
        <div className="notice" style={{ marginBottom: 12 }}>
          This club is <strong>{club.status}</strong>. Golfers cannot see it or book until the platform approves it.
        </div>
      )}

      <div className="bleed">
        <div className="console-nav">
          {tabs.map((s) => (
            <button key={s.key} aria-selected={section === s.key} onClick={() => setSection(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {section === 'dashboard' && <Dashboard clubId={club.id} />}
        {section === 'teesheet' && <TeeSheetView club={club} />}
        {section === 'bookings' && <BookingsAdmin clubId={club.id} />}
        {section === 'customers' && <Customers clubId={club.id} />}
        {section === 'settings' && <Settings club={club} onSaved={setClub} />}
        {section === 'approvals' && <Approvals />}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Dashboard                                                          */
/* ================================================================== */

function Dashboard({ clubId }: { clubId: string }) {
  const [data, setData] = useState<ClubDashboard | null>(null);

  useEffect(() => {
    setData(null);
    api.clubDashboard(clubId).then(setData);
  }, [clubId]);

  if (!data) return <Spinner />;
  const peak = Math.max(1, ...data.trend.map((t) => t.bookings));

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid-2">
        <div className="metric">
          <div className="v" style={{ color: 'var(--accent)' }}>{data.occupancy}%</div>
          <div className="k">Occupancy today · {data.seatsTaken}/{data.seats} seats</div>
        </div>
        <div className="metric">
          <div className="v">{rands(data.money.billedCents)}</div>
          <div className="k">Billed today</div>
        </div>
        <div className="metric">
          <div className="v" style={{ color: 'var(--accent)' }}>{rands(data.money.paidCents)}</div>
          <div className="k">Collected today</div>
        </div>
        <div className="metric">
          <div className="v" style={{ color: data.money.outstandingAllCents ? 'var(--coral)' : undefined }}>
            {rands(data.money.outstandingAllCents)}
          </div>
          <div className="k">Outstanding, all dates</div>
        </div>
      </div>

      <div className="card tight">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Bookings, last 7 days</div>
        <div className="trend-bars">
          {data.trend.map((t) => (
            <div key={t.date}>
              <div className="bar" style={{ height: `${Math.max(4, (t.bookings / peak) * 42)}px` }} />
              <span className="lbl">{new Date(`${t.date}T12:00:00`).toLocaleDateString('en-ZA', { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-3">
        <div className="metric"><div className="v">{data.counts.customers}</div><div className="k">Customers</div></div>
        <div className="metric"><div className="v">{data.counts.noShows}</div><div className="k">No shows</div></div>
        <div className="metric"><div className="v">{data.counts.cancellations}</div><div className="k">Cancelled</div></div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Courses today</div>
        <div className="stack">
          {data.sheet.map((row) => (
            <div key={row.course.id} className="card tight row between">
              <div>
                <div style={{ fontWeight: 620, fontSize: 14 }}>{row.course.name}</div>
                <div className="tiny muted">{row.openSlots} of {row.slots} times open</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontWeight: 700 }}>{row.players}</div>
                <div className="tiny muted">golfers</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.upcoming.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Next out today</div>
          <div className="stack">
            {data.upcoming.map((b) => (
              <div key={b.id} className="card tight row" style={{ gap: 10 }}>
                <span className="num" style={{ fontWeight: 700, width: 46 }}>{b.time}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.organiser?.name}</div>
                  <div className="tiny muted">{b.players} players · {b.course.name}</div>
                </div>
                <span className={`pill ${b.money.outstandingCents > 0 ? 'unpaid' : 'paid'}`}>
                  {b.money.outstandingCents > 0 ? rands(b.money.outstandingCents) : 'Paid'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Tee sheet                                                          */
/* ================================================================== */

function TeeSheetView({ club }: { club: Club }) {
  const toast = useToast();
  const [date, setDate] = useState(isoDays(1)[0]);
  const [courseId, setCourseId] = useState(club.courses[0]?.id);
  const [sheet, setSheet] = useState<TeeSheet | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  const load = useCallback(async () => {
    setSheet(null);
    setSheet(await api.clubTeeSheet(club.id, date, courseId));
  }, [club.id, date, courseId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="stack" style={{ gap: 12 }}>
      {club.courses.length > 1 && (
        <div className="segmented">
          {club.courses.map((c) => (
            <button key={c.id} aria-selected={courseId === c.id} onClick={() => setCourseId(c.id)}>{c.name}</button>
          ))}
        </div>
      )}

      <div className="bleed">
        <div className="date-strip">
          {isoDays(14).map((d) => {
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

      <div className="row between">
        <h2 style={{ fontSize: 16 }}>{dayLabel(date)}</h2>
        <button className="btn sm" onClick={() => setBlockOpen(true)}><IconPlus size={15} /> Close a range</button>
      </div>

      {sheet?.blocks.length ? (
        <div className="row wrap" style={{ gap: 6 }}>
          {sheet.blocks.map((b) => (
            <button
              key={b.id}
              className="chip"
              style={{ color: 'var(--coral)' }}
              onClick={async () => {
                await api.removeBlock(club.id, b.id);
                toast('Closure removed');
                void load();
              }}
            >
              {b.startTime}–{b.endTime} {b.reason} <IconX size={12} />
            </button>
          ))}
        </div>
      ) : null}

      {!sheet && <Spinner />}

      <div className="stack" style={{ gap: 5 }}>
        {sheet?.slots.map((slot) => {
          const bookings = slot.bookings ?? [];
          const blocked = slot.status === 'blocked';
          return (
            <div key={slot.time} className={`sheet-row ${blocked ? 'blocked' : bookings.length ? '' : 'empty'}`}>
              <span className="time">{slot.time}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {blocked ? (
                  <span className="tiny" style={{ color: 'var(--coral)' }}>{slot.blockReason}</span>
                ) : bookings.length === 0 ? (
                  <span className="tiny muted">Open · {slot.capacity} spaces</span>
                ) : (
                  <div className="stack" style={{ gap: 4 }}>
                    {bookings.map((b) => (
                      <div key={b.id} className="row between" style={{ gap: 8 }}>
                        <span className="tiny" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.organiser?.name} · {b.players}
                        </span>
                        <span className={`pill ${b.money.outstandingCents > 0 ? 'unpaid' : 'paid'}`}>
                          {b.money.outstandingCents > 0 ? rands(b.money.outstandingCents) : 'Paid'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!blocked && (
                  <div className="seats">
                    {Array.from({ length: slot.capacity }, (_, i) => (
                      <span key={i} className={`seat ${i < slot.booked ? 'taken' : ''}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {blockOpen && sheet && (
        <BlockSheet
          clubId={club.id}
          courseId={sheet.course.id}
          date={date}
          onClose={() => setBlockOpen(false)}
          onSaved={() => { setBlockOpen(false); toast('Range closed'); void load(); }}
        />
      )}
    </div>
  );
}

function BlockSheet({
  clubId, courseId, date, onClose, onSaved,
}: { clubId: string; courseId: string; date: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ startTime: '06:00', endTime: '12:00', reason: 'Club competition' });
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet open onClose={onClose} title={`Close times · ${dayLabel(date)}`}>
      <div className="stack">
        {error && <div className="error-banner">{error}</div>}
        <div className="grid-2">
          <div className="field">
            <label htmlFor="bs">From</label>
            <input id="bs" className="input num" type="time" value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="be">To</label>
            <input id="be" className="input num" type="time" value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="br">Reason</label>
          <input id="br" className="input" value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <p className="tiny muted">
          Existing bookings in this range are kept — cancel them individually if the course is closing.
        </p>
        <button
          className="btn primary block"
          onClick={async () => {
            try {
              await api.addBlock(clubId, { courseId, date, ...form });
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not close that range');
            }
          }}
        >
          Close these times
        </button>
      </div>
    </Sheet>
  );
}

/* ================================================================== */
/* Bookings                                                           */
/* ================================================================== */

function BookingsAdmin({ clubId }: { clubId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [active, setActive] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    setBookings(null);
    const { bookings: list } = await api.clubBookings(clubId, { status });
    setBookings(list);
  }, [clubId, status]);

  useEffect(() => { void load(); }, [load]);

  const act = async (booking: Booking, action: string, extra: Record<string, unknown> = {}) => {
    const { booking: updated } = await api.clubBookingAction(clubId, booking.id, { action, ...extra });
    setBookings((list) => (list ?? []).map((b) => (b.id === updated.id ? updated : b)));
    setActive(updated);
    toast(`${booking.ref} updated`);
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="bleed">
        <div className="pill-scroll">
          {[['', 'All'], ['confirmed', 'Confirmed'], ['checked_in', 'Checked in'], ['played', 'Played'], ['no_show', 'No show'], ['cancelled', 'Cancelled']].map(([key, label]) => (
            <button key={key} aria-selected={status === key} onClick={() => setStatus(key)}>{label}</button>
          ))}
        </div>
      </div>

      {!bookings && <Spinner />}
      {bookings?.length === 0 && <Empty glyph="📋" title="No bookings here" />}

      <div className="stack" style={{ gap: 8 }}>
        {(bookings ?? []).map((b) => (
          <button key={b.id} className="card tight row" style={{ gap: 10, width: '100%', textAlign: 'left' }} onClick={() => setActive(b)}>
            <div style={{ width: 52, flex: 'none' }}>
              <div className="num" style={{ fontWeight: 700, fontSize: 14 }}>{b.time}</div>
              <div className="tiny muted">{b.date.slice(5)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 620, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.organiser?.name}
              </div>
              <div className="tiny muted">{b.players} players · {b.course.name} · {b.ref}</div>
            </div>
            <span className={`pill ${b.status === 'no_show' ? 'noshow' : b.status === 'cancelled' ? 'cancelled' : b.money.outstandingCents > 0 ? 'unpaid' : 'paid'}`}>
              {b.status === 'cancelled' ? 'Cancelled'
                : b.status === 'no_show' ? 'No show'
                  : b.money.outstandingCents > 0 ? rands(b.money.outstandingCents) : 'Paid'}
            </span>
          </button>
        ))}
      </div>

      {active && (
        <Sheet open onClose={() => setActive(null)} title={active.ref}>
          <div className="stack">
            <div className="card tight">
              <div style={{ fontWeight: 620 }}>{active.organiser?.name}</div>
              <div className="tiny muted">
                {active.course.name} · {dayLabel(active.date)} at {active.time} · {active.players} players
              </div>
            </div>

            <div className="card flat tight stack" style={{ gap: 6 }}>
              <div className="row between small"><span className="muted">Total</span><span className="money">{rands(active.money.totalCents)}</span></div>
              <div className="row between small"><span className="muted">Paid</span><span className="money settled">{rands(active.money.paidCents)}</span></div>
              <div className="row between small">
                <span className="muted">Outstanding</span>
                <span className={`money ${active.money.outstandingCents > 0 ? 'owing' : 'settled'}`}>{rands(active.money.outstandingCents)}</span>
              </div>
            </div>

            {active.payments.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <div className="eyebrow">Ledger</div>
                {active.payments.map((p) => (
                  <div key={p.id} className="row between tiny">
                    <span className="muted">{p.method} · {relativeTime(p.createdAt)}</span>
                    <span className="money">{rands(p.amountCents)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="row wrap" style={{ gap: 8 }}>
              {active.status === 'confirmed' && <button className="btn sm primary" onClick={() => act(active, 'check_in')}>Check in</button>}
              {['confirmed', 'checked_in'].includes(active.status) && <button className="btn sm" onClick={() => act(active, 'played')}>Mark played</button>}
              {active.status !== 'cancelled' && <button className="btn sm" onClick={() => act(active, 'no_show')}>No show</button>}
              {active.money.outstandingCents > 0 && (
                <button className="btn sm primary" onClick={() => act(active, 'record_payment', { method: 'pro_shop' })}>
                  Take {rands(active.money.outstandingCents)}
                </button>
              )}
              {active.money.outstandingCents > 0 && <button className="btn sm" onClick={() => act(active, 'waive')}>Waive</button>}
              {active.status !== 'cancelled' && <button className="btn sm danger" onClick={() => act(active, 'cancel')}>Cancel</button>}
            </div>
            <p className="tiny muted">Payments taken here are recorded against the booking — no card is charged.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ================================================================== */
/* Customers — the club's own record                                  */
/* ================================================================== */

function Customers({ clubId }: { clubId: string }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<ClubCustomer[] | null>(null);
  const [active, setActive] = useState<ClubCustomer | null>(null);

  const load = useCallback(async () => {
    const { customers: list } = await api.clubCustomers(clubId, q);
    setCustomers(list);
  }, [clubId, q]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row card tight" style={{ gap: 10 }}>
        <IconSearch />
        <input
          className="input"
          style={{ border: 0, background: 'transparent', padding: 0 }}
          placeholder="Search your golfers"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {!customers && <Spinner />}
      {customers?.length === 0 && <Empty glyph="👤" title="No customers yet" hint="They appear here the first time someone books." />}

      <div className="stack" style={{ gap: 8 }}>
        {(customers ?? []).map((c) => (
          <button key={c.userId} className="cust-row" onClick={() => setActive(c)}>
            <Avatar name={c.name} color={c.avatarColor} src={c.avatarUrl} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 620, fontSize: 14 }}>{c.name}</div>
              <div className="tiny muted">
                {c.stats.visits} {c.stats.visits === 1 ? 'visit' : 'visits'} · HI {c.handicapIndex.toFixed(1)}
                {c.stats.lastBooking ? ` · last ${c.stats.lastBooking.slice(5)}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="money">{rands(c.stats.spendCents)}</div>
              {c.stats.outstandingCents > 0 && <div className="tiny money owing">{rands(c.stats.outstandingCents)} due</div>}
            </div>
          </button>
        ))}
      </div>

      {active && (
        <CustomerSheet
          clubId={clubId}
          customer={active}
          onClose={() => setActive(null)}
          onSaved={() => { setActive(null); toast('Customer record saved'); void load(); }}
        />
      )}
    </div>
  );
}

function CustomerSheet({
  clubId, customer, onClose, onSaved,
}: { clubId: string; customer: ClubCustomer; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [tags, setTags] = useState(customer.tags.join(', '));
  const [optIn, setOptIn] = useState(customer.marketingOptIn);
  const s = customer.stats;

  return (
    <Sheet open onClose={onClose} title={customer.name}>
      <div className="stack">
        <div className="row" style={{ gap: 12 }}>
          <Avatar name={customer.name} color={customer.avatarColor} src={customer.avatarUrl} size={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tiny muted">{customer.email}</div>
            <div className="tiny muted">
              HI {customer.handicapIndex.toFixed(1)}{customer.homeClub ? ` · ${customer.homeClub}` : ''}
            </div>
          </div>
        </div>

        <div className="grid-3">
          <div className="metric"><div className="v">{s.visits}</div><div className="k">Visits</div></div>
          <div className="metric"><div className="v">{s.bookings}</div><div className="k">Bookings</div></div>
          <div className="metric"><div className="v">{s.playersBrought}</div><div className="k">Golfers brought</div></div>
        </div>
        <div className="grid-3">
          <div className="metric"><div className="v" style={{ color: 'var(--accent)' }}>{rands(s.spendCents)}</div><div className="k">Spend</div></div>
          <div className="metric"><div className="v" style={{ color: s.outstandingCents ? 'var(--coral)' : undefined }}>{rands(s.outstandingCents)}</div><div className="k">Owing</div></div>
          <div className="metric"><div className="v">{s.noShows}</div><div className="k">No shows</div></div>
        </div>

        <div className="field">
          <label htmlFor="cn">Notes</label>
          <textarea id="cn" className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Prefers early tee times, society organiser…" />
        </div>
        <div className="field">
          <label htmlFor="ct">Tags</label>
          <input id="ct" className="input" value={tags} onChange={(e) => setTags(e.target.value)}
            placeholder="society, regular, corporate" />
        </div>

        <button className="card tight row between" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOptIn((v) => !v)}>
          <div>
            <div style={{ fontWeight: 620, fontSize: 14 }}>Marketing consent</div>
            <div className="tiny muted">POPIA — only contact golfers who opted in</div>
          </div>
          <span className={`pill ${optIn ? 'paid' : 'cancelled'}`}>{optIn ? 'Opted in' : 'No consent'}</span>
        </button>

        <button
          className="btn primary block"
          onClick={async () => {
            await api.updateCustomer(clubId, customer.userId, {
              notes,
              tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
              marketingOptIn: optIn,
            });
            onSaved();
          }}
        >
          Save record
        </button>
      </div>
    </Sheet>
  );
}

/* ================================================================== */
/* Settings                                                           */
/* ================================================================== */

function Settings({ club, onSaved }: { club: Club; onSaved: (c: Club) => void }) {
  const toast = useToast();
  const [course, setCourse] = useState<ClubCourse>(club.courses[0]);
  const [form, setForm] = useState(() => ({ ...club.courses[0] }));
  const [profile, setProfile] = useState({
    name: club.name, city: club.city ?? '', phone: club.phone ?? '',
    website: club.website ?? '', blurb: club.blurb ?? '',
  });

  const money = (cents: number) => String(Math.round(cents / 100));
  const [fees, setFees] = useState({
    weekday: money(course.weekdayFeeCents),
    weekend: money(course.weekendFeeCents),
    cart: money(course.cartFeeCents),
  });

  const switchCourse = (c: ClubCourse) => {
    setCourse(c);
    setForm({ ...c });
    setFees({ weekday: money(c.weekdayFeeCents), weekend: money(c.weekendFeeCents), cart: money(c.cartFeeCents) });
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack">
        <div className="eyebrow">Club profile</div>
        <div className="field"><label htmlFor="sn">Name</label>
          <input id="sn" className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="sc">Town</label>
            <input id="sc" className="input" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></div>
          <div className="field"><label htmlFor="sp">Phone</label>
            <input id="sp" className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="sb">Description</label>
          <textarea id="sb" className="input" value={profile.blurb} onChange={(e) => setProfile({ ...profile, blurb: e.target.value })} /></div>
        <button
          className="btn block"
          onClick={async () => {
            const { club: updated } = await api.updateClubProfile(club.id, profile);
            onSaved({ ...updated, courses: club.courses });
            toast('Club profile saved');
          }}
        >
          Save profile
        </button>
      </div>

      <div className="stack">
        <div className="eyebrow">Tee sheet</div>
        {club.courses.length > 1 && (
          <div className="segmented">
            {club.courses.map((c) => (
              <button key={c.id} aria-selected={course.id === c.id} onClick={() => switchCourse(c)}>{c.name}</button>
            ))}
          </div>
        )}

        <div className="grid-2">
          <div className="field"><label htmlFor="ft">First tee</label>
            <input id="ft" className="input num" type="time" value={form.firstTee}
              onChange={(e) => setForm({ ...form, firstTee: e.target.value })} /></div>
          <div className="field"><label htmlFor="lt">Last tee</label>
            <input id="lt" className="input num" type="time" value={form.lastTee}
              onChange={(e) => setForm({ ...form, lastTee: e.target.value })} /></div>
          <div className="field"><label htmlFor="iv">Interval (min)</label>
            <input id="iv" className="input num" inputMode="numeric" value={form.intervalMinutes}
              onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) || 0 })} /></div>
          <div className="field"><label htmlFor="cap">Players per slot</label>
            <input id="cap" className="input num" inputMode="numeric" value={form.slotCapacity}
              onChange={(e) => setForm({ ...form, slotCapacity: Number(e.target.value) || 0 })} /></div>
          <div className="field"><label htmlFor="wd">Weekday fee (R)</label>
            <input id="wd" className="input num" inputMode="numeric" value={fees.weekday}
              onChange={(e) => setFees({ ...fees, weekday: e.target.value })} /></div>
          <div className="field"><label htmlFor="we">Weekend fee (R)</label>
            <input id="we" className="input num" inputMode="numeric" value={fees.weekend}
              onChange={(e) => setFees({ ...fees, weekend: e.target.value })} /></div>
          <div className="field"><label htmlFor="cf">Cart fee (R)</label>
            <input id="cf" className="input num" inputMode="numeric" value={fees.cart}
              onChange={(e) => setFees({ ...fees, cart: e.target.value })} /></div>
          <div className="field"><label htmlFor="ch">Free cancellation (h)</label>
            <input id="ch" className="input num" inputMode="numeric" value={form.cancellationHours}
              onChange={(e) => setForm({ ...form, cancellationHours: Number(e.target.value) || 0 })} /></div>
          <div className="field"><label htmlFor="bw">Booking window (days)</label>
            <input id="bw" className="input num" inputMode="numeric" value={form.bookingWindowDays}
              onChange={(e) => setForm({ ...form, bookingWindowDays: Number(e.target.value) || 0 })} /></div>
        </div>

        <button
          className="card tight row between"
          style={{ width: '100%', textAlign: 'left' }}
          onClick={() => setForm({ ...form, bookable: !form.bookable })}
        >
          <div>
            <div style={{ fontWeight: 620, fontSize: 14 }}>Online bookings</div>
            <div className="tiny muted">Turn off to take the course off the app</div>
          </div>
          <span className={`pill ${form.bookable ? 'paid' : 'cancelled'}`}>{form.bookable ? 'Open' : 'Closed'}</span>
        </button>

        <button
          className="btn primary block"
          onClick={async () => {
            await api.updateClubCourse(club.id, course.id, {
              ...form,
              weekdayFeeCents: Number(fees.weekday) * 100,
              weekendFeeCents: Number(fees.weekend) * 100,
              cartFeeCents: Number(fees.cart) * 100,
            });
            toast('Tee sheet saved');
          }}
        >
          Save tee sheet
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Platform approvals                                                 */
/* ================================================================== */

function Approvals() {
  const toast = useToast();
  const [clubs, setClubs] = useState<Club[] | null>(null);

  const load = useCallback(async () => {
    const { clubs: list } = await api.pendingClubs();
    setClubs(list);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!clubs) return <Spinner />;
  if (clubs.length === 0) return <Empty glyph="✅" title="Nothing waiting" hint="New club registrations land here." />;

  return (
    <div className="stack">
      <p className="tiny muted">
        Clubs stay invisible to golfers until approved, so nobody can list a course they don't run.
      </p>
      {clubs.map((club) => (
        <div key={club.id} className="card stack" style={{ gap: 10 }}>
          <div>
            <div style={{ fontWeight: 660, fontSize: 16 }}>{club.name}</div>
            <div className="tiny muted">{club.city}, {club.province}</div>
          </div>
          <div className="tiny muted">
            Registered by {club.registeredBy?.name} ({club.registeredBy?.email}) · {relativeTime(club.createdAt)}
          </div>
          {club.phone && <div className="tiny muted">{club.phone}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn sm primary"
              onClick={async () => { await api.approveClub(club.id); toast(`${club.name} approved`); void load(); }}
            >
              <IconCheck size={15} /> Approve
            </button>
            <button
              className="btn sm danger"
              onClick={async () => { await api.rejectClub(club.id); toast(`${club.name} rejected`); void load(); }}
            >
              <IconX size={15} /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
