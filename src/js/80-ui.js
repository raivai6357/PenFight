/* ══════════════════════════════════════════════════════════════════════
   HUD
   ══════════════════════════════════════════════════════════════════════ */
const el = (id) => document.getElementById(id);
function bumpCount(i) {
  const n = el(i ? "s2" : "s1");
  n.classList.add("pop");
  setTimeout(() => n.classList.remove("pop"), 200);
}
function syncBoard() {
  el("s1").textContent = G.score[0];
  el("s2").textContent = G.score[1];
  el("n1").textContent = G.mode === "net" ? (NET.role === 0 ? "You" : "Friend")
    : G.mode === "cpu" ? "You" : "Blue";
  el("n2").textContent = G.mode === "net" ? (NET.role === 0 ? "Friend" : "You")
    : G.mode === "cpu" ? "The Desk" : "Red";
  el("w1").textContent = penById(G.penIds[0]).name;
  el("w2").textContent = penById(G.penIds[1]).name;
  for (let p = 0; p < 2; p++) {
    const pips = el(p ? "pip2" : "pip1").children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle("on", G.score[p] > i);
  }
  el("roundLbl").textContent = `Round ${G.round} · best of 3`;

  /* whose flick it is: their side glows in their own ink, the other dims */
  const live = G.phase === "aim" || G.phase === "cpu";
  let who = -1;
  if (live) {
    if (G.mode === "cpu") who = G.phase === "cpu" ? 1 : 0;
    else if (G.mode === "net") who = G.turn;
    else who = G.turn;   // hot seat: both sit at the same screen
  }
  el("s1").parentElement.classList.toggle("active", who === 0);
  el("s2").parentElement.classList.toggle("active", who === 1);
  const dimFoe = live && G.mode !== "hot";
  el("s1").parentElement.classList.toggle("waiting", dimFoe && who !== 0);
  el("s2").parentElement.classList.toggle("waiting", dimFoe && who !== 1);

  const st = el("stateLbl");
  let txt = "", cls = "neutral";
  if (G.phase === "setup") txt = "Choose your weapon";
  else if (G.phase === "over") txt = "Match over";
  else if (G.phase === "score") txt = "…";
  else if (G.phase === "cpu") { txt = "The desk is aiming"; cls = "red"; }
  else if (G.phase === "sim") { txt = "In flight"; cls = "neutral"; }
  else {
    const who = G.mode === "cpu" ? (G.turn === 0 ? "Your" : "Its")
      : G.mode === "net" ? (G.turn === NET.role ? "Your" : "Friend's")
      : `${NAMES[G.turn]}'s`;
    txt = `${who} flick`;
    cls = G.turn ? "red" : "blue";
  }
  st.textContent = txt;
  st.className = "state " + cls;

  el("hint").innerHTML = G.phase === "setup"
    ? "Grab your pen near the <b>tip</b> and it'll spin as it flies&mdash;glancing blows send theirs cartwheeling."
    : (G.mode === "cpu" && G.turn === 1 && G.phase !== "aim"
        ? "It's running the angles. Wooden desks stop a pen dead; glass does not."
        : (G.mode === "net" && G.phase === "aim" && G.turn !== NET.role
            ? "Your friend is lining it up&hellip;"
            : "Drag <b>backwards</b> from your pen, watch the dots, let go."));
}

/* ── setup sheet ── */
function chipCanvas(model, hue, deep) {
  const c = document.createElement("canvas");
  const w = 168, h = 26, dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  g.translate(w / 2, h / 2);
  const s = Math.min(1, (w - 12) / model.len);
  g.scale(s, s);
  g.save(); g.translate(4, 5); g.globalAlpha = .2; g.fillStyle = "#000";
  penShape(g, model.len, model.rad, model.style); g.fill(); g.restore();
  drawPenBody(g, model, hue, deep);
  return c;
}
function statBar(label, v) {
  return `<div class="bar"><span>${label}</span><i style="--v:${Math.round(v * 100)}%"></i></div>`;
}
function buildPenPicker(host, side) {
  host.innerHTML = "";
  const btns = [];
  PENS.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pen-opt";
    b.setAttribute("aria-pressed", String(G.penIds[side] === m.id));
    b.disabled = G.mode === "net" && side !== NET.role;
    b.innerHTML =
      `<span class="nm">${m.name}<em>${m.quip}</em></span>` +
      `<span class="art"></span>` +
      `<span class="bars">${statBar("Weight", (m.m - 0.6) / 0.85)}${statBar("Grip", (m.grip - 0.6) / 0.6)}${statBar("Bounce", (m.rest - 0.1) / 0.55)}</span>`;
    b.querySelector(".art").appendChild(chipCanvas(m, HUES[side], HUES_DEEP[side]));
    b.addEventListener("click", () => {
      if (b.disabled) return;
      G.penIds[side] = m.id;
      // update in place so keyboard focus survives the pick
      for (const o of btns) o.setAttribute("aria-pressed", String(o === b));
      sendCfg();
      syncBoard();
    });
    btns.push(b);
    host.appendChild(b);
  });
}
function buildDeskOpts() {
  const host = el("deskOpts");
  host.innerHTML = "";
  const btns = [];
  DESKS.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "opt";
    b.setAttribute("aria-pressed", String(G.deskId === d.id));
    b.disabled = G.mode === "net" && NET.role === 1;   // the host owns the desk
    b.innerHTML = `${d.name}<small>${d.note}</small>`;
    b.addEventListener("click", () => {
      if (b.disabled) return;
      G.deskId = d.id;
      surf = null; surfKey = "";
      for (const o of btns) o.setAttribute("aria-pressed", String(o === b));
      sendCfg();
    });
    btns.push(b);
    host.appendChild(b);
  });
}
function bindToggle(hostId, key, attr, after) {
  const host = el(hostId);
  host.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-" + attr + "]");
    if (!b) return;
    G[key] = b.dataset[attr];
    [...host.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    if (after) after();
  });
}
bindToggle("modeOpts", "mode", "mode", () => {
  el("diffRow").style.display = G.mode === "cpu" ? "" : "none";
  el("netRow").hidden = G.mode !== "net";
  el("pickLbl1").textContent = G.mode === "hot" ? "Blue picks" : "You pick";
  el("pickLbl2").textContent = G.mode === "cpu" ? "It picks" : G.mode === "net" ? "Your friend picks" : "Red picks";
  if (G.mode !== "net") NET.leave();   // leaving net mode drops the room, tells the peer
  refreshPickers();
});
bindToggle("diffOpts", "diff", "diff");
buildDeskOpts();
buildPenPicker(el("pens1"), 0);
buildPenPicker(el("pens2"), 1);

