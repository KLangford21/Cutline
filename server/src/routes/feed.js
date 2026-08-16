import { Router } from 'express';
import crypto from 'node:crypto';
import { all, get, run, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { broadcast } from '../realtime.js';

const router = Router();
const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;

const postView = (row) => ({
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
  likes: row.like_count,
  liked: row.liked,
  comments: row.comment_count,
});

/**
 * Like and comment counts are gathered in the query rather than per post. They
 * used to be three extra reads for every row, which a hundred-post feed turned
 * into three hundred round trips to a database that is now across a network.
 *
 * COUNT(*) is cast to int deliberately: Postgres counts are bigint, and the
 * driver hands bigint back as a string, so the client would receive "3" likes.
 *
 * The viewer id is always the FIRST parameter, ahead of anything a caller adds
 * in its own WHERE clause — placeholders are numbered by position.
 */
const SELECT_POSTS = `
  SELECT p.*, u.name AS author_name, u.avatar_color AS author_color, u.avatar_url AS author_avatar,
         g.name AS game_name, c.name AS course_name,
         (SELECT COUNT(*)::int FROM likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COUNT(*)::int FROM comments cm WHERE cm.post_id = p.id) AS comment_count,
         EXISTS (SELECT 1 FROM likes lv WHERE lv.post_id = p.id AND lv.user_id = ?) AS liked
  FROM posts p
  LEFT JOIN users u ON u.id = p.user_id
  LEFT JOIN games g ON g.id = p.game_id
  LEFT JOIN courses c ON c.id = g.course_id
`;

/** The Book: everything happening in rounds you are part of, newest first. */
router.get('/', requireAuth, async (req, res) => {
  const scope = req.query.scope === 'mine' ? 'mine' : 'all';
  const rows = scope === 'mine'
    ? await all(
        `${SELECT_POSTS}
         WHERE p.game_id IN (SELECT game_id FROM game_players WHERE user_id = ?)
         ORDER BY p.created_at DESC LIMIT 100`,
        req.user.id, req.user.id,
      )
    : await all(`${SELECT_POSTS} ORDER BY p.created_at DESC LIMIT 100`, req.user.id);
  res.json({ posts: rows.map(postView) });
});

router.get('/game/:gameId', requireAuth, async (req, res) => {
  const rows = await all(
    `${SELECT_POSTS} WHERE p.game_id = ? ORDER BY p.created_at DESC`,
    req.user.id, req.params.gameId,
  );
  res.json({ posts: rows.map(postView) });
});

router.post('/', requireAuth, async (req, res) => {
  const { gameId = null, body, kind = 'text' } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Say something first' });

  const id = uid('pst');
  await run(
    'INSERT INTO posts (id, game_id, user_id, kind, body, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, gameId, req.user.id, kind, body.trim(), null, now(),
  );
  const row = await get(`${SELECT_POSTS} WHERE p.id = ?`, req.user.id, id);
  const view = postView(row);
  if (gameId) broadcast(gameId, 'post', view);
  res.status(201).json({ post: view });
});

router.post('/:id/like', requireAuth, async (req, res) => {
  const liked = await get('SELECT 1 AS x FROM likes WHERE post_id = ? AND user_id = ?', req.params.id, req.user.id);
  if (liked) await run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', req.params.id, req.user.id);
  else await run('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', req.params.id, req.user.id);

  const row = await get(`${SELECT_POSTS} WHERE p.id = ?`, req.user.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Post not found' });
  res.json({ post: postView(row) });
});

router.get('/:id/comments', requireAuth, async (req, res) => {
  const rows = await all(
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

router.post('/:id/comments', requireAuth, async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (!await get('SELECT id FROM posts WHERE id = ?', req.params.id)) {
    return res.status(404).json({ error: 'Post not found' });
  }
  await run(
    'INSERT INTO comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
    uid('cmt'), req.params.id, req.user.id, body, now(),
  );
  res.status(201).json({ ok: true });
});

export default router;
