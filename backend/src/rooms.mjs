import { Chess } from 'chess.js';
import { chessOutcome, play, positionKey, startingFen } from './chess.mjs';
import { bearer, checkVersion, conflict, hashToken, notFound, randomString, readJson, sessionToken } from './http.mjs';

export const roomAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const lifetime = 2 * 24 * 60 * 60 * 1000;

function state(room, color) {
  return {
    code: room.code,
    color,
    ready: room.black_secret !== null,
    fen: room.fen,
    version: room.version,
    lastMove: room.last_move ? JSON.parse(room.last_move) : null,
    outcome: room.outcome,
  };
}

export async function createRoom(db, now, ctx) {
  const token = sessionToken();
  const secret = await hashToken(token);
  const positions = JSON.stringify({ [positionKey(startingFen)]: 1 });
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomString(roomAlphabet, 8);
    const result = await db.prepare(`INSERT INTO rooms
      (code, white_secret, fen, positions, expires_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(code) DO NOTHING`).bind(code, secret, startingFen, positions, now + lifetime).run();
    if (!result.meta.changes) continue;
    ctx.waitUntil(db.prepare(`DELETE FROM rooms WHERE code IN (
      SELECT code FROM rooms WHERE expires_at <= ? LIMIT 12)`).bind(now).run().catch(() => {}));
    return { ...state({ code, fen: startingFen, version: 0, black_secret: null, last_move: null, outcome: null }, 'w'), token };
  }
  throw conflict('無法建立房間，請再試一次。');
}

export async function joinRoom(db, code, now) {
  const token = sessionToken();
  const secret = await hashToken(token);
  const row = await db.prepare(`UPDATE rooms SET black_secret = ?, version = version + 1
    WHERE code = ? AND black_secret IS NULL AND expires_at > ?
    RETURNING code, black_secret, fen, last_move, outcome, version`).bind(secret, code, now).first();
  if (row) return { ...state(row, 'b'), token };
  const exists = await db.prepare('SELECT 1 FROM rooms WHERE code = ? AND expires_at > ?').bind(code, now).first();
  if (!exists) throw notFound();
  throw conflict('這個房間已有兩位玩家。');
}

export async function roomAction(db, request, code, now, action) {
  const token = bearer(request);
  const [room, secret] = await Promise.all([
    db.prepare('SELECT * FROM rooms WHERE code = ? AND expires_at > ?').bind(code, now).first(),
    hashToken(token),
  ]);
  if (!room) throw notFound();
  const color = secret === room.white_secret ? 'w' : secret === room.black_secret ? 'b' : null;
  if (!color) throw notFound();
  if (!action) return state(room, color);

  const body = await readJson(request);
  checkVersion(body, room.version);
  if (!room.black_secret || room.outcome) throw conflict('這個棋局目前無法進行。');
  if (action === 'resign') {
    room.outcome = color === 'w' ? 'white_resigns' : 'black_resigns';
    const result = await db.prepare('UPDATE rooms SET outcome = ?, version = version + 1 WHERE code = ? AND version = ?')
      .bind(room.outcome, code, room.version).run();
    if (!result.meta.changes) throw conflict('棋局已更新，請再試一次。');
  } else {
    const game = new Chess(room.fen);
    if (game.turn() !== color) throw conflict('現在輪到對手。');
    const move = play(game, body);
    room.fen = game.fen();
    const positions = JSON.parse(room.positions);
    const key = positionKey(room.fen);
    const repeats = (positions[key] ?? 0) + 1;
    positions[key] = repeats;
    room.outcome = chessOutcome(game, repeats);
    room.last_move = JSON.stringify({ from: move.from, to: move.to, san: move.san });
    const result = await db.prepare(`UPDATE rooms SET fen = ?, positions = ?, last_move = ?, outcome = ?, version = version + 1
      WHERE code = ? AND version = ?`).bind(room.fen, JSON.stringify(positions), room.last_move, room.outcome, code, room.version).run();
    if (!result.meta.changes) throw conflict('棋局已更新，請再試一次。');
  }
  room.version++;
  return state(room, color);
}
