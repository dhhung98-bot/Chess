import { squareLabel } from './krk.mjs';

const symbols = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' };
const names = { k: '王', q: '后', r: '車', b: '象', n: '馬', p: '兵' };

export class Board {
  constructor(element, select) {
    this.focusIndex = 0;
    this.cells = Array.from({ length: 64 }, (_, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'square';
      button.tabIndex = index === 0 ? 0 : -1;
      button.addEventListener('click', () => select(button.dataset.square));
      button.addEventListener('focus', () => this.moveFocus(index));
      const piece = document.createElement('span');
      const rank = document.createElement('span');
      const file = document.createElement('span');
      for (const decoration of [piece, rank, file]) decoration.setAttribute('aria-hidden', 'true');
      rank.className = 'coord rank';
      file.className = 'coord file';
      button.append(piece, rank, file);
      return { button, piece, rank, file };
    });
    element.append(...this.cells.map(cell => cell.button));
    element.addEventListener('keydown', event => {
      const { key } = event;
      const row = this.focusIndex >> 3;
      const col = this.focusIndex & 7;
      const offsets = { ArrowLeft: col ? -1 : 0, ArrowRight: col < 7 ? 1 : 0,
        ArrowUp: row ? -8 : 0, ArrowDown: row < 7 ? 8 : 0 };
      if (!Object.hasOwn(offsets, key)) return;
      event.preventDefault();
      this.cells[this.focusIndex + offsets[key]].button.focus();
    });
  }

  moveFocus(index) {
    this.cells[this.focusIndex].button.tabIndex = -1;
    this.focusIndex = index;
    this.cells[index].button.tabIndex = 0;
  }

  render({ game, color, selected, lastMove, hint }) {
    const moves = selected ? game.moves({ square: selected, verbose: true }) : [];
    const destinations = new Set(moves.map(move => move.to));
    const inCheck = game.isCheck();
    this.cells.forEach(({ button, piece, rank, file }, index) => {
      const row = index >> 3, col = index & 7;
      const square = squareLabel(color === 'b' ? row * 8 + 7 - col : (7 - row) * 8 + col);
      const chessPiece = game.get(square);
      button.dataset.square = square;
      button.setAttribute('aria-pressed', String(square === selected));
      button.setAttribute('aria-label', chessPiece
        ? `${square}，${chessPiece.color === 'w' ? '白' : '黑'}${names[chessPiece.type]}` : square);
      button.classList.toggle('dark', (row + col) % 2 === 1);
      button.classList.toggle('occupied', !!chessPiece);
      button.classList.toggle('selected', square === selected);
      button.classList.toggle('target', destinations.has(square));
      button.classList.toggle('last', square === lastMove?.from || square === lastMove?.to);
      button.classList.toggle('hint', square === hint?.from);
      button.classList.toggle('hint-destination', square === hint?.to);
      button.classList.toggle('in-check', inCheck && chessPiece?.type === 'k' && chessPiece.color === game.turn());
      piece.className = chessPiece?.color === 'w' ? 'piece white' : 'piece';
      piece.textContent = chessPiece ? symbols[chessPiece.type] : '';
      rank.textContent = col === 0 ? square[1] : '';
      file.textContent = row === 7 ? square[0] : '';
    });
  }
}
