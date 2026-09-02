"use strict";
/* ══════════════════════════════════════════════════════════════════════
   DESK DUEL — a turn-based pen-flicking game.

   No physics library: the CSP on published artifacts blocks CDN scripts,
   so the rigid-body solver (10-physics.js) is hand-rolled. Every body is
   a chain of circles, which keeps collision detection to circle/circle
   and circle/segment while still producing real torque — so a flick
   applied near a pen's tip genuinely spins it.
   ══════════════════════════════════════════════════════════════════════ */

/*#PHYS_START*/
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* seedable RNG — verify.js seeds it so runs reproduce exactly;
   a browser never calls setSeed and just gets Math.random */
let _rng = Math.random;
const rnd = (a, b) => a + _rng() * (b - a);
const pick = (arr) => arr[(_rng() * arr.length) | 0];
function setSeed(s) {
  let t = s >>> 0;   // mulberry32
  _rng = () => {
    t = (t + 0x6D2B79F5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── solver tuning ── */
const GACC = 780;        // px/s^2 of kinetic friction at mu = 1
const ANGDRAG = 9.0;     // rad/s^2 of spin decay at mu = 1
const BAUM = 0.22;       // penetration recovery
const SLOP = 0.45;       // allowed overlap, px
const MAXBIAS = 260;
const MAXDRAG = 210;     // px of pull-back for full power
const MAXJ = 1560;       // impulse at full power
const SPIN = 0.82;       // how much of the lever arm becomes spin
const REST_V = 7.5;      // "stopped" thresholds
const REST_W = 0.13;

let ITERS = 8;           // lowered while the CPU is searching
let SUBS = 2;

/* ── the five pens ───────────────────────────────────────────────────── */
const PENS = [
  { id:"bic",      name:"Bic Classic",      quip:"the standard issue", style:"bic",
    len:84,  rad:5.2, m:1.00, grip:1.00, rest:0.32, fric:0.30 },
  { id:"fountain", name:"Fountain Pen",     quip:"heavy, stubborn",    style:"fountain",
    len:90,  rad:6.6, m:1.38, grip:1.12, rest:0.20, fric:0.36 },
  { id:"pencil",   name:"Mechanical Pencil",quip:"light and clicky",   style:"pencil",
    len:80,  rad:4.6, m:0.84, grip:0.86, rest:0.44, fric:0.26 },
  { id:"gel",      name:"Neon Gel",         quip:"greasy, bouncy",     style:"gel",
    len:82,  rad:6.2, m:0.96, grip:0.74, rest:0.58, fric:0.20 },
  { id:"quill",    name:"Feather Quill",    quip:"absurd, and fast",   style:"quill",
    len:98,  rad:4.0, m:0.70, grip:0.70, rest:0.48, fric:0.24 }
];
const penById = (id) => PENS.find(p => p.id === id) || PENS[0];

/* ── the three surfaces ──────────────────────────────────────────────── */
/* every desk has a raised edge: four rails with the corners left open, so
   a pen has to be driven out through a gap — no more one-shot rounds off
   a bare edge. gap = corner opening, rail = rail thickness; the tray is
   the tightest, the wooden desk the most forgiving. */
const DESKS = [
  { id:"wood",  name:"Wooden Desk",   note:"grippy, edged",  mu:1.35,
    arena:{ x:72, y:58, w:856, h:452 }, lip:true, gap:118, rail:7 },
  { id:"glass", name:"Glass Table",   note:"slides, framed", mu:0.55,
    arena:{ x:96, y:64, w:808, h:440 }, lip:true, gap:96, rail:6.5 },
  { id:"tray",  name:"Cafeteria Tray",note:"walled tight",  mu:0.95,
    arena:{ x:236, y:92, w:528, h:396 }, lip:true, gap:78, rail:9 }
];
const deskById = (id) => DESKS.find(d => d.id === id) || DESKS[0];
