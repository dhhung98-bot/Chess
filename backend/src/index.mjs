import { HttpError, json } from './http.mjs';
import { createRoom, joinRoom, roomAction } from './rooms.mjs';
import { createRun, leaderboard, runAction } from './runs.mjs';

const roomRoute = /^\/api\/rooms\/([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8})(?:\/(join|move|resign))?$/;
const runRoute = /^\/api\/runs\/([0-9a-f-]{36})(?:\/(move|skip))?$/;

async function route(request, env, ctx, path) {
  const now = Date.now();
  const db = env.DB;
  const method = request.method;
  if (path === '/api/health' && method === 'GET') {
    await db.prepare('SELECT 1 FROM runs LIMIT 1').first();
    return { status: 'ok' };
  }
  if (path === '/api/leaderboard' && method === 'GET') return leaderboard(db, now);
  if (path === '/api/rooms' && method === 'POST') return createRoom(db, now, ctx);
  if (path === '/api/runs' && method === 'POST') return createRun(db, request, now, ctx);
  const room = roomRoute.exec(path);
  if (room && method === (room[2] ? 'POST' : 'GET')) {
    if (room[2] === 'join') return joinRoom(db, room[1], now);
    return roomAction(db, request, room[1], now, room[2]);
  }
  const run = runRoute.exec(path);
  if (run && method === (run[2] ? 'POST' : 'GET')) return runAction(db, request, run[1], now, run[2]);
  throw new HttpError(404, 'not_found', '找不到這個網址。');
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const allowed = origin && origin === env.FRONTEND_ORIGIN;
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin',
    });
    if (origin && !allowed) return new Response(null, { status: 403, headers });
    if (allowed) headers.set('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      headers.set('Access-Control-Max-Age', '86400');
      headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      return new Response(null, { status: 204, headers });
    }
    const { pathname } = new URL(request.url);
    try {
      const result = await route(request, env, ctx, pathname);
      if (pathname === '/api/leaderboard') headers.set('Cache-Control', 'public, max-age=10');
      return json(result, headers);
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ code: error.code, message: error.message }, { status: error.status, headers });
      }
      console.error('Chess API error', error);
      return Response.json({ code: 'unavailable', message: '服務暫時無法使用，請稍後再試。' }, { status: 503, headers });
    }
  },
};
