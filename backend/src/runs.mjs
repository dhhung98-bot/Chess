import { Chess } from 'chess.js';
import { bestMove, nextPuzzle } from '../../shared/krk.mjs';
import { banks, table } from './generated-table.mjs';
import { play } from './chess.mjs';
import { badInput, bearer, checkVersion, conflict, hashToken, notFound, readJson, sessionToken } from './http.mjs';

const duration = 180_000;
const levels = [1, 3, 3, 5, 5, 7];

function puzzle(score, previousFen) {
  return nextPuzzle(banks, levels[Math.min(score, levels.length - 1)], previousFen);
}

function state(run, now, turn = {}) {
  return {
    id: run.id, name: run.name, fen: run.fen, score: run.score,
    deadline: run.deadline, startedAt: run.deadline - duration, serverNow: now,
    ended: now >= run.deadline, version: run.version, ...turn,
  };
}

export async function createRun(db, request, now, ctx) {
  const body = await readJson(request);
  const name = typeof body.name === 'string' ? body.name.trim().normalize('NFC').replace(/ +/g, ' ') : '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{1,15}$/u.test(name)) {
    throw badInput('暱稱須為 2 至 16 字，可用中英文、數字、空格、底線與連字號。');
  }
  const id = crypto.randomUUID();
  const token = sessionToken();
  const secret = await hashToken(token);
  const run = { id, name, fen: puzzle(0), score: 0, deadline: now + duration, version: 0 };
  await db.prepare('INSERT INTO runs (id, secret, name, fen, deadline) VALUES (?, ?, ?, ?, ?)')
    .bind(id, secret, name, run.fen, run.deadline).run();
  ctx.waitUntil(db.prepare(`DELETE FROM runs WHERE id IN (
    SELECT id FROM runs WHERE score = 0 AND deadline < ? LIMIT 12)`).bind(now - 86_400_000).run().catch(() => {}));
  return { ...state(run, Date.now()), token };
}

export async function runAction(db, request, id, now, action) {
  const token = bearer(request);
  const [run, secret] = await Promise.all([
    db.prepare('SELECT * FROM runs WHERE id = ?').bind(id).first(),
    hashToken(token),
  ]);
  if (!run || secret !== run.secret) throw notFound();
  if (!action || now >= run.deadline) return state(run, Date.now());

  const body = await readJson(request);
  checkVersion(body, run.version);
  let event = 'skip';
  let lastMove = null;
  let nextFen;
  if (action === 'move') {
    const game = new Chess(run.fen);
    const move = play(game, body);
    if (game.isCheckmate()) {
      nextFen = puzzle(++run.score, run.fen);
      run.last_mate_ms = now - (run.deadline - duration);
      event = 'mate';
    } else {
      const botMove = bestMove(game, table)?.move;
      if (botMove) game.move({ from: botMove.from, to: botMove.to });
      if (!botMove || game.isDrawByFiftyMoves() || game.isInsufficientMaterial() || game.isStalemate()) {
        event = 'draw';
      } else {
        nextFen = game.fen();
        lastMove = { from: botMove.from, to: botMove.to, san: botMove.san };
        event = 'move';
      }
    }
  }
  nextFen ??= puzzle(run.score, run.fen);
  const query = event === 'mate'
    ? db.prepare(`UPDATE runs SET fen = ?, score = ?, last_mate_ms = ?, version = version + 1 WHERE id = ? AND version = ?`)
      .bind(nextFen, run.score, run.last_mate_ms, id, run.version)
    : db.prepare('UPDATE runs SET fen = ?, version = version + 1 WHERE id = ? AND version = ?')
      .bind(nextFen, id, run.version);
  if (!(await query.run()).meta.changes) throw conflict('這一局已更新，請再試一次。');
  run.fen = nextFen;
  run.version++;
  return state(run, Date.now(), { event, lastMove });
}

export async function leaderboard(db, now) {
  const { results } = await db.prepare(`SELECT name, score, last_mate_ms AS elapsedMs FROM runs
    WHERE score > 0 AND deadline <= ? ORDER BY score DESC, last_mate_ms, id LIMIT 20`).bind(now).all();
  return { scores: results };
}
