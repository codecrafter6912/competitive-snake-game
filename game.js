// game.js — state, modes, power-ups, loop, sound and storage
// draw(), burst(), pop() live in render.js; input listeners live in input.js

const COLS = 20, ROWS = 20, BASE_MS = 140, MIN_MS = 70, PER_LEVEL = 5, TIME_LIMIT = 60;
const MODES = {
  classic: { name: 'Classic', info: 'The screen wraps around. Only your own tail can stop you.' },
  walls: { name: 'Walls', info: 'Hit a wall and the run is over.' },
  time: { name: 'Time Attack', info: '60 seconds. Score as much as you can.' }
};
const ACH = [['first', 'First bites', 'Score 10'], ['hungry', 'Hungry', 'Score 25'], ['speed', 'Speed demon', 'Reach level 5'], ['timelord', 'Time lord', '20+ in Time Attack']];

let CELL = 24, DPR = 1, alpha = 1, shake = 0, clock = 0, acc = 0, last = 0, lastFx = 0, deadAt = 0, actx;
let snake, prev, dir, queue, food, bonus, score, eaten, level, stepMs, combo, comboAt, timeLeft, nextBonusAt, slowUntil, shield;
let phase = 'idle';

const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
};
const jget = (k, d) => { try { return JSON.parse(store.get(k)) || d; } catch (e) { return d; } };
const jset = (k, v) => store.set(k, JSON.stringify(v));

let mode = MODES[store.get('snake.mode')] ? store.get('snake.mode') : 'classic';
let bests = jget('snake.best', {}), got = jget('snake.ach', {});
let muted = store.get('snake.mute') === '1';
const best = () => bests[mode] || 0;
const who = () => ($('who').value || '').trim().slice(0, 12) || 'Player';

// ── State ─────────────────────────────────────────────────────────────────
function init() {
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  prev = snake.map(s => ({ x: s.x, y: s.y }));
  dir = { x: 1, y: 0 }; queue = [];
  score = 0; eaten = 0; level = 1; combo = 1; comboAt = -1e9; clock = 0; acc = 0; alpha = 1;
  timeLeft = TIME_LIMIT; bonus = null; nextBonusAt = 7000; slowUntil = 0; shield = false; shake = 0;
  stepMs = BASE_MS; food = null;
  food = freeCell();
  hud(); fx();
}

function freeCell() {               // random free cell, so placement can never loop forever
  const free = [];
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++)
    if (!snake.some(s => s.x === x && s.y === y) && !(food && food.x === x && food.y === y) && !(bonus && bonus.x === x && bonus.y === y)) free.push({ x, y });
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function hud() {
  $('score').textContent = score; $('best').textContent = best(); $('level').textContent = level;
  $('time').textContent = Math.max(0, Math.ceil(timeLeft));
}

function fx() {                     // combo and power-up chips, rebuilt only when they change
  const c = [];
  if (combo > 1 && clock - comboAt < 3000) c.push(['x' + combo + ' combo', '#7dffa8']);
  if (shield) c.push(['🛡 Shield', '#a78bfa']);
  if (slowUntil > clock) c.push(['🐢 Slow ' + Math.ceil((slowUntil - clock) / 1000) + 's', '#5ce1ff']);
  const box = $('fx'), key = c.map(x => x[0]).join('|');
  if (box.dataset.k === key) return;
  box.dataset.k = key;
  box.replaceChildren(...c.map(([t, col]) => { const s = document.createElement('span'); s.textContent = t; s.style.color = s.style.borderColor = col; return s; }));
}

function setPhase(p, title, sub) {
  phase = p;
  $('overlay').hidden = p === 'running';
  if (title) { $('oTitle').textContent = title; $('oSub').textContent = sub || ''; }
  const menu = p === 'idle' || p === 'dead';
  $('modes').hidden = $('modeInfo').hidden = !menu;
  $('shareBtn').hidden = p !== 'dead';
  $('playBtn').textContent = p === 'paused' ? 'Resume' : p === 'dead' ? 'Play again' : 'Play';
  $('pauseBtn').textContent = p === 'paused' ? 'Resume' : 'Pause';
  $('pauseBtn').disabled = p !== 'running' && p !== 'paused';
}

