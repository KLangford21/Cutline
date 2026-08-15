import type {
  Availability, Booking, Club, ClubCourse, ClubCustomer, ClubDashboard, Comment, Course,
  Format, Game, GameSummary, Post, RoundHistory, Stats, TeeSheet, User,
} from './types';

const TOKEN_KEY = 'cutline.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    // fetch only rejects when the request never reached the server
    throw new ApiError("Can't reach Cutline. Check that the server is running.", 0);
  }

  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Body was not JSON, so it did not come from the API.
  }

  if (!res.ok) {
    if (data?.error) throw new ApiError(data.error, res.status);
    // A non-JSON error body means nothing answered *as* the API — in dev that
    // is the Vite proxy reporting the API is down, in production a gateway.
    // Saying so beats a generic shrug.
    throw new ApiError(
      res.status >= 500
        ? "Can't reach the Cutline API. Check the server is running on port 4000."
        : `That request failed (${res.status}).`,
      res.status,
    );
  }
  return data as T;
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  /* auth */
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: body({ email, password }) }),
  register: (payload: { name: string; email: string; password: string; handicapIndex: number; homeClub?: string }) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: body(payload) }),
  me: () => request<{ user: User }>('/auth/me'),
  updateMe: (
    payload: Partial<Pick<User,
      'name' | 'homeClub' | 'bio' | 'avatarColor' | 'avatarUrl' | 'phone' | 'city' |
      'province' | 'preferredTee' | 'dominantHand' | 'ridePreference' | 'favouriteCourse'
    >> & { handicapIndex?: number; goalHandicap?: number | null; playingSince?: number | null },
  ) => request<{ user: User }>('/auth/me', { method: 'PATCH', body: body(payload) }),

  /* reference data */
  courses: (q = '') => request<{ courses: Course[] }>(`/courses?q=${encodeURIComponent(q)}`),
  formats: () => request<{ formats: Format[] }>('/courses/formats'),
  searchUsers: (q: string) => request<{ users: User[] }>(`/users?q=${encodeURIComponent(q)}`),

  /* games */
  games: () => request<{ games: GameSummary[] }>('/games'),
  game: (id: string) => request<{ game: Game }>(`/games/${id}`),
  createGame: (payload: {
    name: string; courseId: string; format: string; scoring: string;
    holeCount: number; startHole: number; stake?: string | null;
    players: { userId?: string; name?: string; handicapIndex?: number; team?: string }[];
  }) => request<{ game: Game }>('/games', { method: 'POST', body: body(payload) }),
  joinGame: (code: string) => request<{ game: Game }>('/games/join', { method: 'POST', body: body({ code }) }),
  addPlayer: (gameId: string, payload: { userId?: string; name?: string; handicapIndex?: number; team?: string }) =>
    request<{ game: Game }>(`/games/${gameId}/players`, { method: 'POST', body: body(payload) }),
  updatePlayer: (gameId: string, playerId: string, payload: { team?: string; handicapIndex?: number }) =>
    request<{ game: Game }>(`/games/${gameId}/players/${playerId}`, { method: 'PATCH', body: body(payload) }),
  removePlayer: (gameId: string, playerId: string) =>
    request<{ game: Game }>(`/games/${gameId}/players/${playerId}`, { method: 'DELETE' }),
  saveScore: (gameId: string, payload: { playerId: string; hole: number; strokes: number | null; putts?: number | null }) =>
    request<{ game: Game }>(`/games/${gameId}/scores`, { method: 'PUT', body: body(payload) }),
  saveScores: (gameId: string, scores: { playerId: string; hole: number; strokes: number | null }[]) =>
    request<{ game: Game }>(`/games/${gameId}/scores`, { method: 'PUT', body: body({ scores }) }),
  finishGame: (gameId: string) => request<{ game: Game }>(`/games/${gameId}/finish`, { method: 'POST' }),
  reopenGame: (gameId: string) => request<{ game: Game }>(`/games/${gameId}/reopen`, { method: 'POST' }),

  /* the book */
  feed: (scope: 'all' | 'mine' = 'all') => request<{ posts: Post[] }>(`/feed?scope=${scope}`),
  gameFeed: (gameId: string) => request<{ posts: Post[] }>(`/feed/game/${gameId}`),
  post: (payload: { gameId?: string | null; body: string }) =>
    request<{ post: Post }>('/feed', { method: 'POST', body: body(payload) }),
  like: (postId: string) => request<{ post: Post }>(`/feed/${postId}/like`, { method: 'POST' }),
  comments: (postId: string) => request<{ comments: Comment[] }>(`/feed/${postId}/comments`),
  comment: (postId: string, text: string) =>
    request<{ ok: boolean }>(`/feed/${postId}/comments`, { method: 'POST', body: body({ body: text }) }),

  /* profile */
  profile: (id = 'me') =>
    request<{ user: User; stats: Stats; rounds: RoundHistory[] }>(`/users/${id}`),

  /* clubs — golfer side */
  clubs: (params: { province?: string; q?: string; date?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    ).toString();
    return request<{ clubs: Club[] }>(`/clubs${query ? `?${query}` : ''}`);
  },
  provinces: () => request<{ provinces: { province: string; clubs: number }[] }>('/clubs/provinces'),
  club: (slug: string) => request<{ club: Club }>(`/clubs/${slug}`),
  myClubs: () => request<{ clubs: Club[]; isPlatformAdmin: boolean }>('/clubs/mine'),
  registerClub: (payload: {
    name: string; city: string; province: string;
    phone?: string; email?: string; website?: string; blurb?: string;
  }) => request<{ club: Club; message: string }>('/clubs/register', { method: 'POST', body: body(payload) }),

  /* bookings — golfer side */
  availability: (courseId: string, date: string) =>
    request<Availability>(`/bookings/availability?courseId=${courseId}&date=${date}`),
  createBooking: (payload: {
    courseId: string; date: string; time: string; players: number;
    guestNames?: string[]; cart?: boolean; notes?: string | null;
    format?: string; scoring?: string;
    partners?: { userId?: string; name: string }[];
  }) => request<{ booking: Booking }>('/bookings', { method: 'POST', body: body(payload) }),
  myBookings: (scope: 'upcoming' | 'past' = 'upcoming') =>
    request<{ bookings: Booking[] }>(`/bookings?scope=${scope}`),
  booking: (id: string) => request<{ booking: Booking }>(`/bookings/${id}`),
  payBooking: (id: string, scope: 'share' | 'balance', method = 'card') =>
    request<{ booking: Booking; settledCents: number }>(`/bookings/${id}/pay`, {
      method: 'POST', body: body({ scope, method }),
    }),
  cancelBooking: (id: string, reason?: string) =>
    request<{ booking: Booking; cancellation: Booking['cancellation'] }>(`/bookings/${id}/cancel`, {
      method: 'POST', body: body({ reason }),
    }),
  /** The round attached to a booking; builds one for older bookings that lack it. */
  bookingRound: (id: string) =>
    request<{ gameId: string }>(`/bookings/${id}/round`, { method: 'POST' }),

  /* clubs — admin side */
  clubDashboard: (clubId: string, date?: string) =>
    request<ClubDashboard>(`/clubs/${clubId}/admin/dashboard${date ? `?date=${date}` : ''}`),
  clubTeeSheet: (clubId: string, date: string, courseId?: string) =>
    request<TeeSheet>(`/clubs/${clubId}/admin/teesheet?date=${date}${courseId ? `&courseId=${courseId}` : ''}`),
  clubBookings: (clubId: string, params: { from?: string; to?: string; status?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    ).toString();
    return request<{ bookings: Booking[] }>(`/clubs/${clubId}/admin/bookings${query ? `?${query}` : ''}`);
  },
  clubBookingAction: (
    clubId: string, bookingId: string,
    payload: { action: string; amountCents?: number; method?: string; reason?: string },
  ) => request<{ booking: Booking }>(`/clubs/${clubId}/admin/bookings/${bookingId}`, {
    method: 'PATCH', body: body(payload),
  }),
  clubCustomers: (clubId: string, q = '') =>
    request<{ customers: ClubCustomer[] }>(`/clubs/${clubId}/admin/customers?q=${encodeURIComponent(q)}`),
  updateCustomer: (
    clubId: string, userId: string,
    payload: { notes?: string; tags?: string[]; marketingOptIn?: boolean },
  ) => request<{ ok: boolean }>(`/clubs/${clubId}/admin/customers/${userId}`, {
    method: 'PATCH', body: body(payload),
  }),
  updateClubCourse: (clubId: string, courseId: string, payload: Partial<ClubCourse>) =>
    request<{ course: ClubCourse }>(`/clubs/${clubId}/admin/courses/${courseId}`, {
      method: 'PATCH', body: body(payload),
    }),
  updateClubProfile: (clubId: string, payload: Partial<Club>) =>
    request<{ club: Club }>(`/clubs/${clubId}/admin/profile`, { method: 'PATCH', body: body(payload) }),
  addBlock: (clubId: string, payload: { courseId: string; date: string; startTime: string; endTime: string; reason?: string }) =>
    request<{ blockId: string }>(`/clubs/${clubId}/admin/blocks`, { method: 'POST', body: body(payload) }),
  removeBlock: (clubId: string, blockId: string) =>
    request<{ ok: boolean }>(`/clubs/${clubId}/admin/blocks/${blockId}`, { method: 'DELETE' }),

  /* platform approval queue */
  pendingClubs: () => request<{ clubs: Club[] }>('/clubs/pending'),
  approveClub: (id: string) => request<{ club: Club }>(`/clubs/${id}/approve`, { method: 'POST' }),
  rejectClub: (id: string) => request<{ club: Club }>(`/clubs/${id}/reject`, { method: 'POST' }),
};

/** Live updates for a single game. Returns an unsubscribe function. */
export function subscribeToGame(gameId: string, onEvent: (event: { type: string; payload: any }) => void) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = getToken();
  const socket = new WebSocket(
    `${protocol}://${location.host}/ws?game=${gameId}${token ? `&token=${token}` : ''}`,
  );
  socket.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data));
    } catch {
      /* ignore malformed frames */
    }
  };
  return () => socket.close();
}
