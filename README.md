# Cutline

Golf for South African clubs and the golfers who play them, in two halves:

- **Play** — live hole-by-hole scoring, handicapped leaderboards across six formats, and a shared
  "book" where the round's birdies and banter end up, in the spirit of **Golf GameBook**.
- **Book** — clubs register, publish a tee sheet and take bookings; golfers browse by province,
  reserve a slot, split the green fee with their group and pay before or after, in the shape of
  **Playtomic**. Each club gets an admin console over its own sheet, bookings and customers.

Built mobile-first as an installable PWA. Money is in rands, distances in metres.

## Visual direction

Painted leaderboard green (`#0E2019`) for chrome, fescue gold (`#C2A76A`) for accents, and red
(`#BE3A2B`) held back for its tournament meanings — under par, and money owed.

**Screens run light** (`#ECEEE9`), deliberately: golfers read them outdoors in glare. Archivo Black
sets the wordmark and headings, IBM Plex Sans the interface, and IBM Plex Mono every time, price
and position, so numbers line up in columns. All three are bundled via `@fontsource` rather than
fetched from a CDN, so typography survives offline.

The **cutline** — a 3px rule with a mono tag — is a working divider, not a logo motif: it sits
under the wordmark and above every ledger and section. If it ever becomes ornament, cut it.

> **On the data.** Club names, towns, provinces, course names and pars are real. Stroke indexes,
> hole lengths and green fees are generated sample data — not official scorecards or live rates.
> A club edits its own tee sheet and pricing from the console after signing up.
>
> **On payments.** The payment ledger is real: splits, part payments, outstanding balances,
> organiser liability, refunds and the cancellation window are all enforced server-side. Card
> capture is *recorded, not charged* — going live needs a South African PSP (PayFast, Yoco or
> Peach) and credentials.

```
Keagan/
├── server/      Express + Postgres API, WebSocket live updates, scoring engine
│   └── migrations/   Schema, applied in order on boot
└── web/         React + TypeScript + Vite mobile app
```

## Run it

Node 22+ and a Postgres database. The API talks to Postgres over `pg`, so there is no native
build step.

Two environment variables are required — the server refuses to start without either:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. On Supabase use the **session pooler** (port 5432), not the transaction pooler — the migration runner holds a transaction open across statements, which transaction-mode pooling cannot support. Percent-encode any punctuation in the password. |
| `CUTLINE_SECRET` | Signs login tokens. Any value will do locally; changing it in production logs every user out. |

```bash
npm run setup
```

Then in two terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Both processes are needed — the web app talks to the API through Vite's proxy, so if only the
front end is running every screen fails with "Can't reach Cutline".

The schema applies itself on boot: every unapplied file in `server/migrations` runs in order and
is recorded, so pointing at an empty database is enough. Outside production the database also
seeds itself with 15 South African clubs across six provinces, 18 courses, eight golfers,
~50 bookings spread either side of today and three rounds (one still in play).

> Point local work at its own Supabase project. `DATABASE_URL` is the only thing separating a
> development run from production, and development seeds demo accounts with a known password.

Open **http://localhost:5173**.

| Sign in as | Email | Password | Sees |
| --- | --- | --- | --- |
| Golfer | `demo@cutline.co.za` | `golf1234` | Rounds, tee times, bookings — also the platform approval queue |
| Club manager | `proshop@steenberg.example` | `golf1234` | The Steenberg club console |
| Club manager | `golf@fancourt.example` | `golf1234` | Fancourt, three courses |

### Single-process production mode

```bash
npm run build
npm start
```

The API then serves the built app too — everything on **http://localhost:4000**.

## Deployment

Live at **https://cutline.fly.dev**, on Fly.io with Supabase Postgres. Pushing to `main` deploys:
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the image on Fly's builders
and releases it. The repository needs one secret, `FLY_API_TOKEN`; the app needs `CUTLINE_SECRET`
and `DATABASE_URL` set as Fly secrets.

