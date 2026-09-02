/* ══════════════════════════════════════════════════════════════════════
   TURN FLOW
   ══════════════════════════════════════════════════════════════════════ */
/* how a seat is named on screen — the typed name if there is one, else the
   mode's sensible default */
function seatName(t) {
  return dispName(t).toUpperCase();
}

/* ── the opening toss ──────────────────────────────────────────────────
   One player calls heads or tails, the coin is flipped, and whoever calls
   it right flicks first. Later rounds still go to whoever's behind. */
const TOSS_FLIP = 1.0;    // seconds the coin is in the air
const TOSS_TIME = 1.6;    // …plus a beat lying on the desk before the banner

/* online, the guest calls it — the host deals the coin */
function tossCaller() {
  return G.mode === "net" ? 1 : 0;
}

function beginToss() {
  G.score = [0, 0]; G.round = 1;
  G.lastBanner = null;
  G.toss = { call: null, result: null, t: 0 };
  G.tossSide = null;
  G.phase = "toss";
  el("setupWrap").hidden = true;
  el("resultWrap").hidden = true;
  updateTossUI();
  syncBoard();
}

function newMatch() {
  beginToss();
  if (G.mode === "net" && NET.role === 0) NET.send({ t: "toss" });   // tell the guest to call it
}

/* the caller commits to a side. Local play flips immediately; online, the
   guest's call travels to the host, who flips for both. */
function callToss(side) {
  if (G.phase !== "toss" || !G.toss || G.toss.call) return;
  if (G.mode === "net") {
    if (NET.role !== 1) return;   // the guest calls it
    G.toss.call = side;
    NET.send({ t: "call", side });
    updateTossUI();
    return;
  }
  runToss(side);
}

function runToss(side) {
  G.toss.call = side;
  G.toss.result = Math.random() < 0.5 ? "heads" : "tails";
  G.toss.t = 0;
  if (G.mode === "net" && NET.role === 0) NET.send({ t: "flip", side, result: G.toss.result });
  updateTossUI();
}

/* called from the paint loop once the coin has had its beat on the desk */
function finishToss() {
  const caller = tossCaller();
  const win = G.toss.call === G.toss.result ? caller : 1 - caller;
  G.turn = win;
  const side = G.toss.result.toUpperCase();
  G.tossSide = side;   // rides along on the round broadcast for the guest's banner
  G.toss = null;
  updateTossUI();
  banner("THE TOSS", `${side} — ${seatName(win)} FLICK FIRST`, HUES[win]);
  startRound();   // net-host: deals the fresh round to both players
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
               round: G.round, turn: G.turn, banner: G.lastBanner, toss: G.tossSide || null,
               desk: G.deskId, pens: G.penIds.slice(), clutter: G.clutter });
    return;
  }
  beginRound();
}

function beginRound() {
  G.W = buildWorld(deskById(G.deskId), G.penIds, !G.clutter);
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
  /* the round broadcast is the truth about pens, desk and clutter too —
     a cfg message that raced the start of the match must not leave the
     two machines simulating different bodies */
  if (m.pens) G.penIds = m.pens.slice();
  if (m.desk && m.desk !== G.deskId) { G.deskId = m.desk; surf = null; surfKey = ""; }
  if (typeof m.clutter === "boolean") G.clutter = m.clutter;
  G.score = m.score.slice();
  G.round = m.round;
  G.turn = m.turn;
  G.lastBanner = m.banner || null;
  /* the round broadcast can overtake the coin still spinning on our side —
     the desk is dealt, the toss is settled */
  G.toss = null;
  updateTossUI();
  beginRound();
  restoreSnap(G.W, m.snap);
  /* round 1 comes with the toss result — but the toss banner is written
     from each side's own seat, so the host's wording can't be reused */
  if (m.round === 1) {
    const side = m.toss ? `${m.toss} — ` : "";
    banner("THE TOSS", `${side}${seatName(m.turn)} FLICK FIRST`, HUES[m.turn]);
  }
  else if (m.banner) banner(m.banner.big, m.banner.small, m.banner.hue);
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

/* the drag tutorial has done its job — remember that, per browser */
function tutorDone() {
  G.tutor = false;
  try { localStorage.setItem("dd_tutored", "1"); } catch (e) { /* headless or file:// */ }
}

function fireShot(shot) {
  const W = G.W, pen = W.pens[G.turn], S = G.shot;
  const p = shot || { angle: S.angle, power: S.power, grabT: S.grabT };
  if (!pen.alive || p.power < 0.05) return;
  if (G.tutor) tutorDone();
  pen.trail.length = 0;
  flick(pen, p.angle, p.power, p.grabT);
  sfxFlick(p.power);
  // a shot fired here is announced; a relayed one (shot given) already was
  if (!shot && G.mode === "net" && NET.on) {
    NET.lastFlick = { angle: p.angle, power: p.power, grabT: p.grabT };
    NET.tries = 0;
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
      const nm = seatName(winner);
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
   The simulation runs on a fixed 1/60s timestep fed by an accumulator —
   never on raw frame deltas. Two machines at different refresh rates must
   integrate the exact same step sequence, or the guest's optimistic copy
   of a shot drifts from the host's authoritative one and snaps back when
   the end-of-turn snapshot arrives. Only the paint (trails, sparks, shake)
   uses real frame time.
   ══════════════════════════════════════════════════════════════════════ */
const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function tick(dt) {
  const W = G.W;
  if (!W) return;
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
    /* the host calls the shot and tells us; if it never even saw our flick
       (a relay hiccup), the desk would sit silent forever — try again,
       then call the connection lost */
    if (G.mode === "net" && NET.role === 1 && G.simT > 8) {
      if (NET.lastFlick && NET.tries < 2) {
        NET.tries++;
        NET.send({ t: "flick", angle: NET.lastFlick.angle, power: NET.lastFlick.power, grabT: NET.lastFlick.grabT });
        G.simT = 4;   // wait another stretch before giving up
      } else netPeerGone("The host stopped responding");
    }
    if (G.simT > 0.3 && (isSettled(W) || G.simT > 7)) resolveTurn();
  } else if (G.phase === "cpu" && CPU) {
    cpuTick(dt);
  } else if (G.phase === "score") {
    G.waitT -= dt;
    if (G.waitT <= 0) afterScore();
  }
}

function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 1 / 30);
  acc = Math.min(acc + dt, 0.25);   // after a stall, don't burst-simulate
  while (acc >= STEP) { tick(STEP); acc -= STEP; }

  // paint-time effects run on real frame time
  const W = G.W;
  if (W) {
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
  /* the coin's flight runs on frame time like the rest of the paint —
     both machines see the same call and result, so they settle the same */
  if (G.phase === "toss" && G.toss && G.toss.result) {
    G.toss.t += dt;
    if (G.toss.t >= TOSS_TIME) finishToss();
  }
  if (G.banner) {
    G.banner.t += dt;
    G.banner.life -= dt * 0.62;
    if (G.banner.life <= 0) G.banner = null;
  }

  /* the setup/result sheet fully covers the desk (fixed fullscreen on
     phones) — repainting the arena under it every frame is pure waste */
  if (el("setupWrap").hidden && el("resultWrap").hidden) draw();
  requestAnimationFrame(loop);
}
