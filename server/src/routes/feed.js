import { Router } from 'express';
import crypto from 'node:crypto';
import { all, get, run, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { broadcast } from '../realtime.js';

const router = Router();
const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;

const postView = (row, viewerId) => ({
  id: row.id,
  gameId: row.game_id,
  gameName: row.game_name,
  courseName: row.course_name,
  kind: row.kind,
  body: row.body,
  createdAt: row.created_at,
  author: row.user_id
    ? { id: row.user_id, name: row.author_name, avatarColor: row.author_color, avatarUrl: row.author_avatar ?? null }
    : { id: null, name: 'Cutline', avatarColor: '#1D3B2E', avatarUrl: null },
  likes: get('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?', row.id).n,
  liked: Boolean(get('SELECT 1 AS x FROM likes WHERE post_id = ? AND user_id = ?', row.id, viewerId)),
  comments: get('SELECT COUNT(*) AS n FROM comments WHERE post_id = ?', row.id).n,
});

const SELECT_POSTS = `
  SELECT p.*, u.name AS author_name, u.avatar_color AS author_color, u.avatar_url AS author_avatar,
         g.name AS game_name, c.name AS course_name
  FROM posts p
  LEFT JOIN users u ON u.id = p.user_id
  LEFT JOIN games g ON g.id = p.game_id
  LEFT JOIN courses c ON c.id = g.course_id
`;

/** The Book: everything happening in rounds you are part of, newest first. */
router.get('/', requireAuth, (req, res) => {
  const scope = req.query.scope === 'mine' ? 'mine' : 'all';
  const rows = scope === 'mine'
    ? all(
        `${SELECT_POSTS}
         WHERE p.game_id IN (SELECT game_id FROM game_players WHERE user_id = ?)
         ORDER BY p.created_at DESC LIMIT 100`,
        req.user.id,
      )
    : all(`${SELECT_POSTS} ORDER BY p.created_at DESC LIMIT 100`);
  res.json({ posts: rows.map((r) => postView(r, req.user.id)) });
});

router.get('/game/:gameId', requireAuth, (req, res) => {
  const rows = all(`${SELECT_POSTS} WHERE p.game_id = ? ORDER BY p.created_at DESC`, req.params.gameId);
  res.json({ posts: rows.map((r) => postView(r, req.user.id)) });
});

router.post('/', requireAuth, (req, res) => {
  const { gameId = null, body, kind = 'text' } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Say something first' });

  const id = uid('pst');
  run(
    'INSERT INTO posts (id, game_id, user_id, kind, body, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, gameId, req.user.id, kind, body.trim(), null, now(),
  );
  const row = get(`${SELECT_POSTS} WHERE p.id = ?`, id);
  const view = postView(row, req.user.id);
  if (gameId) broadcast(gameId, 'post', view);
  res.status(201).json({ post: view });
});

router.post('/:id/like', requireAuth, (req, res) => {
  const liked = get('SELECT 1 AS x FROM likes WHERE post_id = ? AND user_id = ?', req.params.id, req.user.id);
  if (liked) run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', req.params.id, req.user.id);
  else run('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', req.params.id, req.user.id);

  const row = get(`${SELECT_POSTS} WHERE p.id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Post not found' });
  res.json({ post: postView(row, req.user.id) });
});

router.get('/:id/comments', requireAuth, (req, res) => {
  const rows = all(
    `SELECT c.*, u.name AS author_name, u.avatar_color AS author_color, u.avatar_url AS author_avatar
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? ORDER BY c.created_at`,
    req.params.id,
  );
  res.json({
    comments: rows.map((c) => ({
      id: c.id, body: c.body, createdAt: c.created_at,
      author: { id: c.user_id, name: c.author_name, avatarColor: c.author_color, avatarUrl: c.author_avatar ?? null },
    })),
  });
});

router.post('/:id/comments', requireAuth, (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (!get('SELECT id FROM posts WHERE id = ?', req.params.id)) {
    return res.status(404).json({ error: 'Post not found' });
  }
  run(
    'INSERT INTO comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
    uid('cmt'), req.params.id, req.user.id, body, now(),
  );
  res.status(201).json({ ok: true });
});

export default router;
