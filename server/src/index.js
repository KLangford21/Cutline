// Patches Express 4 so a rejected promise inside an async handler reaches the
// error middleware instead of hanging the request until it times out. Every
// route is async now, so this is load-bearing. It must be imported first: it
// patches the Router prototype, and the route modules below build their routers
// as they are imported.
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { attachUser } from './auth.js';
import { attachRealtime } from './realtime.js';
import { close, migrate } from './db.js';
import { seed } from './seed.js';

import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import gameRoutes from './routes/games.js';
import feedRoutes from './routes/feed.js';
import userRoutes from './routes/users.js';
import clubRoutes from './routes/clubs.js';
import bookingRoutes from './routes/bookings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

// Bring the schema up to date before anything can serve a request. Applied
// migrations are recorded, so this is a no-op once the database is current.
await migrate();

// seed() inserts 15 clubs, demo users and sample rounds. That is what a fresh
// developer database wants and the opposite of what production wants, where it
// would re-run on every restart — so outside development it is opt-in.
if (process.env.NODE_ENV !== 'production' || process.env.SEED_ON_BOOT === 'true') {
  await seed();
}

const app = express();

// In production the PWA is served from this same origin, so no cross-origin
// request should be permitted unless one is configured explicitly (a native
// client, say). Development stays permissive.
const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors(
    allowedOrigins.length
      ? { origin: allowedOrigins }
      : process.env.NODE_ENV === 'production'
        ? { origin: false }
        : {},
  ),
);
app.use(express.json({ limit: '1mb' }));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'cutline', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/bookings', bookingRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

// Serve the built PWA when it exists, so one process runs the whole app.
const dist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

const server = http.createServer(app);
attachRealtime(server);
server.listen(PORT, () => {
  console.log(`⛳  Cutline API listening on http://localhost:${PORT}`);
});

// Fly sends SIGTERM before it replaces a machine. Close the listener and the
// connection pool so in-flight work finishes and Supabase reclaims the
// connections immediately rather than waiting for them to time out.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(async () => {
      await close();
      process.exit(0);
    });
  });
}
