"use strict";

/* DOM refs */
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const timerHud = document.getElementById("timerHud");
const historyList = document.getElementById("historyList");

const modeEl = document.getElementById("mode");
const sizeEl = document.getElementById("boardSize");
const winLenEl = document.getElementById("winLen");
const diffEl = document.getElementById("difficulty");
const firstEl = document.getElementById("first");
const markEl = document.getElementById("yourMark");
const timerSel = document.getElementById("timerSel");
const markField = document.getElementById("markField");
const firstLabel = document.getElementById("firstLabel");

const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undoBtn");
const resetScoreBtn = document.getElementById("resetScore");
const exportBtn = document.getElementById("exportGame");
const importBtn = document.getElementById("importReplay");
const openReplayBtn = document.getElementById("openReplay");
const fileInput = document.getElementById("fileInput");

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

const replayOverlay = document.getElementById("replayOverlay");
const closeReplayBtn = document.getElementById("closeReplay");
const replayMeta = document.getElementById("replayMeta");
const stepBackBtn = document.getElementById("stepBack");
const stepForwardBtn = document.getElementById("stepForward");
const restartReplayBtn = document.getElementById("restartReplay");
const replaySpeedEl = document.getElementById("replaySpeed");
const replayPlayBtn = document.getElementById("replayPlay");

/* State */
let N = 3, WIN_LEN = 3, WIN_LINES = [];
let board = Array(9).fill(null);
let moveHistory = []; // { moveNo, index, mark }
let winnerLine = null, gameOver = false;

let mode = "ai";    // 'ai' | 'pvp'
let HUMAN_MARK = "X";
let AI_MARK = "O";
let turnMark = "X"; // 'X'|'O'
let altNextMark = "X";

let score = { left: 0, draw: 0, right: 0 };
let cells = [];

let isReplaying = false;
let replayData = null;
let replayTimer = null;

/* Timer */
let perMoveMs = 0;
let tRemain = 0;
let tInterval = null;

/* Persistence keys */
const LS = {
  theme:"ttt-theme", sounds:"ttt-sounds", mode:"ttt-mode",
  size:"ttt-size", win:"ttt-win", diff:"ttt-diff", first:"ttt-first", mark:"ttt-mark", timer:"ttt-timer"
};

