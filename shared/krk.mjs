const files = 'abcdefgh';
export const DRAW = 255;

export function krkFen(index) {
  const pieces = new Map([
    [index >> 12, 'K'],
    [(index >> 6) & 63, 'R'],
    [index & 63, 'k'],
  ]);
  const ranks = [];
  for (let rank = 7; rank >= 0; rank--) {
    let text = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = pieces.get(rank * 8 + file);
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) text += empty;
      text += piece;
      empty = 0;
    }
    ranks.push(text + (empty || ''));
  }
  return ranks.join('/') + ' w - - 0 1';
}

export function mateDistance(fen, table) {
  const [board, turn] = fen.split(' ', 2);
  let wk = -1, wr = -1, bk = -1;
  let cursor = 0;
  for (const char of board) {
    if (char === '/') continue;
    if (char >= '1' && char <= '8') {
      cursor += Number(char);
      continue;
    }
    const square = (7 - (cursor >> 3)) * 8 + (cursor & 7);
    if (char === 'K') wk = square;
    if (char === 'R') wr = square;
    if (char === 'k') bk = square;
    cursor++;
  }
  if (wk < 0 || wr < 0 || bk < 0) return DRAW;
  return table[((wk * 64 + wr) * 64 + bk) * 2 + Number(turn === 'b')];
}

export function bestMove(game, table) {
  const white = game.turn() === 'w';
  let best = null;
  for (const move of game.moves({ verbose: true })) {
    const distance = mateDistance(move.after, table);
    if (!best || (white ? distance < best.distance : distance > best.distance)) {
      best = { move, distance };
    }
  }
  return best;
}

export function nextPuzzle(banks, distance, previousFen) {
  const bank = banks[distance];
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  const index = random % bank.length;
  const fen = krkFen(bank[index]);
  return fen === previousFen ? krkFen(bank[(index + 1) % bank.length]) : fen;
}

export function squareLabel(square) {
  return files[square % 8] + (Math.floor(square / 8) + 1);
}
