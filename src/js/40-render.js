/* ══════════════════════════════════════════════════════════════════════
   CANVAS + VIEW
   ══════════════════════════════════════════════════════════════════════ */
const CW = 1000, CH = 640;
const cv = document.getElementById("desk");
const ctx = cv.getContext("2d");
let view = { s: 1, ox: 0, oy: 0 };

function fitCanvas() {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  const s = Math.min(cv.width / CW, cv.height / CH);
  view = { s, ox: (cv.width - CW * s) / 2, oy: (cv.height - CH * s) / 2 };
}
function toLogical(ev) {
  const r = cv.getBoundingClientRect();
  const dpr = cv.width / r.width;
  return {
    x: ((ev.clientX - r.left) * dpr - view.ox) / view.s,
    y: ((ev.clientY - r.top) * dpr - view.oy) / view.s
  };
}
new ResizeObserver(fitCanvas).observe(cv);

/* ══════════════════════════════════════════════════════════════════════
   SURFACES — painted once into an offscreen canvas
   ══════════════════════════════════════════════════════════════════════ */
let surf = null, surfKey = "";
function buildSurface(desk) {
  const A = desk.arena;
  const c = document.createElement("canvas");
  c.width = Math.ceil(A.w); c.height = Math.ceil(A.h);
  const g = c.getContext("2d");
  const W = c.width, H = c.height;

  if (desk.id === "wood") {
    const base = g.createLinearGradient(0, 0, W * 0.8, H);
    base.addColorStop(0, "#8a5c33");
    base.addColorStop(0.45, "#7a4f2b");
    base.addColorStop(1, "#5f3c20");
    g.fillStyle = base; g.fillRect(0, 0, W, H);

    // grain: long wavering strokes, denser where the lamp is dim
    for (let i = 0; i < 300; i++) {
      const y = Math.random() * H;
      const dark = Math.random() < 0.62;
      g.beginPath();
      g.moveTo(-10, y);
      let yy = y;
      for (let x = 0; x < W + 30; x += 44) {
        yy += rnd(-2.6, 2.6);
        g.quadraticCurveTo(x + 22, yy + rnd(-3, 3), x + 44, yy);
      }
      g.strokeStyle = dark
        ? `rgba(48,28,12,${rnd(0.05, 0.2)})`
        : `rgba(206,158,105,${rnd(0.03, 0.11)})`;
      g.lineWidth = rnd(0.6, 2.6);
      g.stroke();
    }
    // a couple of knots
    for (let k = 0; k < 3; k++) {
      const kx = rnd(W * 0.1, W * 0.9), ky = rnd(H * 0.1, H * 0.9);
      for (let r = 26; r > 2; r -= 3.4) {
        g.beginPath();
        g.ellipse(kx, ky, r, r * rnd(0.42, 0.6), rnd(-0.5, 0.5), 0, TAU);
        g.strokeStyle = `rgba(46,26,11,${0.055 + (26 - r) * 0.005})`;
        g.lineWidth = rnd(0.8, 2);
        g.stroke();
      }
    }
    // ring stains + a stray pencil mark: desks have history
    g.strokeStyle = "rgba(38,22,10,.13)"; g.lineWidth = 5;
    g.beginPath(); g.ellipse(W * 0.79, H * 0.22, 34, 20, 0.2, 0, TAU); g.stroke();

  } else if (desk.id === "glass") {
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#243440");
    base.addColorStop(0.5, "#1d2a34");
    base.addColorStop(1, "#283b46");
    g.fillStyle = base; g.fillRect(0, 0, W, H);

    // a window's worth of reflection, skewed across the pane
    g.save();
    g.translate(W * 0.14, -H * 0.1);
    g.transform(1, 0.34, 0, 1, 0, 0);
    const win = g.createLinearGradient(0, 0, W * 0.42, H * 0.7);
    win.addColorStop(0, "rgba(196,226,240,.11)");
    win.addColorStop(1, "rgba(196,226,240,0)");
    g.fillStyle = win;
    g.fillRect(0, 0, W * 0.34, H * 0.78);
    g.fillRect(W * 0.4, 0, W * 0.2, H * 0.62);
    g.restore();

    // specular sweep
    const sp = g.createLinearGradient(0, H, W, 0);
    sp.addColorStop(0.3, "rgba(255,255,255,0)");
    sp.addColorStop(0.52, "rgba(255,255,255,.07)");
    sp.addColorStop(0.6, "rgba(255,255,255,0)");
    g.fillStyle = sp; g.fillRect(0, 0, W, H);

    for (let i = 0; i < 2; i++) {
      g.save();
      g.strokeStyle = `rgba(226,244,255,${0.1 - i * 0.045})`;
      g.lineWidth = 1.4 + i * 5;
      g.beginPath();
      g.moveTo(W * (0.06 + i * 0.5), H);
      g.lineTo(W * (0.4 + i * 0.5), -20);
      g.stroke();
      g.restore();
    }
    // faint smudges
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      g.ellipse(Math.random() * W, Math.random() * H, rnd(8, 30), rnd(5, 16), rnd(0, TAU), 0, TAU);
      g.fillStyle = `rgba(220,238,248,${rnd(0.006, 0.02)})`;
      g.fill();
    }

  } else {
    const base = g.createLinearGradient(0, 0, W * 0.3, H);
    base.addColorStop(0, "#5d6f70");
    base.addColorStop(0.6, "#4e5f61");
    base.addColorStop(1, "#425254");
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    // moulded speckle
    for (let i = 0; i < 3400; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(20,28,28,.16)" : "rgba(190,208,206,.13)";
      g.fillRect(Math.random() * W, Math.random() * H, rnd(1, 2.4), rnd(1, 2.4));
    }
    // shallow moulded trough around the rim
    g.strokeStyle = "rgba(16,24,24,.2)"; g.lineWidth = 12;
    g.strokeRect(15, 15, W - 30, H - 30);
    g.strokeStyle = "rgba(198,216,214,.1)"; g.lineWidth = 2;
    g.strokeRect(22, 22, W - 44, H - 44);
    // wells for cutlery, purely decorative
    g.strokeStyle = "rgba(16,24,24,.14)"; g.lineWidth = 8;
    roundRectPath(g, W * 0.36, H * 0.34, W * 0.28, H * 0.32, 16); g.stroke();
  }

  // lamp from the upper left, then a vignette to sink the far edge
  const lamp = g.createRadialGradient(W * 0.24, -H * 0.14, 10, W * 0.24, -H * 0.14, H * 1.7);
  lamp.addColorStop(0, "rgba(255,231,168,.2)");
  lamp.addColorStop(0.45, "rgba(255,231,168,.05)");
  lamp.addColorStop(1, "rgba(255,231,168,0)");
  g.fillStyle = lamp; g.fillRect(0, 0, W, H);

  const vig = g.createRadialGradient(W * 0.4, H * 0.34, Math.min(W, H) * 0.22, W * 0.5, H * 0.5, Math.max(W, H) * 0.82);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,.42)");
  g.fillStyle = vig; g.fillRect(0, 0, W, H);

  surf = c; surfKey = desk.id;
}
function roundRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ══════════════════════════════════════════════════════════════════════
   PEN ART — one silhouette per model, hue supplied by the player
   ══════════════════════════════════════════════════════════════════════ */
