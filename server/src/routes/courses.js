import { Router } from 'express';
import { all, get } from '../db.js';
import { requireAuth } from '../auth.js';
import { FORMATS } from '../scoring.js';

const router = Router();

const view = (c) => ({
  id: c.id, name: c.name, location: c.location, country: c.country, tee: c.tee,
  par: c.par, rating: c.rating, slope: c.slope, holes: JSON.parse(c.holes_json),
  clubId: c.club_id, clubName: c.club_name ?? null, province: c.province ?? null,
  bookable: Boolean(c.bookable),
});

router.get('/', requireAuth, async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  // ILIKE, not LIKE: SQLite matched ASCII case-insensitively by default and
  // Postgres does not, so plain LIKE would quietly stop matching "royal cape".
  const rows = await all(
    `SELECT c.*, cl.name AS club_name, cl.province
     FROM courses c LEFT JOIN clubs cl ON cl.id = c.club_id
     WHERE c.name ILIKE ? OR c.location ILIKE ? OR cl.name ILIKE ?
     ORDER BY cl.name, c.name`,
    q, q, q,
  );
  res.json({ courses: rows.map(view) });
});

router.get('/formats', (_req, res) => {
  res.json({
    formats: Object.entries(FORMATS).map(([key, meta]) => ({ key, ...meta })),
  });
});

router.get('/:id', requireAuth, async (req, res) => {
  const course = await get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  res.json({ course: view(course) });
});

export default router;
