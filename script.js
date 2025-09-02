"use strict";

/* ====== DOM ====== */
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const historyList = document.getElementById("historyList");
const modeEl = document.getElementById("mode");
const sizeEl = document.getElementById("boardSize");
const winLenEl = document.getElementById("winLen");
const diffEl = document.getElementById("difficulty");
const firstEl = document.getElementById("first");
const markEl = document.getElementById("yourMark");
const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undoBtn");
const resetScoreBtn = document.getElementById("resetScore");
const leftLabel = document.getElementById("leftLabel");
const rightLabel = document.getElementById("rightLabel");
const scoreLeftEl = document.getElementById("scoreLeft");
const scoreDrawEl = document.getElementById("scoreDraw");
const scoreRightEl = document.getElementById("scoreRight");
const themeToggleBtn = document.getElementById("themeToggle");
const soundToggle = document.getElementById("soundToggle");
const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalSubtitle = document.getElementById("modalSubtitle");
const closeModalBtn = document.getElementById("closeModal");
const playAgainBtn = document.getElementById("playAgain");

const connectOnlineBtn = document.getElementById("connectOnline");
const disconnectOnlineBtn = document.getElementById("disconnectOnline");

const onlineOverlay = document.getElementById("onlineOverlay");
const closeOnlineBtn = document.getElementById("closeOnline");
const tabHostBtn = document.getElementById("tabHost");
const tabJoinBtn = document.getElementById("tabJoin");
const hostView = document.getElementById("hostView");
const joinView = document.getElementById("joinView");
const makeOfferBtn = document.getElementById("makeOffer");
const copyOfferBtn = document.getElementById("copyOffer");
const offerOut = document.getElementById("offerOut");
const connectWithAnswerBtn = document.getElementById("connectWithAnswer");
const answerIn = document.getElementById("answerIn");
const setOfferBtn = document.getElementById("setOffer");
const offerIn = document.getElementById("offerIn");
const makeAnswerBtn = document.getElementById("makeAnswer");
const copyAnswerBtn = document.getElementById("copyAnswer");
const answerOut = document.getElementById("answerOut");
const onlineStatus = document.getElementById("onlineStatus");

const exportBtn = document.getElementById("exportGame");
const importBtn = document.getElementById("importReplay");
const openReplayBtn = document.getElementById("openReplay");
const fileInput = document.getElementById("fileInput");
const replayOverlay = document.getElementById("replayOverlay");
const closeReplayBtn = document.getElementById("closeReplay");
const replayMeta = document.getElementById("replayMeta");
const stepBackBtn = document.getElementById("stepBack");
const stepForwardBtn = document.getElementById("stepForward");
const restartReplayBtn = document.getElementById("restartReplay");

/* ====== State ====== */
let N = 3;
let WIN_LEN = 3;
let WIN_LINES = [];

let board = Array(9).fill(null);
let moveHistory = []; // { moveNo, index, mark }
let winnerLine = null;
let gameOver = false;

let mode = "ai";    // 'ai' | 'pvp' | 'online'
let HUMAN_MARK = "X";
let AI_MARK = "O";
let myMark = "X";   // for online
let turnMark = "X"; // 'X' | 'O'
let altNextMark = "X"; // for alternate starts (by mark)

let score = { left: 0, draw: 0, right: 0 };

let cells = [];
let isReplaying = false;
let replayData = null; // { N, WIN_LEN, moves: [{index, mark}], note }

/* ====== Online (WebRTC) ====== */
const online = {
  role: null,            // 'host' | 'join'
  pc: null,
  dc: null,
  connected: false
};

/* ====== Persistence ====== */
const LS = {
  theme: "ttt-theme",
  sounds: "ttt-sounds",
  diff: "ttt-difficulty",
  first: "ttt-first",
  mark: "ttt-mark",
  mode: "ttt-mode",
  size: "ttt-size",
  win: "ttt-winlen"
};

/* ====== Audio (Web Audio) ====== */
let audioCtx = null;
let soundEnabled = true;

