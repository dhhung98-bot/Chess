import { Chess } from './chess.mjs';
import { apiBase } from './config.mjs';
import { krkFen, bestMove, DRAW, nextPuzzle } from './krk.mjs';
import { banks } from './positions.mjs';
import { Board } from './board.mjs';

const el = id => document.getElementById(id);
const setText = (id, text) => { el(id).textContent = text; };
const setHidden = (id, hidden) => { el(id).hidden = hidden; };
const setDisabled = (id, disabled) => { el(id).disabled = disabled; };
const labels = {
  coach: ['AI 練習', '用白王和白車將死黑王。需要幫忙時，請 AI 提示下一步。'],
  online: ['線上對戰', '邀請好友下完整的西洋棋，雙方在各自的裝置上走棋。'],
  speed: ['3 分鐘速通', '在時間結束前盡量多次將死黑王，分數會自動加入排行榜。'],
  leaderboard: ['排行榜', '依將死次數排名。同分時，以最後一次將死較快的玩家優先。'],
};
const roomCode = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
const turnName = color => color === 'w' ? '白方' : '黑方';
const speedPreview = new Chess(krkFen(banks[1][0]));
const onlinePreview = new Chess();
const coach = { game: new Chess(nextPuzzle(banks, 7)), message: '輪到你走棋。', busy: false, hint: null, lastMove: null };
const room = { session: stored('room'), state: null, game: null, busy: false, syncing: false, poll: null,
  error: '', failures: 0, lobby: '建立房間並分享邀請，或輸入好友的房間代碼。' };
const run = { session: stored('run'), state: null, game: null, busy: false, deadline: 0, lastMove: null,
  message: '將死一次得 1 分，接著挑戰下一個局面。' };
const invitation = new URLSearchParams(location.search).get('room')?.toUpperCase();
const board = new Board(el('board'), chooseSquare);
let tableRequest;
let mode;
let selected = null;
let leaderboardRequest = 0;

function stored(key) {
  try { return JSON.parse(sessionStorage.getItem(`chess:${key}`)); }
  catch { return null; }
}
function remember(key, session) {
  try {
    if (session) sessionStorage.setItem(`chess:${key}`, JSON.stringify(session));
    else sessionStorage.removeItem(`chess:${key}`);
  } catch { /* The current tab can still play without storage. */ }
}

