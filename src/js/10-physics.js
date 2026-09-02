/* ── bodies ──────────────────────────────────────────────────────────── */
function makeBody(o) {
  const b = {
    tag: o.tag || "obj",
    wall: !!o.wall,
    owner: o.owner ?? -1,
    model: o.model || null,
    cs: o.cs || [],
    segs: o.segs || null,
    x: o.x || 0, y: o.y || 0, a: o.a || 0,
    vx: 0, vy: 0, w: 0,
    rest: o.rest ?? 0.3,
    fric: o.fric ?? 0.3,
    grip: o.grip ?? 1,
    len: o.len || 0, rad: o.rad || 0,
    alive: true, out: false, fall: 0, spinOut: 0,
    trail: [], glow: 0,
    wc: []
  };
  b.stat = !!o.wall || !!o.stat;
  if (b.stat) { b.m = 0; b.im = 0; b.I = 0; b.iI = 0; }
  else {
    b.m = o.m || 1; b.im = 1 / b.m;
    const mi = b.m / b.cs.length;
    let I = 0;
    for (const c of b.cs) I += mi * (0.5 * c.r * c.r + c.ox * c.ox + c.oy * c.oy);
    b.I = I; b.iI = 1 / I;
  }
  let br = 0;
  for (const c of b.cs) br = Math.max(br, Math.hypot(c.ox, c.oy) + c.r);
  b.brad = br;
  return b;
}

/* a pen: a capsule approximated by 9 circles down its spine. The spacing
   (len/8) is smaller than a circle's diameter, so the spine is watertight —
   a foreign circle can never wedge between two neighbours and touch both
   flanks at once, which would create two contacts with opposing normals
   and weld the pens together. */
function makePen(model, owner, x, y, a) {
  const n = 9, span = model.len / 2 - model.rad, cs = [];
  for (let i = 0; i < n; i++) cs.push({ ox: lerp(-span, span, i / (n - 1)), oy: 0, r: model.rad });
  return makeBody({
    tag: "pen", owner, model, cs, x, y, a,
    m: model.m, grip: model.grip, rest: model.rest, fric: model.fric,
    len: model.len, rad: model.rad
  });
}

const CLUTTER = [
  { kind:"paper",  make:(x,y,a) => makeBody({ tag:"obj", kind:"paper", cs:[{ox:0,oy:0,r:14}],
      x, y, a, m:0.5, grip:0.88, rest:0.52, fric:0.34 }) },
  { kind:"eraser", make:(x,y,a) => makeBody({ tag:"obj", kind:"eraser",
      cs:[{ox:-9,oy:0,r:8.5},{ox:0,oy:0,r:8.5},{ox:9,oy:0,r:8.5}],
      x, y, a, m:1.15, grip:1.34, rest:0.14, fric:0.44 }) },
  { kind:"stub",   make:(x,y,a) => makeBody({ tag:"obj", kind:"stub",
      cs:[{ox:-16,oy:0,r:4.6},{ox:-5.3,oy:0,r:4.6},{ox:5.3,oy:0,r:4.6},{ox:16,oy:0,r:4.6}],
      x, y, a, m:0.72, grip:0.94, rest:0.36, fric:0.28 }) },
  { kind:"cap",    make:(x,y,a) => makeBody({ tag:"obj", kind:"cap",
      cs:[{ox:-6,oy:0,r:5},{ox:6,oy:0,r:5}],
      x, y, a, m:0.34, grip:0.8, rest:0.5, fric:0.24 }) }
];

/* the raised edge: four rails with the corners left open, so a pen that
   rattles around can still be driven out through a gap. Each desk sets its
   own corner opening and rail thickness. */
