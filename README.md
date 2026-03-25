# Bruteforce Billiards

Web-based billiards simulator designed for phone or laptop. It runs fully client-side with no server.

## Features

- Mode select menu:
  - `8-Ball (Simple)`
  - `Free-Play Sandbox`
- Fixed top-down camera
- Opening break in 8-ball
- Tap-to-select target ball (auto-aim)
- Power slider from normal speed up to `1.0c` max (gamified)
- Near-light visual effects at high power
- Spin picker (tap where you strike the cue ball)
- Target-ball projected path guide toggle (accounts for cut angle, spin, and power)
- Randomness slider (deterministic-ish to chaotic)
- Multi-shot undo
- Pass-and-play (`Player 1` / `Player 2`)
- Local save/resume with `localStorage`

## How To Run Locally

Because this is a static app, you can open `index.html` directly or serve it with any static file server.

Example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy To GitHub Pages

1. Push this repo to GitHub.
2. In repo settings, open `Pages`.
3. Set source to `Deploy from a branch`.
4. Choose branch `main` and folder `/ (root)`.
5. Save; GitHub will publish `index.html` as the app entrypoint.

## Controls

- Tap a target ball on the table.
- Set `Power`.
- Set `Spin / English` by tapping the mini cue-ball.
- Optional: toggle `Target Path Guide` for lining up the shot.
- Press `Shoot`.
- Press `Undo` to roll back one shot (repeat for multiple undos).
- Use `Randomness` to increase/decrease shot and collision noise.

## Simplified 8-Ball Rules (v1)

- Solids/stripes are assigned on first potted object ball.
- Scratch is allowed and cue is respotted; turn passes.
- You keep turn when you pocket your own group cleanly.
- 8-ball can win only after clearing your group and not scratching.
- If 8-ball is pocketed illegally, opponent wins.

## Notes

- Physics is intentionally gamified (not strict real-world or relativistic simulation).
- Shot speed is hard-capped at `1.0c`.
- In the simulator, a `1.0c` shot is scaled to be strong enough to carry the cue ball roughly ten back-and-forth table traversals.
- Higher power uses sub-stepping and visual effects for playability.
