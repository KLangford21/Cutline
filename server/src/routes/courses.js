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

router.get('/', requireAuth, (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = all(
    `SELECT c.*, cl.name AS club_name, cl.province
     FROM courses c LEFT JOIN clubs cl ON cl.id = c.club_id
     WHERE c.name LIKE ? OR c.location LIKE ? OR cl.name LIKE ?
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

router.get('/:id', requireAuth, (req, res) => {
  const course = get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  res.json({ course: view(course) });
});

export default router;