The `Dockerfile` builds the PWA and serves it from the API process, so one container is the whole
app.

Two deliberate constraints:

- **Exactly one machine.** `realtime.js` keeps its WebSocket rooms in an in-memory `Map`, so a
  second instance would split players in the same round across separate room sets and live scoring
  would quietly stop working between them. Fly provisions a second machine by default — check with
  `fly status` after any scaling change. Moving room state into Postgres is what would lift this.
- **`lhr`, not `jnb`.** Supabase is in `eu-west-1` and a request makes several database round
  trips, so the app sits next to the database rather than next to its users: one slow hop for the
  user instead of several.

`seed()` is opt-in outside development. Set `SEED_ON_BOOT=true` to load the sample data into a
deployed environment; leave it unset and the database is left alone on every restart.

## What's in it

**Rounds & formats** — Stroke play, Stableford, Match play, Fourball, Scramble and Skins. Each
format gets its own leaderboard maths, its own handicap allowance, and its own result wording
("Marcus 3&2", "4 skins", "38 pts").

**Real handicapping** — Playing handicap is `HI × (Slope ÷ 113) + (CR − Par)`, halved for nine
holes and scaled by the format allowance. Shots are allocated by stroke index across the holes
actually being played, so a back-nine round gives shots on the right holes. Plus handicaps give
shots back from the easiest hole up.

**Live scoring** — Every score change is pushed over WebSockets to everyone in the round, so four
phones stay in sync without polling. Quick entry writes the whole group in a single request.

**The book** — Birdies, eagles and holes-in-one post themselves. Players add their own posts,
likes and comments, per round or across the whole feed.

**Player card** — a profile photo, bio, and the details a golfer actually carries: home club, town,
usual tee, left or right handed, walking or riding, playing since, favourite course and a phone
number (shared with a club only when you book there). Rounds, wins, scoring average and putts per
round sit alongside a form line, a target-handicap tracker and eight milestones earned off the
stats already being computed. Photos are downscaled and centre-cropped to a 256px square in the
browser and stored as a data URL on the user row — no file store to run — and the server only
accepts png/jpeg/webp under 400KB.

## Booking

**Booking sets up the round.** Choosing a tee time and choosing your game are one step, not two:
the booking sheet takes the group, the format and net/gross, then creates the round alongside the
booking with the field and handicaps already set. It sits `scheduled` — not pretending to be in
play — until someone enters a score on the day, and opens straight from the booking. Partners
picked from Cutline keep their real handicap and can settle their own share; guests play off 18
and the organiser covers them. Cancelling a booking removes its round, unless it has already been
scored. `/new` remains for rounds you did not book through the app.

**Tee sheets** — each course publishes slots from its first tee to its last at its own interval,
with weekday and weekend pricing, a booking window and a per-course cancellation policy. Clubs
close ranges for competitions or maintenance, and closed times vanish from the golfer's view.

**Splitting and liability** — the organiser books; the fee splits evenly across the group and each
player can settle their own share. Nothing has to be paid up front. Whatever is still outstanding
is carried by the organiser, and the app says so on the booking rather than burying it.

**Cancellation** — free up to the course's window (24 hours by default), which refunds everything
settled. Inside the window, money paid is retained and the balance stays payable. The consequence
and the exact amount are shown *before* the golfer confirms. The policy in force is snapshotted
onto the booking, so a club changing its setting later never rewrites existing terms.

**Club console** at `/club`, for whoever administers the club:

- *Dashboard* — occupancy, billed and collected today, outstanding across all dates, a seven-day
  booking trend, and who is next out.
- *Tee sheet* — the day at a glance, seats taken per slot, and range closures.
- *Bookings* — check in, mark played or no-show, take a payment at the desk, waive a balance, cancel.
- *Customers* — the club's own record of each golfer: visits, spend, outstanding, no-shows, golfers
  brought, free-text notes, tags, and a POPIA marketing-consent flag.
- *Settings* — club profile, and per course the tee interval, first and last tee, capacity, fees,
  booking window and cancellation hours.

