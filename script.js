"use strict";

/* ====== Firebase (optional Quick Connect) ====== */
// Fill this with your Firebase project config if you want one-click Online via room codes.
// Get it from Firebase console > Project settings > Web app.
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DB_URL", // e.g. https://your-project-default-rtdb.firebaseio.com
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};
let FB = { app: null, db: null, authed: false, roomRef: null };

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
const timerSelect = document.getElementById("timerSelect");
const ratedToggle = document.getElementById("ratedToggle");

const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undoBtn");
const resetScoreBtn = document.getElementById("resetScore");
const leftLabel = document.getElementById("leftLabel");
const rightLabel = document.getElementById("rightLabel");
const scoreLeftEl = document.getElementById("scoreLeft");
const scoreDrawEl = document.getElementById("scoreDraw");
const scoreRightEl = document.getElementById("scoreRight");
const ratingLine = document.getElementById("ratingLine");

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

/* Firebase quick connect UI */
const fbRoomCodeEl = document.getElementById("fbRoomCode");
const fbHostBtn = document.getElementById("fbHostBtn");
const fbJoinBtn = document.getElementById("fbJoinBtn");
const fbDisconnectBtn = document.getElementById("fbDisconnectBtn");
const fbStatus = document.getElementById("fbStatus");

/* Replay UI */
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
const replaySpeedEl = document.getElementById("replaySpeed");
const replayPlayBtn = document.getElementById("replayPlay");

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
let myMark = "X";   // for online data channel
let turnMark = "X"; // 'X' | 'O'
let altNextMark = "X"; // for alternate starts

let score = { left: 0, draw: 0, right: 0 };
let ratings = { you: 1200, ai: 1200, p1: 1200, p2: 1200 };

let cells = [];
let isReplaying = false;
let replayData = null; // { N, WIN_LEN, moves: [{index, mark}] }
let replayTimer = null;

/* Timer (per-move) */
let timer = {
  perMoveMs: 0,
  remainingMs: 0,
  activeMark: null,
  interval: null,
  running: false
};

/* Online (WebRTC) */
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
  win: "ttt-winlen",
  rated: "ttt-rated",
  ratings: "ttt-ratings"
};

/* ====== Audio ====== */
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
function chord(freqs = [440,660,880], duration = 180, volume = 0.03) {
  if (!soundEnabled) return;
  const ctx = ensureAudio(); if (!ctx) return;
  const gain = ctx.createGain(); gain.gain.value = volume; gain.connect(ctx.destination);
  const now = ctx.currentTime;
  for (const f of freqs) { const o = ctx.createOscillator(); o.type="sine"; o.frequency.value=f; o.connect(gain); o.start(now); o.stop(now+duration/1000); }
}

/* ====== Utils ====== */
function setStatus(msg){ statusEl.textContent = msg; }
function availableMoves(b){ return b.map((v,i)=>v===null?i:null).filter(v=>v!==null); }
function buildLines(n, winLen){
  const lines = [];
  // rows
  for (let r=0;r<n;r++) for (let c=0;c<=n-winLen;c++){ const L=[]; for(let k=0;k<winLen;k++) L.push(r*n+(c+k)); lines.push(L); }
  // cols
  for (let c=0;c<n;c++) for (let r=0;r<=n-winLen;r++){ const L=[]; for(let k=0;k<winLen;k++) L.push((r+k)*n+c); lines.push(L); }
  // diag ↘
  for (let r=0;r<=n-winLen;r++) for (let c=0;c<=n-winLen;c++){ const L=[]; for(let k=0;k<winLen;k++) L.push((r+k)*n+(c+k)); lines.push(L); }
  // diag ↙
  for (let r=0;r<=n-winLen;r++) for (let c=winLen-1;c<n;c++){ const L=[]; for(let k=0;k<winLen;k++) L.push((r+k)*n+(c-k)); lines.push(L); }
  return lines;
}
function checkWinner(b){
  for (const line of WIN_LINES){
    const m = b[line[0]];
    if (!m) continue;
    let ok = true;
    for (let i=1;i<line.length;i++){ if (b[line[i]] !== m){ ok=false; break; } }
    if (ok) return { winner: m, line: [...line] };
  }
  return null;
}
function isDraw(b){ return availableMoves(b).length === 0; }
function otherMark(m){ return m === "X" ? "O" : "X"; }
function fmtTime(ms){
  const s = Math.max(0, Math.ceil(ms/1000));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}

