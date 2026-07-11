---
name: verify
description: Build/launch/drive recipe for verifying the Liar's Bar web game end-to-end in headless Chromium.
---

# Verifying Liar's Bar

Static site, no build step. Surface is a mobile browser GUI.

## Launch

```sh
python3 -m http.server 8377 &   # serve repo root
```

## Drive (headless Chromium via playwright-core)

- `npm install playwright-core` in a scratch dir; launch with
  `executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'`
  (or whatever `ls /opt/pw-browsers` shows) and
  `args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']`.
  The full `chrome` binary gets OOM-killed (exit 137) in this sandbox — use the headless shell.
- Viewport 390×844 (mobile portrait).
- Game state is globally inspectable: `page.evaluate(() => G)` exposes players/hands/turn;
  `selected` is the human's card selection set. `#overlay` + `#ovBtn` drive modal pacing.
- Loop policy that plays a full game: if `#ovBtn` visible → click Continue; if `G.humanTurn`
  → click cards (`#hand .card[data-i="N"]`) then `#playBtn`, or `#callBtn` ~25% of the time.
  A full game (to "Play again" overlay) takes ~90–120s of wall time due to bot pacing delays.
- Collect `pageerror`/console errors; expect none.

## Flows worth driving

- Full game to game-over + "Play again" restart (hands reset to 5, all alive).
- Probes that should hold: Play disabled with 0 selected; Call Liar disabled with no last play;
  selecting a 4th card is ignored (cap 3); help modal opens/closes.
- Human death → spectator mode (overlays auto-advance after ~2.2s, bots finish the game).
- Offline tab (`#tabs .tab[data-tab="offline"]`): name setup → "Load the guns" → fire via
  `#offGrid [data-fire="N"]` (1.2s spin, buttons locked during it). State is `OFF` (global),
  persisted in localStorage `liarsbar-offline`; reload should restore game view and tab choice.
