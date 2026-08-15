export type User = {
  id: string;
  name: string;
  email: string;
  handicapIndex: number;
  homeClub: string | null;
  avatarColor: string;
  avatarUrl: string | null;
  bio: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  preferredTee: string;
  dominantHand: 'right' | 'left';
  ridePreference: 'walk' | 'ride' | 'either';
  goalHandicap: number | null;
  playingSince: number | null;
  favouriteCourse: string | null;
  createdAt: string;
};

export type Hole = { hole: number; par: number; si: number; metres: number };

export type Course = {
  id: string;
  name: string;
  location: string;
  country: string;
  tee: string;
  par: number;
  rating: number;
  slope: number;
  holes: Hole[];
};

export type GamePlayer = {
  id: string;
  userId: string | null;
  name: string;
  avatarColor: string;
  avatarUrl?: string | null;
  handicapIndex: number;
  playingHandicap: number;
  team: string | null;
};

export type ScoreLabel = 'ace' | 'albatross' | 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'worse';

export type CardCell = {
  hole: number;
  par: number;
  si: number;
  metres: number;
  strokes: number | null;
  putts: number | null;
  shots: number;
  net: number | null;
  points: number | null;
  label: ScoreLabel | null;
};

export type PlayerBoard = {
  playerId: string;
  userId: string | null;
  name: string;
  avatarColor: string;
  handicapIndex: number;
  playingHandicap: number;
  team: string | null;
  card: CardCell[];
  counts: Record<ScoreLabel, number>;
  thru: number;
  gross: number;
  net: number;
  points: number;
  putts: number;
  parOfPlayed: number;
  toPar: number;
  netToPar: number;
};

export type BoardRow = PlayerBoard & {
  total: number;
  display: string;
  unit: string;
  position: number;
  tied: boolean;
  players?: { id: string; name: string; avatarColor: string }[];
  team?: string | null;
};

export type MatchState = {
  diff: number;
  margin: number;
  remaining: number;
  closed: boolean;
  statusText: string;
  leaderId: string | null;
  holes: { hole: number; result: 'A' | 'B' | 'halved' | null }[];
  sides: { id: string; name: string; players: { id: string; name: string }[] }[];
};

export type SkinsState = {
  holes: { hole: number; winner: { id: string; name: string } | null; value: number; carry: number; played: boolean }[];
  carry: number;
  totals: Record<string, number>;
};

export type Leaderboard = {
  gameId: string;
  format: string;
  scoring: string;
  coursePar: number;
  holes: Hole[];
  players: PlayerBoard[];
  rows: BoardRow[];
  teams: any[];
  match: MatchState | null;
  skins: SkinsState | null;
};

export type Game = {
  id: string;
  code: string;
  name: string;
  format: string;
  formatLabel: string;
  scoring: 'net' | 'gross';
  holeCount: number;
  startHole: number;
  status: 'scheduled' | 'live' | 'finished';
  stake: string | null;
  createdBy: string;
  createdAt: string;
  finishedAt: string | null;
  course: Course;
  holes: Hole[];
  players: GamePlayer[];
  leaderboard: Leaderboard;
};

export type GameSummary = Omit<Game, 'leaderboard'> & {
  top: { name: string; display: string; unit: string; position: number; avatarColor: string }[];
  me?: { thru: number; display: string; unit: string; position: number | null };
  thru: number;
};

export type Post = {
  id: string;
  gameId: string | null;
  gameName: string | null;
  courseName: string | null;
  kind: 'text' | 'event';
  body: string;
  createdAt: string;
  author: { id: string | null; name: string; avatarColor: string; avatarUrl?: string | null };
  likes: number;
  liked: boolean;
  comments: number;
};

export type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarColor: string; avatarUrl?: string | null };
};

export type Stats = {
  rounds: number;
  holes: number;
  wins: number;
  podiums: number;
  bestGross: number | null;
  bestPoints: number | null;
  avgGross: number | null;
  avgPoints: number | null;
  avgPutts: number | null;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  scoringSplit: Record<string, number>;
  trend: { at: string; points: number; toPar: number }[];
};

export type RoundHistory = {
  gameId: string;
  name: string;
  format: string;
  courseName: string;
  courseLocation: string;
  playedAt: string;
  thru: number;
  gross: number;
  net: number;
  points: number;
  toPar: number;
  position: number | null;
  fieldSize: number;
};