function lipWalls(A, gap, r) {
  const seg = (ax, ay, bx, by) => ({ ax, ay, bx, by, r });
  return makeBody({
    wall: true, tag: "wall", rest: 0.46, fric: 0.24,
    segs: [
      seg(A.x + gap, A.y, A.x + A.w - gap, A.y),
      seg(A.x + gap, A.y + A.h, A.x + A.w - gap, A.y + A.h),
      seg(A.x, A.y + gap, A.x, A.y + A.h - gap),
      seg(A.x + A.w, A.y + gap, A.x + A.w, A.y + A.h - gap)
    ]
  });
}

/* ── world ───────────────────────────────────────────────────────────── */
function buildWorld(desk, penIds, bare) {
  const A = desk.arena;
  const W = { desk, arena: A, mu: desk.mu, bodies: [], walls: [], fx: true, impacts: [], onOut: null };

  if (desk.lip) { const wl = lipWalls(A, desk.gap || 78, desk.rail || 9); W.walls.push(wl); W.bodies.push(wl); }

  const cy = A.y + A.h / 2;
  const p1 = makePen(penById(penIds[0]), 0, A.x + A.w * 0.19, cy + rnd(-A.h * 0.1, A.h * 0.1), rnd(-1.25, 1.25));
  const p2 = makePen(penById(penIds[1]), 1, A.x + A.w * 0.81, cy + rnd(-A.h * 0.1, A.h * 0.1), rnd(-1.25, 1.25));
  W.pens = [p1, p2];
  W.bodies.push(p1, p2);

  if (!bare) {   // "clear the desk": just the two pens, nothing loose
    const count = 2 + ((_rng() * 2) | 0);   // seeded: a shared seed must rebuild this world exactly
    const placed = [];
    for (let i = 0; i < count; i++) {
      for (let t = 0; t < 30; t++) {
        const x = A.x + A.w * rnd(0.33, 0.67);
        const y = A.y + A.h * rnd(0.14, 0.86);
        let ok = Math.hypot(x - p1.x, y - p1.y) > 92 && Math.hypot(x - p2.x, y - p2.y) > 92;
        for (const q of placed) if (Math.hypot(x - q.x, y - q.y) < 62) ok = false;
        if (!ok) continue;
        const b = pick(CLUTTER).make(x, y, rnd(0, TAU));
        placed.push(b); W.bodies.push(b);
        break;
      }
    }
  }
  return W;
}

/* ── geometry ────────────────────────────────────────────────────────── */
function closestOnSeg(s, px, py) {
  const ex = s.bx - s.ax, ey = s.by - s.ay;
  const L2 = ex * ex + ey * ey;
  let t = L2 > 1e-9 ? ((px - s.ax) * ex + (py - s.ay) * ey) / L2 : 0;
  t = clamp(t, 0, 1);
  return { x: s.ax + ex * t, y: s.ay + ey * t };
}

function syncWC(b) {
  const ca = Math.cos(b.a), sa = Math.sin(b.a);
  for (let i = 0; i < b.cs.length; i++) {
    const c = b.cs[i];
    let w = b.wc[i]; if (!w) w = b.wc[i] = { x: 0, y: 0, r: 0 };
    w.x = b.x + c.ox * ca - c.oy * sa;
    w.y = b.y + c.ox * sa + c.oy * ca;
    w.r = c.r;
  }
}

/* relative velocity of B w.r.t. A at the contact point */
const _rv = [0, 0];
function relV(c) {
  const A = c.A, B = c.B;
  _rv[0] = (B.vx - B.w * c.rby) - (A.vx - A.w * c.ray);
  _rv[1] = (B.vy + B.w * c.rbx) - (A.vy + A.w * c.rax);
  return _rv;
}