function ensureAudio() {
  if (!soundEnabled) return null;
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function beep(freq = 440, duration = 100, type = "sine", volume = 0.04) {
  if (!soundEnabled) return;
  const ctx = ensureAudio(); if (!ctx) return;
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = type; osc.frequency.value = freq; gain.gain.value = volume;
  osc.connect(gain).connect(ctx.destination);
  const now = ctx.currentTime; osc.start(now); osc.stop(now + duration / 1000);
}
function chord(freqs = [440, 660, 880], duration = 180, volume = 0.03) {
  if (!soundEnabled) return;
  const ctx = ensureAudio(); if (!ctx) return;
  const gain = ctx.createGain(); gain.gain.value = volume; gain.connect(ctx.destination);
  const now = ctx.currentTime;
  for (const f of freqs) {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
    o.connect(gain); o.start(now); o.stop(now + duration / 1000);
  }
}

/* ====== Utils ====== */
function setStatus(msg){ statusEl.textContent = msg; }

function clampWinLenOptions(){
  const size = Number(sizeEl.value);
  // Win length between 3 and min(size, 5) for playability
  const maxWin = Math.min(size, 5);
  winLenEl.innerHTML = "";
  for (let k = 3; k <= maxWin; k++){
    const opt = document.createElement("option");
    opt.value = String(k);
    opt.textContent = String(k);
    winLenEl.appendChild(opt);
  }
  // default per size
  let def = (size === 3) ? 3 : 4;
  if (def > maxWin) def = maxWin;
  winLenEl.value = String(def);
}

function buildLines(n, winLen){
  const lines = [];
  // rows
  for (let r=0; r<n; r++){
    for (let c=0; c<=n-winLen; c++){
      const line = []; for (let k=0; k<winLen; k++) line.push(r*n + (c+k));
      lines.push(line);
    }
  }
  // cols
  for (let c=0; c<n; c++){
    for (let r=0; r<=n-winLen; r++){
      const line = []; for (let k=0; k<winLen; k++) line.push((r+k)*n + c);
      lines.push(line);
    }
  }
  // diag down-right
  for (let r=0; r<=n-winLen; r++){
    for (let c=0; c<=n-winLen; c++){
      const line = []; for (let k=0; k<winLen; k++) line.push((r+k)*n + (c+k));
      lines.push(line);
    }
  }
  // diag down-left
  for (let r=0; r<=n-winLen; r++){
    for (let c=winLen-1; c<n; c++){
      const line = []; for (let k=0; k<winLen; k++) line.push((r+k)*n + (c-k));
      lines.push(line);
    }
  }
  return lines;
}

function availableMoves(b){
  const res = [];
  for (let i=0; i<b.length; i++) if (b[i] === null) res.push(i);
  return res;
}
function checkWinner(b){
  for (const line of WIN_LINES){
    const m = b[line[0]];
    if (!m) continue;
    let ok = true;
    for (let i=1; i<line.length; i++){
      if (b[line[i]] !== m){ ok = false; break; }
    }
    if (ok) return { winner: m, line: [...line] };
  }
  return null;
}
function isDraw(b){ return availableMoves(b).length === 0; }
function otherMark(m){ return m === "X" ? "O" : "X"; }

/* ====== UI Build/Render ====== */
function buildBoard(){
  boardEl.innerHTML = "";
  boardEl.style.setProperty("--n", String(N));
  cells = [];
  for (let i=0; i<N*N; i++){
    const btn = document.createElement("button");
    btn.className = "cell";
    btn.dataset.index = String(i);
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", `Cell ${i+1} empty`);
    btn.addEventListener("click", onCellClick);
    cells.push(btn);
    boardEl.appendChild(btn);
  }
}

function render(){
  cells.forEach((btn, i) => {
    const mark = board[i];
    btn.textContent = mark ?? "";
    btn.classList.toggle("mark-x", mark === "X");
    btn.classList.toggle("mark-o", mark === "O");
    const isWin = winnerLine ? winnerLine.includes(i) : false;
    btn.classList.toggle("win", isWin);
    btn.setAttribute("aria-label", `Cell ${i+1} ${mark ?? "empty"}`);

    const itsAiTurn = (mode === "ai" && turnMark === AI_MARK);
    const itsOnlineOppTurn = (mode === "online" && online.connected && turnMark !== myMark);
    const disabled = !!mark || gameOver || itsAiTurn || itsOnlineOppTurn || isReplaying || (mode === "online" && !online.connected);
    btn.disabled = disabled;
  });
  updateLabels();
  updateScore();
  updateHistory();
  undoBtn.disabled = moveHistory.length === 0 || isReplaying || (mode === "online" && !online.connected);
  openReplayBtn.disabled = moveHistory.length === 0;
}

function updateLabels(){
  if (mode === "ai"){
    leftLabel.firstChild.textContent = `You (${HUMAN_MARK}): `;
    rightLabel.firstChild.textContent = `Computer (${AI_MARK}): `;
  } else if (mode === "pvp"){
    leftLabel.firstChild.textContent = `Player 1 (X): `;
    rightLabel.firstChild.textContent = `Player 2 (O): `;
  } else {
    const who = online.connected ? `You (${myMark})` : "You";
    const opp = online.connected ? `Opponent (${otherMark(myMark)})` : "Opponent";
    leftLabel.firstChild.textContent = `${who}: `;
    rightLabel.firstChild.textContent = `${opp}: `;
  }
}

function updateScore(){
  scoreLeftEl.textContent = String(score.left);
  scoreDrawEl.textContent = String(score.draw);
  scoreRightEl.textContent = String(score.right);
}

function updateHistory(){
  historyList.innerHTML = "";
  for (const step of moveHistory){
    const li = document.createElement("li");
    li.textContent = `${step.moveNo}. ${step.mark} → ${step.index + 1}`;
    historyList.appendChild(li);
  }
}

/* ====== Gameplay ====== */
function placeMove(i, mark){
  board[i] = mark;
  moveHistory.push({ moveNo: moveHistory.length + 1, index: i, mark });
  const cell = cells[i];
  if (cell){
    cell.classList.add("pop");
    setTimeout(() => cell.classList.remove("pop"), 140);
  }
  beep(mark === "X" ? 880 : 660, 80, "triangle", 0.03);
  render();
}

function evaluateEnd(openModal = true){
  const win = checkWinner(board);
  if (win){
    gameOver = true; winnerLine = win.line; render();
    const leftMark = (mode === "ai") ? HUMAN_MARK : "X";
    if (win.winner === leftMark) {
      score.left++;
      setStatus(mode === "ai" ? "You win! 🎉" : (mode === "online" ? "You win! 🎉" : "Player 1 wins! 🎉"));
      chord([880,1100,1320], 220, 0.03);
      navigator.vibrate?.(25);
      if (openModal) openResultModal("Win 🎉", `Line ${win.line.map(i => i+1).join("-")}`);
    } else {
      score.right++;
      setStatus(mode === "ai" ? "Computer wins! 🤖" : (mode === "online" ? "Opponent wins! 🏆" : "Player 2 wins! 🏆"));
      chord([300,240,200], 240, 0.03);
      navigator.vibrate?.([15, 50, 15]);
      if (openModal) openResultModal("Defeat", `Line ${win.line.map(i => i+1).join("-")}`);
    }
    return true;
  }
  if (isDraw(board)){
    gameOver = true; render(); score.draw++;
    setStatus("It's a draw."); beep(420, 120, "sine", 0.03);
    if (openModal) openResultModal("Draw", "No more moves left.");
    return true;
  }
  return false;
}

function onCellClick(e){
  const i = Number(e.currentTarget.dataset.index);
  if (board[i] !== null || gameOver || isReplaying) return;

  if (mode === "ai"){
    if (turnMark !== HUMAN_MARK) return;
    placeMove(i, HUMAN_MARK);
    if (evaluateEnd()) return;
    turnMark = otherMark(turnMark);
    render();
    setStatus("Computer is thinking…");
    disableBoard(true);
    setTimeout(aiTurn, 300);
  } else if (mode === "pvp"){
    placeMove(i, turnMark);
    if (evaluateEnd()) return;
    turnMark = otherMark(turnMark);
    setStatus(`Player ${turnMark === "X" ? "1 (X)" : "2 (O)"} to move`);
  } else if (mode === "online"){
    if (!online.connected || turnMark !== myMark) return;
    placeMove(i, myMark);
    sendOnline({ type: "move", index: i });
    if (evaluateEnd()) return;
    turnMark = otherMark(turnMark);
    setStatus(`Opponent's turn…`);
  }

  render();
}

function disableBoard(disabled){
  cells.forEach(btn => { if (!btn.textContent) btn.disabled = disabled; });
}

/* ====== AI ====== */
function randomMove(b){
  const moves = availableMoves(b);
  return moves[Math.floor(Math.random() * moves.length)];
}
function centers(){
  const mid = Math.floor(N/2);
  if (N % 2 === 1) return [mid*N + mid];
  return [ (mid-1)*N + (mid-1), (mid-1)*N + mid, mid*N + (mid-1), mid*N + mid ];
}
function corners(){ return [0, N-1, (N-1)*N, N*N-1]; }
function sides(){
  const res = [];
  for (let i=0; i<N*N; i++){
    const r = Math.floor(i/N), c = i%N;
    const isEdge = (r===0 || r===N-1 || c===0 || c===N-1);
    const isCorner = (r===0&&c===0) || (r===0&&c===N-1) || (r===N-1&&c===0) || (r===N-1&&c===N-1);
    if (isEdge && !isCorner) res.push(i);
  }
  return res;
}
function winningMove(b, mark){
  for (const m of availableMoves(b)){
    b[m] = mark;
    const w = checkWinner(b);
    b[m] = null;
    if (w && w.winner === mark) return m;
  }
  return null;
}
function mediumMove(b){
  let m = winningMove(b, AI_MARK); if (m !== null) return m;
  m = winningMove(b, HUMAN_MARK); if (m !== null) return m;
  const cs = centers().filter(i => b[i] === null); if (cs.length) return cs[Math.floor(Math.random()*cs.length)];
  const cr = corners().filter(i => b[i] === null); if (cr.length) return cr[Math.floor(Math.random()*cr.length)];
  const sd = sides().filter(i => b[i] === null); if (sd.length) return sd[Math.floor(Math.random()*sd.length)];
  return randomMove(b);
}

// perfect for 3x3 with WIN_LEN 3
function minimax3(b, player, depth, alpha, beta){
  const win = checkWinner(b);
  if (win){
    if (win.winner === AI_MARK) return { score: 10 - depth };
    if (win.winner === HUMAN_MARK) return { score: depth - 10 };
  }
  if (isDraw(b)) return { score: 0 };

  const moves = availableMoves(b);
  let bestMove = moves[0];

  if (player === AI_MARK){
    let bestScore = -Infinity;
    for (const m of moves){
      b[m] = AI_MARK;
      const { score } = minimax3(b, HUMAN_MARK, depth+1, alpha, beta);
      b[m] = null;
      if (score > bestScore){ bestScore = score; bestMove = m; }
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  } else {
    let bestScore = Infinity;
    for (const m of moves){
      b[m] = HUMAN_MARK;
      const { score } = minimax3(b, AI_MARK, depth+1, alpha, beta);
      b[m] = null;
      if (score < bestScore){ bestScore = score; bestMove = m; }
      beta = Math.min(beta, bestScore);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  }
}

// heuristic for larger boards or WIN_LEN != 3
function evalBoard(b){
  let total = 0;
  for (const line of WIN_LINES){
    let a=0, h=0;
    for (const idx of line){
      if (b[idx] === AI_MARK) a++; else if (b[idx] === HUMAN_MARK) h++;
    }
    if (a>0 && h>0) continue;
    const count = a>0 ? a : h;
    if (count === 0) continue;
    const maxL = WIN_LEN;
    const weights = (maxL === 3) ? [0, 1, 10, 1000] : [0, 1, 6, 25, 5000];
    total += (a>0 ? +weights[count] : -weights[count]);
  }
  return total;
}
function orderedMoves(b){
  const avail = availableMoves(b);
  const cs = new Set(centers()), cr = new Set(corners()), sd = new Set(sides());
  return avail.sort((i,j) => {
    const pi = cs.has(i)?3:cr.has(i)?2:sd.has(i)?1:0;
    const pj = cs.has(j)?3:cr.has(j)?2:sd.has(j)?1:0;
    return pj - pi;
  });
}
function minimaxDL(b, player, depth, maxDepth, alpha, beta){
  const win = checkWinner(b);
  if (win){
    if (win.winner === AI_MARK) return { score: 100000 - depth };
    if (win.winner === HUMAN_MARK) return { score: depth - 100000 };
  }
  if (isDraw(b)) return { score: 0 };
  if (depth >= maxDepth) return { score: evalBoard(b) };

  const moves = orderedMoves(b);
  let bestMove = moves[0];

  if (player === AI_MARK){
    let bestScore = -Infinity;
    const winNow = winningMove(b, AI_MARK);
    if (winNow !== null) return { score: 99999 - depth, move: winNow };
    for (const m of moves){
      b[m] = AI_MARK;
      const { score } = minimaxDL(b, HUMAN_MARK, depth+1, maxDepth, alpha, beta);
      b[m] = null;
      if (score > bestScore){ bestScore = score; bestMove = m; }
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  } else {
    let bestScore = Infinity;
    for (const m of moves){
      b[m] = HUMAN_MARK;
      const { score } = minimaxDL(b, AI_MARK, depth+1, maxDepth, alpha, beta);
      b[m] = null;
      if (score < bestScore){ bestScore = score; bestMove = m; }
      beta = Math.min(beta, bestScore);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  }
}

function chooseAIMove(){
  const difficulty = diffEl.value;
  if (difficulty === "easy") return randomMove(board);
  if (difficulty === "medium") return mediumMove(board);
  if (N === 3 && WIN_LEN === 3){
    const { move } = minimax3(board.slice(), AI_MARK, 0, -Infinity, Infinity);
    return move ?? randomMove(board);
  } else {
    const maxDepth = (N <= 4) ? 4 : (N === 5 ? 3 : 2); // tuned for speed
    const { move } = minimaxDL(board.slice(), AI_MARK, 0, maxDepth, -Infinity, Infinity);
    return move ?? mediumMove(board);
  }
}

function aiTurn(){
  if (gameOver || mode !== "ai" || turnMark !== AI_MARK) return;
  const idx = chooseAIMove();
  placeMove(idx, AI_MARK);
  navigator.vibrate?.(10);
  if (evaluateEnd()) return;
  turnMark = otherMark(turnMark);
  setStatus(`Your turn — place ${HUMAN_MARK}`);
  disableBoard(false);
  render();
}

/* ====== Game lifecycle ====== */
function getStarterMark(){
  const v = firstEl.value;
  if (v === "X" || v === "p1" || v === "player") return "X";
  if (v === "O" || v === "p2" || v === "computer") return "O";
  if (v === "random") return Math.random() < 0.5 ? "X" : "O";
  // alternate
  const m = altNextMark; altNextMark = otherMark(altNextMark); return m;
}

function newGame(initByOnlineConfig=null){
  // If config provided by host in online mode
  if (initByOnlineConfig){
    N = initByOnlineConfig.N;
    WIN_LEN = initByOnlineConfig.WIN_LEN;
    sizeEl.value = String(N);
    clampWinLenOptions();
    winLenEl.value = String(WIN_LEN);
  } else {
    N = Number(sizeEl.value);
    clampWinLenOptions();
    WIN_LEN = Number(winLenEl.value);
  }
  WIN_LINES = buildLines(N, WIN_LEN);
  board = Array(N*N).fill(null);
  moveHistory = [];
  winnerLine = null;
  gameOver = false;

  HUMAN_MARK = markEl.value;
  AI_MARK = otherMark(HUMAN_MARK);

  buildBoard();
  render();

  if (mode === "ai"){
    const starter = getStarterMark(); // X or O
    turnMark = starter;
    const humanStarts = (starter === HUMAN_MARK);
    if (humanStarts){
      setStatus(`Your turn — place ${HUMAN_MARK}`);
      disableBoard(false);
    } else {
      setStatus("Computer is thinking…");
      disableBoard(true);
      setTimeout(aiTurn, 350);
    }
  } else if (mode === "pvp"){
    turnMark = getStarterMark();
    setStatus(`Player ${turnMark === "X" ? "1 (X)" : "2 (O)"} to move`);
    disableBoard(false);
  } else if (mode === "online"){
    const starter = initByOnlineConfig ? initByOnlineConfig.startMark : getStarterMark();
    turnMark = starter;
    // host sends config; guest receives config (handled in online connect)
    if (!online.connected){
      setStatus("Not connected — Connect Online to play.");
      disableBoard(true);
    } else {
      setStatus(turnMark === myMark ? `Your turn — place ${myMark}` : `Opponent's turn…`);
      disableBoard(turnMark !== myMark);
    }
  }
}

function resetScore(){ score = { left: 0, draw: 0, right: 0 }; updateScore(); }

/* ====== Undo ====== */
function undo(){
  if (moveHistory.length === 0) return;
  if (mode === "ai"){
    // paired undo until it's human's turn
    do { const last = moveHistory.pop(); board[last.index] = null; }
    while (moveHistory.length && (turnMark === HUMAN_MARK ? false : true) && (turnMark = otherMark(turnMark)));
    // recompute turn properly:
    turnMark = HUMAN_MARK;
    winnerLine = null; gameOver = false; render();
    setStatus(`Your turn — place ${HUMAN_MARK}`);
  } else if (mode === "pvp"){
    const last = moveHistory.pop(); if (last) board[last.index] = null;
    turnMark = last ? last.mark : "X";
    winnerLine = null; gameOver = false; render();
    setStatus(`Player ${turnMark === "X" ? "1 (X)" : "2 (O)"} to move`);
  } else if (mode === "online"){
    if (!online.connected) return;
    // Undo last single move on both sides
    const last = moveHistory.pop(); if (last) board[last.index] = null;
    turnMark = last ? last.mark : myMark;
    winnerLine = null; gameOver = false; render();
    setStatus(turnMark === myMark ? `Your turn — place ${myMark}` : `Opponent's turn…`);
    sendOnline({ type: "undo" });
  }
}

/* ====== Export / Import / Replay ====== */
function exportGame(){
  const data = {
    meta: { when: new Date().toISOString() },
    N, WIN_LEN,
    moves: moveHistory.map(m => ({ index: m.index, mark: m.mark }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tictactoe_${N}x${N}_win${WIN_LEN}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function readFileAsText(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsText(file);
  });
}

function openReplay(data){
  isReplaying = true;
  replayData = data;
  // Set board/config
  N = data.N; WIN_LEN = data.WIN_LEN; sizeEl.value = String(N); clampWinLenOptions(); winLenEl.value = String(WIN_LEN);
  WIN_LINES = buildLines(N, WIN_LEN);
  board = Array(N*N).fill(null);
  moveHistory = [];
  winnerLine = null; gameOver = false;
  buildBoard(); render();
  replayMeta.textContent = `${N}×${N} — win in ${WIN_LEN} — ${data.moves.length} moves`;
  replayOverlay.classList.add("open");
  replayOverlay.setAttribute("aria-hidden", "false");
  setStatus("Replay mode — controls in panel");
  disableBoard(true);
}

function closeReplay(){
  isReplaying = false; replayData = null;
  replayOverlay.classList.remove("open");
  replayOverlay.setAttribute("aria-hidden", "true");
  // Start a fresh game with current UI selections
  newGame();
}

function replayStepForward(){
  if (!replayData) return;
  const idx = moveHistory.length;
  if (idx >= replayData.moves.length) return;
  const move = replayData.moves[idx];
  placeMove(move.index, move.mark);
  // Do not evaluateEnd in replay to avoid modal; just highlight when over
  if (checkWinner(board)){
    winnerLine = checkWinner(board).line; render();
  }
}
function replayStepBack(){
  if (!replayData || moveHistory.length === 0) return;
  const last = moveHistory.pop(); board[last.index] = null; winnerLine = null; gameOver = false; render();
}

/* ====== Modal ====== */
function openResultModal(title, subtitle){
  modalTitle.textContent = title;
  modalSubtitle.textContent = subtitle || "";
  modalOverlay.classList.add("open");
  modalOverlay.setAttribute("aria-hidden", "false");
}
function closeResultModal(){
  modalOverlay.classList.remove("open");
  modalOverlay.setAttribute("aria-hidden", "true");
}

/* ====== Theme ====== */
function getSystemPrefersDark(){ return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
function applyTheme(theme){
  const html = document.documentElement;
  if (theme === "auto"){
    html.setAttribute("data-theme", getSystemPrefersDark() ? "dark" : "auto");
    themeToggleBtn.textContent = getSystemPrefersDark() ? "☀️" : "🌙";
    return;
  }
  html.setAttribute("data-theme", theme);
  themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}
function toggleTheme(){
  const current = localStorage.getItem(LS.theme) || "auto";
  let next;
  if (current === "auto"){ next = getSystemPrefersDark() ? "light" : "dark"; }
  else { next = current === "dark" ? "light" : "dark"; }
  localStorage.setItem(LS.theme, next); applyTheme(next);
}

/* ====== Persistence ====== */
function restorePrefs(){
  const theme = localStorage.getItem(LS.theme) || "auto"; applyTheme(theme);
  const snd = localStorage.getItem(LS.sounds); if (snd !== null){ soundEnabled = snd === "1"; soundToggle.checked = soundEnabled; }
  const m = localStorage.getItem(LS.mode); if (m) modeEl.value = m;
  const sz = localStorage.getItem(LS.size); if (sz) sizeEl.value = sz;
  clampWinLenOptions();
  const wl = localStorage.getItem(LS.win); if (wl && [...winLenEl.options].some(o=>o.value===wl)) winLenEl.value = wl;
  const df = localStorage.getItem(LS.diff); if (df) diffEl.value = df;
  const fs = localStorage.getItem(LS.first); if (fs) firstEl.value = fs;
  const mk = localStorage.getItem(LS.mark); if (mk) markEl.value = mk;
}
function savePrefs(){
  localStorage.setItem(LS.sounds, soundEnabled ? "1" : "0");
  localStorage.setItem(LS.mode, modeEl.value);
  localStorage.setItem(LS.size, sizeEl.value);
  localStorage.setItem(LS.win, winLenEl.value);
  localStorage.setItem(LS.diff, diffEl.value);
  localStorage.setItem(LS.first, firstEl.value);
  localStorage.setItem(LS.mark, markEl.value);
}

/* ====== Online (WebRTC) ====== */
function openOnlinePanel(){
  onlineOverlay.classList.add("open");
  onlineOverlay.setAttribute("aria-hidden", "false");
}
function closeOnlinePanel(){
  onlineOverlay.classList.remove("open");
  onlineOverlay.setAttribute("aria-hidden", "true");
}
function setTabs(hostActive){
  tabHostBtn.classList.toggle("active", hostActive);
  tabJoinBtn.classList.toggle("active", !hostActive);
  hostView.hidden = !hostActive;
  joinView.hidden = hostActive;
}
function setOnlineStatus(msg){ onlineStatus.textContent = msg; }

async function createPeer(role){
  online.role = role;
  online.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  online.pc.onicegatheringstatechange = () => {
    // Update textareas when complete
    if (online.pc.icegatheringstate === "complete"){
      if (role === "host" && online.pc.localDescription){
        offerOut.value = JSON.stringify(online.pc.localDescription);
        copyOfferBtn.disabled = false;
      } else if (role === "join" && online.pc.localDescription){
        answerOut.value = JSON.stringify(online.pc.localDescription);
        copyAnswerBtn.disabled = false;
      }
    }
  };
  online.pc.onconnectionstatechange = () => {
    if (online.pc.connectionState === "disconnected" || online.pc.connectionState === "failed" || online.pc.connectionState === "closed"){
      online.connected = false; disconnectOnlineBtn.disabled = true;
      setOnlineStatus("Disconnected");
      setStatus("Disconnected");
      render();
    }
  };
  if (role === "host"){
    online.dc = online.pc.createDataChannel("moves");
    wireDataChannel();
  } else {
    online.pc.ondatachannel = (e) => {
      online.dc = e.channel;
      wireDataChannel();
    };
  }
}
function wireDataChannel(){
  const dc = online.dc;
  dc.onopen = () => {
    online.connected = true;
    disconnectOnlineBtn.disabled = false;
    setOnlineStatus("Connected!");
    setStatus("Connected");
    closeOnlinePanel();
    // Assign marks: host = X, guest = O
    myMark = (online.role === "host") ? "X" : "O";
    // Host sends config to start
    if (online.role === "host"){
      const cfg = { N: Number(sizeEl.value), WIN_LEN: Number(winLenEl.value), startMark: getStarterMark() };
      sendOnline({ type: "config", config: cfg });
      mode = "online"; modeEl.value = "online"; savePrefs();
      newGame(cfg);
    } else {
      mode = "online"; modeEl.value = "online"; savePrefs();
      // Wait for config from host
      setStatus("Waiting for host to start…");
      disableBoard(true);
    }
    render();
  };
  dc.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleOnlineMessage(msg);
    } catch {}
  };
  dc.onclose = () => { online.connected = false; disconnectOnlineBtn.disabled = true; setOnlineStatus("Channel closed"); render(); };
}
function sendOnline(obj){
  if (online.connected && online.dc?.readyState === "open"){
    online.dc.send(JSON.stringify(obj));
  }
}
function handleOnlineMessage(msg){
  if (msg.type === "config"){
    const cfg = msg.config;
    newGame(cfg);
  } else if (msg.type === "move"){
    const idx = msg.index;
    const opp = otherMark(myMark);
    placeMove(idx, opp);
    if (evaluateEnd()) return;
    turnMark = otherMark(turnMark);
    setStatus(turnMark === myMark ? `Your turn — place ${myMark}` : `Opponent's turn…`);
    render();
  } else if (msg.type === "newGame"){
    newGame(msg.config);
  } else if (msg.type === "undo"){
    // undo one move
    const last = moveHistory.pop();
    if (last){ board[last.index] = null; winnerLine = null; gameOver = false; render(); }
  }
}

function disconnectOnline(){
  try { online.dc?.close(); } catch {}
  try { online.pc?.close(); } catch {}
  online.dc = null; online.pc = null; online.connected = false; disconnectOnlineBtn.disabled = true;
  setStatus("Disconnected"); setOnlineStatus("Not connected"); render();
}

/* ====== Event wiring ====== */
function onKeyNav(e){
  if (gameOver || isReplaying) return;
  const itsAiTurn = (mode === "ai" && turnMark === AI_MARK);
  const itsOnlineOppTurn = (mode === "online" && online.connected && turnMark !== myMark);
  if (itsAiTurn || itsOnlineOppTurn) return;

  const focusIndex = cells.findIndex(c => c === document.activeElement);
  if (focusIndex === -1) return;
  const map = { ArrowLeft: -1, ArrowRight: +1, ArrowUp: -N, ArrowDown: +N };
  if (map[e.key] !== undefined){
    e.preventDefault();
    const next = focusIndex + map[e.key];
    if (next < 0 || next >= N*N) return;
    cells[next].focus();
  } else if (e.key === "Enter" || e.key === " "){
    e.preventDefault(); document.activeElement.click();
  }
}
boardEl.addEventListener("keydown", onKeyNav);

newGameBtn.addEventListener("click", () => { beep(520, 70, "sine", 0.02); newGame(); });
undoBtn.addEventListener("click", () => { beep(380, 40, "sine", 0.02); undo(); });
resetScoreBtn.addEventListener("click", () => { resetScore(); beep(380, 60, "sine", 0.02); });

modeEl.addEventListener("change", () => { savePrefs(); resetScore(); newGame(); render(); });
sizeEl.addEventListener("change", () => { savePrefs(); newGame(); });
winLenEl.addEventListener("change", () => { savePrefs(); newGame(); });
diffEl.addEventListener("change", () => { savePrefs(); beep(520, 60, "sine", 0.02); });
firstEl.addEventListener("change", () => { savePrefs(); newGame(); });
markEl.addEventListener("change", () => { savePrefs(); newGame(); });

themeToggleBtn.addEventListener("click", () => { toggleTheme(); beep(700, 40, "sine", 0.02); });
soundToggle.addEventListener("change", () => {
  soundEnabled = soundToggle.checked; savePrefs();
  if (soundEnabled) beep(760, 60, "sine", 0.03);
});

playAgainBtn.addEventListener("click", () => { closeResultModal(); if (mode === "online" && online.connected && online.role === "host"){ const cfg = { N, WIN_LEN, startMark: getStarterMark() }; sendOnline({ type: "newGame", config: cfg }); newGame(cfg); } else { newGame(); } });
closeModalBtn.addEventListener("click", () => closeResultModal());
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeResultModal(); });

/* Online UI */
connectOnlineBtn.addEventListener("click", () => { openOnlinePanel(); setTabs(true); });
closeOnlineBtn.addEventListener("click", closeOnlinePanel);
tabHostBtn.addEventListener("click", () => setTabs(true));
tabJoinBtn.addEventListener("click", () => setTabs(false));

makeOfferBtn.addEventListener("click", async () => {
  await createPeer("host");
  setOnlineStatus("Gathering ICE…");
  const offer = await online.pc.createOffer();
  await online.pc.setLocalDescription(offer);
  // final SDP will populate after ice completes
  copyOfferBtn.disabled = false;
});
copyOfferBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(offerOut.value || "");
  setOnlineStatus("Offer copied!");
});
connectWithAnswerBtn.addEventListener("click", async () => {
  if (!answerIn.value.trim()) return;
  const desc = JSON.parse(answerIn.value.trim());
  await online.pc.setRemoteDescription(desc);
  setOnlineStatus("Connecting…");
});
answerIn.addEventListener("input", () => { connectWithAnswerBtn.disabled = !answerIn.value.trim(); });

setOfferBtn.addEventListener("click", async () => {
  await createPeer("join");
  if (!offerIn.value.trim()) return;
  const desc = JSON.parse(offerIn.value.trim());
  await online.pc.setRemoteDescription(desc);
  setOnlineStatus("Creating answer…");
  makeAnswerBtn.disabled = false;
});
makeAnswerBtn.addEventListener("click", async () => {
  const answer = await online.pc.createAnswer();
  await online.pc.setLocalDescription(answer);
  // final SDP in answerOut after ICE completes
  copyAnswerBtn.disabled = false;
});
copyAnswerBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(answerOut.value || "");
  setOnlineStatus("Answer copied! Send to host.");
});

