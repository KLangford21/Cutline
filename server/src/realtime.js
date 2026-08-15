import { WebSocketServer } from 'ws';
import { readToken } from './auth.js';

/**
 * Tiny pub/sub over WebSockets. Clients subscribe to a game id and get pushed
 * every score change, join and post so leaderboards stay live without polling.
 */
const rooms = new Map(); // gameId -> Set<socket>

export function broadcast(gameId, type, payload) {
  const room = rooms.get(gameId);
  if (!room) return;
  const message = JSON.stringify({ type, gameId, payload, at: Date.now() });
  for (const socket of room) {
    if (socket.readyState === socket.OPEN) socket.send(message);
  }
}

function join(socket, gameId) {
  if (!gameId) return;
  if (!rooms.has(gameId)) rooms.set(gameId, new Set());
  rooms.get(gameId).add(socket);
  socket.rooms.add(gameId);
}

function leaveAll(socket) {
  for (const gameId of socket.rooms) {
    rooms.get(gameId)?.delete(socket);
    if (rooms.get(gameId)?.size === 0) rooms.delete(gameId);
  }
  socket.rooms.clear();
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    socket.rooms = new Set();
    const url = new URL(req.url, 'http://localhost');
    socket.userId = readToken(url.searchParams.get('token'))?.sub ?? null;
    join(socket, url.searchParams.get('game'));

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'subscribe') join(socket, msg.gameId);
      if (msg.type === 'unsubscribe') {
        rooms.get(msg.gameId)?.delete(socket);
        socket.rooms.delete(msg.gameId);
      }
      if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
    });

    socket.on('close', () => leaveAll(socket));
    socket.send(JSON.stringify({ type: 'ready' }));
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) if (client.readyState === client.OPEN) client.ping();
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}
