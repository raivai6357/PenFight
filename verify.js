/* Regression harness for the built artifact — run:  node verify.js
 *
 * Rebuilds dist/desk-duel.html first, so it can never test a stale file.
 * Then pulls the solver and the whole game script straight out of the HTML,
 * so it stays honest if you retune the physics constants. Two suites:
 *   1. the solver on its own (stability, spin, friction, aim accuracy)
 *   2. the real turn flow, driven headlessly against a stubbed canvas
 */
const fs = require('fs');
const html = fs.readFileSync(require('./build.js').build(), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const phys = html.slice(html.indexOf('/*#PHYS_START*/'), html.indexOf('/*#PHYS_END*/'));

const P = new Function(phys + `
  ;return {buildWorld,stepWorld,checkOut,isSettled,edgeDist,flick,snapshot,restoreSnap,
           PENS,DESKS,penById,deskById,MAXJ,GACC,setSeed};`)();
P.setSeed(0x5EED);

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const finite = (W) => W.bodies.every(b => b.stat || [b.x, b.y, b.a, b.vx, b.vy, b.w].every(Number.isFinite));

console.log('\n── solver ─────────────────────────────────');

/* stability: every surface x every pen, full power, near-maximum spin.
   The invariant is kinetic ENERGY, not speed — a pen striking a lighter
   obstacle legitimately sends it off faster than the pen was travelling.
   Bodies that leave the desk are dropped, which only lowers the measurement. */
const kinetic = (W) => {
  let e = 0;
  for (const b of W.bodies) if (!b.stat && b.alive) {
    e += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.I * b.w * b.w;
  }
  return e;
};
{
  let bad = 0, worstRatio = 0, worstName = '';
  for (const d of P.DESKS) for (const pen of P.PENS) {
    const W = P.buildWorld(d, [pen.id, pen.id]);
    P.flick(W.pens[0], 0.4, 1.0, 0.9);
    const e0 = kinetic(W);
    for (let i = 0; i < 420; i++) {
      P.stepWorld(W, 1 / 60); P.checkOut(W);
      if (!finite(W)) { bad++; break; }
      const r = kinetic(W) / e0;
      if (r > worstRatio) { worstRatio = r; worstName = d.id + '/' + pen.id; }
    }
  }
  ok(bad === 0, 'no NaN across 15 desk/pen combinations at full power');
  ok(worstRatio <= 1.02,
    `energy only ever leaves the system — worst total KE ${(worstRatio * 100).toFixed(1)}% of launch (${worstName})`);
}

/* friction actually dissipates: a contained pen comes to a full stop */
{
  const d = P.deskById('tray'), A = d.arena;
  let stopped = 0; const times = [];
  for (let t = 0; t < 20; t++) {
    const W = P.buildWorld(d, ['bic', 'bic']);
    const p = W.pens[0];
    p.x = A.x + A.w / 2; p.y = A.y + A.h / 2; p.a = 0;
    P.flick(p, -Math.PI / 2, 1.0, 0);
    let s = 0;
    while (s < 1800 && p.alive && (Math.hypot(p.vx, p.vy) > 7.5 || Math.abs(p.w) > 0.13)) {
      P.stepWorld(W, 1 / 60); P.checkOut(W); s++;
    }
    if (p.alive) { stopped++; times.push(s / 60); }
  }
  const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
  ok(stopped >= 18 && avg < 8, `${stopped}/20 contained pens reach full rest, avg ${avg.toFixed(2)}s`);
}

/* a clean full-power shove, aimed down the diagonal notch between the rail
   caps, still knocks the target off — mid-desk shots stay in (see below) */
{
  const d = P.deskById('wood'), A = d.arena, D = Math.SQRT1_2;
  let knocked = 0;
  for (let t = 0; t < 12; t++) {
    const W = P.buildWorld(d, ['bic', 'bic'], true);
    const me = W.pens[0], foe = W.pens[1];
    me.a = foe.a = -Math.PI / 4;                     // both pointing at the corner
    foe.x = A.x + A.w - 130; foe.y = A.y + 130;
    me.x = foe.x - 100 * D; me.y = foe.y + 100 * D;  // lined up behind on the diagonal
    P.flick(me, -Math.PI / 4, 1.0, 0);
    for (let i = 0; i < 420; i++) { P.stepWorld(W, 1 / 60); P.checkOut(W); }
    if (!foe.alive) knocked++;
  }
  ok(knocked >= 9, `${knocked}/12 full-power shoves through the corner notch send the target off`);
}

/* the point of the rails: a straight full-power shot at mid-desk bounces
   off the edge and STAYS ON — the round is no longer one shot long */
{
  let held = 0;
  for (const id of ['wood', 'glass']) {
    const d = P.deskById(id), A = d.arena;
    for (let t = 0; t < 6; t++) {
      const W = P.buildWorld(d, ['bic', 'bic'], true);
      const p = W.pens[0];
      p.x = A.x + A.w / 2; p.y = A.y + A.h / 2; p.a = 0;
      P.flick(p, 0, 1.0, 0);
      for (let i = 0; i < 420; i++) { P.stepWorld(W, 1 / 60); P.checkOut(W); }
      if (p.alive) held++;
    }
  }
  ok(held >= 10, `${held}/12 full-power mid-desk shots stay on behind the wood/glass rails`);
}

/* the corners are the only way out — and a skill shot, not a coin flip:
   most random full-power flicks stay on, but some still find a gap */
{
  let out = 0, trials = 0;
  P.setSeed(0xC0FFEE);
  for (const d of P.DESKS) {
    const A = d.arena;
    for (const pen of P.PENS) {
      for (let fy = 0.25; fy <= 0.7501; fy += 0.0625) {
        for (const ang of [-0.35, 0, 0.35]) {
          const W = P.buildWorld(d, [pen.id, pen.id], true);
          W.pens[1].alive = false; W.pens[1].x = W.pens[1].y = 99999;
          W.bodies = W.bodies.filter((b) => b.tag !== 'pen' || b.owner === 0);
          const p = W.pens[0];
          p.x = A.x + A.w / 2; p.y = A.y + A.h * fy; p.a = 0;
          P.flick(p, ang, 1.0, 0);
          trials++;
          for (let i = 0; i < 600 && p.alive; i++) { P.stepWorld(W, 1 / 60); P.checkOut(W); }
          if (!p.alive) out++;
        }
      }
    }
  }
  P.setSeed(0x5EED);
  const rate = out / trials;
  ok(rate < 0.3 && out > 0,
    `random full-power shots stay on ${(100 * (1 - rate)).toFixed(0)}% of the time — corners are the only way out`);
}

/* the grab point is a real lever arm — this is the whole skill mechanic */
{
  const shot = (grabT) => {
    const W = P.buildWorld(P.deskById('wood'), ['bic', 'bic']);
    const p = W.pens[0]; p.a = 0;
    P.flick(p, Math.PI / 2, 0.9, grabT);
    return { w: Math.abs(p.w), v: Math.hypot(p.vx, p.vy) };
  };
  const c = shot(0), m = shot(0.5), t = shot(1);
  ok(c.w < 0.01 && t.w > 18 && t.w > m.w && m.w > c.w,
    `spin scales with grab offset: ${c.w.toFixed(1)} / ${m.w.toFixed(1)} / ${t.w.toFixed(1)} rad/s`);
  ok(Math.abs(t.v - c.v) < 1, `grab point trades spin, not speed (${c.v.toFixed(0)} px/s either way)`);
}

/* the clutter toggle really empties the desk */
{
  const d = P.deskById('wood');
  const hasObjs = (W) => W.bodies.some((b) => b.tag === 'obj');
  ok(hasObjs(P.buildWorld(d, ['bic', 'bic'])) && !hasObjs(P.buildWorld(d, ['bic', 'bic'], true)),
    'buildWorld(bare) deals an empty desk');
}

/* the tray lip holds a full-power shot into a rail */
{
  const d = P.deskById('tray'), A = d.arena;
  let held = 0;
  for (let t = 0; t < 10; t++) {
    const W = P.buildWorld(d, ['bic', 'bic']);
    W.bodies = W.bodies.filter(b => b.tag !== 'obj');
    const p = W.pens[0];
    p.x = A.x + A.w / 2; p.y = A.y + A.h / 2; p.a = 0;
    P.flick(p, -Math.PI / 2, 1.0, 0);
    for (let i = 0; i < 240; i++) { P.stepWorld(W, 1 / 60); P.checkOut(W); }
    if (p.alive) held++;
  }
  ok(held >= 9, `${held}/10 full-power shots at a rail stay in the tray`);
}

/* snapshot/restore — the computer's forward search is worthless if this drifts */
{
  const W = P.buildWorld(P.deskById('glass'), ['gel', 'quill']);
  for (let i = 0; i < 5; i++) P.stepWorld(W, 1 / 60);
  const s = P.snapshot(W), before = JSON.stringify(s);
  P.flick(W.pens[0], 1.2, 1.0, 0.7);
  for (let i = 0; i < 120; i++) { P.stepWorld(W, 1 / 60); P.checkOut(W); }
  P.restoreSnap(W, s);
  ok(JSON.stringify(P.snapshot(W)) === before, 'world restores bit-identically after a simulated shot');
}

/* the aim dots have to match what the solver will actually do */
{
  let worst = 0, worstName = '';
  for (const dk of P.DESKS) for (const pm of P.PENS) for (const power of [0.35, 0.6, 0.85]) {
    const W = P.buildWorld(dk, [pm.id, 'bic']);
    W.bodies = W.bodies.filter(b => b.tag !== 'obj');
    const p = W.pens[0];
    p.x = -50000; p.y = 0; p.a = Math.PI / 2;
    W.pens[1].alive = false; W.pens[1].x = W.pens[1].y = 99999;
    W.arena = { x: -1e9, y: -1e9, w: 2e9, h: 2e9 };
    const x0 = p.x;
    P.flick(p, 0, power, 0);
    for (let i = 0; i < 1200; i++) { P.stepWorld(W, 1 / 60); if (Math.hypot(p.vx, p.vy) <= 30) break; }
    const actual = p.x - x0;
    let v = power * P.MAXJ * p.im, pred = 0;
    const dec = W.mu * p.grip * P.GACC;
    for (let i = 0; i < 400 && v > 30; i++) { pred += v / 60; v = Math.max(0, v - dec / 60) * (1 - 0.16 / 60); }
    const err = Math.abs(actual - pred) / pred;
    if (err > worst) { worst = err; worstName = `${dk.id}/${pm.id}@${power}`; }
  }
  ok(worst < 0.03, `aim preview within ${(worst * 100).toFixed(2)}% of simulation (worst ${worstName})`);
}

console.log('\n── game loop (stubbed DOM, real turn flow) ────────────');

const GRAD = { addColorStop() {} };
const ctxProxy = new Proxy({}, {
  get(_, p) {
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => GRAD;
    if (p === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set() { return true; }
});
const mkEl = (id) => {
  const e = {
    id, textContent: '', innerHTML: '', className: '', hidden: false,
    style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, focus() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return mkEl('sub'); }, closest() { return null; },
    // the game highlights the active player via parentElement.classList —
    // a self-reference satisfies it in this headless DOM
    get parentElement() { return this; },
    getContext() { return ctxProxy; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 640 }; },
    width: 1000, height: 640
  };
  if (id === 'pip1' || id === 'pip2') e.children = [mkEl('pip'), mkEl('pip')];
  return e;
};
const cache = {};
globalThis.document = { getElementById: (id) => (cache[id] ||= mkEl(id)), createElement: (t) => mkEl(t) };
globalThis.window = { devicePixelRatio: 1 };
globalThis.matchMedia = () => ({ matches: false });
globalThis.ResizeObserver = class { observe() {} };
globalThis.requestAnimationFrame = () => 0;   // stops the loop recursing; we drive frames by hand
let clock = 0;
/* keep markResourceTiming: undici's fetch calls it, and replacing performance
   wholesale (as older harnesses did) crashes Node's fetch mid-response */
globalThis.performance = { now: () => clock, markResourceTiming() {} };

/* each instance is a full, independent copy of the game — the net suite
   runs two of them against each other */
const makeGame = () => new Function(script + `
  ;return {G, newMatch, fireShot, loop, PENS, setSeed, NET, netDispatch, snapshot, restoreSnap};`)();
const M = makeGame();

/* seeded RNG for the harness's own random aim — keeps every run reproducible */
function mulberry32(t) {
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const PHASES = new Set(['setup', 'aim', 'sim', 'cpu', 'score', 'over']);
const frame = () => { clock += 1000 / 60; M.loop(clock); };

/* Plays with random aim — we are testing that the machine never breaks,
   not that the shots are good. */
function play(mode, diff, deskId, penIds, wantMatches, cap) {
  const G = M.G;
  G.mode = mode; G.diff = diff; G.deskId = deskId; G.penIds = penIds.slice();
  let matches = 0, flicks = 0, frames = 0, badPhase = 0, badNum = 0, bust = 0, cpuWins = 0;
  const hrng = mulberry32(0xA11CE);
  M.setSeed(0x5EED);
  M.newMatch();
  while (matches < wantMatches && frames < cap) {
    if (G.phase === 'over') {
      if (G.score[1] > G.score[0]) cpuWins++;
      matches++; M.newMatch();
    }
    if (G.phase === 'aim' && (mode === 'hot' || G.turn === 0)) {
      G.shot.angle = hrng() * Math.PI * 2;
      G.shot.power = 0.25 + hrng() * 0.75;
      G.shot.grabT = hrng() * 2 - 1;
      M.fireShot(); flicks++;
    }
    frame(); frames++;
    if (!PHASES.has(G.phase)) badPhase++;
    if (G.score[0] > 2 || G.score[1] > 2 || G.round > 40) bust++;
    if (G.W) for (const b of G.W.bodies) {
      if (b.stat) continue;
      if (![b.x, b.y, b.a, b.vx, b.vy, b.w].every(Number.isFinite)) badNum++;
    }
  }
  return { matches, flicks, frames, badPhase, badNum, bust, cpuWins };
}

let thrown = null;
try {
  for (const desk of ['wood', 'glass', 'tray']) {
    const r = play('hot', 'casual', desk, ['bic', 'gel'], 6, 90000);
    ok(r.matches >= 6 && !r.badPhase && !r.badNum && !r.bust,
      `hot seat / ${desk.padEnd(5)} — ${r.matches} matches, ${r.flicks} flicks, ${(r.frames / 60).toFixed(0)}s simulated`);
  }
  for (const diff of ['casual', 'sharp']) {
    const r = play('cpu', diff, 'wood', ['bic', 'fountain'], 4, 90000);
    ok(r.matches >= 4 && !r.badPhase && !r.badNum && !r.bust,
      `vs computer / ${diff.padEnd(6)} — ${r.matches} matches completed cleanly`);
  }
  let penOK = 0;
  for (const p of M.PENS) {
    const r = play('hot', 'casual', 'wood', [p.id, 'bic'], 2, 40000);
    if (r.matches >= 2 && !r.badNum && !r.badPhase) penOK++;
  }
  ok(penOK === M.PENS.length, `all ${M.PENS.length} pens complete matches cleanly`);

  const r = play('cpu', 'sharp', 'wood', ['bic', 'bic'], 10, 120000);
  ok(r.cpuWins >= 6, `sharp computer beats a random player ${r.cpuWins}/10 — the search is doing work`);

  /* the toss: round 1 must sometimes go to each side, and must be announced */
  {
    let blueFirst = 0;
    for (let i = 0; i < 40; i++) { M.newMatch(); if (M.G.turn === 0) blueFirst++; }
    const b = M.G.banner;
    ok(blueFirst > 5 && blueFirst < 35,
      `the toss is a real coin — Blue flicks first ${blueFirst}/40 matches`);
    ok(b && b.big === 'THE TOSS' && /FLICK FIRST/.test(b.small),
      'the toss announces who flicks first');
  }

  netPlaySuite();
} catch (e) { thrown = e; }
ok(!thrown, thrown ? 'threw: ' + thrown.stack.split('\n').slice(0, 3).join(' | ') : 'no exceptions across the whole run');

(async () => {
  if (typeof fetch === 'function') {
    try { await serverSuite(); }
    catch (e) { ok(false, 'relay server suite threw: ' + e.message); }
  } else {
    ok(false, 'relay server suite needs Node 18+ (global fetch)');
  }
  console.log(fails ? `\n${fails} FAILING\n` : '\nall checks pass\n');
  process.exit(fails ? 1 : 0);
})();

/* ── two game copies wired together at the message layer. The protocol is
      what's under test: the host is authoritative, the guest reconciles to
      its snapshots — first at matched frame rates, then at wildly different
      ones (a 60 Hz host against a 144 Hz guest). ── */
function netPlaySuite() {
  console.log('\n── net play (two instances, wired at the message layer) ──────');

  const host = makeGame(), guest = makeGame();
  const HG = host.G, GG = guest.G;
  for (const I of [host, guest]) { I.G.mode = 'net'; I.NET.on = true; }
  host.NET.role = 0;    // host = Blue
  guest.NET.role = 1;   // guest = Red
  host.NET.send = (m) => guest.netDispatch(m);
  guest.NET.send = (m) => host.netDispatch(m);

  const nrng = mulberry32(0x0CC0);
  const step = (I) => { clock += 1000 / 60; I.loop(clock); };

  let matches = 0, flicks = 0, frames = 0, badPhase = 0, badNum = 0, desync = 0;
  host.newMatch();
  while (matches < 6 && frames < 150000) {
    // whoever's turn it is fires — both instances agree on whose turn
    if (HG.phase === 'aim' && GG.phase === 'aim' && HG.turn === GG.turn) {
      const I = HG.turn === 0 ? host : guest;
      I.G.shot.angle = nrng() * Math.PI * 2;
      I.G.shot.power = 0.25 + nrng() * 0.75;
      I.G.shot.grabT = nrng() * 2 - 1;
      I.fireShot();
      flicks++;
    }
    step(host); step(guest); frames++;

    for (const I of [host, guest]) {
      if (!PHASES.has(I.G.phase)) badPhase++;
      if (I.G.W) for (const b of I.G.W.bodies) {
        if (b.stat) continue;
        if (![b.x, b.y, b.a, b.vx, b.vy, b.w].every(Number.isFinite)) badNum++;
      }
    }
    // at rest and both aiming: the two machines must agree on everything
    if (HG.phase === 'aim' && GG.phase === 'aim') {
      if (JSON.stringify(host.snapshot(HG.W)) !== JSON.stringify(guest.snapshot(GG.W))) desync++;
      if (HG.score[0] !== GG.score[0] || HG.score[1] !== GG.score[1] ||
          HG.turn !== GG.turn || HG.round !== GG.round) desync++;
    }
    if (HG.phase === 'over') { matches++; host.newMatch(); }   // host drives the rematch
  }
  ok(matches >= 6 && !badPhase && !badNum && !desync,
    `host/guest — ${matches} matches, ${flicks} relayed flicks, ${desync} desyncs, ${(frames / 60).toFixed(0)}s simulated`);

  // a disconnect drops the peer back to the setup sheet
  guest.netDispatch({ t: 'peer-left' });
  ok(GG.phase === 'setup' && !guest.NET.on, 'peer-left returns the peer to the setup sheet');

  /* a cfg that raced the start of the match must not decide the world: the
     round broadcast is the truth about pens, desk and clutter, and the guest
     adopts all three from it */
  {
    const h = makeGame(), g = makeGame();
    for (const I of [h, g]) { I.G.mode = 'net'; I.NET.on = true; }
    h.NET.role = 0; g.NET.role = 1;
    h.NET.send = (m) => g.netDispatch(m);
    g.NET.send = () => {};
    h.G.penIds = ['quill', 'gel']; h.G.deskId = 'glass'; h.G.clutter = false;
    g.G.penIds = ['bic', 'bic'];   g.G.deskId = 'wood';  g.G.clutter = true;
    h.newMatch();   // host deals: the round message carries the full setup
    ok(g.G.penIds[0] === 'quill' && g.G.penIds[1] === 'gel' &&
       g.G.deskId === 'glass' && g.G.clutter === false &&
       !g.G.W.bodies.some((b) => b.tag === 'obj'),
      'the guest adopts pens, desk and clutter from the round broadcast');
  }

  /* a 60 Hz host against a 144 Hz guest — the accumulator must make both
     machines integrate the same 1/60 s steps even though their frames are
     differently spaced, or the guest's optimistic shot diverges and snaps
     back when the host's snapshot lands */
  {
    const h = makeGame(), g = makeGame();
    const HG = h.G, GG = g.G;
    for (const I of [h, g]) { I.G.mode = 'net'; I.NET.on = true; }
    h.NET.role = 0; g.NET.role = 1;
    h.NET.send = (m) => g.netDispatch(m);
    g.NET.send = (m) => h.netDispatch(m);

    const nrng = mulberry32(0xFACE);
    // each instance gets its own virtual clock, ticking at its own refresh rate
    let hClock = clock + 1000, gClock = clock + 1000;
    let matches = 0, flicks = 0, frames = 0, desync = 0;
    h.newMatch();
    while (matches < 3 && frames < 90000) {
      if (HG.phase === 'aim' && GG.phase === 'aim' && HG.turn === GG.turn) {
        const I = HG.turn === 0 ? h : g;
        I.G.shot.angle = nrng() * Math.PI * 2;
        I.G.shot.power = 0.25 + nrng() * 0.75;
        I.G.shot.grabT = nrng() * 2 - 1;
        I.fireShot(); flicks++;
      }
      hClock += 1000 / 60;  h.loop(hClock);
      gClock += 1000 / 144; g.loop(gClock);
      frames++;
      if (HG.phase === 'aim' && GG.phase === 'aim') {
        if (JSON.stringify(h.snapshot(HG.W)) !== JSON.stringify(g.snapshot(GG.W))) desync++;
        if (HG.turn !== GG.turn || HG.round !== GG.round) desync++;
      }
      if (HG.phase === 'over') { matches++; h.newMatch(); }
    }
    ok(matches >= 3 && !desync,
      `60 Hz host vs 144 Hz guest — ${matches} matches, ${flicks} relayed flicks, ${desync} desyncs`);
  }
}

/* ── the real relay over real HTTP: create, join, presence, relay, leave ── */
async function serverSuite() {
  console.log('\n── relay server (real HTTP) ────────────────────');
  const { createServer } = require('./server.js');
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, b) => fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b || {}),
  }).then((r) => r.json());
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));

  /* one SSE reader, parsed into a queue */
  async function openStream(cred) {
    const ac = new AbortController();
    const res = await fetch(`${base}/events?room=${cred.room}&token=${cred.token}`, { signal: ac.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    const queue = [];
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const d = chunk.split('\n').find((l) => l.startsWith('data: '));
            if (d) queue.push(JSON.parse(d.slice(6)));
          }
        }
      } catch { /* aborted */ }
    })();
    return { queue, ac };
  }

  const page = await fetch(base + '/').then((r) => r.text());
  ok(page.includes('Desk Duel'), 'GET / serves the game page');

  const host = await post('/create');
  const hs = await openStream(host);          // the host listens before anyone joins
  const guest = await post('/join', { room: host.room });
  ok(typeof host.room === 'string' && host.room.length === 4 && !guest.error,
    `room ${host.room || '?'} created and joined`);
  await tick(100);
  ok(hs.queue.some((m) => m.t === 'peer-joined'), 'the host is told a peer joined');

  const third = await post('/join', { room: host.room });
  ok(!!third.error, 'a third player is refused');

  const gs = await openStream(guest);
  await post('/msg', { room: host.room, token: host.token, msg: { t: 'hi', from: 'host' } });
  await post('/msg', { room: host.room, token: guest.token, msg: { t: 'hi', from: 'guest' } });
  await tick(100);
  ok(hs.queue.some((m) => m.t === 'hi' && m.from === 'guest') &&
     gs.queue.some((m) => m.t === 'hi' && m.from === 'host'),
    'messages relay to the right peer');

  gs.ac.abort();
  await tick(200);
  ok(hs.queue.some((m) => m.t === 'peer-left'), 'the host is told the peer left');

  srv.close();
  if (srv.closeAllConnections) srv.closeAllConnections();
}