disconnectOnlineBtn.addEventListener("click", disconnectOnline);

/* Export / Import / Replay */
exportBtn.addEventListener("click", () => exportGame());
importBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0]; if (!f) return;
  try {
    const txt = await readFileAsText(f);
    const data = JSON.parse(txt);
    if (!data.N || !data.WIN_LEN || !Array.isArray(data.moves)) throw new Error("Bad file");
    openReplay(data);
  } catch {
    alert("Invalid replay file.");
  } finally {
    fileInput.value = "";
  }
});
openReplayBtn.addEventListener("click", () => {
  if (moveHistory.length === 0) return;
  const data = { N, WIN_LEN, moves: moveHistory.map(m => ({ index: m.index, mark: m.mark })) };
  openReplay(data);
});
closeReplayBtn.addEventListener("click", closeReplay);
stepForwardBtn.addEventListener("click", replayStepForward);
stepBackBtn.addEventListener("click", replayStepBack);
restartReplayBtn.addEventListener("click", () => {
  if (!replayData) return;
  board = Array(N*N).fill(null); moveHistory = []; winnerLine = null; gameOver = false; render();
});

/* Resume audio on first gesture */
["click", "touchstart", "keydown"].forEach(evt => {
  window.addEventListener(evt, () => ensureAudio(), { once: true, passive: true });
});

/* Service worker */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  });
}

/* Init */
restorePrefs();
resetScore();
newGame();
render();
