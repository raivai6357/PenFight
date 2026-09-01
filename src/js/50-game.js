/* ══════════════════════════════════════════════════════════════════════
   TURN FLOW
   ══════════════════════════════════════════════════════════════════════ */
function newMatch() {
  G.score = [0, 0]; G.round = 1; G.turn = 0;
  G.lastBanner = null;
  startRound();
  syncBoard();
}

function startRound() {
  if (G.mode === "net") {
    if (NET.role !== 0) return;   // the guest's round starts when the host's message arrives
    // the host owns the deck: it seeds the shuffle and deals it out
    const seed = (Math.random() * 0x7fffffff) | 0;
    setSeed(seed);
    beginRound();
    NET.send({ t: "round", seed, snap: snapshot(G.W), score: G.score.slice(),
               round: G.round, turn: G.turn, banner: G.lastBanner });
    return;
  }
  beginRound();
}

function beginRound() {
  G.W = buildWorld(deskById(G.deskId), G.penIds);
  G.W.onOut = (b) => {
    if (b.tag === "pen") { sfxOut(); G.shake = 1; }
    else sfxClack(400);
    burst(b.x, b.y, b.tag === "pen" ? HUES[b.owner] : "#cfc9b6", b.tag === "pen" ? 22 : 10);
  };
  G.sparks.length = 0;
  G.phase = "aim";
  G.simT = 0;
  resetShot();
  syncBoard();
}

/* the guest rebuilds the host's world from the shared seed, then takes the
   host's word for where everything sits */
function startRoundFromNet(m) {
  el("setupWrap").hidden = true;
  el("resultWrap").hidden = true;
  setSeed(m.seed);
  G.score = m.score.slice();
  G.round = m.round;
  G.turn = m.turn;
  G.lastBanner = m.banner || null;
  beginRound();
  restoreSnap(G.W, m.snap);
  if (m.banner) banner(m.banner.big, m.banner.small, m.banner.hue);
  syncBoard();
}

function resetShot() {
  const W = G.W;
  const me = W.pens[G.turn], foe = W.pens[1 - G.turn];
  G.shot.on = false; G.shot.kb = false;
  G.shot.grabT = 0;
  G.shot.power = 0.62;
  G.shot.angle = foe && foe.alive ? Math.atan2(foe.y - me.y, foe.x - me.x) : (G.turn ? Math.PI : 0);
  if (G.mode === "cpu" && G.turn === 1) beginCPU();
}

function fireShot(shot) {
  const W = G.W, pen = W.pens[G.turn], S = G.shot;
  const p = shot || { angle: S.angle, power: S.power, grabT: S.grabT };
  if (!pen.alive || p.power < 0.05) return;
  pen.trail.length = 0;
  flick(pen, p.angle, p.power, p.grabT);
  sfxFlick(p.power);
  // a shot fired here is announced; a relayed one (shot given) already was
  if (!shot && G.mode === "net" && NET.on) {
    NET.send({ t: "flick", angle: p.angle, power: p.power, grabT: p.grabT });
  }
  G.phase = "sim";
  G.simT = 0;
  S.on = false; S.kb = false;
  syncBoard();
}

function resolveTurn() {
  if (G.mode === "net" && NET.role === 1) return;   // the host calls it; the guest waits for word
  const W = G.W;
  const p1out = !W.pens[0].alive, p2out = !W.pens[1].alive;

  if (p1out || p2out) {
    if (p1out && p2out) {
      banner("BOTH OFF", "Nobody scores. Reset the desk.", "#8f96ac");
      G.phase = "score"; G.waitT = 1.5; G.pendingRound = "redo";
    } else {
      const winner = p1out ? 1 : 0;
      G.score[winner]++;
      const done = G.score[winner] >= TARGET;
      const nm = G.mode === "net"
        ? (winner === NET.role ? "YOU" : "YOUR FRIEND")
        : NAMES[winner].toUpperCase();
      banner(
        `${nm} SCORES`,
        done ? "That's the match." : `${G.score[0]}–${G.score[1]} · round ${G.round + 1} next`,
        HUES[winner]
      );
      G.phase = "score"; G.waitT = 1.7;
      G.pendingRound = done ? "over" : "next";
      bumpCount(winner);
    }
    syncBoard();
    return;
  }

  G.turn = 1 - G.turn;
  G.phase = "aim";
  resetShot();
  syncBoard();
  if (G.mode === "net" && NET.role === 0) {
    NET.send({ t: "turn", turn: G.turn, snap: snapshot(W), score: G.score.slice(), round: G.round });
  }
}

