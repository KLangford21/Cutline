import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { attachUser } from './auth.js';
import { attachRealtime } from './realtime.js';
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

seed();

const app = express();
app.use(cors());
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
