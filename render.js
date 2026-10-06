// render.js — canvas setup and all drawing
// Reads globals from game.js at draw time: CELL, COLS, ROWS, snake, prev, alpha, dir, food, bonus, phase, mode, timeLeft, clock, shake

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const BONUS = { gold: ['#ffd166', '⭐'], slow: ['#5ce1ff', '🐢'], shield: ['#a78bfa', '🛡️'] };
let particles = [], pops = [];

function burst(x, y, col) {
  if (calm) return;
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, v = 50 + Math.random() * 110;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col: col || '#ff5c7a' });
  }
}
function pop(c, text, col) { pops.push({ x: (c.x + 0.5) * CELL, y: (c.y + 0.5) * CELL, text, col, life: 1 }); }

function segment(x, y, color) {
  const pad = Math.max(1, CELL * 0.07);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x * CELL + pad, y * CELL + pad, CELL - pad * 2, CELL - pad * 2, CELL * 0.32);
  ctx.fill();
}

function drawFood(t) {
  const fx = (food.x + 0.5) * CELL, fy = (food.y + 0.5) * CELL;
  const pulse = calm ? 1 : 1 + Math.sin(t / 200) * 0.1;
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, CELL * 1.2);
  glow.addColorStop(0, 'rgba(255,92,122,0.4)'); glow.addColorStop(1, 'rgba(255,92,122,0)');
  ctx.fillStyle = glow; ctx.fillRect(fx - CELL * 1.2, fy - CELL * 1.2, CELL * 2.4, CELL * 2.4);
  ctx.fillStyle = '#ff5c7a';
  ctx.beginPath(); ctx.arc(fx, fy, CELL * 0.3 * pulse, 0, TAU); ctx.fill();
}

function drawBonus(t) {
  if (!bonus) return;
  if (bonus.until - clock < 2000 && Math.floor(t / 150) % 2) return;   // blink before it disappears
  const [col, icon] = BONUS[bonus.type], x = (bonus.x + 0.5) * CELL, y = (bonus.y + 0.5) * CELL;
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, CELL * 0.42 * (calm ? 1 : 1 + Math.sin(t / 160) * 0.07), 0, TAU); ctx.stroke();
  ctx.font = CELL * 0.62 + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icon, x, y + 1);
}

function drawSnake() {
  const n = snake.length, dead = phase === 'dead';
  const pts = snake.map((s, i) => {                       // glide from the previous cell to the current one
    const f = prev[i] || prev[prev.length - 1] || s;
    const jump = Math.abs(s.x - f.x) > 1 || Math.abs(s.y - f.y) > 1;   // wrapped around the edge
    return jump ? s : { x: f.x + (s.x - f.x) * alpha, y: f.y + (s.y - f.y) * alpha };
  });
  for (let i = n - 1; i >= 0; i--) {                       // tail first, head on top
    if (i === 0 && !dead) { ctx.shadowColor = '#56ef83'; ctx.shadowBlur = CELL * 0.9; }
    segment(pts[i].x, pts[i].y, 'hsl(145,' + (dead ? 8 : 68) + '%,' + (36 + 26 * (1 - i / n)) + '%)');
    ctx.shadowBlur = 0;
  }
  const hx = (pts[0].x + 0.5) * CELL, hy = (pts[0].y + 0.5) * CELL, px = -dir.y, py = dir.x;
  [-1, 1].forEach(side => {
    const ex = hx + dir.x * CELL * 0.16 + px * side * CELL * 0.2, ey = hy + dir.y * CELL * 0.16 + py * side * CELL * 0.2;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, CELL * 0.11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0b0e1f'; ctx.beginPath(); ctx.arc(ex + dir.x * CELL * 0.04, ey + dir.y * CELL * 0.04, CELL * 0.055, 0, TAU); ctx.fill();
  });
}

function drawEffects(dt) {
  const s = dt / 1000;
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx * s; p.y += p.vy * s; p.life -= s * 2.2;
    ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, CELL * 0.1, 0, TAU); ctx.fill();
  });
  ctx.globalAlpha = 1;
  pops = pops.filter(p => p.life > 0);
  ctx.font = 'bold ' + CELL * 0.7 + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pops.forEach(p => {
    p.y -= 28 * s; p.life -= s * 1.2;
    ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y);
  });
  ctx.globalAlpha = 1;
}

function draw(t, dt) {
  const S = CELL * COLS;
  ctx.save();
  if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = calm ? 0 : Math.max(0, shake - dt * 0.03); }
  ctx.fillStyle = '#10142b'; ctx.fillRect(-20, -20, S + 40, S + 40);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
    ctx.beginPath(); ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * 0.05, 0, TAU); ctx.fill();
  }
  if (mode === 'walls') { ctx.strokeStyle = 'rgba(255,92,122,0.7)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, S - 3, S - 3); }
  if (mode === 'time') { ctx.fillStyle = '#5ce1ff'; ctx.fillRect(0, 0, S * Math.max(0, timeLeft) / 60, 3); }
  drawFood(t); drawBonus(t); drawSnake(); drawEffects(dt);
  ctx.restore();
}