# Desk Duel

Two pens. One desk. Knock theirs off twice and it's yours.

A turn-based pen-flicking game — drag back from your own pen like a
slingshot and let go. Grab near the tip and it spins as it flies; glancing
blows send theirs cartwheeling. Play the desk (computer), hot seat, or a
friend over the network.

**Zero dependencies.** The physics is a hand-rolled rigid-body solver, the
sound is a tiny WebAudio synth, and the build is plain concatenation — no
npm packages, no bundler.

## Commands

| command | what it does |
|---|---|
| `npm run build` | assembles `src/` → `dist/desk-duel.html` (or `node build.js`) |
| `npm test` | rebuilds, then runs the regression harness: 24 checks over the solver, the real turn flow, net play between two game instances, and the relay server over real HTTP |
| `npm run serve` | rebuilds, serves the game + the multiplayer relay on http://localhost:3000 |

`dist/desk-duel.html` is the only file that gets published — one
self-contained page that still works double-clicked from disk. The CSP on
published artifacts blocks CDN scripts, which is why everything is inlined
rather than loaded.

## Layout

```
build.js            zero-dep assembler: src/ → dist/desk-duel.html
server.js           multiplayer relay (SSE + POST), serves the built page
verify.js           regression harness (builds first, so never stale)
src/
  index.html        page template with <!--@css@--> / <!--@js@--> markers
  styles.css        all CSS
  js/
    00-core.js      math helpers, seeded RNG, solver tuning, PENS, DESKS
    10-physics.js   the solver — between /*#PHYS_START*/ and /*#PHYS_END*/
                    markers so verify.js can extract it standalone
    20-state.js     game state object, player names/hues
    30-audio.js     the WebAudio synth
    40-render.js    canvas view, surface/pen/clutter art, draw()
    50-game.js      turn flow, CPU search, main loop
    60-net.js       NET transport + message dispatch
    70-input.js     pointer + keyboard control
    80-ui.js        HUD, setup sheet, buttons, boot
dist/
  desk-duel.html    generated artifact — do not edit by hand
```

The numbered filenames give the concatenation order with no tooling. Each
file is a slice of one script scope (not an ES module — that would need a
bundler, and the artifact must stay a single inline `<script>`), so
cross-file references work, but top-level statements can only use
declarations from earlier files. A future platform adapter (e.g. the
CrazyGames SDK) slots in as `src/js/15-platform.js`.

## Multiplayer

The relay knows nothing about the game — it just shuttles JSON between two
browsers. One player creates a room, shares the 4-letter code, the other
joins. The **host is authoritative**: it owns the deck, seeds each round,
and sends the guest settled-world snapshots to restore. The guest plays an
optimistic local simulation of its own flicks and reconciles on arrival, so
the two machines cannot drift apart even at different frame rates.

## Playing online (Render or similar)

`server.js` is a plain Node HTTP server with zero dependencies that serves
the page and relays messages, so it deploys anywhere Node runs:

1. Push the repo to GitHub.
2. On [render.com](https://render.com): **New → Web Service**, pick the repo,
   environment **Node**. No build command needed; start command `npm start`
   (the default). Render's `PORT` env var is already handled.
3. Open the assigned `https://…onrender.com` URL in two browsers — the page
   defaults its server field to its own origin, so "Create a room" works
   immediately.

Notes: rooms live in memory, so a server restart drops any match in
progress (the players just see "connection lost" and can re-create). On
Render's free tier the service sleeps after 15 idle minutes — the first
visitor then waits ~30–60s for it to wake. The 25-second SSE heartbeat
keeps an open room's connection alive while you play.

## Testing

`node verify.js` drives the real game headlessly: stability and energy
conservation across every desk/pen combination, spin as a lever arm,
snapshot/restore bit-identity, aim-preview honesty against the actual
solver, full matches in every mode, and two game instances wired together
at the message layer (6 matches, 0 desyncs allowed).
