/* ══════════════════════════════════════════════════════════════════════
   NETWORK — the host runs the match; the guest mirrors its messages.
   The world itself is never streamed: rounds are rebuilt from a shared
   seed, and settled states arrive as a snapshot to restore.
   ══════════════════════════════════════════════════════════════════════ */
const NET = {
  on: false,
  role: 0,          // 0 = host (Blue), 1 = guest (Red)
  room: "",
  token: "",
  base: "",
  es: null,
  peerName: "",       // what the friend calls themselves, heard from their cfg
  lastFlick: null,   // our last announced flick, kept for a resend if it got lost
  tries: 0,

  url(path) { return this.base.replace(/\/+$/, "") + path; },
  async post(path, body) {
    const r = await fetch(this.url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return r.json();
  },
  send(msg) {
    if (!this.on) return;
    this.post("/msg", { room: this.room, token: this.token, msg }).catch(() => {});
  },
  openEvents() {
    this.es = new EventSource(this.url("/events?room=" + this.room + "&token=" + this.token));
    this.es.onmessage = (ev) => {
      try { netDispatch(JSON.parse(ev.data)); } catch { /* half a message never arrived */ }
    };
    this.es.onerror = () => { if (this.on) netPeerGone("Connection lost"); };
  },
  async create(base) {
    this.base = base;
    const r = await this.post("/create");
    this.room = r.room; this.token = r.token; this.role = 0;
    this.on = true;
    this.openEvents();
    netStatus(`Room <b>${r.room}</b> — waiting for your friend…`);
  },
  async join(base, code) {
    this.base = base;
    const r = await this.post("/join", { room: code });
    if (r.error) { netStatus(r.error); return false; }
    this.room = r.room; this.token = r.token; this.role = 1;
    this.on = true;
    this.openEvents();
    netStatus(`Joined room <b>${r.room}</b>.`);
    return true;
  },
  leave() {
    if (!this.on) return;
    const { room, token } = this;
    this.reset();
    this.post("/leave", { room, token }).catch(() => {});
  },
  reset() {
    if (this.es) { this.es.close(); this.es = null; }
    this.on = false; this.room = ""; this.token = ""; this.role = 0; this.peerName = "";
  },
};

function netStatus(html) { el("netStatus").innerHTML = html || ""; }

/* the picks you're allowed to make depend on which seat you hold */
function refreshPickers() {
  buildDeskOpts();
  buildPenPicker(el("pens1"), 0);
  buildPenPicker(el("pens2"), 1);
  const locked = G.mode === "net" && NET.role === 1;
  el("startBtn").disabled = locked;
  el("startBtn").textContent = locked ? "Waiting for host…" : "Flick off";
  el("clutterBtn").setAttribute("aria-pressed", String(G.clutter));
  applyModeToNames();   // the seat (and so the name slots) can change on connect
}

/* the desk, the clutter and the players' names are shared — either seat can
   change them and the pick syncs to both. Each seat additionally broadcasts
   its own pen and its own name. */
function sendCfg() {
  if (G.mode !== "net" || !NET.on) return;
  const m = { t: "cfg", desk: G.deskId, clutter: G.clutter };
  const nm = (G.names[NET.role] || "").trim();
  if (nm) m.name = nm.slice(0, 12);
  if (NET.role === 0) m.pen0 = G.penIds[0]; else m.pen1 = G.penIds[1];
  NET.send(m);
}

function netPeerGone(why) {
  NET.reset();
  el("resultWrap").hidden = true;
  el("setupWrap").hidden = false;
  G.phase = "setup"; G.W = null; CPU = null;
  G.toss = null;
  updateTossUI();
  netStatus(`${why}. Create or join a room to try again.`);
  refreshPickers();
  syncBoard();
}

function netDispatch(m) {
  if (!NET.on) return;
  switch (m.t) {
    case "ping":
      return;
    case "peer-joined":
      netStatus(NET.role === 0 ? "Your friend is here. Pick your pens!" : "Your friend is here.");
      sendCfg();   // both seats trade their picks and their name
      refreshPickers();
      syncBoard();
      return;
    case "peer-left":
      netPeerGone("Your friend left");
      return;
    case "cfg":
      if (m.desk) { G.deskId = m.desk; surf = null; surfKey = ""; }
      if (m.pen0) G.penIds[0] = m.pen0;
      if (m.pen1) G.penIds[1] = m.pen1;
      if (typeof m.clutter === "boolean") G.clutter = m.clutter;
      if (m.name) {
        NET.peerName = String(m.name).slice(0, 12);
        G.names[1 - NET.role] = NET.peerName;
      }
      refreshPickers();
      syncBoard();
      return;
    /* the host deals a fresh match: the guest calls the opening toss */
    case "toss":
      if (NET.role === 1) beginToss();
      return;
    /* the guest's call — the host flips the coin for both */
    case "call":
      if (NET.role === 0 && G.phase === "toss" && G.toss && !G.toss.call) runToss(m.side);
      return;
    /* the host's flip — the guest animates the same coin */
    case "flip":
      if (NET.role === 1 && G.phase === "toss" && G.toss && G.toss.call && !G.toss.result) {
        G.toss.call = m.side;
        G.toss.result = m.result;
        G.toss.t = 0;
        updateTossUI();
      }
      return;
    case "flick":
      // only if it's the sender's turn, and only while the desk is at rest
      if (G.phase === "aim" && G.W && G.turn !== NET.role) {
        fireShot({ angle: m.angle, power: m.power, grabT: m.grabT });
      }
      return;
    case "round":
      if (NET.role === 1) { NET.lastFlick = null; startRoundFromNet(m); }
      return;
    case "turn":
      if (NET.role !== 1) return;
      NET.lastFlick = null;   // acknowledged — nothing left to resend
      restoreSnap(G.W, m.snap);
      G.score = m.score.slice();
      G.round = m.round;
      G.turn = m.turn;
      G.phase = "aim";
      resetShot();
      syncBoard();
      return;
    case "over":
      if (NET.role !== 1) return;
      G.score = m.score.slice();
      G.round = m.round;
      G.phase = "over";
      showResult();
      if (m.banner) banner(m.banner.big, m.banner.small, m.banner.hue);
      return;
    case "setup":
      el("resultWrap").hidden = true;
      el("setupWrap").hidden = false;
      G.phase = "setup"; G.W = null;
      refreshPickers();   // a returning guest rebuilds its pickers with fresh state
      syncBoard();
      return;
    case "bye":
      netPeerGone("Your friend left the match");
      return;
  }
}