function afterScore() {
  const what = G.pendingRound;
  G.pendingRound = null;
  if (what === "over") {
    G.phase = "over"; showResult();
    if (G.mode === "net" && NET.role === 0) {
      NET.send({ t: "over", score: G.score.slice(), round: G.round, banner: G.lastBanner });
    }
    return;
  }
  if (what === "next") G.round++;
  else if (what !== "redo") return;   // both fell off: same round, fresh desk
  // loser flicks first next round — small mercy
  G.turn = G.score[0] > G.score[1] ? 1 : 0;
  startRound();   // net-host: broadcasts the fresh round to the guest
}

function banner(big, small, hue) {
  G.banner = { big, small, hue, t: 0, life: 1 };
  G.lastBanner = { big, small, hue };
}
function burst(x, y, c, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), sp = rnd(30, 240);
    G.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rnd(1, 3.4), life: 1, c });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   THE COMPUTER — samples candidate flicks and actually simulates each one
   ══════════════════════════════════════════════════════════════════════ */
let CPU = null;
function beginCPU() {
  const W = G.W, me = W.pens[1], foe = W.pens[0];
  const base = Math.atan2(foe.y - me.y, foe.x - me.x);
  const cands = [];
  const spread = G.diff === "sharp" ? 0.62 : 0.5;
  const N = G.diff === "sharp" ? 11 : 9;
  const powers = G.diff === "sharp" ? [0.5, 0.7, 0.86, 1] : [0.55, 0.78, 1];
  const grabs = G.diff === "sharp" ? [-0.6, 0, 0.6] : [-0.5, 0, 0.5];
  for (let i = 0; i < N; i++) {
    const ang = base + lerp(-spread, spread, N === 1 ? 0.5 : i / (N - 1));
    for (const p of powers) for (const gt of grabs) cands.push({ ang, p, gt });
  }
  CPU = {
    cands, i: 0, best: null, bs: -1e9, ranked: [],
    base: snapshot(W),
    foeD0: edgeDist(W, foe), meD0: edgeDist(W, me),
    foeX: foe.x, foeY: foe.y,
    phase: "think"
  };
  G.phase = "cpu";
  syncBoard();
}

function cpuEval(c) {
  const W = G.W;
  const me = W.pens[1], foe = W.pens[0];
  restoreSnap(W, CPU.base);
  W.fx = false;
  const oi = ITERS, os = SUBS;
  ITERS = 5; SUBS = 1;
  let s = 0;
  try {
    flick(me, c.ang, c.p, c.gt);
    let steps = 0;
    const dt = 1 / 60;
    while (steps < 150) {
      stepWorld(W, dt);
      checkOut(W);
      steps++;
      if (!foe.alive || !me.alive) break;
      if (steps > 20 && isSettled(W)) break;
    }

    if (!foe.alive) s += 1000;
    if (!me.alive) s -= 1400;
    if (foe.alive) {
      s += (CPU.foeD0 - edgeDist(W, foe)) * 3.2;
      if (Math.hypot(foe.x - CPU.foeX, foe.y - CPU.foeY) > 6) s += 26; // reward contact
    }
    if (me.alive) s -= Math.max(0, CPU.meD0 - edgeDist(W, me)) * 1.5;
  } finally {
    // a failed search must never leave the real game on degraded settings
    ITERS = oi; SUBS = os;
    restoreSnap(W, CPU.base);
    W.fx = true;
  }
  return s;
}

