// input.js — keyboard, swipe, D-pad and button listeners
// Uses globals from game.js (loaded before this file)

const KEYS = {
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0]
};

function turn(dx, dy) {
  if (phase !== 'running') { play(); if (phase !== 'running') return; }
  const ref = queue.length ? queue[queue.length - 1] : dir;   // compare with the last queued turn
  if ((dx === ref.x && dy === ref.y) || (dx === -ref.x && dy === -ref.y) || queue.length >= 2) return;
  queue.push({ x: dx, y: dy });
}

// Keyboard
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;   // let the name box work normally
  const k = e.key.toLowerCase();
  const onButton = e.target.closest && e.target.closest('button');
  if (KEYS[k]) { e.preventDefault(); turn(KEYS[k][0], KEYS[k][1]); }
  else if (k === 'p' || k === 'escape' || (k === ' ' && !onButton)) {
    e.preventDefault();
    if (phase === 'running' || phase === 'paused') togglePause(); else play();
  } else if (k === 'enter' && !onButton) play();
});

// Swipe (touch, pen or mouse drag): turns as soon as the finger has moved far enough
let origin = null;
canvas.addEventListener('pointerdown', e => { origin = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!origin) return;
  const dx = e.clientX - origin.x, dy = e.clientY - origin.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0); else turn(0, dy > 0 ? 1 : -1);
  origin = { x: e.clientX, y: e.clientY };
});
['pointerup', 'pointercancel'].forEach(ev => canvas.addEventListener(ev, () => { origin = null; }));

// D-pad (shown on touch screens)
const DPAD = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
document.querySelectorAll('.dpad button').forEach(b =>
  b.addEventListener('pointerdown', e => { e.preventDefault(); turn(DPAD[b.dataset.d][0], DPAD[b.dataset.d][1]); }));

// Buttons, mode picker, player name
function syncSound() {
  $('soundBtn').textContent = 'Sound ' + (muted ? 'off' : 'on');
  $('soundBtn').setAttribute('aria-pressed', String(!muted));
}
$('playBtn').addEventListener('click', play);
$('pauseBtn').addEventListener('click', togglePause);
$('shareBtn').addEventListener('click', share);
$('soundBtn').addEventListener('click', () => { muted = !muted; store.set('snake.mute', muted ? '1' : '0'); syncSound(); });
document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('who').value = store.get('snake.name') || '';
$('who').addEventListener('input', () => store.set('snake.name', $('who').value.trim().slice(0, 12)));
syncSound();