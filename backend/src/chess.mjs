import { Chess } from 'chess.js';
import { badInput } from './http.mjs';

export function play(chess, { from, to, promotion }) {
  if (typeof from !== 'string' || !/^[a-h][1-8]$/.test(from)
      || typeof to !== 'string' || !/^[a-h][1-8]$/.test(to)
      || (promotion !== undefined && !['q', 'r', 'b', 'n'].includes(promotion))) {
    throw badInput('請提供合法的起點、終點與升變棋子。');
  }
  try { return chess.move({ from, to, promotion }); }
  catch { throw badInput('這一步不符合棋規。'); }
}

export function positionKey(fen) { return fen.split(' ', 4).join(' '); }

export function chessOutcome(game, repetitions = 1) {
  if (game.isCheckmate()) return game.turn() === 'w' ? 'black_wins' : 'white_wins';
  if (game.isStalemate()) return 'stalemate';
  if (game.isInsufficientMaterial()) return 'insufficient';
  if (repetitions >= 3) return 'repetition';
  if (game.isDrawByFiftyMoves()) return 'fifty_moves';
  return null;
}

export const startingFen = new Chess().fen();
