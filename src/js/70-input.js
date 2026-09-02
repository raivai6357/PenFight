/* ══════════════════════════════════════════════════════════════════════
   INPUT
   ══════════════════════════════════════════════════════════════════════ */
/* whose hands are on the controls right now */
function myTurn() {
  if (G.mode === "cpu") return G.turn === 0;
  if (G.mode === "net") return G.turn === NET.role;
  return true;
}

function hitPen(pen, x, y, slop) {
  slop = slop || 20;
  const dx = x - pen.x, dy = y - pen.y;
  const ca = Math.cos(-pen.a), sa = Math.sin(-pen.a);
  const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
  const span = pen.len / 2 - pen.rad;
  if (Math.abs(ly) > pen.rad + slop) return null;
  if (Math.abs(lx) > span + pen.rad + slop) return null;
  return clamp(lx / span, -1, 1);
}

/* a finger is a finger: the grab slop is a constant ~26 CSS px regardless
   of how far the canvas is zoomed, or a pen on a phone screen is too small
   to grab at all. (One logical unit draws as view.s/dpr CSS px.) */
function touchSlop() {
  const dpr = window.devicePixelRatio || 1;
  return clamp(26 * dpr / view.s, 20, 110);
}

cv.addEventListener("pointerdown", (ev) => {
  if (G.phase !== "aim" || !G.W) return;
  if (!myTurn()) return;
  const p = toLogical(ev);
  const pen = G.W.pens[G.turn];
  const t = hitPen(pen, p.x, p.y, touchSlop());
  if (t === null) return;
  if (G.tutor) tutorDone();   // they found the grab — the demo can stop
  cv.setPointerCapture(ev.pointerId);
  cv.focus({ preventScroll: true });
  audio();
  const S = G.shot;
  S.on = true; S.kb = false; S.grabT = t; S.power = 0;
  const ox = t * (pen.len / 2 - pen.rad);
  S.ax = pen.x + ox * Math.cos(pen.a);
  S.ay = pen.y + ox * Math.sin(pen.a);
  ev.preventDefault();
});

cv.addEventListener("pointermove", (ev) => {
  const S = G.shot;
  if (!S.on) return;
  const p = toLogical(ev);
  const dx = p.x - S.ax, dy = p.y - S.ay;
  const d = Math.hypot(dx, dy);
  if (d < 4) { S.power = 0; return; }
  S.angle = Math.atan2(-dy, -dx);
  S.power = clamp(d / MAXDRAG, 0, 1);
});

function endDrag(ev) {
  const S = G.shot;
  if (!S.on) return;
  if (G.phase === "aim" && S.power >= 0.06) fireShot();
  else { S.on = false; S.power = 0.62; }
  if (ev && cv.hasPointerCapture && ev.pointerId != null && cv.hasPointerCapture(ev.pointerId)) {
    cv.releasePointerCapture(ev.pointerId);
  }
}
cv.addEventListener("pointerup", endDrag);
cv.addEventListener("pointercancel", endDrag);
/* a long-press on a touch screen must not pop up a context menu mid-aim */
cv.addEventListener("contextmenu", (ev) => ev.preventDefault());

cv.addEventListener("keydown", (ev) => {
  if (G.phase !== "aim") return;
  if (!myTurn()) return;
  const S = G.shot;
  const fine = ev.shiftKey ? 0.25 : 1;
  let used = true;
  switch (ev.key) {
    case "ArrowLeft":  S.angle -= 0.05 * fine; S.kb = true; break;
    case "ArrowRight": S.angle += 0.05 * fine; S.kb = true; break;
    case "ArrowUp":    S.power = clamp(S.power + 0.05 * fine, 0, 1); S.kb = true; break;
    case "ArrowDown":  S.power = clamp(S.power - 0.05 * fine, 0, 1); S.kb = true; break;
    case "a": case "A": S.grabT = clamp(S.grabT - 0.1, -1, 1); S.kb = true; break;
    case "d": case "D": S.grabT = clamp(S.grabT + 0.1, -1, 1); S.kb = true; break;
    case " ": case "Enter": audio(); fireShot(); break;
    default: used = false;
  }
  if (used) ev.preventDefault();
});