async function api(path, { method = 'GET', body, token, cache } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${apiBase}/api${path}`, {
      method, headers, cache, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new Error('暫時無法連線，請稍後再試。'); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const error = new Error(result?.message || '服務暫時無法使用，請稍後再試。');
    error.status = response.status;
    throw error;
  }
  return result;
}

function table() {
  tableRequest ??= fetch('./krk-table.bin').then(async response => {
    if (!response.ok) throw new Error();
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== 2 * 64 ** 3) throw new Error();
    return bytes;
  }).catch(error => { tableRequest = null; throw error; });
  return tableRequest;
}

function currentBoard() {
  if (mode === 'online') {
    const { state, game, busy } = room;
    const overlay = !state ? '建立或加入房間後開始' : !state.ready ? '等待好友加入' : '';
    return { game: game || onlinePreview, color: state?.color || 'w', lastMove: state?.lastMove,
      playable: !!state?.ready && !state.outcome && !busy && game.turn() === state.color,
      overlay, context: '西洋棋 · 雙人', ended: !!state?.outcome, seated: !!state };
  }
  if (mode === 'speed') {
    return { game: run.game || speedPreview, color: 'w', lastMove: run.lastMove,
      playable: !!run.state && !run.state.ended && !run.busy && performance.now() < run.deadline,
      overlay: !run.state ? '開始計時後開局' : run.state.ended ? '時間到' : '',
      context: '王車對單王 · 速通', ended: !!run.state?.ended, seated: !!run.state };
  }
  return { ...coach, hint: coach.hint?.move, playable: !coach.game.isGameOver() && !coach.busy && coach.game.turn() === 'w',
    color: 'w', context: '王車對單王', ended: coach.game.isGameOver(), seated: true };
}

function render() {
  if (mode === 'leaderboard') return;
  const view = currentBoard();
  board.render({ ...view, selected: view.playable ? selected : null });
  setText('board-side', view.seated ? `${view.color === 'w' ? '♔' : '♚'}　你執${turnName(view.color)}` : '♔　棋盤預覽');
  setText('board-state', view.ended ? '棋局結束' : view.overlay ? '等待開始' : `${turnName(view.game.turn())}回合${view.game.isCheck() ? ' · 將軍' : ''}`);
  setText('board-context', view.context);
  setText('board-last-move', view.lastMove ? `上一步 ${view.lastMove.san}` : '');
  setHidden('board-overlay', !view.overlay);
  setText('overlay-text', view.overlay || '');
  if (mode === 'coach') renderCoach(view);
  if (mode === 'online') renderRoom();
  if (mode === 'speed') renderRun();
}

async function chooseSquare(square) {
  if (mode === 'leaderboard') return;
  const { game, color, playable } = currentBoard();
  if (!playable) return;
  const piece = game.get(square);
  if (!selected || piece?.color === color) {
    selected = square === selected || piece?.color !== color ? null : square;
    render();
    return;
  }
  const moves = game.moves({ square: selected, verbose: true }).filter(move => move.to === square);
  if (!moves.length) {
    selected = null;
    render();
    return;
  }
  const activeMode = mode;
  const move = moves.length === 1 ? moves[0] : await promotion(moves);
  if (!move || mode !== activeMode || currentBoard().game !== game || !currentBoard().playable) return;
  selected = null;
  const payload = { from: move.from, to: move.to, promotion: move.promotion };
  if (mode === 'coach') await coachMove(payload);
  if (mode === 'online') await sendRoomAction('move', payload);
  if (mode === 'speed') await sendRunAction('move', payload);
}

function promotion(moves) {
  const dialog = el('promotion-dialog');
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => {
    resolve(moves.find(move => move.promotion === dialog.returnValue));
  }, { once: true }));
}

function renderCoach(view) {
  setText('coach-status', coach.message);
  setDisabled('hint', !view.playable);
  setHidden('hint-card', !coach.hint);
  if (!coach.hint) return;
  const { move, distance } = coach.hint;
  setText('hint-move', `${move.from} → ${move.to}`);
  setText('hint-detail', distance === DRAW ? '這個局面無法強制將死。這一步可以繼續練習。'
    : distance === 0 ? '這一步可立即將死。' : `照最佳走法，白方還需 ${Math.ceil((distance + 1) / 2)} 步將死。`);
}

async function showHint() {
  if (!currentBoard().playable) return;
  const game = coach.game;
  const fen = game.fen();
  try {
    const distances = await table();
    if (mode !== 'coach' || coach.game !== game || game.fen() !== fen) return;
    coach.hint = bestMove(game, distances);
  } catch { coach.message = '暫時無法載入提示，請再試一次。'; }
  render();
}

function newPractice() {
  const distances = [5, 7, 9, 11, 13, 15, 17];
  const difficulty = distances[Math.floor(Math.random() * distances.length)];
  coach.game = new Chess(nextPuzzle(banks, difficulty, coach.game.fen()));
  Object.assign(coach, { message: '輪到你走棋。', hint: null, lastMove: null, busy: false });
  selected = null;
  render();
}

async function coachMove(payload) {
  const game = coach.game;
  coach.hint = null;
  coach.busy = true;
  const move = game.move(payload);
  coach.lastMove = move;
  coach.message = game.isCheckmate() ? '將死了！你贏了這一局。' : game.isGameOver() ? '和棋。可以換一個局面再練習。' : '黑王正在走棋…';
  render();
  if (!game.isGameOver()) {
    const [distances] = await Promise.all([table().catch(() => null), new Promise(resolve => setTimeout(resolve, 220))]);
    if (game !== coach.game) return;
    const reply = distances ? bestMove(game, distances).move : game.moves({ verbose: true })[0];
    coach.lastMove = game.move({ from: reply.from, to: reply.to });
    coach.message = game.isGameOver() ? '和棋。可以換一個局面再練習。' : `黑王走了 ${reply.san}。輪到你。`;
  }
  coach.busy = false;
  if (mode === 'coach') render();
}

const outcomes = { white_wins: '將死，白方獲勝。', black_wins: '將死，黑方獲勝。', stalemate: '逼和。',
  insufficient: '棋子不足，和棋。', repetition: '三次重複局面，和棋。', fifty_moves: '五十步規則，和棋。',
  white_resigns: '白方認輸，黑方獲勝。', black_resigns: '黑方認輸，白方獲勝。' };

function renderRoom() {
  const state = room.state;
  setHidden('lobby', !!state);
  setHidden('active-room', !state);
  setText('lobby-status', !state && room.busy ? '正在連線…' : room.lobby);
  setDisabled('create-room', room.busy || room.syncing);
  el('join-room').querySelector('button').disabled = room.busy || room.syncing;
  if (!state) return;
  setText('active-code', state.code);
  setText('room-status', room.error || (state.outcome ? outcomes[state.outcome] : !state.ready
    ? '等待好友加入。把邀請連結傳給對方。' : room.game.turn() === state.color ? '輪到你走棋。' : '等待對手走棋。'));
  setHidden('resign', !state.ready || !!state.outcome);
  setDisabled('resign', room.busy);
  setDisabled('leave-room', room.busy);
}

function receiveRoom(state) {
  if (room.state && state.version < room.state.version) return;
  if (!room.state || state.version !== room.state.version) {
    room.game = new Chess(state.fen);
    if (mode === 'online') selected = null;
  }
  room.state = state;
  room.error = '';
  room.failures = 0;
}

function schedulePoll() {
  clearTimeout(room.poll);
  if (mode !== 'online' || !room.session || document.hidden || room.state?.outcome) return;
  const interval = room.state?.ready && room.game.turn() === room.state.color ? 12_000 : 4_000;
  room.poll = setTimeout(syncRoom, room.failures ? Math.min(30_000, interval * 2 ** room.failures) : interval);
}

async function syncRoom() {
  const session = room.session;
  if (!session || room.busy || room.syncing) return;
  room.syncing = true;
  try {
    const state = await api(`/rooms/${session.code}`, { token: session.token });
    if (session === room.session) receiveRoom(state);
  } catch (error) {
    if (session !== room.session) return;
    if (error.status === 404 || error.status === 401) clearRoom(error.message);
    else {
      room.error = error.message;
      if (!room.state) room.lobby = error.message;
      room.failures++;
    }
  } finally {
    room.syncing = false;
    if (mode === 'online') render();
    schedulePoll();
  }
}

function clearRoom(message = '已離開房間。你可以建立或加入另一個房間。') {
  Object.assign(room, { session: null, state: null, game: null, error: '', failures: 0, lobby: message });
  remember('room', null);
  const url = new URL(location.href);
  if (url.searchParams.has('room')) {
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }
  selected = null;
}

async function enterRoom(path) {
  if (room.busy || room.syncing) return;
  room.busy = true;
  render();
  try {
    const { token, ...state } = await api(path, { method: 'POST' });
    room.state = null;
    room.session = { code: state.code, token };
    remember('room', room.session);
    receiveRoom(state);
  } catch (error) { room.lobby = error.message; }
  finally {
    room.busy = false;
    if (mode === 'online') render();
    schedulePoll();
  }
}

async function sendRoomAction(action, body = {}) {
  if (room.busy || !room.state || room.state.outcome) return;
  const { code, token } = room.session;
  room.busy = true;
  render();
  let conflict = false;
  try {
    receiveRoom(await api(`/rooms/${code}/${action}`, {
      method: 'POST', body: { ...body, version: room.state.version }, token,
    }));
  } catch (error) {
    if (error.status === 404 || error.status === 401) clearRoom(error.message);
    else { room.error = error.message; conflict = error.status === 409; }
  } finally {
    room.busy = false;
    if (mode === 'online') render();
    if (conflict) await syncRoom();
    else schedulePoll();
  }
}

async function shareRoom() {
  if (!room.state) return;
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('room', room.state.code);
  url.hash = 'online';
  try {
    await navigator.clipboard.writeText(url.href);
    setText('room-status', '邀請連結已複製。');
  } catch { setText('room-status', `請與好友分享房間代碼 ${room.state.code}。`); }
}

function clockText(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function renderRun() {
  const { state, busy } = run;
  const ended = !!state?.ended;
  setText('speed-status', busy && !state ? '正在開始計時…' : run.message);
  setText('score', state?.score ?? 0);
  const seconds = state ? (ended ? 0 : Math.ceil((run.deadline - performance.now()) / 1000)) : 180;
  paintTimer(seconds);
  setHidden('start-run', !!state);
  el('start-run').querySelector('button').disabled = busy;
  setHidden('speed-actions', !state);
  setHidden('skip', ended);
  setDisabled('skip', busy);
  setHidden('restart-run', !ended);
  setDisabled('restart-run', busy);
  setHidden('show-scores', !ended);
}

function paintTimer(seconds) {
  const text = clockText(seconds);
  if (el('timer').textContent !== text) setText('timer', text);
  el('timer').classList.toggle('urgent', seconds <= 20);
}

function tick() {
  if (mode !== 'speed' || !run.state || run.state.ended) return;
  const remaining = run.deadline - performance.now();
  if (remaining > 0) { paintTimer(Math.ceil(remaining / 1000)); return; }
  run.state.ended = true;
  run.message = finishedMessage(run.state.score);
  selected = null;
  render();
  if (!run.busy) restoreRun();
}

function finishedMessage(score) {
  return score ? `時間到！你完成了 ${score} 次將死，分數已進入排行榜。` : '時間到！這次沒有得分，可以再挑戰一次。';
}

function receiveRun(state, sent) {
  if (run.state && state.version < run.state.version) return;
  run.deadline = performance.now() + Math.max(0, state.deadline - state.serverNow - (performance.now() - sent) / 2);
  run.state = state;
  run.game = new Chess(state.fen);
  run.lastMove = state.lastMove || null;
  if (mode === 'speed') selected = null;
  if (state.ended) run.message = finishedMessage(state.score);
  else if (state.event === 'mate') run.message = '將死成功，得 1 分！繼續下一題。';
  else if (state.event === 'draw') run.message = '這一局和棋。已換到下一個局面。';
  else if (state.event === 'skip') run.message = '已跳過，繼續下一個局面。';
  else run.message = '輪到你。盡快將死黑王。';
}

async function startRun(name) {
  if (run.busy) return;
  run.busy = true;
  render();
  try {
    const sent = performance.now();
    const { token, ...state } = await api('/runs', { method: 'POST', body: { name } });
    run.session = { id: state.id, token };
    run.state = null;
    remember('run', run.session);
    receiveRun(state, sent);
  } catch (error) { run.message = error.message; }
  finally { run.busy = false; if (mode === 'speed') render(); }
}

async function restoreRun() {
  if (!run.session || run.busy) return;
  const { id, token } = run.session;
  const sent = performance.now();
  run.busy = true;
  try { receiveRun(await api(`/runs/${id}`, { token }), sent); }
  catch (error) {
    if (error.status === 404 || error.status === 401) resetRun();
    if (!run.state?.ended) run.message = error.message;
  } finally { run.busy = false; if (mode === 'speed') render(); }
}

async function sendRunAction(action, body = {}) {
  if (run.busy || !run.state || run.state.ended || performance.now() >= run.deadline) return;
  const { id, token } = run.session;
  const sent = performance.now();
  run.busy = true;
  render();
  let conflict = false;
  try {
    receiveRun(await api(`/runs/${id}/${action}`, { method: 'POST', token,
      body: { ...body, version: run.state.version } }), sent);
  } catch (error) {
    if (error.status === 404 || error.status === 401) resetRun();
    run.message = error.message;
    conflict = error.status === 409;
  } finally {
    run.busy = false;
    if (mode === 'speed') render();
    if (conflict) await restoreRun();
  }
}

function resetRun() {
  Object.assign(run, { session: null, state: null, game: null, lastMove: null,
    message: '將死一次得 1 分，接著挑戰下一個局面。' });
  remember('run', null);
  selected = null;
}

async function loadLeaderboard(force = false) {
  const request = ++leaderboardRequest;
  setText('ranking-status', '載入中…');
  setDisabled('refresh-scores', true);
  try {
    const { scores } = await api('/leaderboard', { cache: force ? 'reload' : 'default' });
    if (request !== leaderboardRequest) return;
    const rows = scores.map(({ name, score, elapsedMs }, index) => {
      const row = document.createElement('tr');
      for (const text of [index + 1, name, score, `${(elapsedMs / 1000).toFixed(1)} 秒`]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      return row;
    });
    el('score-rows').replaceChildren(...rows);
    setHidden('scores-table', !rows.length);
    setText('ranking-status', rows.length ? '' : '目前還沒有成績。完成一輪速通即可上榜。');
  } catch (error) {
    if (request === leaderboardRequest) setText('ranking-status', error.message);
  } finally { if (request === leaderboardRequest) setDisabled('refresh-scores', false); }
}

function showMode() {
  const requested = location.hash.slice(1);
  const next = Object.hasOwn(labels, requested) ? requested : invitation && roomCode.test(invitation) ? 'online' : 'coach';
  if (mode === next) return;
  mode = next;
  selected = null;
  if (el('promotion-dialog').open) el('promotion-dialog').close('cancel');
  for (const link of document.querySelectorAll('[data-mode]')) {
    if (link.dataset.mode === mode) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== mode;
  setText('page-title', labels[mode][0]);
  setText('page-description', labels[mode][1]);
  setHidden('game-layout', mode === 'leaderboard');
  setHidden('leaderboard-panel', mode !== 'leaderboard');
  if (mode === 'leaderboard') loadLeaderboard();
  if (mode === 'online') syncRoom();
  if (mode === 'speed' && run.session) restoreRun();
  schedulePoll();
  render();
  tick();
}

el('hint').addEventListener('click', showHint);
el('new-practice').addEventListener('click', newPractice);
el('create-room').addEventListener('click', () => enterRoom('/rooms'));
el('join-room').addEventListener('submit', event => {
  event.preventDefault();
  const code = el('room-code').value.trim().toUpperCase();
  if (!roomCode.test(code)) { room.lobby = '請輸入有效的 8 位房間代碼。'; render(); return; }
  enterRoom(`/rooms/${code}/join`);
});
el('share-room').addEventListener('click', shareRoom);
el('resign').addEventListener('click', () => {
  if (window.confirm('確定要認輸嗎？')) sendRoomAction('resign');
});
el('leave-room').addEventListener('click', () => {
  if (room.state?.ready && !room.state.outcome && !window.confirm('離開後，這個分頁無法返回同一席位。確定要離開？')) return;
  clearRoom();
  schedulePoll();
  render();
});
el('start-run').addEventListener('submit', event => { event.preventDefault(); startRun(el('player-name').value); });
el('skip').addEventListener('click', () => sendRunAction('skip'));
el('restart-run').addEventListener('click', () => { resetRun(); render(); el('player-name').focus(); });
el('refresh-scores').addEventListener('click', () => loadLeaderboard(true));
window.addEventListener('hashchange', showMode);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && mode === 'online') syncRoom();
  schedulePoll();
  tick();
});
if (invitation && roomCode.test(invitation)) {
  el('room-code').value = invitation;
  if (room.session?.code !== invitation) room.session = null;
}
showMode();
setInterval(tick, 200);