function setMode(m) {
  mode = m; store.set('snake.mode', m);
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('modeInfo').textContent = MODES[m].info;
  $('timeBox').hidden = m !== 'time';
  $('lbMode').textContent = MODES[m].name;
  if (phase === 'idle' || phase === 'dead') hud();
  renderLB();
}

function start() { init(); setPhase('running'); sfx('start'); }
function togglePause() {
  if (phase === 'running') setPhase('paused', 'Paused', 'Take a breath. Your snake will wait.');
  else if (phase === 'paused') setPhase('running');
}
function play() {                   // Play button, Enter, or a first arrow press
  if (phase === 'paused') togglePause();
  else if (phase === 'idle' || (phase === 'dead' && performance.now() - deadAt > 400)) start();
}

// ── One game step ─────────────────────────────────────────────────────────
function useShield() { if (!shield) return false; shield = false; shake = 8; sfx('power'); fx(); return true; }

function tick() {
  if (queue.length) dir = queue.shift();
  prev = snake.map(s => ({ x: s.x, y: s.y }));
  let h = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  if (h.x < 0 || h.x >= COLS || h.y < 0 || h.y >= ROWS) {
    if (mode === 'walls' && !useShield()) return end('dead');
    h = { x: (h.x + COLS) % COLS, y: (h.y + ROWS) % ROWS };
  }
  const eating = h.x === food.x && h.y === food.y;
  const body = eating ? snake : snake.slice(0, -1);       // the tail cell is free when the snake moves on
  if (body.some(s => s.x === h.x && s.y === h.y) && !useShield()) return end('dead');
  snake.unshift(h);
  if (!eating) snake.pop();
  if (eating) eat(h);
  if (bonus && h.x === bonus.x && h.y === bonus.y) grab(h);
}

function eat(h) {
  combo = clock - comboAt < 3000 ? Math.min(4, combo + 1) : 1;   // eat again within 3s to build a combo
  comboAt = clock; score += combo; eaten++;
  level = 1 + Math.floor(eaten / PER_LEVEL);
  stepMs = Math.max(MIN_MS, BASE_MS - (level - 1) * 8);
  burst((h.x + 0.5) * CELL, (h.y + 0.5) * CELL);
  pop(h, '+' + combo + (combo > 1 ? ' x' + combo : ''), '#7dffa8');
  sfx('eat'); hud(); fx(); achieve();
  food = null; food = freeCell();
  if (!food) end('win');
}

function grab(h) {
  const t = bonus.type;
  bonus = null; nextBonusAt = clock + 8000 + Math.random() * 5000;
  burst((h.x + 0.5) * CELL, (h.y + 0.5) * CELL, '#ffd166'); sfx('power');
  if (t === 'gold') { score += 5 * combo; pop(h, '+' + 5 * combo, '#ffd166'); }
  else if (t === 'slow') { slowUntil = clock + 5000; pop(h, 'Slow-mo', '#5ce1ff'); }
  else { shield = true; pop(h, 'Shield', '#a78bfa'); }
  hud(); fx(); achieve();
}

function end(kind) {                // 'dead' | 'win' | 'time'
  const record = score > best();
  if (record) { bests[mode] = score; jset('snake.best', bests); }
  if (score > 0) {
    const lb = jget('snake.lb.' + mode, []);
    lb.push({ n: who(), s: score }); lb.sort((a, b) => b.s - a.s);
    jset('snake.lb.' + mode, lb.slice(0, 10));
  }
  deadAt = performance.now(); shake = kind === 'dead' ? 14 : 0;
  achieve(kind); hud(); renderLB();
  setPhase('dead', kind === 'win' ? 'You win' : kind === 'time' ? "Time's up" : 'Game over', 'Score ' + score + (record ? ' · New best!' : ''));
  sfx(kind === 'dead' ? 'die' : 'level');
}