/* ====== UI Build/Render ====== */
function clampWinLenOptions(){
  const size = Number(sizeEl.value);
  const maxWin = Math.min(size, 5);
  winLenEl.innerHTML = "";
  for (let k=3; k<=maxWin; k++){
    const opt = document.createElement("option");
    opt.value = String(k); opt.textContent = String(k);
    winLenEl.appendChild(opt);
  }
  let def = (size === 3) ? 3 : 4;
  if (def > maxWin) def = maxWin;
  winLenEl.value = String(def);
}
function buildBoard(){
  boardEl.innerHTML = "";
  boardEl.style.setProperty("--n", String(N));
  cells = [];
  for (let i=0;i<N*N;i++){
    const btn = document.createElement("button");
    btn.className = "cell"; btn.dataset.index = String(i);
    btn.setAttribute("role","gridcell");
    btn.setAttribute("aria-label",`Cell ${i+1} empty`);
    btn.addEventListener("click", onCellClick);
    cells.push(btn); boardEl.appendChild(btn);
  }
}
function render(){
  cells.forEach((btn,i)=>{
    const mark = board[i];
    btn.textContent = mark ?? "";
    btn.classList.toggle("mark-x", mark==="X");
    btn.classList.toggle("mark-o", mark==="O");
    btn.classList.toggle("win", winnerLine ? winnerLine.includes(i) : false);
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
  updateRatingLine();
  updateTimerHud();
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
function updateRatingLine(){
  if (!ratedToggle.checked){
    ratingLine.textContent = "";
    return;
  }
  if (mode === "ai"){
    ratingLine.textContent = `Ratings — You: ${Math.round(ratings.you)} • Computer: ${Math.round(ratings.ai)}`;
  } else if (mode === "pvp"){
    ratingLine.textContent = `Ratings — Player 1 (X): ${Math.round(ratings.p1)} • Player 2 (O): ${Math.round(ratings.p2)}`;
  } else {
    ratingLine.textContent = "Ratings disabled in Online mode.";
  }
}

/* ====== Gameplay ====== */
function placeMove(i, mark){
  board[i] = mark;
  moveHistory.push({ moveNo: moveHistory.length + 1, index: i, mark });
  const cell = cells[i]; if (cell){ cell.classList.add("pop"); setTimeout(()=>cell.classList.remove("pop"), 140); }
  beep(mark === "X" ? 880 : 660, 80, "triangle", 0.03);
  render();
}
function evaluateEnd(openModal = true){
  const win = checkWinner(board);
  if (win){
    stopTimer();
    gameOver = true; winnerLine = win.line; render();
    const leftMark = (mode === "ai") ? HUMAN_MARK : "X";
    const leftWins = (win.winner === leftMark);
    if (leftWins){
      score.left++; setStatus(mode === "ai" ? "You win! 🎉" : (mode === "online" ? "You win! 🎉" : "Player 1 wins! 🎉"));
      chord([880,1100,1320], 220, 0.03); navigator.vibrate?.(25);
      if (openModal) openResultModal("Win 🎉", `Line ${win.line.map(i=>i+1).join("-")}`);
    } else {
      score.right++; setStatus(mode === "ai" ? "Computer wins! 🤖" : (mode === "online" ? "Opponent wins! 🏆" : "Player 2 wins! 🏆"));
      chord([300,240,200], 240, 0.03); navigator.vibrate?.([15,50,15]);
      if (openModal) openResultModal("Defeat", `Line ${win.line.map(i=>i+1).join("-")}`);
    }
    maybeUpdateRatings(win.winner, false);
    return true;
  }
  if (isDraw(board)){
    stopTimer();
    gameOver = true; render();
    score.draw++; setStatus("It's a draw."); beep(420, 120, "sine", 0.03);
    if (openModal) openResultModal("Draw", "No more moves left.");
    maybeUpdateRatings(null, true);
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
    startTurnTimer(turnMark);
    setStatus("Computer is thinking…");
    disableBoard(true);
    setTimeout(aiTurn, 300);
  } else if (mode === "pvp"){
    placeMove(i, turnMark);
    if (evaluateEnd()) return;
    turnMark = otherMark(turnMark);
    startTurnTimer(turnMark);
    setStatus(`Player ${turnMark === "X" ? "1 (X)" : "2 (O)"} to move`);
  } else if (mode === "online"){
    if (!online.connected || turnMark !== myMark) return;
    placeMove(i, myMark);
    sendOnline({ type: "move", index: i });
    if (evaluateEnd()) return;
    turnMark = otherMark(turnMark);
    startTurnTimer(turnMark, true); // sync
    sendOnline({ type: "timerStart", mark: turnMark, secs: timer.perMoveMs / 1000 });
    setStatus(`Opponent's turn…`);
  }
  render();
}
function disableBoard(disabled){ cells.forEach(btn => { if (!btn.textContent) btn.disabled = disabled; }); }

/* ====== Timer (per-move) ====== */
function setTimerFromUI(){
  const v = timerSelect.value;
  timer.perMoveMs = (v === "off") ? 0 : Number(v) * 1000;
}
function startTurnTimer(mark, skipLocalStart=false){
  stopTimer();
  if (timer.perMoveMs <= 0 || gameOver || isReplaying) { updateTimerHud(); return; }
  timer.activeMark = mark;
  timer.remainingMs = timer.perMoveMs;
  timer.running = true;
  updateTimerHud();
  timer.interval = setInterval(()=>{
    timer.remainingMs -= 250;
    if (timer.remainingMs <= 0){
      handleTimeout(mark);
    } else {
      updateTimerHud();
    }
  }, 250);
}
function stopTimer(){
  if (timer.interval){ clearInterval(timer.interval); timer.interval = null; }
  timer.running = false;
}
function updateTimerHud(){
  if (timer.perMoveMs <= 0 || !timer.running) {
    document.getElementById("timerHud").textContent = "";
    return;
  }
  document.getElementById("timerHud").textContent = `⏱️ ${timer.activeMark} to move — ${fmtTime(timer.remainingMs)}`;
}
function handleTimeout(mark){
  if (gameOver) return;
  stopTimer();
  // Who loses on time? mark is the side to move
  const winner = otherMark(mark);
  // Apply result
  if ((mode === "ai" && winner === HUMAN_MARK) || (mode === "pvp" && winner === "X")){
    score.left++;
  } else if (mode !== "online") {
    score.right++;
  }
  setStatus(`${mark} ran out of time! ${winner} wins.`);
  winnerLine = null; gameOver = true; render();
  maybeUpdateRatings(winner, false);
  openResultModal("Time out ⏱️", `${mark} flagged on time.`);
  if (mode === "online" && online.connected){
    sendOnline({ type: "timeout", mark });
  }
}

/* ====== AI ====== */
function randomMove(b){ const moves = availableMoves(b); return moves[Math.floor(Math.random()*moves.length)]; }
function centers(){
  const mid = Math.floor(N/2);
  return (N%2===1) ? [mid*N+mid] : [(mid-1)*N+(mid-1),(mid-1)*N+mid, mid*N+(mid-1), mid*N+mid];
}
function corners(){ return [0, N-1, (N-1)*N, N*N-1]; }
function sides(){
  const res=[]; for (let i=0;i<N*N;i++){
    const r=Math.floor(i/N), c=i%N, edge=(r===0||r===N-1||c===0||c===N-1), corner=(r===0&&c===0)||(r===0&&c===N-1)||(r===N-1&&c===0)||(r===N-1&&c===N-1);
    if (edge && !corner) res.push(i);
  } return res;
}
function winningMove(b, mark){
  for (const m of availableMoves(b)){
    b[m]=mark; const w=checkWinner(b); b[m]=null; if (w && w.winner===mark) return m;
  } return null;
}
function mediumMove(b){
  let m=winningMove(b, AI_MARK); if (m!==null) return m;
  m=winningMove(b, HUMAN_MARK); if (m!==null) return m;
  const cs=centers().filter(i=>b[i]===null); if (cs.length) return cs[Math.floor(Math.random()*cs.length)];
  const cr=corners().filter(i=>b[i]===null); if (cr.length) return cr[Math.floor(Math.random()*cr.length)];
  const sd=sides().filter(i=>b[i]===null); if (sd.length) return sd[Math.floor(Math.random()*sd.length)];
  return randomMove(b);
}
// perfect minimax for 3x3 & WIN_LEN=3
function minimax3(b, player, depth, alpha, beta){
  const win=checkWinner(b);
  if (win){ if (win.winner===AI_MARK) return {score:10-depth}; if (win.winner===HUMAN_MARK) return {score:depth-10}; }
  if (isDraw(b)) return {score:0};
  const moves=availableMoves(b); let bestMove=moves[0];
  if (player===AI_MARK){
    let best=-Infinity;
    for (const m of moves){ b[m]=AI_MARK; const {score}=minimax3(b,HUMAN_MARK,depth+1,alpha,beta); b[m]=null;
      if (score>best){ best=score; bestMove=m; } alpha=Math.max(alpha,best); if (beta<=alpha) break;
    } return {score:best, move:bestMove};
  } else {
    let best=Infinity;
    for (const m of moves){ b[m]=HUMAN_MARK; const {score}=minimax3(b,AI_MARK,depth+1,alpha,beta); b[m]=null;
      if (score<best){ best=score; bestMove=m; } beta=Math.min(beta,best); if (beta<=alpha) break;
    } return {score:best, move:bestMove};
  }
}
// heuristic for larger boards or WIN_LEN != 3
function evalBoard(b){
  let total=0;
  for (const line of WIN_LINES){
    let a=0,h=0; for (const idx of line){ if (b[idx]===AI_MARK) a++; else if (b[idx]===HUMAN_MARK) h++; }
    if (a>0 && h>0) continue;
    const count = a>0 ? a : h; if (count===0) continue;
    const W = (WIN_LEN===3) ? [0,1,10,1000] : [0,1,6,25,5000];
    total += (a>0 ? +W[count] : -W[count]);
  }
  return total;
}
function orderedMoves(b){
  const avail=availableMoves(b), C=new Set(centers()), R=new Set(corners()), S=new Set(sides());
  return avail.sort((i,j)=> (C.has(j)?3:R.has(j)?2:S.has(j)?1:0) - (C.has(i)?3:R.has(i)?2:S.has(i)?1:0));
}
function minimaxDL(b, player, depth, maxDepth, alpha, beta){
  const w=checkWinner(b);
  if (w){ if (w.winner===AI_MARK) return {score:100000-depth}; if (w.winner===HUMAN_MARK) return {score:depth-100000}; }
  if (isDraw(b)) return {score:0};
  if (depth>=maxDepth) return {score:evalBoard(b)};
  const moves=orderedMoves(b); let bestMove=moves[0];
  if (player===AI_MARK){
    let best=-Infinity; const winNow=winningMove(b,AI_MARK); if (winNow!==null) return {score:99999-depth, move:winNow};
    for (const m of moves){ b[m]=AI_MARK; const {score}=minimaxDL(b,HUMAN_MARK,depth+1,maxDepth,alpha,beta); b[m]=null;
      if (score>best){ best=score; bestMove=m; } alpha=Math.max(alpha,best); if (beta<=alpha) break;
    } return {score:best, move:bestMove};
  } else {
    let best=Infinity;
    for (const m of moves){ b[m]=HUMAN_MARK; const {score}=minimaxDL(b,AI_MARK,depth+1,maxDepth,alpha,beta); b[m]=null;
      if (score<best){ best=score; bestMove=m; } beta=Math.min(beta,best); if (beta<=alpha) break;
    } return {score:best, move:bestMove};
  }
}
function chooseAIMove(){
  const d = diffEl.value;
  if (d==="easy") return randomMove(board);
  if (d==="medium") return mediumMove(board);
  if (N===3 && WIN_LEN===3){
    const { move } = minimax3(board.slice(), AI_MARK, 0, -Infinity, Infinity);
    return move ?? randomMove(board);
  } else {
    const maxDepth = (N<=4) ? 4 : (N===5 ? 3 : 2);
    const { move } = minimaxDL(board.slice(), AI_MARK, 0, maxDepth, -Infinity, Infinity);
    return move ?? mediumMove(board);
  }
}
function aiTurn(){
  if (gameOver || mode!=="ai" || turnMark!==AI_MARK) return;
  const idx = chooseAIMove();
  placeMove(idx, AI_MARK); navigator.vibrate?.(10);
  if (evaluateEnd()) return;
  turnMark = otherMark(turnMark);
  startTurnTimer(turnMark);
  setStatus(`Your turn — place ${HUMAN_MARK}`);
  disableBoard(false);
  render();
}

/* ====== Ratings ====== */
function maybeUpdateRatings(winnerMark, isDraw){
  if (!ratedToggle.checked) return;
  const K = 24;
  function elo(Ra, Rb, Sa){
    const Ea = 1/(1+Math.pow(10, (Rb-Ra)/400));
    return Ra + K*(Sa-Ea);
  }
  if (mode === "ai"){
    let Sa; // score for 'you'
    if (isDraw) Sa = 0.5;
    else Sa = (winnerMark === HUMAN_MARK) ? 1 : 0;
    const newYou = elo(ratings.you, ratings.ai, Sa);
    const newAI = elo(ratings.ai, ratings.you, 1-Sa);
    ratings.you = newYou; ratings.ai = newAI;
  } else if (mode === "pvp"){
    let Sx; // score for X (Player 1)
    if (isDraw) Sx = 0.5;
    else Sx = (winnerMark === "X") ? 1 : 0;
    const newP1 = elo(ratings.p1, ratings.p2, Sx);
    const newP2 = elo(ratings.p2, ratings.p1, 1-Sx);
    ratings.p1 = newP1; ratings.p2 = newP2;
  }
  localStorage.setItem(LS.ratings, JSON.stringify(ratings));
  updateRatingLine();
}

/* ====== Game lifecycle ====== */
function getStarterMark(){
  const v = firstEl.value;
  if (["X","O","p1","p2","player","computer"].includes(v)){
    if (v==="X"||v==="p1"||v==="player") return "X";
    if (v==="O"||v==="p2"||v==="computer") return "O";
  }
  if (v === "random") return Math.random() < 0.5 ? "X" : "O";
  const m = altNextMark; altNextMark = otherMark(altNextMark); return m;
}
function newGame(initByOnline=null){
  if (replayTimer){ clearInterval(replayTimer); replayTimer=null; }
  isReplaying = false; replayData = null;

  if (initByOnline){
    N = initByOnline.N; WIN_LEN = initByOnline.WIN_LEN;
    sizeEl.value = String(N); clampWinLenOptions(); winLenEl.value = String(WIN_LEN);
  } else {
    N = Number(sizeEl.value); clampWinLenOptions();
    WIN_LEN = Number(winLenEl.value);
  }
  WIN_LINES = buildLines(N, WIN_LEN);
  board = Array(N*N).fill(null);
  moveHistory = []; winnerLine = null; gameOver = false;

  HUMAN_MARK = markEl.value; AI_MARK = otherMark(HUMAN_MARK);
  setTimerFromUI();
  buildBoard(); render();

  const starter = initByOnline ? initByOnline.startMark : getStarterMark();
  turnMark = starter;

  if (mode === "ai"){
    if (starter === HUMAN_MARK){
      setStatus(`Your turn — place ${HUMAN_MARK}`); disableBoard(false); startTurnTimer(turnMark);
    } else {
      setStatus("Computer is thinking…"); disableBoard(true); startTurnTimer(turnMark); setTimeout(aiTurn, 350);
    }
  } else if (mode === "pvp"){
    setStatus(`Player ${turnMark === "X" ? "1 (X)" : "2 (O)"} to move`); disableBoard(false); startTurnTimer(turnMark);
  } else if (mode === "online"){
    if (!online.connected){
      setStatus("Not connected — use Online to connect."); disableBoard(true);
    } else {
      myMark = (online.role === "host") ? "X" : "O";
      setStatus(turnMark === myMark ? `Your turn — place ${myMark}` : `Opponent's turn…`);
      disableBoard(turnMark !== myMark); startTurnTimer(turnMark, true);
      if (online.role === "host" && !initByOnline){
        const cfg = { N, WIN_LEN, startMark: starter };
        sendOnline({ type: "newGame", config: cfg });
      }
    }
  }
}
function resetScore(){ score = { left:0, draw:0, right:0 }; updateScore(); }

/* ====== Undo ====== */
function undo(){
  if (moveHistory.length === 0) return;
  if (mode === "ai"){
    // paired undo to return to your turn
    stopTimer();
    while (moveHistory.length){
      const last = moveHistory.pop(); board[last.index] = null;
      if (last.mark === HUMAN_MARK) break; // undo your last + AI last
      if (moveHistory.length === 0) break;
    }
    turnMark = HUMAN_MARK; winnerLine=null; gameOver=false; render();
    setStatus(`Your turn — place ${HUMAN_MARK}`); startTurnTimer(turnMark);
  } else if (mode === "pvp"){
    stopTimer();
    const last = moveHistory.pop(); if (last) board[last.index] = null;
    turnMark = last ? last.mark : "X"; winnerLine=null; gameOver=false; render();
    setStatus(`Player ${turnMark === "X" ? "1 (X)" : "2 (O)"} to move`); startTurnTimer(turnMark);
  } else if (mode === "online"){
    if (!online.connected) return;
    stopTimer();
    const last = moveHistory.pop(); if (last) board[last.index] = null;
    turnMark = last ? last.mark : myMark; winnerLine=null; gameOver=false; render();
    setStatus(turnMark === myMark ? `Your turn — place ${myMark}` : `Opponent's turn…`);
    startTurnTimer(turnMark, true);
    sendOnline({ type: "undo" });
  }
  beep(380, 40, "sine", 0.02);
}

/* ====== Export / Import / Replay (with autoplay speed) ====== */
function exportGame(){
  const data = { N, WIN_LEN, moves: moveHistory.map(m => ({ index:m.index, mark:m.mark })) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `tictactoe_${N}x${N}_win${WIN_LEN}.json`; a.click();
  URL.revokeObjectURL(a.href);
}
function readFileAsText(file){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsText(file); }); }
function openReplay(data){
  isReplaying = true; replayData = data; if (replayTimer){ clearInterval(replayTimer); replayTimer=null; }
  N = data.N; WIN_LEN = data.WIN_LEN; sizeEl.value = String(N); clampWinLenOptions(); winLenEl.value = String(WIN_LEN);
  WIN_LINES = buildLines(N, WIN_LEN);
  board = Array(N*N).fill(null); moveHistory = []; winnerLine=null; gameOver=false;
  buildBoard(); render();
  replayMeta.textContent = `${N}×${N} — win in ${WIN_LEN} — ${data.moves.length} moves`;
  replayOverlay.classList.add("open"); replayOverlay.setAttribute("aria-hidden","false");
  setStatus("Replay mode — use controls in panel"); disableBoard(true);
}
function closeReplay(){
  isReplaying = false; replayData = null; if (replayTimer){ clearInterval(replayTimer); replayTimer=null; }
  replayOverlay.classList.remove("open"); replayOverlay.setAttribute("aria-hidden","true");
  newGame();
}
function replayStepForward(){
  if (!replayData) return;
  const i = moveHistory.length; if (i >= replayData.moves.length) return;
  const mv = replayData.moves[i]; board[mv.index] = mv.mark;
  moveHistory.push({ moveNo:i+1, index:mv.index, mark:mv.mark });
  const w = checkWinner(board); winnerLine = w ? w.line : null; render();
}
function replayStepBack(){
  if (!replayData || moveHistory.length===0) return;
  const last = moveHistory.pop(); board[last.index] = null; winnerLine = null; render();
}
function replayRestart(){
  board = Array(N*N).fill(null); moveHistory=[]; winnerLine=null; render();
}
function replayPlayToggle(){
  if (!replayData) return;
  if (replayTimer){ clearInterval(replayTimer); replayTimer=null; replayPlayBtn.textContent="▶️ Play"; return; }
  const speed = Number(replaySpeedEl.value || "1");
  const stepMs = Math.max(150, Math.round(600 / speed));
  replayPlayBtn.textContent = "⏸️ Pause";
  replayTimer = setInterval(()=>{
    if (!replayData) { replayPlayToggle(); return; }
    if (moveHistory.length >= replayData.moves.length){ replayPlayToggle(); return; }
    replayStepForward();
  }, stepMs);
}

/* ====== Modal ====== */
function openResultModal(title, subtitle){
  modalTitle.textContent = title; modalSubtitle.textContent = subtitle || "";
  modalOverlay.classList.add("open"); modalOverlay.setAttribute("aria-hidden","false");
}
function closeResultModal(){ modalOverlay.classList.remove("open"); modalOverlay.setAttribute("aria-hidden","true"); }

/* ====== Theme ====== */
function getSystemPrefersDark(){ return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
function applyTheme(theme){
  const html=document.documentElement;
  if (theme==="auto"){ html.setAttribute("data-theme", getSystemPrefersDark() ? "dark" : "auto"); themeToggleBtn.textContent = getSystemPrefersDark() ? "☀️" : "🌙"; return; }
  html.setAttribute("data-theme", theme); themeToggleBtn.textContent = theme==="dark" ? "☀️" : "🌙";
}
function toggleTheme(){
  const cur = localStorage.getItem(LS.theme) || "auto";
  const next = cur==="auto" ? (getSystemPrefersDark() ? "light":"dark") : (cur==="dark" ? "light":"dark");
  localStorage.setItem(LS.theme, next); applyTheme(next);
}

/* ====== Persistence ====== */
function restorePrefs(){
  const theme = localStorage.getItem(LS.theme) || "auto"; applyTheme(theme);
  const snd = localStorage.getItem(LS.sounds); if (snd!==null){ soundEnabled = snd==="1"; soundToggle.checked = soundEnabled; }
  const m = localStorage.getItem(LS.mode); if (m) modeEl.value = m;
  const sz = localStorage.getItem(LS.size); if (sz) sizeEl.value = sz;
  clampWinLenOptions();
  const wl = localStorage.getItem(LS.win); if (wl && [...winLenEl.options].some(o=>o.value===wl)) winLenEl.value = wl;
  const df = localStorage.getItem(LS.diff); if (df) diffEl.value = df;
  const fs = localStorage.getItem(LS.first); if (fs) firstEl.value = fs;
  const mk = localStorage.getItem(LS.mark); if (mk) markEl.value = mk;
  const rated = localStorage.getItem(LS.rated); ratedToggle.checked = rated === "1";
  try{ const r = JSON.parse(localStorage.getItem(LS.ratings)||"{}"); ratings = { ...ratings, ...r }; }catch{}
}
function savePrefs(){
  localStorage.setItem(LS.sounds, soundEnabled ? "1":"0");
  localStorage.setItem(LS.mode, modeEl.value);
  localStorage.setItem(LS.size, sizeEl.value);
  localStorage.setItem(LS.win, winLenEl.value);
  localStorage.setItem(LS.diff, diffEl.value);
  localStorage.setItem(LS.first, firstEl.value);
  localStorage.setItem(LS.mark, markEl.value);
  localStorage.setItem(LS.rated, ratedToggle.checked ? "1" : "0");
}

/* ====== Online (Manual + Firebase Quick Connect) ====== */
function openOnlinePanel(){ onlineOverlay.classList.add("open"); onlineOverlay.setAttribute("aria-hidden","false"); }
function closeOnlinePanel(){ onlineOverlay.classList.remove("open"); onlineOverlay.setAttribute("aria-hidden","true"); }
function setTabs(hostActive){ tabHostBtn.classList.toggle("active", hostActive); tabJoinBtn.classList.toggle("active", !hostActive); hostView.hidden = !hostActive; joinView.hidden = hostActive; }
function setOnlineStatus(msg){ onlineStatus.textContent = msg; }
function createPC(role){
  online.role = role;
  if (online.pc) try { online.pc.close(); }catch{}
  online.pc = new RTCPeerConnection({ iceServers: [{ urls:"stun:stun.l.google.com:19302" }] });
  online.pc.onconnectionstatechange = () => {
    if (["disconnected","failed","closed"].includes(online.pc.connectionState)){
      online.connected=false; disconnectOnlineBtn.disabled=true; setOnlineStatus("Disconnected"); setStatus("Disconnected"); render();
    }
  };
  if (role === "host"){
    online.dc = online.pc.createDataChannel("moves");
    wireDC();
  } else {
    online.pc.ondatachannel = (e)=>{ online.dc = e.channel; wireDC(); };
  }
}
function wireDC(){
  online.dc.onopen = () => {
    online.connected = true; disconnectOnlineBtn.disabled = false;
    setOnlineStatus("Connected"); setStatus("Connected"); closeOnlinePanel();
    myMark = (online.role === "host") ? "X" : "O";
    mode = "online"; modeEl.value = "online"; savePrefs();
    if (online.role === "host"){
      const cfg = { N: Number(sizeEl.value), WIN_LEN: Number(winLenEl.value), startMark: getStarterMark() };
      sendOnline({ type:"newGame", config: cfg }); newGame(cfg);
    } else {
      setStatus("Waiting for host to start…"); disableBoard(true);
    }
    render();
  };
  online.dc.onclose = ()=>{ online.connected=false; disconnectOnlineBtn.disabled=true; setOnlineStatus("Channel closed"); render(); };
  online.dc.onmessage = (e)=>{ try{ handleOnlineMessage(JSON.parse(e.data)); }catch{} };
}
function sendOnline(obj){ if (online.connected && online.dc?.readyState==="open"){ online.dc.send(JSON.stringify(obj)); } }
async function manualHost(){
  createPC("host");
  online.pc.onicegatheringstatechange = () => {
    if (online.pc.iceGatheringState === "complete"){
      offerOut.value = JSON.stringify(online.pc.localDescription);
      copyOfferBtn.disabled = false;
    }
  };
  setOnlineStatus("Creating offer…");
  const offer = await online.pc.createOffer();
  await online.pc.setLocalDescription(offer);
}
async function manualHostAcceptAnswer(){
  try{
    const desc = JSON.parse(answerIn.value.trim());
    await online.pc.setRemoteDescription(desc);
    setOnlineStatus("Connecting…");
  } catch { alert("Invalid answer"); }
}
async function manualJoin(){
  try{
    createPC("join");
    const off = JSON.parse(offerIn.value.trim());
    await online.pc.setRemoteDescription(off);
    const ans = await online.pc.createAnswer(); await online.pc.setLocalDescription(ans);
    online.pc.onicegatheringstatechange = () => {
      if (online.pc.iceGatheringState === "complete"){
        answerOut.value = JSON.stringify(online.pc.localDescription);
        copyAnswerBtn.disabled = false;
      }
    };
  } catch { alert("Invalid offer"); }
}
function handleOnlineMessage(msg){
  switch(msg.type){
    case "newGame": newGame(msg.config); break;
    case "move": {
      const opp = otherMark(myMark);
      placeMove(msg.index, opp);
      if (evaluateEnd()) return;
      turnMark = otherMark(turnMark);
      setStatus(turnMark === myMark ? `Your turn — place ${myMark}` : `Opponent's turn…`);
      startTurnTimer(turnMark);
      break;
    }
    case "undo": {
      if (moveHistory.length){ const last = moveHistory.pop(); board[last.index]=null; }
      winnerLine=null; gameOver=false; render();
      startTurnTimer(turnMark);
      break;
    }
    case "timerStart": {
      timer.perMoveMs = (msg.secs|0)*1000;
      startTurnTimer(msg.mark);
      break;
    }
    case "timeout": {
      handleTimeout(msg.mark); // mark that flagged on time
      break;
    }
  }
}
function disconnectOnline(){
  try{ online.dc?.close(); }catch{} try{ online.pc?.close(); }catch{}
  online.dc=null; online.pc=null; online.connected=false; disconnectOnlineBtn.disabled=true;
  setStatus("Disconnected"); setOnlineStatus("Not connected"); render();
}

/* ====== Firebase Quick Connect (Realtime Database) ====== */
async function fbEnsure(){
  if (!window.firebase) { fbStatus.textContent = "Firebase SDK not loaded."; return false; }
  try{
    if (!FB.app){ FB.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG); }
    if (!FB.db){ FB.db = firebase.database(); }
    if (!FB.authed){ await firebase.auth().signInAnonymously(); FB.authed = true; }
    return true;
  }catch(e){
    fbStatus.textContent = "Firebase init/auth failed. Check config.";
    return false;
  }
}
function normRoom(code){ return (code||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12); }
async function fbHost(){
  if (!await fbEnsure()) return;
  const code = normRoom(fbRoomCodeEl.value);
  if (!code) { fbStatus.textContent = "Enter a room code."; return; }
  fbStatus.textContent = `Hosting room ${code}…`;
  createPC("host");
  // Trickle ICE to DB
  const ref = FB.db.ref("rooms/"+code);
  FB.roomRef = ref;
  await ref.set({ created: Date.now() });
  ref.onDisconnect().remove();

  online.pc.addEventListener("icecandidate", (e)=>{
    if (e.candidate) ref.child("candidates/host").push(e.candidate.toJSON()).catch(()=>{});
  });

  // Listen for answer + join candidates
  ref.child("answer").on("value", async (snap)=>{
    const ans = snap.val(); if (!ans) return;
    try{ await online.pc.setRemoteDescription(new RTCSessionDescription(ans)); }catch{}
  });
  ref.child("candidates/join").on("child_added", async (snap)=>{
    const cand = snap.val(); if (!cand) return;
    try{ await online.pc.addIceCandidate(new RTCIceCandidate(cand)); }catch{}
  });

  const offer = await online.pc.createOffer();
  await online.pc.setLocalDescription(offer);
  await ref.child("offer").set(offer.toJSON());
  fbStatus.textContent = `Offer posted. Waiting for Answer…`;
}
async function fbJoin(){
  if (!await fbEnsure()) return;
  const code = normRoom(fbRoomCodeEl.value);
  if (!code) { fbStatus.textContent = "Enter a room code."; return; }
  fbStatus.textContent = `Joining room ${code}…`;
  createPC("join");
  const ref = FB.db.ref("rooms/"+code);
  FB.roomRef = ref;

  online.pc.addEventListener("icecandidate", (e)=>{
    if (e.candidate) ref.child("candidates/join").push(e.candidate.toJSON()).catch(()=>{});
  });
  // Host candidates
  ref.child("candidates/host").on("child_added", async (snap)=>{
    const cand = snap.val(); if (!cand) return;
    try{ await online.pc.addIceCandidate(new RTCIceCandidate(cand)); }catch{}
  });

  const offSnap = await ref.child("offer").get();
  if (!offSnap.exists()){ fbStatus.textContent = "No offer found. Ask host to start."; return; }
  const offer = offSnap.val();
  await online.pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await online.pc.createAnswer();
  await online.pc.setLocalDescription(answer);
  await ref.child("answer").set(answer.toJSON());
  fbStatus.textContent = "Answer posted. Connecting…";
}
async function fbDisconnect(){
  if (FB.roomRef){
    try{
      // Clean listeners
      FB.roomRef.off();
      if (online.role === "host") await FB.roomRef.remove();
    }catch{}
    FB.roomRef = null;
  }
  disconnectOnline();
  fbStatus.textContent = "Firebase: disconnected.";
}

/* ====== Events ====== */
function onKeyNav(e){
  if (gameOver || isReplaying) return;
  const itsAiTurn = (mode==="ai" && turnMark===AI_MARK);
  const itsOnlineOppTurn = (mode==="online" && online.connected && turnMark!==myMark);
  if (itsAiTurn || itsOnlineOppTurn) return;
  const idx = cells.findIndex(c => c === document.activeElement); if (idx === -1) return;
  const map = { ArrowLeft:-1, ArrowRight:+1, ArrowUp:-N, ArrowDown:+N };
  if (map[e.key] !== undefined){
    e.preventDefault(); const next = idx + map[e.key]; if (next>=0 && next<N*N) cells[next].focus();
  } else if (e.key === "Enter" || e.key === " "){
    e.preventDefault(); cells[idx].click();
  }
}
boardEl.addEventListener("keydown", onKeyNav);

newGameBtn.addEventListener("click", () => { beep(520,70,"sine",0.02); newGame(); });
undoBtn.addEventListener("click", () => { beep(380,40,"sine",0.02); undo(); });
resetScoreBtn.addEventListener("click", () => { resetScore(); beep(380,60,"sine",0.02); });

modeEl.addEventListener("change", () => { savePrefs(); resetScore(); newGame(); render(); });
sizeEl.addEventListener("change", () => { savePrefs(); newGame(); });
winLenEl.addEventListener("change", () => { savePrefs(); newGame(); });
diffEl.addEventListener("change", () => { savePrefs(); beep(520,60,"sine",0.02); });
firstEl.addEventListener("change", () => { savePrefs(); newGame(); });
markEl.addEventListener("change", () => { savePrefs(); newGame(); });
timerSelect.addEventListener("change", () => { setTimerFromUI(); startTurnTimer(turnMark); });

ratedToggle.addEventListener("change", () => { savePrefs(); updateRatingLine(); });

themeToggleBtn.addEventListener("click", () => { toggleTheme(); beep(700,40,"sine",0.02); });
soundToggle.addEventListener("change", () => { soundEnabled = soundToggle.checked; savePrefs(); if (soundEnabled) beep(760,60,"sine",0.03); });

playAgainBtn.addEventListener("click", () => {
  closeResultModal();
  if (mode==="online" && online.connected && online.role==="host"){
    const cfg = { N, WIN_LEN, startMark: getStarterMark() }; sendOnline({ type:"newGame", config: cfg }); newGame(cfg);
  } else { newGame(); }
});
closeModalBtn.addEventListener("click", () => closeResultModal());
modalOverlay.addEventListener("click", (e)=>{ if (e.target===modalOverlay) closeResultModal(); });

connectOnlineBtn.addEventListener("click", () => { openOnlinePanel(); setTabs(true); });
closeOnlineBtn.addEventListener("click", closeOnlinePanel);
tabHostBtn.addEventListener("click", () => setTabs(true));
tabJoinBtn.addEventListener("click", () => setTabs(false));
makeOfferBtn.addEventListener("click", manualHost);
copyOfferBtn.addEventListener("click", async ()=>{ await navigator.clipboard.writeText(offerOut.value||""); setOnlineStatus("Offer copied!"); });
connectWithAnswerBtn.addEventListener("click", manualHostAcceptAnswer);
answerIn.addEventListener("input", ()=>{ connectWithAnswerBtn.disabled = !answerIn.value.trim(); });
setOfferBtn.addEventListener("click", manualJoin);
makeAnswerBtn.addEventListener("click", async ()=>{
  // handled inside manualJoin (answer created there after setting remote offer)
});
copyAnswerBtn.addEventListener("click", async ()=>{ await navigator.clipboard.writeText(answerOut.value||""); setOnlineStatus("Answer copied!"); });
disconnectOnlineBtn.addEventListener("click", disconnectOnline);

/* Firebase quick connect buttons */
fbHostBtn.addEventListener("click", fbHost);
fbJoinBtn.addEventListener("click", fbJoin);
fbDisconnectBtn.addEventListener("click", fbDisconnect);

/* Export/Import/Replay */
exportBtn.addEventListener("click", exportGame);
importBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async ()=> {
  const f = fileInput.files?.[0]; if (!f) return;
  try{
    const txt = await readFileAsText(f);
    const data = JSON.parse(txt);
    if (!data.N || !data.WIN_LEN || !Array.isArray(data.moves)) throw new Error("bad");
    openReplay(data);
  } catch { alert("Invalid file."); }
  fileInput.value = "";
});
openReplayBtn.addEventListener("click", () => {
  if (moveHistory.length === 0) return;
  const data = { N, WIN_LEN, moves: moveHistory.map(m => ({ index:m.index, mark:m.mark })) };
  openReplay(data);
});
closeReplayBtn.addEventListener("click", closeReplay);
stepForwardBtn.addEventListener("click", replayStepForward);
stepBackBtn.addEventListener("click", replayStepBack);
restartReplayBtn.addEventListener("click", replayRestart);
replayPlayBtn.addEventListener("click", replayPlayToggle);

/* Resume audio on first gesture */
["click","touchstart","keydown"].forEach(evt => window.addEventListener(evt, ()=>ensureAudio(), { once:true, passive:true }));

/* Service worker */
if ("serviceWorker" in navigator){ window.addEventListener("load", ()=> navigator.serviceWorker.register("./service-worker.js").catch(()=>{})); }

/* Init */
restorePrefs();
resetScore();
newGame();
render();
