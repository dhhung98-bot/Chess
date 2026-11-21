import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

// 這個網頁只負責顯示與互動；chess.js 負責判斷「這一步能不能走」。
const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const countEl = document.querySelector("#move-count");
const aiButton = document.querySelector("#ai-move");
const qButton = document.querySelector("#show-q");
const newButton = document.querySelector("#new-game");
const qPanel = document.querySelector("#q-panel");
const scoreList = document.querySelector("#move-scores");

let policy = {};
let game;
let whiteMoves = 0;
let selected = null;
let qTable = null;
let qWhiteKing = null;
let gameOver = false;

const files = "abcdefgh";
const glyph = { wk:"♔", wr:"♖", bk:"♚" };

// python-chess 的編號：a1 是 0，每往右加 1、每往上一排加 8。
function squareNumber(square) {
  return files.indexOf(square[0]) + (Number(square[1]) - 1) * 8;
}

function squareName(number) {
  return `${files[number % 8]}${Math.floor(number / 8) + 1}`;
}

function currentState() {
  const locations = {};
  for (const rank of "12345678") for (const file of files) {
    const square = `${file}${rank}`;
    const piece = game.get(square);
    if (!piece) continue;
    if (piece.color === "w" && piece.type === "k") locations.wk = squareNumber(square);
    if (piece.color === "w" && piece.type === "r") locations.wr = squareNumber(square);
    if (piece.color === "b" && piece.type === "k") locations.bk = squareNumber(square);
  }
  return locations;
}

function setStatus(text) { statusEl.textContent = text; }

function isWhiteTurn() { return game.turn() === "w" && !gameOver; }

function makeRandomGame() {
  // 重複抽三個不同格子，直到 chess.js 接受這個王車殺單王開局。
  while (true) {
    const squares = [...Array(64).keys()].sort(() => Math.random() - 0.5).slice(0, 3);
    const [wk, wr, bk] = squares.map(squareName);
    const board = {};
    board[wk] = "K"; board[wr] = "R"; board[bk] = "k";
    const ranks = [...Array(8).keys()].map(rank => {
      let empty = 0, text = "";
      for (let file = 0; file < 8; file++) {
        const piece = board[`${files[file]}${rank + 1}`];
        if (piece) { if (empty) text += empty; empty = 0; text += piece; } else empty++;
      }
      return text + (empty || "");
    }).reverse();
    try {
      const candidate = new Chess(`${ranks.join("/")} w - - 0 1`);
      if (!candidate.isGameOver()) return candidate;
    } catch { /* 這個抽法不合法，重新抽即可。 */ }
  }
}

function checkAfterWhiteMove() {
  if (game.isCheckmate()) return endGame("將死！白方 AI 獲勝。");
  if (game.isStalemate()) return endGame("逼和，遊戲結束。白方未能獲勝。");
  setStatus("輪到黑方：點選黑王，再點目標格。");
}

function checkAfterBlackMove() {
  // 訓練程式在黑方走完後，才檢查白車是否被吃掉與 50 步限制。
  const state = currentState();
  if (state.wr === undefined) return endGame("黑王吃掉白車，遊戲結束。");
  if (whiteMoves >= 50) return endGame("白方走滿 50 步，遊戲結束。");
  setStatus("輪到白方 AI。可先查看 Q 分數，或直接讓 AI 走一步。");
}

function endGame(message) { gameOver = true; selected = null; setStatus(message); render(); }

function aiMove() {
  if (!isWhiteTurn()) return;
  const state = currentState();
  const key = `${state.wk},${state.wr},${state.bk}`;
  const legal = game.moves({ verbose:true });
  const learned = policy[key];
  // policy 沒有存到的局面，用合法走法當中的隨機一步當備案。
  const move = legal.find(item => item.from + item.to + (item.promotion || "") === learned)
    || legal[Math.floor(Math.random() * legal.length)];
  game.move({ from:move.from, to:move.to, promotion:move.promotion });
  whiteMoves++;
  qPanel.hidden = true;
  selected = null;
  checkAfterWhiteMove();
  render();
}

function onSquareClick(square) {
  if (gameOver || game.turn() !== "b") return;
  const piece = game.get(square);
  const legal = game.moves({ verbose:true });
  if (!selected) {
    if (piece?.color === "b" && piece.type === "k") { selected = square; render(); }
    return;
  }
  const move = legal.find(item => item.from === selected && item.to === square);
  if (move) {
    game.move({ from:move.from, to:move.to });
    selected = null;
    checkAfterBlackMove();
  } else if (piece?.color === "b" && piece.type === "k") selected = square;
  else selected = null;
  render();
}