// ── Update, loop ──────────────────────────────────────────────────────────
const step = () => slowUntil > clock ? stepMs * 1.8 : stepMs;

function update(dt) {
  if (!bonus && clock >= nextBonusAt) {
    const c = freeCell();
    if (c) bonus = { x: c.x, y: c.y, type: ['gold', 'slow', 'shield'][Math.floor(Math.random() * 3)], until: clock + 7000 };
  } else if (bonus && clock > bonus.until) { bonus = null; nextBonusAt = clock + 6000; }
  if (clock - lastFx > 200) { lastFx = clock; fx(); }
  if (mode === 'time') { timeLeft -= dt / 1000; $('time').textContent = Math.max(0, Math.ceil(timeLeft)); if (timeLeft <= 0) end('time'); }
}

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(100, t - last); last = t;
  if (phase === 'running') {
    clock += dt; update(dt); acc += dt;
    let s;
    while (phase === 'running' && acc >= (s = step())) { acc -= s; tick(); }
    alpha = phase === 'running' ? Math.min(1, acc / step()) : 1;
  } else if (phase !== 'paused') alpha = 1;
  draw(t, dt);
}

// ── Leaderboard, achievements, toasts, share ──────────────────────────────
function renderLB() {
  const lb = jget('snake.lb.' + mode, []), ol = $('lb');
  ol.replaceChildren(...(lb.length ? lb.map(r => {
    const li = document.createElement('li'), n = document.createElement('span'), s = document.createElement('b');
    n.textContent = r.n; s.textContent = r.s; li.append(n, s); return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty', textContent: 'No scores yet. Be the first.' })]));
}
function renderAch() {
  $('ach').replaceChildren(...ACH.map(a => {
    const li = document.createElement('li'); li.textContent = a[1]; li.title = a[2]; li.classList.toggle('on', !!got[a[0]]); return li;
  }));
}
function toast(text) {
  const d = document.createElement('div'); d.textContent = text; $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 3300);
}
function unlock(id) {
  if (got[id]) return;
  got[id] = 1; jset('snake.ach', got); toast('🏆 ' + ACH.find(a => a[0] === id)[1]); sfx('level'); renderAch();
}
function achieve(kind) {
  if (score >= 10) unlock('first');
  if (score >= 25) unlock('hungry');
  if (level >= 5) unlock('speed');
  if (kind === 'time' && score >= 20) unlock('timelord');
}
function share() {
  const t = 'I scored ' + score + ' in Snake Arena (' + MODES[mode].name + '). Can you beat me? ' + location.href.split('#')[0];
  if (navigator.share) { navigator.share({ text: t }).catch(() => { }); return; }
  navigator.clipboard.writeText(t).then(() => toast('Score copied to clipboard'), () => toast('Could not copy'));
}

// ── Sound (tiny synth, no files) ──────────────────────────────────────────
function sfx(kind) {
  if (muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    const [f1, f2, d, type] = {
      eat: [520, 880, 0.12, 'square'], die: [220, 70, 0.4, 'sawtooth'], start: [330, 440, 0.1, 'triangle'],
      power: [660, 1320, 0.18, 'triangle'], level: [440, 990, 0.25, 'square']
    }[kind];
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d);
  } catch (e) { }
}

// ── Resize: crisp on high-DPI screens, fits the space left on screen ──────
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  const h = sel => document.querySelector(sel).offsetHeight;
  const used = h('.bar') + h('.hud') + h('.fx') + h('.dpad') + h('.hint') + 90;
  const avail = Math.min(innerWidth - 24 - (innerWidth > 900 ? 324 : 0), innerHeight - used, 640);
  CELL = Math.max(8, Math.floor(avail / COLS));
  const S = CELL * COLS;
  canvas.width = S * DPR; canvas.height = S * DPR;
  canvas.style.width = canvas.style.height = S + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  document.documentElement.style.setProperty('--w', S + 'px');
}

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'running') togglePause(); });
init();
setPhase('idle', 'Snake Arena', 'Eat, grow, and do not bite your tail.');
setMode(mode); renderAch(); resize();
requestAnimationFrame(loop);