function penShape(g, L, R, style) {
  const h = R;
  if (style === "quill") {
    g.beginPath();
    g.moveTo(-L / 2, 0);
    g.quadraticCurveTo(-L * 0.1, -h * 2.5, L * 0.34, -h * 0.85);
    g.lineTo(L / 2, -h * 0.3);
    g.lineTo(L / 2, h * 0.3);
    g.lineTo(L * 0.34, h * 0.85);
    g.quadraticCurveTo(-L * 0.1, h * 2.5, -L / 2, 0);
    g.closePath();
    return;
  }
  const tip = style === "fountain" ? L * 0.16 : L * 0.13;
  g.beginPath();
  g.moveTo(L / 2, 0);
  g.lineTo(L / 2 - tip, -h);
  g.lineTo(-L / 2 + h * 0.7, -h);
  g.quadraticCurveTo(-L / 2, -h, -L / 2, 0);
  g.quadraticCurveTo(-L / 2, h, -L / 2 + h * 0.7, h);
  g.lineTo(L / 2 - tip, h);
  g.closePath();
}

function drawPenBody(g, model, hue, deep) {
  const L = model.len, R = model.rad, st = model.style;

  penShape(g, L, R, st);
  const grad = g.createLinearGradient(0, -R, 0, R);
  grad.addColorStop(0, mix(hue, "#ffffff", st === "gel" ? 0.5 : 0.34));
  grad.addColorStop(0.42, hue);
  grad.addColorStop(1, deep);
  g.fillStyle = grad; g.fill();
  g.strokeStyle = "rgba(0,0,0,.42)"; g.lineWidth = 1; g.stroke();

  // top-light highlight, common to every model
  g.save();
  g.beginPath();
  g.roundRect(-L / 2 + R * 0.5, -R * 0.78, L - R * 2.1, R * 0.5, R * 0.25);
  g.fillStyle = "rgba(255,255,255,.3)"; g.fill();
  g.restore();

  if (st === "bic") {
    g.fillStyle = "rgba(20,20,26,.92)";
    g.beginPath(); g.roundRect(-L / 2, -R, L * 0.13, R * 2, R * 0.6); g.fill();  // cap
    g.beginPath(); g.roundRect(-L / 2 + 2, -R - 2.6, L * 0.3, 2.8, 1.4); g.fill(); // clip
    g.fillStyle = "#c9a227";
    g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L / 2 - L * 0.13, -R * 0.82); g.lineTo(L / 2 - L * 0.13, R * 0.82); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 0.7;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-L * 0.3, i * R * 0.5); g.lineTo(L * 0.3, i * R * 0.5); g.stroke(); }

  } else if (st === "fountain") {
    g.fillStyle = "#1b1d24";
    g.beginPath(); g.roundRect(-L / 2, -R, L * 0.4, R * 2, R * 0.8); g.fill();
    g.fillStyle = "#d9b154";
    g.beginPath(); g.roundRect(-L * 0.1, -R, L * 0.05, R * 2, 1); g.fill();
    g.beginPath(); g.roundRect(-L * 0.02, -R, L * 0.03, R * 2, 1); g.fill();
    g.beginPath(); g.roundRect(-L / 2 + 2.5, -R - 3, L * 0.3, 3, 1.5); g.fill(); // gold clip
    g.fillStyle = "#e0c274";
    g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L * 0.32, -R * 0.9); g.lineTo(L * 0.32, R * 0.9); g.closePath(); g.fill();
    g.strokeStyle = "rgba(40,30,10,.8)"; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L * 0.34, 0); g.stroke();

  } else if (st === "pencil") {
    g.fillStyle = "#2a2d36";
    g.beginPath(); g.roundRect(L / 2 - L * 0.16, -R * 0.75, L * 0.16, R * 1.5, 1); g.fill();
    g.fillStyle = "#b9bfcc";
    g.beginPath(); g.roundRect(L * 0.18, -R, L * 0.1, R * 2, 1); g.fill();  // clutch band
    g.beginPath(); g.roundRect(-L / 2 + 1.5, -R - 2.4, L * 0.26, 2.6, 1.3); g.fill();
    g.fillStyle = "#e59aa4";
    g.beginPath(); g.roundRect(-L / 2 - 1, -R * 0.75, 4.5, R * 1.5, 1.6); g.fill(); // eraser nub

  } else if (st === "gel") {
    g.fillStyle = "rgba(24,26,34,.9)";
    g.beginPath(); g.roundRect(L * 0.06, -R * 1.06, L * 0.3, R * 2.12, R * 0.7); g.fill();
    g.fillStyle = "rgba(255,255,255,.22)";
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(L * (0.1 + i * 0.055), 0, 1.1, 0, TAU); g.fill(); }
    g.fillStyle = "#e9e2c8";
    g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L * 0.38, -R * 0.7); g.lineTo(L * 0.38, R * 0.7); g.closePath(); g.fill();
    g.save();
    g.globalCompositeOperation = "lighter";
    g.shadowColor = hue; g.shadowBlur = 12;
    penShape(g, L, R, st);
    g.strokeStyle = mix(hue, "#ffffff", 0.4); g.lineWidth = 1.1; g.stroke();
    g.restore();

  } else if (st === "quill") {
    // barbs
    g.save();
    g.strokeStyle = "rgba(255,255,255,.2)"; g.lineWidth = 0.7;
    for (let i = 0; i < 16; i++) {
      const t = i / 15, x = lerp(-L / 2, L * 0.34, t);
      const sp = Math.sin(t * Math.PI) * R * 2.3;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 5, -sp); g.stroke();
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 5, sp); g.stroke();
    }
    g.restore();
    g.strokeStyle = deep; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L * 0.42, 0); g.stroke();
    g.fillStyle = "#1c1e26";
    g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L * 0.36, -R * 0.8); g.lineTo(L * 0.36, R * 0.8); g.closePath(); g.fill();
  }
}