**Getting listed** — anyone can register a club, but it lands `pending` and stays invisible to
golfers until approved, so nobody can list a course they don't run. Approvers are set with
`CUTLINE_PLATFORM_ADMIN` (comma-separated emails; defaults to `demo@cutline.co.za`).

## API

All routes sit under `/api`; everything except `/api/health`, `/api/auth/*` and
`/api/courses/formats` needs a `Bearer` token.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register`, `/auth/login` | Accounts (scrypt hashes, HMAC-signed tokens) |
| `GET` `PATCH` | `/auth/me` | Read / update the signed-in player |
| `GET` | `/courses`, `/courses/:id`, `/courses/formats` | Course catalogue and format metadata |
| `GET` `POST` | `/games` | List your rounds / create one |
| `POST` | `/games/join` | Join by six-character code |
| `GET` | `/games/:id`, `/games/:id/leaderboard` | Full round state, computed leaderboard |
| `PUT` | `/games/:id/scores` | Save one score or a batch (`{ scores: [...] }`) |
| `POST` `PATCH` `DELETE` | `/games/:id/players[/:playerId]` | Roster, teams, handicap edits |
| `POST` | `/games/:id/finish`, `/games/:id/reopen` | Close or reopen the round (host only) |
| `GET` `POST` | `/feed`, `/feed/game/:id`, `/feed/:id/like`, `/feed/:id/comments` | The book |
| `GET` | `/users?q=`, `/users/:id` | Player search, profile and stats |
| `GET` | `/clubs`, `/clubs/provinces`, `/clubs/:slug` | Browse approved clubs |
| `POST` | `/clubs/register` | Register a club (lands pending) |
| `GET` `POST` | `/clubs/pending`, `/clubs/:id/approve\|reject` | Platform approval queue |
| `GET` | `/clubs/:id/admin/dashboard\|teesheet\|bookings\|customers` | Club console |
| `PATCH` | `/clubs/:id/admin/bookings/:id` | Check in, no-show, take payment, waive, cancel |
| `PATCH` | `/clubs/:id/admin/customers/:userId`, `/courses/:id`, `/profile` | Customer record, tee sheet, club profile |
| `POST` `DELETE` | `/clubs/:id/admin/blocks` | Close and reopen ranges of tee times |
| `GET` | `/bookings/availability?courseId=&date=` | Live tee sheet for a date |
| `GET` `POST` | `/bookings` | Your bookings / make one |
| `POST` | `/bookings/:id/pay\|cancel\|round` | Settle a share or balance, cancel, start the round |

WebSocket: `ws://host/ws?game=<gameId>` (`wss://` in production) — emits `leaderboard`, `players`,
`status` and `post` events for that round.

## Notes

- Scoring lives in one place, [`server/src/scoring.js`](server/src/scoring.js), and tee-sheet rules
  in [`server/src/teetimes.js`](server/src/teetimes.js), so both can be read and tested on their own.
- Money is stored in cents throughout — no floating-point rands. `booking_payments` is append-only
  so a club's books reconcile.
- Dates are `YYYY-MM-DD` and times `HH:MM`, both local. South Africa is one timezone with no
  daylight saving, so there is no conversion anywhere.
- Two racing requests cannot oversell the last seat in a tee slot: the availability check and the
  insert run inside one transaction, behind a Postgres advisory lock keyed on the course and date.
  This used to be free — the old synchronous SQLite driver could not interleave them — and became
  explicit when the database moved behind a connection pool.
- Aggregates are cast (`COUNT(*)::int`, `SUM(...)::int`) because Postgres returns bigint and the
  driver hands bigint back as a string. Uncast, money totals reach the client as text.
- Searches use `ILIKE`. Postgres `LIKE` is case-sensitive; SQLite's was not.
- Guests without accounts can be added to any round; they score exactly like registered players.
- `CUTLINE_SECRET` and `DATABASE_URL` have no defaults — the server throws on boot without them,
  rather than starting in a state nobody intended.
