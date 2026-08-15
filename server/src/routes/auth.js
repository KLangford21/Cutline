import { Router } from 'express';
import crypto from 'node:crypto';
import { get, run, now } from '../db.js';
import { hashPassword, verifyPassword, createToken, requireAuth, publicUser } from '../auth.js';

const router = Router();

const COLORS = ['#1D3B2E', '#C2A76A', '#BE3A2B', '#4A574F', '#C2A76A', '#163025', '#7C8E84', '#4A574F'];

router.post('/register', (req, res) => {
  const { name, email, password, handicapIndex = 18, homeClub = null } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const normalised = email.trim().toLowerCase();
  if (get('SELECT id FROM users WHERE email = ?', normalised)) {
    return res.status(409).json({ error: 'That email is already registered' });
  }

  const id = `usr_${crypto.randomUUID().slice(0, 8)}`;
  run(
    `INSERT INTO users (id, name, email, password_hash, handicap_index, home_club, avatar_color, bio, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, name.trim(), normalised, hashPassword(password), Number(handicapIndex) || 0, homeClub,
    COLORS[Math.floor(Math.random() * COLORS.length)], null, now(),
  );

  const user = get('SELECT * FROM users WHERE id = ?', id);
  res.status(201).json({ token: createToken(id), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = get('SELECT * FROM users WHERE email = ?', String(email || '').trim().toLowerCase());
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  res.json({ token: createToken(user.id), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

/**
 * Avatars ride along as data URLs rather than needing a file store. Cap the
 * size and insist on a real image type — the client downscales to 256px first,
 * which lands well under this.
 */
const MAX_AVATAR_CHARS = 400_000;

function avatarProblem(url) {
  if (url === undefined || url === null || url === '') return null;
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(url)) {
    return 'That does not look like an image';
  }
  if (url.length > MAX_AVATAR_CHARS) return 'That picture is too large — try a smaller one';
  return null;
}

router.patch('/me', requireAuth, (req, res) => {
  const {
    name, handicapIndex, homeClub, bio, avatarColor, avatarUrl,
    phone, city, province, preferredTee, dominantHand, ridePreference,
    goalHandicap, playingSince, favouriteCourse,
  } = req.body || {};

  const problem = avatarProblem(avatarUrl);
  if (problem) return res.status(400).json({ error: problem });

  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const text = (v) => (v === undefined ? null : v);

  run(
    `UPDATE users SET
       name = COALESCE(?, name),
       handicap_index = COALESCE(?, handicap_index),
       home_club = COALESCE(?, home_club),
       bio = COALESCE(?, bio),
       avatar_color = COALESCE(?, avatar_color),
       avatar_url = COALESCE(?, avatar_url),
       phone = COALESCE(?, phone),
       city = COALESCE(?, city),
       province = COALESCE(?, province),
       preferred_tee = COALESCE(?, preferred_tee),
       dominant_hand = COALESCE(?, dominant_hand),
       ride_preference = COALESCE(?, ride_preference),
       goal_handicap = COALESCE(?, goal_handicap),
       playing_since = COALESCE(?, playing_since),
       favourite_course = COALESCE(?, favourite_course)
     WHERE id = ?`,
    name?.trim() ?? null, num(handicapIndex), text(homeClub), text(bio),
    text(avatarColor), avatarUrl === '' ? null : text(avatarUrl),
    text(phone), text(city), text(province), text(preferredTee),
    text(dominantHand), text(ridePreference), num(goalHandicap),
    num(playingSince), text(favouriteCourse),
    req.user.id,
  );

  // COALESCE keeps existing values, so clearing the photo needs its own write.
  if (avatarUrl === '' || avatarUrl === null) {
    run('UPDATE users SET avatar_url = NULL WHERE id = ?', req.user.id);
  }

  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

export default router;