el("startBtn").addEventListener("click", () => {
  if (G.mode === "net" && (!NET.on || NET.role !== 0)) return;   // only the host deals
  audio();
  el("setupWrap").hidden = true;
  el("resultWrap").hidden = true;
  surf = null; surfKey = "";
  newMatch();
  cv.focus({ preventScroll: true });
});

function showResult() {
  const w = G.score[0] > G.score[1] ? 0 : 1;
  el("vKick").textContent = "Match over";
  const t = el("vTitle");
  t.textContent = G.mode === "cpu"
    ? (w === 0 ? "You take the desk" : "The desk takes you")
    : G.mode === "net"
      ? (w === NET.role ? "You take the desk" : "Your friend takes it")
      : `${NAMES[w]} wins`;
  t.className = w ? "red" : "blue";
  el("vSub").textContent = `${G.score[w]}–${G.score[1 - w]} on the ${deskById(G.deskId).name.toLowerCase()}.`;
  el("vTally").innerHTML =
    `<span>Blue&rsquo;s pen <b>${penById(G.penIds[0]).name}</b></span>` +
    `<span>Red&rsquo;s pen <b>${penById(G.penIds[1]).name}</b></span>` +
    `<span>Rounds played <b>${G.round}</b></span>`;
  // online, the host drives what happens next
  const lock = G.mode === "net" && NET.role === 1;
  el("againBtn").disabled = lock;
  el("changeBtn").disabled = lock;
  el("againBtn").textContent = lock ? "Waiting for host…" : "Run it back";
  el("changeBtn").textContent = lock ? "Host decides" : "Change pens";
  el("resultWrap").hidden = false;
  syncBoard();
}
el("againBtn").addEventListener("click", () => {
  if (G.mode === "net" && (!NET.on || NET.role !== 0)) return;
  el("resultWrap").hidden = true;
  newMatch();
  cv.focus({ preventScroll: true });
});
el("changeBtn").addEventListener("click", () => {
  if (G.mode === "net" && (!NET.on || NET.role !== 0)) return;
  if (G.mode === "net") NET.send({ t: "setup" });
  el("resultWrap").hidden = true;
  el("setupWrap").hidden = false;
  G.phase = "setup"; G.W = null;
  syncBoard();
});
el("quitBtn").addEventListener("click", () => {
  if (G.mode === "net" && NET.on) NET.leave();   // the peer is told we've gone
  el("resultWrap").hidden = true;
  el("setupWrap").hidden = false;
  G.phase = "setup"; G.W = null; CPU = null;
  syncBoard();
});
el("soundBtn").addEventListener("click", (ev) => {
  G.sound = !G.sound;
  ev.currentTarget.setAttribute("aria-pressed", String(G.sound));
  ev.currentTarget.textContent = G.sound ? "Sound on" : "Sound off";
  if (G.sound) audio();
});

/* ── the connection panel ── */
const DEFAULT_SERVER = (typeof location === "object" && /^https?:$/.test(location.protocol || ""))
  ? location.origin
  : "http://localhost:3000";
el("netServer").value = DEFAULT_SERVER;

el("netCreate").addEventListener("click", async () => {
  if (NET.on) NET.leave();
  netStatus("Creating a room…");
  try {
    await NET.create(el("netServer").value.trim() || DEFAULT_SERVER);
  } catch {
    netStatus("Couldn't reach the server — is it running?");
    return;
  }
  refreshPickers();
});

el("netJoinBtn").addEventListener("click", async () => {
  if (NET.on) NET.leave();
  const code = el("netCode").value.trim().toUpperCase();
  if (code.length !== 4) { netStatus("The room code is four letters."); return; }
  netStatus("Joining…");
  try {
    if (!await NET.join(el("netServer").value.trim() || DEFAULT_SERVER, code)) return;
  } catch {
    netStatus("Couldn't reach the server — is it running?");
    return;
  }
  refreshPickers();
});

el("netCode").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") { ev.preventDefault(); el("netJoinBtn").click(); }
});

/* go */
fitCanvas();
syncBoard();
requestAnimationFrame(loop);