async function showQ() {
  if (!isWhiteTurn()) { setStatus("Q 分數只在輪到白方時顯示，因為它評估白方的下一步。"); return; }
  const state = currentState();
  // 只有按下此按鈕才抓取 q/{白王位置}.json，平時不下載 20 MB 的資料。
  if (qWhiteKing !== state.wk) {
    setStatus("正在下載這個白王位置的 Q 值…");
    try {
      qTable = await fetch(`q/${state.wk}.json`).then(response => {
        if (!response.ok) throw new Error("找不到 Q 檔案");
        return response.json();
      });
      qWhiteKing = state.wk;
    } catch (error) { setStatus("Q 值檔案載入失敗，仍可正常下棋。"); return; }
  }
  const actions = qTable[`${state.wr},${state.bk}`] || {};
  const legal = game.moves({ verbose:true });
  const scored = legal.map(move => ({ move, score:actions[move.from + move.to + (move.promotion || "")] ?? 0 }));
  showHeatmap(scored);
  scoreList.replaceChildren(...scored.sort((a,b) => b.score - a.score).map(({move,score}) => {
    const item = document.createElement("li");
    item.textContent = `${move.from}${move.to}：${score}`;
    return item;
  }));
  qPanel.hidden = false;
  setStatus("熱力圖已顯示：紅色代表在這個局面中 Q 值較高。");
}

function showHeatmap(scored) {
  const values = scored.map(item => item.score);
  const min = Math.min(...values), max = Math.max(...values);
  for (const item of scored) {
    const cell = boardEl.querySelector(`[data-square="${item.move.to}"]`);
    const amount = max === min ? .5 : (item.score - min) / (max - min);
    // 藍（低分）到紅（高分），顯示每個走法的目的地分數。
    cell.style.setProperty("--heat", `hsl(${220 - amount * 220} 70% 52%)`);
    cell.classList.add("heat");
  }
}

function render() {
  boardEl.replaceChildren();
  const legalTargets = selected ? new Set(game.moves({ verbose:true }).filter(m => m.from === selected).map(m => m.to)) : new Set();
  for (let rank = 8; rank >= 1; rank--) for (let file = 0; file < 8; file++) {
    const square = `${files[file]}${rank}`;
    const piece = game.get(square);
    const cell = document.createElement("button");
    cell.className = `square ${(file + rank) % 2 ? "light" : "dark"}`;
    cell.dataset.square = square;
    cell.style.setProperty("--base", (file + rank) % 2 ? "var(--light)" : "var(--dark)");
    if (square === selected) cell.classList.add("selected");
    if (legalTargets.has(square)) cell.classList.add("target");
    if (piece?.color === "b" && game.turn() === "b") cell.classList.add("selectable");
    if (piece) { const span = document.createElement("span"); span.className = `piece ${piece.color === "w" ? "white" : "black"}`; span.textContent = glyph[`${piece.color}${piece.type}`]; cell.append(span); }
    if (file === 0) { const rankLabel=document.createElement("span"); rankLabel.className="coord rank"; rankLabel.textContent=rank; cell.append(rankLabel); }
    if (rank === 1) { const fileLabel=document.createElement("span"); fileLabel.className="coord file"; fileLabel.textContent=files[file]; cell.append(fileLabel); }
    cell.addEventListener("click", () => onSquareClick(square));
    boardEl.append(cell);
  }
  countEl.textContent = `白方已走 ${whiteMoves} / 50 步`;
  aiButton.disabled = !isWhiteTurn();
}

function newGame() { game = makeRandomGame(); whiteMoves = 0; gameOver = false; selected = null; qPanel.hidden = true; setStatus("輪到白方 AI。可先查看 Q 分數，或直接讓 AI 走一步。"); render(); }

aiButton.addEventListener("click", aiMove);
qButton.addEventListener("click", showQ);
newButton.addEventListener("click", newGame);

// 策略太大，分成五個仍是相同格式的 JSON 檔；進網頁時合併一次。
// Q 表則完全按需載入，避免第一次開網頁就下載全部 Q 值。
try {
  const parts = await Promise.all(["best_policy.json", "best_policy_1.json", "best_policy_2.json", "best_policy_3.json", "best_policy_4.json"]
    .map(file => fetch(file).then(response => {
      if (!response.ok) throw new Error("找不到策略檔");
      return response.json();
    })));
  policy = Object.assign({}, ...parts);
  newGame();
}
catch { setStatus("策略表載入失敗。請確認 best_policy.json 在 docs 資料夾。 "); }