/* Audio */
let audioCtx = null, soundEnabled = true;
function ensureAudio(){
  if (!soundEnabled) return null;
  if (!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function beep(freq=440, dur=80, type="sine", vol=0.04){
  if (!soundEnabled) return;
  const ctx = ensureAudio(); if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type=type; o.frequency.value=freq; g.gain.value=vol;
  o.connect(g).connect(ctx.destination);
  const t = ctx.currentTime; o.start(t); o.stop(t + dur/1000);
}
function chord(freqs=[440,660,880], dur=180, vol=0.03){
  if (!soundEnabled) return;
  const ctx = ensureAudio(); if (!ctx) return;
  const g = ctx.createGain(); g.gain.value=vol; g.connect(ctx.destination);
  const t = ctx.currentTime;
  freqs.forEach(f=>{ const o=ctx.createOscillator(); o.type="sine"; o.frequency.value=f; o.connect(g); o.start(t); o.stop(t + dur/1000); });
}

/* Utils */
function setStatus(msg){ statusEl.textContent = msg; }
function clampWinLenOptions(){
  const size = Number(sizeEl.value);
  const maxWin = Math.min(size, 5);
  winLenEl.innerHTML = "";
  for (let k=3;k<=maxWin;k++){
    const opt=document.createElement("option"); opt.value=String(k); opt.textContent=String(k);
    winLenEl.appendChild(opt);
  }
  winLenEl.value = size===3 ? "3" : String(Math.min(4, maxWin));
}
function buildLines(n, w){
  const lines=[];
  for (let r=0;r<n;r++) for (let c=0;c<=n-w;c++){ const L=[]; for(let k=0;k<w;k++) L.push(r*n+(c+k)); lines.push(L); }
  for (let c=0;c<n;c++) for (let r=0;r<=n-w;r++){ const L=[]; for(let k=0;k<w;k++) L.push((r+k)*n+c); lines.push(L); }
  for (let r=0;r<=n-w;r++) for (let c=0;c<=n-w;c++){ const L=[]; for(let k=0;k<w;k++) L.push((r+k)*n+(c+k)); lines.push(L); }
  for (let r=0;r<=n-w;r++) for (let c=w-1;c<n;c++){ const L=[]; for(let k=0;k<w;k++) L.push((r+k)*n+(c-k)); lines.push(L); }
  return lines;
}
function availableMoves(b){ return b.map((v,i)=>v===null?i:null).filter(v=>v!==null); }
function checkWinner(b){
  for (const line of WIN_LINES){
    const m=b[line[0]]; if (!m) continue;
    let ok=true; for (let i=1;i<line.length;i++){ if (b[line[i]]!==m){ ok=false; break; } }
    if (ok) return { winner:m, line:[...line] };
  }
  return null;
}
function isDraw(b){ return availableMoves(b).length===0; }
function otherMark(m){ return m==="X" ? "O" : "X"; }
function fmtTime(ms){ const s=Math.max(0,Math.ceil(ms/1000)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }

/* Build/Render */
function buildBoard(){
  boardEl.innerHTML=""; boardEl.style.setProperty("--n", String(N)); cells=[];
  for (let i=0;i<N*N;i++){
    const btn=document.createElement("button");
    btn.className="cell"; btn.dataset.index=String(i);
    btn.setAttribute("role","gridcell"); btn.setAttribute("aria-label",`Cell ${i+1} empty`);
    btn.addEventListener("click", onCellClick);
    cells.push(btn); boardEl.appendChild(btn);
  }
}
function render(){
  const aiTurn = (mode==="ai" && turnMark===AI_MARK);
  const disabledGlobal = isReplaying;
  cells.forEach((btn,i)=>{
    const mark = board[i];
    btn.textContent = mark ?? "";
    btn.classList.toggle("mark-x", mark==="X");
    btn.classList.toggle("mark-o", mark==="O");
    btn.classList.toggle("win", winnerLine ? winnerLine.includes(i) : false);
    btn.disabled = !!mark || gameOver || aiTurn || disabledGlobal;
  });
  // labels
  if (mode==="ai"){
    leftLabel.firstChild.textContent = `You (${HUMAN_MARK}): `;
    rightLabel.firstChild.textContent = `Computer (${AI_MARK}): `;
  } else {
    leftLabel.firstChild.textContent = `Player 1 (X): `;
    rightLabel.firstChild.textContent = `Player 2 (O): `;
  }
  // score
  scoreLeftEl.textContent = String(score.left);
  scoreDrawEl.textContent = String(score.draw);
  scoreRightEl.textContent = String(score.right);
  // history
  historyList.innerHTML="";
  for (const step of moveHistory){
    const li=document.createElement("li");
    li.textContent = `${step.moveNo}. ${step.mark} → ${step.index+1}`;
    historyList.appendChild(li);
  }
  // controls
  undoBtn.disabled = moveHistory.length===0 || isReplaying;
  openReplayBtn.disabled = moveHistory.length===0;
  updateTimerHud();
}

/* Timer */
function startTimer(mark){
  perMoveMs = Number(timerSel.value) * 1000;
  stopTimer();
  if (!perMoveMs || isReplaying || gameOver){ timerHud.textContent=""; return; }
  tRemain = perMoveMs;
  timerHud.textContent = `⏱️ ${mark} to move — ${fmtTime(tRemain)}`;
  tInterval = setInterval(()=>{
    tRemain -= 250;
    if (tRemain <= 0){
      stopTimer();
      handleTimeout(mark);
    } else {
      timerHud.textContent = `⏱️ ${mark} to move — ${fmtTime(tRemain)}`;
    }
  }, 250);
}
function stopTimer(){ if (tInterval){ clearInterval(tInterval); tInterval=null; } }
function updateTimerHud(){
  if (!tInterval || gameOver || isReplaying){ /* keep current text or empty */ }
}

/* Gameplay */
function placeMove(i, mark){
  board[i]=mark;
  moveHistory.push({ moveNo: moveHistory.length+1, index:i, mark });
  const cell=cells[i]; if (cell){ cell.classList.add("pop"); setTimeout(()=>cell.classList.remove("pop"), 140); }
  beep(mark==="X"?880:660,80,"triangle",0.03);
  render();
}
function evaluateEnd(openModal=true){
  const w = checkWinner(board);
  if (w){
    gameOver=true; winnerLine=w.line; stopTimer(); render();
    const leftMark = (mode==="ai") ? HUMAN_MARK : "X";
    if (w.winner===leftMark){
      score.left++; setStatus(mode==="ai"?"You win! 🎉":"Player 1 wins! 🎉"); chord([880,1100,1320],220,0.03);
      if (openModal) openResultModal("Win 🎉", `Line ${w.line.map(i=>i+1).join("-")}`);
    } else {
      score.right++; setStatus(mode==="ai"?"Computer wins! 🤖":"Player 2 wins! 🏆"); chord([300,240,200],240,0.03);
      if (openModal) openResultModal("Game Over", `Line ${w.line.map(i=>i+1).join("-")}`);
    }
    return true;
  }
  if (isDraw(board)){
    gameOver=true; stopTimer(); render(); score.draw++;
    setStatus("It's a draw."); beep(420,120,"sine",0.03);
    if (openModal) openResultModal("Draw","No more moves left.");
    return true;
  }
  return false;
}
function onCellClick(e){
  const i = Number(e.currentTarget.dataset.index);
  if (board[i]!==null || gameOver || isReplaying) return;

  if (mode==="ai"){
    if (turnMark !== HUMAN_MARK) return;
    placeMove(i, HUMAN_MARK);
    if (evaluateEnd()) return;
    turnMark = otherMark(turnMark);
    setStatus("Computer is thinking…");
    startTimer(turnMark);
    disableBoard(true);
    setTimeout(aiTurn, 250);
  } else {
    placeMove(i, turnMark);
    if (evaluateEnd()) return;
    turnMark = otherMark(turnMark);
    setStatus(`Player ${turnMark==="X"?"1 (X)":"2 (O)"} to move`);
    startTimer(turnMark);
  }
  render();
}
function handleTimeout(mark){
  if (gameOver) return;
  const winner = otherMark(mark);
  gameOver = true; winnerLine=null; render();
  const leftWins = (mode==="ai" && winner===HUMAN_MARK) || (mode==="pvp" && winner==="X");
  if (leftWins){ score.left++; } else { score.right++; }
  setStatus(`${mark} ran out of time — ${winner} wins ⏱️`);
  openResultModal("Time out ⏱️", `${winner} wins on time.`);
}
function disableBoard(disabled){
  cells.forEach(btn=>{ if (!btn.textContent) btn.disabled = disabled; });
}

/* AI */
function randomMove(b){ const m=availableMoves(b); return m[Math.floor(Math.random()*m.length)]; }
function centers(){
  const mid=Math.floor(N/2);
  return (N%2===1) ? [mid*N+mid] : [(mid-1)*N+(mid-1),(mid-1)*N+mid, mid*N+(mid-1), mid*N+mid];
}
function corners(){ return [0,N-1,(N-1)*N,N*N-1]; }
function sides(){
  const out=[]; for (let i=0;i<N*N;i++){ const r=Math.floor(i/N),c=i%N,edge=(r===0||r===N-1||c===0||c===N-1),corner=(r===0&&c===0)||(r===0&&c===N-1)||(r===N-1&&c===0)||(r===N-1&&c===N-1);
    if (edge && !corner) out.push(i);
  } return out;
}
function winningMove(b, mark){
  for (const i of availableMoves(b)){ b[i]=mark; const w=checkWinner(b); b[i]=null; if (w && w.winner===mark) return i; }
  return null;
}
function mediumMove(b){
  let m=winningMove(b, AI_MARK); if (m!==null) return m;
  m=winningMove(b, HUMAN_MARK); if (m!==null) return m;
  const cs=centers().filter(i=>b[i]===null); if (cs.length) return cs[Math.floor(Math.random()*cs.length)];
  const cr=corners().filter(i=>b[i]===null); if (cr.length) return cr[Math.floor(Math.random()*cr.length)];
  const sd=sides().filter(i=>b[i]===null); if (sd.length) return sd[Math.floor(Math.random()*sd.length)];
  return randomMove(b);
}
// Perfect 3x3 minimax
function minimax3(b, player, depth, alpha, beta){
  const w=checkWinner(b);
  if (w){ if (w.winner===AI_MARK) return {score:10-depth}; if (w.winner===HUMAN_MARK) return {score:depth-10}; }
  if (isDraw(b)) return {score:0};
  const moves=availableMoves(b); let bestMove=moves[0];
  if (player===AI_MARK){
    let best=-Infinity;
    for (const m of moves){ b[m]=AI_MARK; const {score}=minimax3(b,HUMAN_MARK,depth+1,alpha,beta); b[m]=null;
      if (score>best){ best=score; bestMove=m; } alpha=Math.max(alpha,best); if (beta<=alpha) break; }
    return {score:best, move:bestMove};
  } else {
    let best=Infinity;
    for (const m of moves){ b[m]=HUMAN_MARK; const {score}=minimax3(b,AI_MARK,depth+1,alpha,beta); b[m]=null;
      if (score<best){ best=score; bestMove=m; } beta=Math.min(beta,best); if (beta<=alpha) break; }
    return {score:best, move:bestMove};
  }
}
// Heuristic eval for NxN / WIN_LEN>=3
function evalBoard(b){
  let total=0;
  const W = (WIN_LEN===3)?[0,1,10,1000]:[0,1,6,25,5000];
  for (const line of WIN_LINES){
    let a=0,h=0; for (const idx of line){ if (b[idx]===AI_MARK) a++; else if (b[idx]===HUMAN_MARK) h++; }
    if (a>0 && h>0) continue;
    const n=a>0?a:h; if (!n) continue;
    total += (a>0 ? +W[Math.min(n, W.length-1)] : -W[Math.min(n, W.length-1)]);
  }
  return total;
}
function orderedMoves(b){
  const avail=availableMoves(b), C=new Set(centers()), R=new Set(corners()), S=new Set(sides());
  return avail.sort((i,j)=>{ const pi=C.has(i)?3:R.has(i)?2:S.has(i)?1:0; const pj=C.has(j)?3:R.has(j)?2:S.has(j)?1:0; return pj-pi; });
}
function minimaxDL(b, player, depth, maxDepth, alpha, beta){
  const w=checkWinner(b);
  if (w){ if (w.winner===AI_MARK) return {score:100000-depth}; if (w.winner===HUMAN_MARK) return {score:depth-100000}; }
  if (isDraw(b)) return {score:0};
  if (depth>=maxDepth) return {score:evalBoard(b)};
  const moves=orderedMoves(b); let bestMove=moves[0];
  if (player===AI_MARK){
    let best=-Infinity; const now=winningMove(b,AI_MARK); if (now!==null) return {score:99999-depth, move:now};
    for (const m of moves){ b[m]=AI_MARK; const {score}=minimaxDL(b,HUMAN_MARK,depth+1,maxDepth,alpha,beta); b[m]=null;
      if (score>best){ best=score; bestMove=m; } alpha=Math.max(alpha,best); if (beta<=alpha) break; }
    return {score:best, move:bestMove};
  } else {
    let best=Infinity;
    for (const m of moves){ b[m]=HUMAN_MARK; const {score}=minimaxDL(b,AI_MARK,depth+1,maxDepth,alpha,beta); b[m]=null;
      if (score<best){ best=score; bestMove=m; } beta=Math.min(beta,best); if (beta<=alpha) break; }
    return {score:best, move:bestMove};
  }
}
function chooseAIMove(){
  const d = diffEl.value;
  if (d==="easy") return randomMove(board);
  if (d==="medium") return mediumMove(board);
  if (N===3 && WIN_LEN===3){
    const {move} = minimax3(board.slice(), AI_MARK, 0, -Infinity, Infinity);
    return move ?? randomMove(board);
  } else {
    const depth = (N<=4)?4:(N===5?3:2);
    const {move} = minimaxDL(board.slice(), AI_MARK, 0, depth, -Infinity, Infinity);
    return move ?? mediumMove(board);
  }
}
function aiTurn(){
  if (gameOver || mode!=="ai" || turnMark!==AI_MARK) return;
  const idx = chooseAIMove();
  placeMove(idx, AI_MARK); navigator.vibrate?.(10);
  if (evaluateEnd()) return;
  turnMark = otherMark(turnMark);
  setStatus(`Your turn — place ${HUMAN_MARK}`);
  startTimer(turnMark);
  disableBoard(false);
  render();
}

/* New Game / Reset / Undo */
function updateControlsForMode(){
  const isAI = modeEl.value === "ai";
  diffEl.disabled = !isAI;
  markField.style.display = isAI ? "grid" : "none";
  // Update "Who starts" options
  if (isAI){
    firstLabel.textContent = "Who starts";
    firstEl.innerHTML = `
      <option value="player" selected>Player</option>
      <option value="computer">Computer</option>
      <option value="random">Random</option>
      <option value="alternate">Alternate</option>
    `;
  } else {
    firstLabel.textContent = "Who starts";
    firstEl.innerHTML = `
      <option value="X" selected>X</option>
      <option value="O">O</option>
      <option value="random">Random</option>
      <option value="alternate">Alternate</option>
    `;
  }
}
function getStarterMark(){
  const v = firstEl.value;
  if (mode==="ai"){
    if (v==="player") return HUMAN_MARK;
    if (v==="computer") return AI_MARK;
  } else {
    if (v==="X"||v==="O") return v;
  }
  if (v==="random") return Math.random()<0.5?"X":"O";
  // alternate
  const m=altNextMark; altNextMark=otherMark(altNextMark); return m;
}
function newGame(){
  N = Number(sizeEl.value); clampWinLenOptions(); WIN_LEN = Number(winLenEl.value);
  WIN_LINES = buildLines(N, WIN_LEN);
  board = Array(N*N).fill(null); moveHistory=[]; winnerLine=null; gameOver=false;

  mode = modeEl.value;
  HUMAN_MARK = markEl.value; AI_MARK = otherMark(HUMAN_MARK);
  updateControlsForMode();
  buildBoard(); render();

  turnMark = getStarterMark();
  if (mode==="ai"){
    if (turnMark===HUMAN_MARK){
      setStatus(`Your turn — place ${HUMAN_MARK}`); disableBoard(false); startTimer(turnMark);
    } else {
      setStatus("Computer is thinking…"); disableBoard(true); startTimer(turnMark); setTimeout(aiTurn, 350);
    }
  } else {
    setStatus(`Player ${turnMark==="X"?"1 (X)":"2 (O)"} to move`); disableBoard(false); startTimer(turnMark);
  }
}
function resetScore(){ score = { left:0, draw:0, right:0 }; render(); }
function undo(){
  if (moveHistory.length===0) return;
  stopTimer();
  if (mode==="ai"){
    // Undo back to your turn: remove AI's last (if any) and your last
    if (moveHistory.length && moveHistory[moveHistory.length-1].mark===AI_MARK){
      const last=moveHistory.pop(); board[last.index]=null;
    }
    if (moveHistory.length && moveHistory[moveHistory.length-1].mark===HUMAN_MARK){
      const last=moveHistory.pop(); board[last.index]=null;
    }
    turnMark = HUMAN_MARK;
    setStatus(`Your turn — place ${HUMAN_MARK}`);
  } else {
    const last=moveHistory.pop(); board[last.index]=null;
    turnMark = last ? last.mark : "X";
    setStatus(`Player ${turnMark==="X"?"1 (X)":"2 (O)"} to move`);
  }
  winnerLine=null; gameOver=false; render(); startTimer(turnMark);
  beep(380,40,"sine",0.02);
}

/* Export / Import / Replay */
function exportGame(){
  const data = { N, WIN_LEN, moves: moveHistory.map(m=>({index:m.index, mark:m.mark})) };
  const blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=`tictactoe_${N}x${N}_win${WIN_LEN}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function readFileAsText(file){
  return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsText(file); });
}
function openReplay(data){
  isReplaying=true; replayData=data; stopTimer();
  N=data.N; WIN_LEN=data.WIN_LEN; sizeEl.value=String(N); clampWinLenOptions(); winLenEl.value=String(WIN_LEN);
  WIN_LINES=buildLines(N,WIN_LEN);
  board=Array(N*N).fill(null); moveHistory=[]; winnerLine=null; gameOver=false;
  buildBoard(); render();
  replayMeta.textContent = `${N}×${N}, win in ${WIN_LEN} — ${data.moves.length} moves`;
  replayOverlay.classList.add("open"); replayOverlay.setAttribute("aria-hidden","false");
  setStatus("Replay mode — use controls to step or autoplay");
  disableBoard(true);
}
function closeReplay(){
  isReplaying=false; replayData=null; if (replayTimer){ clearInterval(replayTimer); replayTimer=null; }
  replayOverlay.classList.remove("open"); replayOverlay.setAttribute("aria-hidden","true");
  newGame();
}
function replayStepForward(){
  if (!replayData) return;
  const idx=moveHistory.length; if (idx>=replayData.moves.length) return;
  const mv=replayData.moves[idx]; board[mv.index]=mv.mark; moveHistory.push({ moveNo:idx+1, index:mv.index, mark:mv.mark });
  winnerLine = checkWinner(board)?.line || null; render();
}
function replayStepBack(){
  if (!replayData || moveHistory.length===0) return;
  const last=moveHistory.pop(); board[last.index]=null; winnerLine=null; render();
}
function replayRestart(){ board=Array(N*N).fill(null); moveHistory=[]; winnerLine=null; render(); }
function replayPlayToggle(){
  if (!replayData) return;
  if (replayTimer){ clearInterval(replayTimer); replayTimer=null; replayPlayBtn.textContent="▶️ Play"; return; }
  const speed = Number(replaySpeedEl.value||"1");
  const interval = Math.max(150, Math.round(700 / speed));
  replayPlayBtn.textContent="⏸️ Pause";
  replayTimer=setInterval(()=>{
    if (!replayData || moveHistory.length>=replayData.moves.length){ replayPlayToggle(); return; }
    replayStepForward();
  }, interval);
}

/* Modal & Theme */
function openResultModal(title, sub){ modalTitle.textContent=title; modalSubtitle.textContent=sub||""; modalOverlay.classList.add("open"); modalOverlay.setAttribute("aria-hidden","false"); }
function closeResultModal(){ modalOverlay.classList.remove("open"); modalOverlay.setAttribute("aria-hidden","true"); }

function getSystemDark(){ return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
function applyTheme(theme){
  const html=document.documentElement;
  if (theme==="auto"){ html.setAttribute("data-theme", getSystemDark() ? "dark" : "auto"); themeToggleBtn.textContent = getSystemDark() ? "☀️" : "🌙"; return; }
  html.setAttribute("data-theme", theme); themeToggleBtn.textContent = theme==="dark"?"☀️":"🌙";
}
function toggleTheme(){
  const cur=localStorage.getItem(LS.theme)||"auto";
  const next = cur==="auto" ? (getSystemDark() ? "light":"dark") : (cur==="dark" ? "light":"dark");
  localStorage.setItem(LS.theme,next); applyTheme(next);
}

/* Persistence */
function restorePrefs(){
  applyTheme(localStorage.getItem(LS.theme)||"auto");
  const snd=localStorage.getItem(LS.sounds); if (snd!==null){ soundEnabled=snd==="1"; soundToggle.checked=soundEnabled; }
  const m=localStorage.getItem(LS.mode); if (m) modeEl.value=m;
  const sz=localStorage.getItem(LS.size); if (sz) sizeEl.value=sz;
  clampWinLenOptions();
  const wl=localStorage.getItem(LS.win); if (wl && [...winLenEl.options].some(o=>o.value===wl)) winLenEl.value=wl;
  const df=localStorage.getItem(LS.diff); if (df) diffEl.value=df;
  const fs=localStorage.getItem(LS.first); if (fs) firstEl.value=fs;
  const mk=localStorage.getItem(LS.mark); if (mk) markEl.value=mk;
  const tm=localStorage.getItem(LS.timer); if (tm) timerSel.value=tm;
}
function savePrefs(){
  localStorage.setItem(LS.sounds, soundEnabled?"1":"0");
  localStorage.setItem(LS.mode, modeEl.value);
  localStorage.setItem(LS.size, sizeEl.value);
  localStorage.setItem(LS.win, winLenEl.value);
  localStorage.setItem(LS.diff, diffEl.value);
  localStorage.setItem(LS.first, firstEl.value);
  localStorage.setItem(LS.mark, markEl.value);
  localStorage.setItem(LS.timer, timerSel.value);
}

/* Events */
boardEl.addEventListener("keydown",(e)=>{
  if (gameOver || isReplaying) return;
  const aiTurn=(mode==="ai" && turnMark===AI_MARK); if (aiTurn) return;
  const idx=cells.findIndex(c=>c===document.activeElement); if (idx===-1) return;
  const map={ArrowLeft:-1,ArrowRight:+1,ArrowUp:-N,ArrowDown:+N};
  if (map[e.key]!==undefined){ e.preventDefault(); const next=idx+map[e.key]; if (next>=0 && next<N*N) cells[next].focus(); }
  else if (e.key==="Enter" || e.key===" "){ e.preventDefault(); cells[idx].click(); }
});

newGameBtn.addEventListener("click", ()=>{ beep(520,70,"sine",0.02); newGame(); });
undoBtn.addEventListener("click", ()=> undo());
resetScoreBtn.addEventListener("click", ()=>{ resetScore(); beep(380,60,"sine",0.02); });

modeEl.addEventListener("change", ()=>{ savePrefs(); newGame(); });
sizeEl.addEventListener("change", ()=>{ savePrefs(); newGame(); });
winLenEl.addEventListener("change", ()=>{ savePrefs(); newGame(); });
diffEl.addEventListener("change", ()=>{ savePrefs(); beep(520,60,"sine",0.02); });
firstEl.addEventListener("change", ()=>{ savePrefs(); newGame(); });
markEl.addEventListener("change", ()=>{ savePrefs(); newGame(); });
timerSel.addEventListener("change", ()=>{ savePrefs(); startTimer(turnMark); });

themeToggleBtn.addEventListener("click", ()=>{ toggleTheme(); beep(700,40,"sine",0.02); });
soundToggle.addEventListener("change", ()=>{ soundEnabled=soundToggle.checked; savePrefs(); if (soundEnabled) beep(760,60,"sine",0.03); });

playAgainBtn.addEventListener("click", ()=>{ closeResultModal(); newGame(); });
closeModalBtn.addEventListener("click", ()=> closeResultModal());
modalOverlay.addEventListener("click", (e)=>{ if (e.target===modalOverlay) closeResultModal(); });

exportBtn.addEventListener("click", exportGame);
importBtn.addEventListener("click", ()=> fileInput.click());
fileInput.addEventListener("change", async ()=>{
  const f=fileInput.files?.[0]; if (!f) return;
  try{ const txt=await readFileAsText(f); const data=JSON.parse(txt);
    if (!data.N || !data.WIN_LEN || !Array.isArray(data.moves)) throw 0; openReplay(data);
  }catch{ alert("Invalid replay file."); }
  finally{ fileInput.value=""; }
});
openReplayBtn.addEventListener("click", ()=>{
  if (moveHistory.length===0) return;
  const data={ N, WIN_LEN, moves: moveHistory.map(m=>({index:m.index, mark:m.mark})) };
  openReplay(data);
});
closeReplayBtn.addEventListener("click", closeReplay);
stepForwardBtn.addEventListener("click", replayStepForward);
stepBackBtn.addEventListener("click", replayStepBack);
restartReplayBtn.addEventListener("click", replayRestart);
replayPlayBtn.addEventListener("click", replayPlayToggle);

/* Audio policy */
["click","touchstart","keydown"].forEach(evt=>window.addEventListener(evt, ()=>ensureAudio(), { once:true, passive:true }));

/* Service worker (offline installable) */
if ("serviceWorker" in navigator){
  window.addEventListener("load", ()=> navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
}

/* Init */
restorePrefs();
updateControlsForMode();
resetScore();
newGame();
render();
