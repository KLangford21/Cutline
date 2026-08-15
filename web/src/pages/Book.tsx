import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store';
import { Avatar, Empty, Spinner, relativeTime } from '../components/ui';
import { IconChat, IconHeart } from '../components/icons';
import type { Comment, Post } from '../types';

function Thread({ post }: { post: Post }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    const { comments: list } = await api.comments(post.id);
    setComments(list);
  }, [post.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="stack" style={{ marginTop: 10, gap: 10 }}>
      {(comments ?? []).map((c) => (
        <div key={c.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Avatar name={c.author.name} color={c.author.avatarColor} src={c.author.avatarUrl} size={26} />
          <div style={{ flex: 1 }}>
            <div className="tiny"><strong>{c.author.name}</strong> <span className="muted">{relativeTime(c.createdAt)}</span></div>
            <div className="small">{c.body}</div>
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ padding: '10px 14px', fontSize: 13.5 }}
          placeholder="Reply…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || !text.trim()) return;
            await api.comment(post.id, text);
            setText('');
            void load();
          }}
        />
      </div>
    </div>
  );
}

export default function Book() {
  const { user } = useAuth();
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { posts: list } = await api.feed(scope);
    setPosts(list);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const publish = async () => {
    if (!text.trim()) return;
    await api.post({ body: text });
    setText('');
    void load();
  };

  const like = async (post: Post) => {
    const { post: updated } = await api.like(post.id);
    setPosts((list) => (list ?? []).map((p) => (p.id === post.id ? updated : p)));
  };

  return (
    <div className="screen">
      <header className="topbar">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">What happened out there</div>
          <h1>The Book</h1>
        </div>
        <Avatar name={user?.name ?? '?'} color={user?.avatarColor ?? '#1D3B2E'} src={user?.avatarUrl} size={40} variant="ring" />
      </header>

      <div className="segmented" style={{ marginBottom: 14 }}>
        <button aria-selected={scope === 'all'} onClick={() => setScope('all')}>Everyone</button>
        <button aria-selected={scope === 'mine'} onClick={() => setScope('mine')}>My rounds</button>
      </div>

      <div className="card tight row" style={{ gap: 10, marginBottom: 14 }}>
        <Avatar name={user?.name ?? '?'} color={user?.avatarColor ?? '#1D3B2E'} src={user?.avatarUrl} size={32} />
        <input
          className="input"
          style={{ border: 0, background: 'transparent', padding: 0 }}
          placeholder="How did it go?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && publish()}
        />
        <button className="btn sm primary" disabled={!text.trim()} onClick={publish}>Post</button>
      </div>

      {posts === null && <Spinner />}
      {posts?.length === 0 && <Empty glyph="📖" title="The book is empty" hint="Post something after your next round." />}

      <div className="stack">
        {(posts ?? []).map((post) => (
          <article key={post.id} className={`card post ${post.kind === 'event' ? 'event-post' : ''}`}>
            <div className="row" style={{ gap: 10 }}>
              <Avatar name={post.author.name} color={post.author.avatarColor} src={post.author.avatarUrl} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 630, fontSize: 14 }}>{post.author.name}</div>
                <div className="meta">
                  {relativeTime(post.createdAt)}
                  {post.courseName && <> · {post.courseName}</>}
                </div>
              </div>
              {post.gameId && (
                <Link to={`/game/${post.gameId}`} className="chip">Round</Link>
              )}
            </div>

            <div className="body">{post.body}</div>

            <div className="post-actions">
              <button className={post.liked ? 'on' : ''} onClick={() => like(post)}>
                <IconHeart /> {post.likes || 'Like'}
              </button>
              <button className={open === post.id ? 'on' : ''} onClick={() => setOpen(open === post.id ? null : post.id)}>
                <IconChat /> {post.comments || 'Comment'}
              </button>
            </div>

            {open === post.id && <Thread post={post} />}
          </article>
        ))}
      </div>
    </div>
  );
}