export type Format = { key: string; label: string; team: boolean; blurb: string };

/* ---------------- clubs, tee sheets and bookings ---------------- */

export type ClubCourse = {
  id: string;
  clubId: string;
  name: string;
  tee: string;
  par: number;
  rating: number;
  slope: number;
  holes: Hole[];
  bookable: boolean;
  intervalMinutes: number;
  firstTee: string;
  lastTee: string;
  slotCapacity: number;
  weekdayFeeCents: number;
  weekendFeeCents: number;
  cartFeeCents: number;
  bookingWindowDays: number;
  cancellationHours: number;
};

export type Club = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  province: string;
  country: string;
  blurb: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  brandColor: string;
  status: 'pending' | 'active' | 'rejected';
  createdAt: string;
  courses: ClubCourse[];
  role?: string;
  fromFeeCents?: number | null;
  openSlots?: number;
  nextTee?: string | null;
  registeredBy?: { name: string; email: string } | null;
};

export type Slot = {
  time: string;
  minutes: number;
  capacity: number;
  booked: number;
  remaining: number;
  pricePerPlayer: number;
  status: 'open' | 'full' | 'blocked' | 'past';
  blockReason: string | null;
  groups?: number;
  bookings?: Booking[];
};

export type BookingPlayer = {
  id: string;
  userId: string | null;
  name: string;
  isOrganiser: boolean;
  shareCents: number;
  paidCents: number;
  outstandingCents: number;
};

export type Cancellation = {
  free: boolean;
  windowHours: number;
  hoursUntil: number;
  deadline: string;
  refundCents: number;
  liabilityCents: number;
  message: string;
};

export type Booking = {
  id: string;
  ref: string;
  status: 'confirmed' | 'checked_in' | 'played' | 'no_show' | 'cancelled';
  date: string;
  time: string;
  players: number;
  cart: boolean;
  notes: string | null;
  gameId: string | null;
  format: string;
  formatLabel: string;
  scoring: 'net' | 'gross';
  roundStatus: 'scheduled' | 'live' | 'finished' | null;
  createdAt: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lateCancel: boolean;
  club: { id: string; name: string; slug: string; city: string; province: string; brandColor: string; phone: string | null };
  course: { id: string; name: string; par: number };
  money: {
    currency: string;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
    status: 'unpaid' | 'part_paid' | 'paid' | 'refunded' | 'waived';
    organiserOwesCents: number;
  };
  organiser: { id: string | null; name: string } | null;
  isOrganiser: boolean;
  myShare: { playerId: string; shareCents: number; paidCents: number; outstandingCents: number } | null;
  group: BookingPlayer[];
  payments: { id: string; amountCents: number; method: string; status: string; note: string | null; createdAt: string }[];
  cancellation: Cancellation;
};

export type Availability = {
  date: string;
  course: {
    id: string; name: string; par: number; capacity: number;
    intervalMinutes: number; bookingWindowDays: number;
    cancellationHours: number; cartFeeCents: number;
  };
  slots: Slot[];
};

export type ClubCustomer = {
  userId: string;
  name: string;
  email: string;
  handicapIndex: number;
  avatarColor: string;
  avatarUrl: string | null;
  homeClub: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
  marketingOptIn: boolean;
  firstSeen: string;
  stats: {
    bookings: number;
    visits: number;
    noShows: number;
    cancellations: number;
    spendCents: number;
    outstandingCents: number;
    playersBrought: number;
    lastBooking: string | null;
  };
};

export type ClubDashboard = {
  club: Club;
  date: string;
  occupancy: number;
  seats: number;
  seatsTaken: number;
  sheet: { course: ClubCourse; slots: number; openSlots: number; bookings: number; players: number }[];
  money: {
    currency: string;
    billedCents: number;
    paidCents: number;
    outstandingTodayCents: number;
    outstandingAllCents: number;
  };
  counts: { customers: number; noShows: number; cancellations: number };
  trend: { date: string; bookings: number; players: number; billed: number }[];
  upcoming: Booking[];
};

export type TeeSheet = {
  date: string;
  courses: ClubCourse[];
  course: ClubCourse;
  blocks: { id: string; startTime: string; endTime: string; reason: string | null }[];
  slots: Slot[];
};