function mix(a, b, t) {
  const pa = hx(a), pb = hx(b);
  return `rgb(${Math.round(lerp(pa[0], pb[0], t))},${Math.round(lerp(pa[1], pb[1], t))},${Math.round(lerp(pa[2], pb[2], t))})`;
}
function hx(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ══════════════════════════════════════════════════════════════════════
   OBSTACLE ART
   ══════════════════════════════════════════════════════════════════════ */
function drawClutter(g, b) {
  if (b.kind === "paper") {
    g.beginPath();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const r = 14 * (0.74 + ((i * 37) % 11) / 24);
      const x = Math.cos(t) * r, y = Math.sin(t) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    const gr = g.createLinearGradient(-12, -12, 10, 12);
    gr.addColorStop(0, "#efe9da"); gr.addColorStop(1, "#b9b2a1");
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(60,54,42,.45)"; g.lineWidth = 0.8; g.stroke();
    g.strokeStyle = "rgba(90,84,70,.4)"; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(-8, -3); g.lineTo(2, 4); g.lineTo(9, -5); g.stroke();

  } else if (b.kind === "eraser") {
    g.beginPath(); g.roundRect(-17.5, -8.5, 35, 17, 3);
    const gr = g.createLinearGradient(0, -8, 0, 9);
    gr.addColorStop(0, "#f0aeb6"); gr.addColorStop(1, "#c07d87");
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(70,40,45,.45)"; g.lineWidth = 0.9; g.stroke();
    g.fillStyle = "rgba(255,255,255,.42)";
    g.beginPath(); g.roundRect(-14, -6.5, 28, 3.4, 1.7); g.fill();
    g.fillStyle = "rgba(60,64,120,.6)";
    g.beginPath(); g.roundRect(-6, -3, 12, 6, 1); g.fill();

  } else if (b.kind === "stub") {
    g.beginPath(); g.roundRect(-20, -4.6, 34, 9.2, 1.4);
    const gr = g.createLinearGradient(0, -5, 0, 5);
    gr.addColorStop(0, "#e6b23c"); gr.addColorStop(1, "#a97b1c");
    g.fillStyle = gr; g.fill();
    g.fillStyle = "#d8c7a6";
    g.beginPath(); g.moveTo(14, -4.6); g.lineTo(20.5, 0); g.lineTo(14, 4.6); g.closePath(); g.fill();
    g.fillStyle = "#26262c";
    g.beginPath(); g.moveTo(18.4, -1.6); g.lineTo(20.5, 0); g.lineTo(18.4, 1.6); g.closePath(); g.fill();
    g.strokeStyle = "rgba(60,42,10,.5)"; g.lineWidth = 0.8;
    g.beginPath(); g.roundRect(-20, -4.6, 34, 9.2, 1.4); g.stroke();

  } else {
    g.beginPath(); g.roundRect(-11.5, -5, 23, 10, 4);
    g.fillStyle = "#3b4050"; g.fill();
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 0.9; g.stroke();
    g.fillStyle = "rgba(255,255,255,.18)";
    g.beginPath(); g.roundRect(-8, -3.4, 16, 2.4, 1.2); g.fill();
  }
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════════ */
function draw() {
  const W = G.W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#101219";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);

  // the room behind the desk
  const room = ctx.createLinearGradient(0, 0, 0, CH);
  room.addColorStop(0, "#171a23");
  room.addColorStop(0.7, "#0f1117");
  room.addColorStop(1, "#0a0c11");
  ctx.fillStyle = room; ctx.fillRect(0, 0, CW, CH);

  if (!W) {
    drawIdleDesk();
    drawToss();   // the very first match is tossed before any world exists
    return;
  }

  if (G.shake > 0.01 && !reduceMotion) {
    ctx.translate(rnd(-1, 1) * G.shake * 5, rnd(-1, 1) * G.shake * 5);
  }

  const A = W.arena, desk = W.desk;
  const front = desk.id === "tray" ? 16 : 26;

  // cast shadow under the slab
  ctx.save();
  const sh = ctx.createLinearGradient(0, A.y + A.h, 0, A.y + A.h + front + 46);
  sh.addColorStop(0, "rgba(0,0,0,.6)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(A.x - 22, A.y + A.h, A.w + 44, front + 46);
  ctx.restore();

  // front bevel — sells the slab as a physical object seen slightly from above
  ctx.fillStyle = desk.id === "wood" ? "#3f2917" : desk.id === "glass" ? "#16222a" : "#2f3c3e";
  roundRectPath(ctx, A.x, A.y + A.h - 6, A.w, front + 6, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.055)";
  ctx.fillRect(A.x, A.y + A.h - 1, A.w, 2);

  // the surface
  if (surfKey !== desk.id || !surf) buildSurface(desk);
  ctx.save();
  roundRectPath(ctx, A.x, A.y, A.w, A.h, 4);
  ctx.clip();
  ctx.drawImage(surf, A.x, A.y);
  ctx.restore();

  // rim
  ctx.strokeStyle = desk.id === "glass" ? "rgba(198,230,246,.4)" : "rgba(255,255,255,.11)";
  ctx.lineWidth = 1.4;
  roundRectPath(ctx, A.x + 0.7, A.y + 0.7, A.w - 1.4, A.h - 1.4, 4);
  ctx.stroke();

  if (desk.lip) drawLip(A, desk);

  // shadows, then bodies
  for (const b of W.bodies) if (!b.stat) drawShadow(b);
  for (const b of W.bodies) if (!b.stat) drawTrail(b);
  for (const b of W.bodies) if (!b.stat) drawBody(b);

  drawSparks();
  if (G.phase === "aim" || G.phase === "cpu") drawAim();
  drawTutor();
  drawToss();
  drawBanner();
  ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
}

function drawIdleDesk() {
  const d = deskById(G.deskId), A = d.arena;
  if (surfKey !== d.id || !surf) buildSurface(d);
  ctx.save();
  roundRectPath(ctx, A.x, A.y, A.w, A.h, 4);
  ctx.clip();
  ctx.drawImage(surf, A.x, A.y);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,.1)"; ctx.lineWidth = 1.4;
  roundRectPath(ctx, A.x + .7, A.y + .7, A.w - 1.4, A.h - 1.4, 4); ctx.stroke();
  if (d.lip) drawLip(A, d);
}

function drawLip(A, desk) {
  const g = desk.gap || 78, r = desk.rail || 9;
  // each desk's edge wears its own material
  const col = desk.id === "wood"  ? ["#8a6a42", "#5d452a", "rgba(236,206,158,.3)"]
            : desk.id === "glass" ? ["#a9c3d4", "#5d7686", "rgba(232,248,255,.32)"]
            :                       ["#6d8081", "#4a5b5d", "rgba(210,228,226,.24)"];
  const rails = [
    [A.x + g, A.y, A.x + A.w - g, A.y],
    [A.x + g, A.y + A.h, A.x + A.w - g, A.y + A.h],
    [A.x, A.y + g, A.x, A.y + A.h - g],
    [A.x + A.w, A.y + g, A.x + A.w, A.y + A.h - g]
  ];
  for (const [ax, ay, bx, by] of rails) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(10,16,16,.5)"; ctx.lineWidth = r * 2 + 4;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    const grd = ctx.createLinearGradient(ax, ay - r, bx, by + r);
    grd.addColorStop(0, col[0]); grd.addColorStop(1, col[1]);
    ctx.strokeStyle = grd; ctx.lineWidth = r * 2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = col[2]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay - r * 0.45); ctx.lineTo(bx, by - r * 0.45); ctx.stroke();
    ctx.restore();
  }
}