/* n always points from A toward B */
function mkContact(A, B, px, py, nx, ny, pen) {
  const c = { A, B, px, py, nx, ny, pen, Pn: 0, Pt: 0 };
  c.rax = px - A.x; c.ray = py - A.y;
  c.rbx = px - B.x; c.rby = py - B.y;
  const rnA = c.rax * ny - c.ray * nx, rnB = c.rbx * ny - c.rby * nx;
  c.kn = A.im + B.im + A.iI * rnA * rnA + B.iI * rnB * rnB;
  const tx = -ny, ty = nx;
  const rtA = c.rax * ty - c.ray * tx, rtB = c.rbx * ty - c.rby * tx;
  c.kt = A.im + B.im + A.iI * rtA * rtA + B.iI * rtB * rtB;
  c.e = Math.max(A.rest, B.rest);
  c.mu = Math.sqrt(A.fric * B.fric);
  const rv = relV(c);
  const vn = rv[0] * nx + rv[1] * ny;
  c.vn0 = vn;
  c.target = vn < -24 ? -c.e * vn : 0;   // only bounce off a real impact
  return c;
}

const _cts = [];
function buildContacts(W, out) {
  out.length = 0;
  const bs = W.bodies;
  for (const b of bs) if (!b.stat && b.alive) syncWC(b);

  for (let i = 0; i < bs.length; i++) {
    const A = bs[i];
    if (!A.alive || A.stat) continue;

    for (const wl of W.walls) {
      for (const s of wl.segs) {
        for (const p of A.wc) {
          const cp = closestOnSeg(s, p.x, p.y);
          const dx = p.x - cp.x, dy = p.y - cp.y;
          const rr = s.r + p.r, d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          let d = Math.sqrt(d2), nx, ny;
          if (d < 1e-6) { nx = 0; ny = -1; d = 0; } else { nx = dx / d; ny = dy / d; }
          out.push(mkContact(wl, A, cp.x + nx * s.r, cp.y + ny * s.r, nx, ny, rr - d));
        }
      }
    }

    for (let j = i + 1; j < bs.length; j++) {
      const B = bs[j];
      if (!B.alive || B.stat) continue;
      const dx = B.x - A.x, dy = B.y - A.y, rr = A.brad + B.brad;
      if (dx * dx + dy * dy > rr * rr) continue;
      for (const p of A.wc) for (const q of B.wc) {
        const ex = q.x - p.x, ey = q.y - p.y;
        const r2 = p.r + q.r, d2 = ex * ex + ey * ey;
        if (d2 >= r2 * r2) continue;
        let d = Math.sqrt(d2), nx, ny;
        if (d < 1e-6) { nx = 1; ny = 0; d = 0; } else { nx = ex / d; ny = ey / d; }
        out.push(mkContact(A, B, p.x + nx * p.r, p.y + ny * p.r, nx, ny, r2 - d));
      }
    }
  }
}

function applyP(c, ix, iy) {
  const A = c.A, B = c.B;
  A.vx -= ix * A.im; A.vy -= iy * A.im;
  A.w  -= A.iI * (c.rax * iy - c.ray * ix);
  B.vx += ix * B.im; B.vy += iy * B.im;
  B.w  += B.iI * (c.rbx * iy - c.rby * ix);
}

function solveContact(c, invdt) {
  const bias = Math.min(MAXBIAS, BAUM * invdt * Math.max(0, c.pen - SLOP));

  let rv = relV(c);
  const vn = rv[0] * c.nx + rv[1] * c.ny;
  let dPn = (c.target + bias - vn) / c.kn;
  const nPn = Math.max(0, c.Pn + dPn);
  dPn = nPn - c.Pn; c.Pn = nPn;
  applyP(c, dPn * c.nx, dPn * c.ny);

  const tx = -c.ny, ty = c.nx;
  rv = relV(c);
  const vt = rv[0] * tx + rv[1] * ty;
  let dPt = -vt / c.kt;
  const cap = c.mu * c.Pn;
  const nPt = clamp(c.Pt + dPt, -cap, cap);
  dPt = nPt - c.Pt; c.Pt = nPt;
  applyP(c, dPt * tx, dPt * ty);
}

/* kinetic friction against the desk: constant deceleration, not a
   velocity multiplier — that's what makes the stopping distance
   predictable enough to draw an honest aim line */
