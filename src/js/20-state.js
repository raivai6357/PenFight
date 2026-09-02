/* ══════════════════════════════════════════════════════════════════════
   GAME STATE
   ══════════════════════════════════════════════════════════════════════ */
const G = {
  mode: "cpu",
  diff: "casual",
  deskId: "wood",
  penIds: ["bic", "fountain"],
  clutter: true,      // loose objects on the desk — either player can clear them
  score: [0, 0],
  round: 1,
  turn: 0,
  phase: "setup",     // setup | aim | sim | cpu | score | over
  simT: 0,
  waitT: 0,
  pendingRound: null,
  sound: true,
  tutor: true,       // the drag tutorial — dismissed on the player's first grab
  names: ["", ""],   // what each seat is called — typed by the players
  toss: null,        // the opening coin toss: { call, result, t }
  tossSide: null,    // how the last coin landed ("HEADS"/"TAILS") — for the guest's banner
  shake: 0,
  banner: null,
  lastBanner: null,
  sparks: [],
  W: null,
  shot: { on: false, kb: false, angle: 0, power: 0, grabT: 0, ax: 0, ay: 0, px: 0, py: 0 }
};
const NAMES = ["Blue", "Red"];
/* what a seat is called when nobody has typed a name — the net seats read
   from your side of the table, the local ones from the sideline */
function seatDefault(seat) {
  if (G.mode === "cpu") return seat ? "The Desk" : "You";
  if (G.mode === "net") return seat === NET.role ? "You" : "Friend";
  return NAMES[seat];
}
/* the name a seat goes by on screen, whatever was typed or heard from the peer */
function dispName(t) {
  const n = (G.names[t] || "").trim();
  return n || seatDefault(t);
}
const HUES = ["#5a72ea", "#e2503f"];
const HUES_DEEP = ["#2b3a9e", "#9a2b21"];
const TARGET = 2;      // best of three
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* returning players (same browser) don't need the tutorial again; headless
   and file:// runs have no usable localStorage and simply keep it on */
try { if (localStorage.getItem("dd_tutored")) G.tutor = false; } catch (e) {}
