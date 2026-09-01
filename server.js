/* Desk Duel relay server — no game logic, no dependencies.
 *
 *   node server.js            → serves dist/desk-duel.html on http://localhost:3000
 *   PORT=8080 node server.js  → any port you like
 *
 * It builds the page first (from src/), so what it serves is always fresh.
 * Players open the page (from this server, or from file:// — CORS is open),
 * one creates a room, the other joins with the 4-letter code, and the two
 * browsers exchange small JSON messages through here:
 *
 *   POST /create            → {room, token}
 *   POST /join   {room}     → {room, token}        (peer gets "peer-joined")
 *   POST /msg    {room, token, msg}                (msg relayed to the peer)
 *   POST /leave  {room, token}                     (peer gets "peer-left")
 *   GET  /events?room=&token=   → SSE stream of relayed messages + presence
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { build } = require('./build.js');

const PAGE = build();

/* room code: 4 letters, skipping the ones people read wrong over the phone */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
function newCode(rooms) {
  for (let t = 0; t < 200; t++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[(Math.random() * ALPHABET.length) | 0];
    if (!rooms.has(c)) return c;
  }
  return 'ZZZZ';
}
const newToken = () => crypto.randomBytes(12).toString('hex');

function createServer() {
  /* room → { clients: Map<token, res>, lastSeen } */
  const rooms = new Map();

  const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };
  const json = (res, code, obj) => {
    cors(res);
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  const readBody = (req) => new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 65536) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });

  /* push one JSON message down a client's SSE stream */
  function deliver(res, msg) {
    if (!res || res.destroyed || res.writableEnded) return false;
    res.write('data: ' + JSON.stringify(msg) + '\n\n');
    return true;
  }

  function peerOf(room, token) {
    for (const [t, res] of room.clients) if (t !== token) return { token: t, res };
    return null;
  }

  function dropClient(roomCode, token, res) {
    const room = rooms.get(roomCode);
    if (!room) return;
    // only drop if the stored stream is THIS connection — EventSource
    // reconnects race the old socket's close event
    if (room.clients.get(token) !== res) return;
    room.clients.delete(token);
    if (res) { clearInterval(res._beat); try { res.end(); } catch { /* already gone */ } }
    const peer = peerOf(room, token);
    if (peer) deliver(peer.res, { t: 'peer-left' });
    if (room.clients.size === 0) rooms.delete(roomCode);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');

    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

    /* the game itself */
    if (req.method === 'GET' && url.pathname === '/') {
      try {
        const html = fs.readFileSync(PAGE);
        cors(res);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(500); res.end('dist/desk-duel.html not found — run node build.js');
      }
      return;
    }

    /* the event stream */
    if (req.method === 'GET' && url.pathname === '/events') {
      const room = rooms.get(url.searchParams.get('room') || '');
      const token = url.searchParams.get('token') || '';
      if (!room || !room.clients.has(token)) { json(res, 404, { error: 'no such room/token' }); return; }
      // a returning EventSource replaces its old stream, if any
      const old = room.clients.get(token);
      if (old) { clearInterval(old._beat); }

      cors(res);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write(': hello\n\n');
      room.clients.set(token, res);
      room.lastSeen = Date.now();
      res._beat = setInterval(() => { if (!deliver(res, { t: 'ping' })) clearInterval(res._beat); }, 25000);
      req.on('close', () => dropClient(url.searchParams.get('room'), token, res));
      return;
    }

    if (req.method !== 'POST') { json(res, 404, { error: 'not found' }); return; }
    const body = await readBody(req);

    if (url.pathname === '/create') {
      const code = newCode(rooms);
      const token = newToken();
      const room = { clients: new Map(), lastSeen: Date.now() };
      room.clients.set(token, null);       // claimed, no stream yet
      rooms.set(code, room);
      json(res, 200, { room: code, token });
      return;
    }

    if (url.pathname === '/join') {
      const room = rooms.get(body.room || '');
      if (!room) { json(res, 404, { error: 'no such room' }); return; }
      // count claims too: a creator with no stream yet still holds a seat
      let seats = 0;
      for (const [, r] of room.clients) if (r === null || !r.writableEnded) seats++;
      if (seats >= 2) { json(res, 409, { error: 'room is full' }); return; }
      const token = newToken();
      room.clients.set(token, null);
      room.lastSeen = Date.now();
      for (const [t, r] of room.clients) if (t !== token && r) deliver(r, { t: 'peer-joined' });
      json(res, 200, { room: body.room, token });
      return;
    }

    if (url.pathname === '/msg') {
      const room = rooms.get(body.room || '');
      const res_ = room && room.clients.get(body.token || '');
      if (!res_) { json(res, 404, { error: 'no such room/token' }); return; }
      room.lastSeen = Date.now();
      const peer = peerOf(room, body.token);
      if (peer) deliver(peer.res, body.msg);
      json(res, 200, {});
      return;
    }

    if (url.pathname === '/leave') {
      const room = rooms.get(body.room || '');
      if (room && room.clients.has(body.token || '')) {
        dropClient(body.room || '', body.token || '', room.clients.get(body.token || ''));
      }
      json(res, 200, {});
      return;
    }

    json(res, 404, { error: 'not found' });
  });

  /* tidy up rooms nobody has touched for ten minutes */
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.lastSeen > 10 * 60 * 1000) {
        for (const [t, r] of [...room.clients]) dropClient(code, t, r);
        rooms.delete(code);
      }
    }
  }, 60000);
  sweeper.unref();

  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => {
    console.log(`Desk Duel — open http://localhost:${port} in two browsers.`);
  });
}