function surfaceFriction(b, dt, mu) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 1e-4) {
    const k = Math.max(0, sp - mu * GACC * dt) / sp;
    b.vx *= k; b.vy *= k;
  } else { b.vx = 0; b.vy = 0; }

  const aw = Math.abs(b.w);
  if (aw > 1e-4) {
    const nw = Math.max(0, aw - mu * ANGDRAG * dt);
    b.w = b.w < 0 ? -nw : nw;
  } else b.w = 0;

  b.vx *= 1 - 0.16 * dt; b.vy *= 1 - 0.16 * dt;
  b.w *= 1 - 0.5 * dt;
}

function stepWorld(W, dt) {
  const sdt = dt / SUBS, invdt = 1 / sdt;
  for (let s = 0; s < SUBS; s++) {
    buildContacts(W, _cts);
    for (let k = 0; k < ITERS; k++) for (let i = 0; i < _cts.length; i++) solveContact(_cts[i], invdt);

    if (W.fx) {
      for (const c of _cts) {
        if (c.Pn > 130 && c.vn0 < -70) {
          W.impacts.push({ x: c.px, y: c.py, mag: c.Pn, tag: c.B.tag });
          if (c.A.tag === "pen") c.A.glow = 1;
          if (c.B.tag === "pen") c.B.glow = 1;
        }
      }
    }

    for (const b of W.bodies) {
      if (b.stat || !b.alive) continue;
      b.x += b.vx * sdt; b.y += b.vy * sdt; b.a += b.w * sdt;
      surfaceFriction(b, sdt, W.mu * b.grip);
    }
  }
}

function checkOut(W) {
  const A = W.arena;
  for (const b of W.bodies) {
    if (b.stat || !b.alive) continue;
    if (b.x < A.x || b.x > A.x + A.w || b.y < A.y || b.y > A.y + A.h) {
      b.alive = false; b.out = true; b.fall = 0.0001;
      b.spinOut = (b.w || 0) + (b.vx > 0 ? 5 : -5);
      if (W.fx && W.onOut) W.onOut(b);
    }
  }
}

function isSettled(W) {
  for (const b of W.bodies) {
    if (b.stat || !b.alive) continue;
    if (Math.hypot(b.vx, b.vy) > REST_V || Math.abs(b.w) > REST_W) return false;
  }
  return true;
}

function edgeDist(W, b) {
  const A = W.arena;
  return Math.min(b.x - A.x, A.x + A.w - b.x, b.y - A.y, A.y + A.h - b.y);
}

/* apply the flick. The impulse lands at the grabbed point on the barrel,
   so its lever arm about the centre of mass becomes spin for free. */
function flick(pen, angle, power, grabT) {
  const J = clamp(power, 0, 1) * MAXJ;
  const jx = Math.cos(angle) * J, jy = Math.sin(angle) * J;
  const ox = grabT * (pen.len / 2 - pen.rad);
  const rx = ox * Math.cos(pen.a), ry = ox * Math.sin(pen.a);
  pen.vx += jx * pen.im;
  pen.vy += jy * pen.im;
  pen.w += pen.iI * (rx * jy - ry * jx) * SPIN;
}

function snapshot(W) {
  const s = [];
  for (const b of W.bodies) {
    if (b.stat) continue;
    s.push([b.x, b.y, b.a, b.vx, b.vy, b.w, b.alive, b.out, b.fall]);
  }
  return s;
}
function restoreSnap(W, s) {
  let i = 0;
  for (const b of W.bodies) {
    if (b.stat) continue;
    const d = s[i++];
    b.x = d[0]; b.y = d[1]; b.a = d[2];
    b.vx = d[3]; b.vy = d[4]; b.w = d[5];
    b.alive = d[6]; b.out = d[7]; b.fall = d[8];
  }
}
/*#PHYS_END*/