function cpuTick(dt) {
  if (CPU.phase === "think") {
    const until = performance.now() + 20;
    while (CPU.i < CPU.cands.length && performance.now() < until) {
      const c = CPU.cands[CPU.i++];
      const s = cpuEval(c);
      CPU.ranked.push({ c, s });
      if (s > CPU.bs) { CPU.bs = s; CPU.best = c; }
    }
    if (CPU.i >= CPU.cands.length) {
      let chosen = CPU.best;
      if (G.diff === "casual") {
        CPU.ranked.sort((a, b) => b.s - a.s);
        const top = CPU.ranked.slice(0, Math.max(3, (CPU.ranked.length * 0.22) | 0));
        chosen = pick(top).c;
        chosen = { ang: chosen.ang + rnd(-0.06, 0.06), p: clamp(chosen.p + rnd(-0.08, 0.08), 0.2, 1), gt: chosen.gt };
      }
      CPU.chosen = chosen;
      CPU.phase = "settle";
      CPU.settleT = 0;
      // show the aim being taken, so the shot reads as deliberate
      G.shot.kb = true;
      G.shot.angle = chosen.ang;
      G.shot.grabT = chosen.gt;
      G.shot.power = 0;
    }
  } else {
    CPU.settleT += dt;
    const k = clamp(CPU.settleT / 0.45, 0, 1);
    G.shot.power = CPU.chosen.p * (k * k);
    if (CPU.settleT > 0.62) {
      G.shot.power = CPU.chosen.p;
      fireShot();
      CPU = null;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN LOOP
   ══════════════════════════════════════════════════════════════════════ */
let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 1 / 30);

  const W = G.W;
  if (W) {
    if (G.phase === "sim") {
      G.simT += dt;
      W.impacts.length = 0;
      stepWorld(W, dt);
      checkOut(W);
      for (const im of W.impacts) {
        sfxClack(im.mag);
        burst(im.x, im.y, im.tag === "pen" ? "#ece8de" : "#cfc9b6", 3);
        G.shake = Math.max(G.shake, clamp(im.mag / 2600, 0, 0.7));
      }
      if (G.simT > 0.3 && (isSettled(W) || G.simT > 7)) resolveTurn();
    } else if (G.phase === "cpu" && CPU) {
      cpuTick(dt);
    } else if (G.phase === "score") {
      G.waitT -= dt;
      if (G.waitT <= 0) afterScore();
    }

    // trails + fall animation run in every phase
    for (const b of W.bodies) {
      if (b.stat) continue;
      if (b.alive) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 210) {
          const tipx = b.x + Math.cos(b.a) * (b.len / 2 || b.brad);
          const tipy = b.y + Math.sin(b.a) * (b.len / 2 || b.brad);
          b.trail.push({ x: tipx, y: tipy, life: 1 });
          if (b.trail.length > 26) b.trail.shift();
        }
      } else if (b.fall > 0 && b.fall < 1.4) {
        b.fall += dt * 1.15;
        b.a += b.spinOut * dt;
      }
      for (const p of b.trail) p.life -= dt * 2.4;
      while (b.trail.length && b.trail[0].life <= 0) b.trail.shift();
      b.glow = Math.max(0, b.glow - dt * 3.2);
    }
  }

  for (let i = G.sparks.length - 1; i >= 0; i--) {
    const s = G.sparks[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.vx *= 1 - 2.6 * dt; s.vy *= 1 - 2.6 * dt;
    s.life -= dt * 1.7;
    if (s.life <= 0) G.sparks.splice(i, 1);
  }
  G.shake = Math.max(0, G.shake - dt * 3.4);
  if (G.banner) {
    G.banner.t += dt;
    G.banner.life -= dt * 0.62;
    if (G.banner.life <= 0) G.banner = null;
  }

  draw();
  requestAnimationFrame(loop);
}