function drawShadow(b) {
  if (b.fall > 0.55) return;
  const k = b.fall > 0 ? 1 - b.fall / 0.55 : 1;
  ctx.save();
  ctx.translate(b.x + 7, b.y + 10);
  ctx.rotate(b.a);
  ctx.globalAlpha = 0.3 * k;
  ctx.fillStyle = "#000";
  if (b.tag === "pen") { penShape(ctx, b.len * 1.02, b.rad * 1.15, b.model.style); ctx.fill(); }
  else { ctx.beginPath(); ctx.ellipse(0, 0, b.brad * 1.15, b.brad * 0.85, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawTrail(b) {
  if (b.trail.length < 2) return;
  const hue = b.tag === "pen" ? HUES[b.owner] : "#8f96ac";
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (let i = 1; i < b.trail.length; i++) {
    const p = b.trail[i - 1], q = b.trail[i];
    const t = i / b.trail.length;
    ctx.globalAlpha = q.life * t * 0.55;
    ctx.strokeStyle = hue;
    ctx.lineWidth = lerp(0.6, b.tag === "pen" ? 4.4 : 3, t);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.restore();
}

function drawBody(b) {
  ctx.save();
  if (b.fall > 0) {
    const f = b.fall;
    ctx.globalAlpha = clamp(1 - f * 1.05, 0, 1);
    ctx.translate(b.x, b.y + f * f * 190);
    ctx.rotate(b.a);
    const s = clamp(1 - f * 0.55, 0.1, 1);
    ctx.scale(s, s);
  } else {
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
  }

  if (b.tag === "pen") {
    const own = b.owner;
    // the active pen wears a soft ring of its own ink
    if (G.phase === "aim" && own === G.turn && b.alive) {
      ctx.save();
      ctx.rotate(-b.a);
      const pulse = 0.55 + Math.sin(performance.now() / 380) * 0.2;
      ctx.strokeStyle = HUES[own];
      ctx.globalAlpha = pulse * 0.55;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 0, b.len * 0.62, b.rad * 4.4, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (b.glow > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = HUES[own]; ctx.shadowBlur = 22 * b.glow;
      penShape(ctx, b.len, b.rad, b.model.style);
      ctx.fillStyle = `rgba(255,255,255,${0.1 * b.glow})`; ctx.fill();
      ctx.restore();
    }
    drawPenBody(ctx, b.model, HUES[own], HUES_DEEP[own]);
  } else {
    drawClutter(ctx, b);
  }
  ctx.restore();
}

/* the aim overlay: rubber band, honest stopping-distance dots, power arc */
function drawAim() {
  const S = G.shot, W = G.W;
  const pen = W.pens[G.turn];
  if (!pen || !pen.alive) return;
  if (!S.on && !S.kb && G.phase !== "cpu") return;
  if (G.phase === "cpu" && !S.kb && !S.on) return;

  const hue = HUES[G.turn];
  const ox = S.grabT * (pen.len / 2 - pen.rad);
  const gx = pen.x + ox * Math.cos(pen.a);
  const gy = pen.y + ox * Math.sin(pen.a);
  const pull = S.power * MAXDRAG;
  const bx = gx - Math.cos(S.angle) * pull;
  const by = gy - Math.sin(S.angle) * pull;

  ctx.save();

  // band being pulled back
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(236,232,222,.3)";
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(bx, by); ctx.stroke();
  ctx.fillStyle = "rgba(236,232,222,.55)";
  ctx.beginPath(); ctx.arc(bx, by, 3.4, 0, TAU); ctx.fill();

  // predicted path, spaced by the real friction model
  const mu = W.mu * pen.grip;
  let v = (S.power * MAXJ) * pen.im;
  const dec = mu * GACC;
  let px = gx, py = gy;
  const cs = Math.cos(S.angle), sn = Math.sin(S.angle);
  let t = 0, i = 0;
  const A = W.arena;
  ctx.fillStyle = hue;
  while (v > 30 && t < 3 && i < 220) {
    const dt = 1 / 60;
    px += cs * v * dt; py += sn * v * dt;
    v = Math.max(0, v - dec * dt) * (1 - 0.16 * dt);   // match surfaceFriction exactly
    t += dt; i++;
    if (i % 4 === 0) {
      const inside = px > A.x && px < A.x + A.w && py > A.y && py < A.y + A.h;
      ctx.globalAlpha = inside ? clamp(0.5 - i / 500, 0.1, 0.5) : 0.85;
      const r = inside ? 2 : 2.8;
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
      if (!inside) break;
    }
  }
  ctx.globalAlpha = 1;

  // where it comes to rest (or leaves)
  ctx.strokeStyle = hue; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px - 11, py); ctx.lineTo(px - 4, py);
  ctx.moveTo(px + 4, py); ctx.lineTo(px + 11, py);
  ctx.stroke();

  // power arc around the grab point
  ctx.lineWidth = 3.2; ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(236,232,222,.15)";
  ctx.beginPath(); ctx.arc(gx, gy, 22, -Math.PI * 0.75, Math.PI * 0.75); ctx.stroke();
  ctx.strokeStyle = S.power > 0.92 ? "#e9c049" : hue;
  ctx.beginPath();
  ctx.arc(gx, gy, 22, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 1.5 * S.power);
  ctx.stroke();

  // spin readout — the tell that grabbing off-centre matters
  const spin = Math.abs(S.grabT);
  if (spin > 0.12) {
    ctx.font = "600 10px 'Chivo Mono', monospace";
    ctx.fillStyle = "rgba(233,192,73,.85)";
    ctx.textAlign = "center";
    ctx.fillText(spin > 0.6 ? "HEAVY SPIN" : "SPIN", gx, gy - 30);
  }
  ctx.restore();
}

/* the first-flick tutorial: a ghost fingertip pulls back from the active
   pen and lets go, on a loop, until the player does it themselves. The
   band, the arc — everything is drawn exactly like the real aim overlay,
   so the demo teaches the actual controls. */
function drawTutor() {
  if (!G.tutor || G.phase !== "aim" || !G.W) return;
  if (!myTurn()) return;
  const S = G.shot, pen = G.W.pens[G.turn];
  if (!pen || !pen.alive || S.on || S.kb) return;

  const LOOP = 2.8;
  const t = reduceMotion ? 1.6 : (performance.now() / 1000) % LOOP;
  const ang = S.angle;    // resetShot already aimed it at the foe
  const ox = 0.15 * (pen.len / 2 - pen.rad);
  const gx = pen.x + ox * Math.cos(pen.a);
  const gy = pen.y + ox * Math.sin(pen.a);
  const hue = HUES[G.turn];

  // how far the ghost finger has pulled back, 0..1
  let k = 0, alpha = 1;
  if (t < 0.4) alpha = t / 0.4;
  else if (t < 1.5) {
    const u = (t - 0.4) / 1.1;
    k = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }
  else if (t < 1.75) k = 1;
  else if (t < 1.95) { k = 1 - (t - 1.75) / 0.2; alpha = 1 - (t - 1.75) / 0.2; }
  else { k = 0; alpha = 0; }

  const pull = k * MAXDRAG * 0.62;
  const bx = gx - Math.cos(ang) * pull;
  const by = gy - Math.sin(ang) * pull;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);

  if (k > 0.02) {
    // the band, dressed like the real one
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(236,232,222,.3)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(bx, by); ctx.stroke();
    // the power arc filling up
    ctx.lineWidth = 3.2; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(236,232,222,.15)";
    ctx.beginPath(); ctx.arc(gx, gy, 22, -Math.PI * 0.75, Math.PI * 0.75); ctx.stroke();
    ctx.strokeStyle = hue;
    ctx.beginPath(); ctx.arc(gx, gy, 22, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 1.5 * (k * 0.62)); ctx.stroke();
  }

  // the ghost fingertip
  ctx.fillStyle = "rgba(236,232,222,.92)";
  ctx.beginPath(); ctx.arc(bx, by, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(236,232,222,.35)";
  ctx.lineWidth = 2;
  const pulse = reduceMotion ? 12 : 12 + Math.sin(performance.now() / 300) * 1.5;
  ctx.beginPath(); ctx.arc(bx, by, pulse, 0, TAU); ctx.stroke();

  // the let-go: a short streak shooting forward
  if (t >= 1.75 && t < 2.35) {
    const f = (t - 1.75) / 0.6;
    ctx.strokeStyle = hue;
    ctx.lineWidth = 2.4; ctx.lineCap = "round";
    ctx.globalAlpha = clamp(1 - f, 0, 1);
    for (let i = 0; i < 3; i++) {
      const d = 26 + f * 95 + i * 17;
      ctx.beginPath();
      ctx.moveTo(gx + Math.cos(ang) * d, gy + Math.sin(ang) * d);
      ctx.lineTo(gx + Math.cos(ang) * (d + 13), gy + Math.sin(ang) * (d + 13));
      ctx.stroke();
    }
  }

  // handwriting on the desk, kept away from the pen itself
  const A = G.W.arena;
  const tx = clamp(pen.x, A.x + 170, A.x + A.w - 170);
  const ty = clamp(pen.y - 72, A.y + 40, A.y + A.h - 16);
  ctx.globalAlpha = 0.92;
  ctx.textAlign = "center";
  ctx.font = "700 25px Caveat, cursive";
  ctx.fillStyle = "rgba(236,232,222,.95)";
  ctx.fillText("drag back from your pen —", tx, ty);
  ctx.fillText("let go to flick!", tx, ty + 27);
  ctx.restore();
}

/* the coin for the opening toss: sits waiting for the call, then spins
   through five slowing turns and lands on the result */
function drawToss() {
  if (G.phase !== "toss" || !G.toss) return;
  const T = G.toss;
  const cx = CW / 2, cy = CH * 0.42;

  // how the coin sits: horizontal squash (edge-on at 0), height, tilt, face
  let sq = 1, dy = 0, rot = 0, face = "?";
  if (!T.result) {
    dy = Math.sin(performance.now() / 480) * 3;   // idling, waiting to be called
  } else {
    const front = T.result === "heads" ? "H" : "T";
    const back = front === "H" ? "T" : "H";
    if (T.t < TOSS_FLIP) {
      const k = T.t / TOSS_FLIP;
      // five turns that ease to a stop — the spin starts edge-on and ends
      // face-up, so the resting face is the result
      const ang = Math.PI + (1 - Math.pow(1 - k, 2.4)) * Math.PI * 9;
      sq = Math.abs(Math.cos(ang));
      face = Math.cos(ang) >= 0 ? front : back;
      dy = -Math.sin(k * Math.PI) * 60;
      rot = Math.sin(ang * 0.5) * 0.12;
    } else {
      face = front;
      const b = T.t - TOSS_FLIP;   // a decaying little bounce on landing
      dy = -Math.abs(Math.sin(b * 12)) * 9 * Math.max(0, 1 - b * 2.4);
      rot = Math.sin(b * 9) * 0.08 * Math.max(0, 1 - b * 2);
    }
  }
  if (reduceMotion) { sq = 1; dy = 0; rot = 0; if (T.result) face = T.result === "heads" ? "H" : "T"; }

  // the shadow tracks the coin's height
  const h = -dy;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${clamp(0.3 - h * 0.0022, 0.08, 0.3)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 46, clamp(30 - h * 0.16, 14, 30), clamp(9 - h * 0.05, 4, 9), 0, 0, TAU);
  ctx.fill();

  ctx.translate(cx, cy + dy);
  ctx.rotate(rot);
  ctx.scale(Math.max(sq, 0.06), 1);

  const g = ctx.createRadialGradient(-8, -10, 4, 0, 0, 36);
  g.addColorStop(0, "#f4d27a");
  g.addColorStop(0.55, "#e9c049");
  g.addColorStop(1, "#a67c1e");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#7a5a14"; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = "rgba(122,90,20,.55)"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.stroke();
  ctx.fillStyle = "#5d451a";
  ctx.font = "700 34px Antonio, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(face, 0, 2);
  ctx.restore();
}

function drawSparks() {
  ctx.save();
  for (const s of G.sparks) {
    ctx.globalAlpha = clamp(s.life, 0, 1) * 0.9;
    ctx.fillStyle = s.c;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawBanner() {
  const b = G.banner;
  if (!b) return;
  const rise = clamp(b.t / 0.28, 0, 1);
  const fade = clamp(b.life / 0.35, 0, 1);
  ctx.save();
  ctx.globalAlpha = Math.min(rise, fade);
  ctx.textAlign = "center";
  ctx.translate(CW / 2, CH * 0.44);
  ctx.scale(lerp(0.86, 1, rise), lerp(0.86, 1, rise));
  ctx.fillStyle = "rgba(10,12,17,.72)";
  const w = 460, h = 92;
  roundRectPath(ctx, -w / 2, -h / 2, w, h, 3); ctx.fill();
  ctx.strokeStyle = b.hue; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w / 2, h / 2); ctx.stroke();
  ctx.fillStyle = b.hue;
  ctx.font = "700 44px Antonio, sans-serif";
  ctx.fillText(b.big, 0, 4);
  ctx.fillStyle = "rgba(236,232,222,.7)";
  ctx.font = "400 15px Chivo, sans-serif";
  ctx.fillText(b.small, 0, 30);
  ctx.restore();
}
