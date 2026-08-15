import crypto from 'node:crypto';
import { get } from './db.js';

const secret = process.env.CUTLINE_SECRET;
if (!secret) throw new Error('CUTLINE_SECRET must be set');
const SECRET = secret;

/* ---------- passwords (scrypt, no native deps) ---------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

/* ---------- tokens (compact HMAC-signed JWT) ---------- */

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

export function createToken(userId, days = 60) {
  const payload = b64({ sub: userId, exp: Date.now() + days * 864e5 });
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function readToken(token) {
  if (!token) return null;
  const [header, payload, signature] = String(token).split('.');
  if (!header || !payload || !signature) return null;
  if (sign(`${header}.${payload}`) !== signature) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

/* ---------- express middleware ---------- */

function userFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const data = readToken(token);
  if (!data) return null;
  return get('SELECT * FROM users WHERE id = ?', data.sub) || null;
}

/** Attaches req.user when a valid token is present, but never blocks. */
export function attachUser(req, _res, next) {
  req.user = userFromRequest(req);
  next();
}

/** Blocks the request unless a valid token is present. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

export const publicUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    email: u.email,
    handicapIndex: u.handicap_index,
    homeClub: u.home_club,
    avatarColor: u.avatar_color,
    avatarUrl: u.avatar_url ?? null,
    bio: u.bio,
    phone: u.phone ?? null,
    city: u.city ?? null,
    province: u.province ?? null,
    preferredTee: u.preferred_tee ?? 'White',
    dominantHand: u.dominant_hand ?? 'right',
    ridePreference: u.ride_preference ?? 'either',
    goalHandicap: u.goal_handicap ?? null,
    playingSince: u.playing_since ?? null,
    favouriteCourse: u.favourite_course ?? null,
    createdAt: u.created_at,
  };
