const STORAGE_KEY = "bruteforce-billiards-save-v1";
const DEFAULT_POWER_PCT = 30;
const LIGHT_SPEED_TIMEOUT = 20;
const TABLE = { width: 1000, height: 500, rail: 34, pocketR: 24, ballR: 13 };
const PHYS = {
  dt: 1 / 120,
  friction: 0.992,
  minSpeed: 3,
  restitution: 0.96,
  cSpeed: 20000,
};

const BALL_COLORS = {
  cue: "#f8f8f8",
  eight: "#111111",
  solid1: "#ffd43b",
  solid2: "#4dabf7",
  solid3: "#f06595",
  solid4: "#845ef7",
  solid5: "#ff922b",
  solid6: "#20c997",
  solid7: "#ff6b6b",
  stripe9: "#ffd43b",
  stripe10: "#4dabf7",
  stripe11: "#f06595",
  stripe12: "#845ef7",
  stripe13: "#ff922b",
  stripe14: "#20c997",
  stripe15: "#ff6b6b",
};

const player1Badge = document.getElementById("player1Badge");
const player2Badge = document.getElementById("player2Badge");
const player1Meta = document.getElementById("player1Meta");
const player2Meta = document.getElementById("player2Meta");
const powerInput = document.getElementById("power");
const powerOut = document.getElementById("powerOut");
const spinOut = document.getElementById("spinOut");
const menuPanel = document.getElementById("menu");
const gamePanel = document.getElementById("game");
const celebrationOverlay = document.getElementById("celebrationOverlay");
const celebrationMenuBtn = document.getElementById("celebrationMenuBtn");
const tableCanvas = document.getElementById("table");
const overlayCanvas = document.getElementById("overlay");
const spinCanvas = document.getElementById("spinPicker");

const tableCtx = tableCanvas.getContext("2d");
const overlayCtx = overlayCanvas.getContext("2d");
const spinCtx = spinCanvas.getContext("2d");

const state = {
  mode: null,
  gameOver: false,
  winner: null,
  turn: 0,
  players: ["Player 1", "Player 2"],
  groups: [null, null],
  breakDone: false,
  balls: [],
  selectedTargetId: null,
  spinPick: { x: 0, y: 0 },
  cueSpin: { x: 0, y: 0 },
  randomness: 0.1,
  showProjection: true,
  powerPct: DEFAULT_POWER_PCT,
  lightSpeedMode: false,
  shooting: false,
  shotContext: null,
  history: [],
  warp: { intensity: 0, time: 0 },
  flash: { text: "", time: 0, tone: "good" },
  message: "Tap a target ball, adjust power, then shoot.",
};

let celebrationTimers = [];

function playRect() {
  return {
    left: TABLE.rail,
    top: TABLE.rail,
    right: TABLE.width - TABLE.rail,
    bottom: TABLE.height - TABLE.rail,
  };
}

function pockets() {
  const p = playRect();
  const midX = (p.left + p.right) / 2;
  return [
    { x: p.left, y: p.top },
    { x: midX, y: p.top },
    { x: p.right, y: p.top },
    { x: p.left, y: p.bottom },
    { x: midX, y: p.bottom },
    { x: p.right, y: p.bottom },
  ];
}

function randomJitter(scale) {
  return (Math.random() * 2 - 1) * scale * state.randomness;
}

function normalize(vx, vy) {
  const m = Math.hypot(vx, vy) || 1;
  return { x: vx / m, y: vy / m };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ballSpeed(ball) {
  return Math.hypot(ball.vx, ball.vy);
}

function triggerFlash(text, tone) {
  state.flash = { text, time: 0.9, tone };
}

function isLightSpeedPower() {
  return state.powerPct >= 100;
}

function getBallById(id) {
  return state.balls.find((b) => b.id === id && b.active);
}

function activeBalls() {
  return state.balls.filter((b) => b.active);
}

function createBall(id, number, x, y, kind, color, stripe = false) {
  return {
    id,
    number,
    x,
    y,
    vx: 0,
    vy: 0,
    active: true,
    kind,
    color,
    stripe,
    r: TABLE.ballR,
  };
}

function rackSpots() {
  const p = playRect();
  const tipX = p.left + (p.right - p.left) * 0.72;
  const tipY = (p.top + p.bottom) / 2;
  const spacing = TABLE.ballR * 2.05;
  const spots = [];

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      spots.push({
        x: tipX + row * (spacing * 0.88),
        y: tipY - (row * spacing) / 2 + col * spacing,
      });
    }
  }

  return spots;
}

function rackBalls(mode) {
  const balls = [];
  const p = playRect();
  const cueX = p.left + (p.right - p.left) * 0.22;
  const cueY = (p.top + p.bottom) / 2;
  balls.push(createBall("cue", 0, cueX, cueY, "cue", BALL_COLORS.cue));

  if (mode === "sandbox") {
    const spots = rackSpots();
    const targetSpot = spots[Math.floor(Math.random() * spots.length)];
    balls.push(
      createBall("target", 1, targetSpot.x, targetSpot.y, "solid", "#ffd43b")
    );
    return balls;
  }

  const order = [
    1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15,
  ];

  let k = 0;
  const spots = rackSpots();
  for (let i = 0; i < spots.length; i++) {
    const { x, y } = spots[i];
      const n = order[k++];
      const kind = n === 8 ? "eight" : n < 8 ? "solid" : "stripe";
      const colorKey =
        n === 8
          ? "eight"
          : n < 8
            ? `solid${n}`
            : `stripe${n}`;
      balls.push(
        createBall(`ball-${n}`, n, x, y, kind, BALL_COLORS[colorKey], n > 8)
      );
  }

  return balls;
}

function startGame(mode) {
  clearCelebration();
  state.mode = mode;
  state.gameOver = false;
  state.winner = null;
  state.turn = 0;
  state.groups = [null, null];
  state.breakDone = mode === "sandbox";
  state.balls = rackBalls(mode);
  state.selectedTargetId = findDefaultTarget();
  state.history = [];
  state.shooting = false;
  state.message =
    mode === "8ball"
      ? "Break shot: tap a target ball then shoot."
      : "Sandbox: tap any ball and shoot.";
  state.shotContext = null;
  saveState();
  updateLabels();
  showGame();
}

function currentPlayerName() {
  return state.players[state.turn];
}

function clearCelebration() {
  celebrationTimers.forEach((id) => clearTimeout(id));
  celebrationTimers = [];
  celebrationOverlay.classList.remove("active", "stage-1", "stage-2", "stage-3");
  celebrationOverlay.setAttribute("aria-hidden", "true");
}

function startCelebration() {
  clearCelebration();
  celebrationOverlay.classList.add("active", "stage-1");
  celebrationOverlay.setAttribute("aria-hidden", "false");
  celebrationTimers.push(
    setTimeout(() => celebrationOverlay.classList.add("stage-2"), 2600)
  );
  celebrationTimers.push(
    setTimeout(() => celebrationOverlay.classList.add("stage-3"), 5200)
  );
}

function playerGroupLabel(idx) {
  const g = state.groups[idx];
  if (!g) return "Open table";
  return g === "solid" ? "Solids" : "Stripes";
}

function remainingBallsText(idx) {
  if (state.mode !== "8ball") return "Open table";
  const group = state.groups[idx];
  if (!group) return "Open table";
  const remaining = activeBalls().filter((b) => b.kind === group).length;
  return `${remaining} ${group} left`;
}

function updateLabels() {
  player1Badge.classList.toggle("player-badge-active", state.turn === 0);
  player2Badge.classList.toggle("player-badge-active", state.turn === 1);
  player1Meta.textContent = remainingBallsText(0);
  player2Meta.textContent = remainingBallsText(1);

  powerOut.textContent = `${state.powerPct}%`;

  const sx = state.spinPick.x.toFixed(2);
  const sy = (-state.spinPick.y).toFixed(2);
  spinOut.textContent = `Spin x:${sx} y:${sy}`;
}

function findDefaultTarget() {
  const cue = getBallById("cue");
  if (!cue) return null;
  let best = null;
  let bestDist = Infinity;
  for (const b of activeBalls()) {
    if (b.id === "cue") continue;
    const d = Math.hypot(b.x - cue.x, b.y - cue.y);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best ? best.id : null;
}

function mapPowerToSpeed(pct) {
  const t = pct / 100;
  const baseSpeed = 200 + t * t * (PHYS.cSpeed - 200);
  if (pct < 100) return baseSpeed;
  return PHYS.cSpeed * 1.6;
}

function buildShotVelocity(cue, target, includeRandomness) {
  const dir = normalize(target.x - cue.x, target.y - cue.y);
  const side = state.spinPick.x;
  const topBottom = state.spinPick.y;
  const perp = { x: -dir.y, y: dir.x };
  const speed = mapPowerToSpeed(state.powerPct);
  const launchNoise = includeRandomness ? 0.02 + 0.12 * state.randomness : 0;
  const noiseAngle = randomJitter(launchNoise);
  const nDir = {
    x: dir.x * Math.cos(noiseAngle) - dir.y * Math.sin(noiseAngle),
    y: dir.x * Math.sin(noiseAngle) + dir.y * Math.cos(noiseAngle),
  };

  return {
    x: (nDir.x * speed + perp.x * speed * 0.2 * side) * (1 + topBottom * 0.15),
    y: (nDir.y * speed + perp.y * speed * 0.2 * side) * (1 + topBottom * 0.15),
    speed,
  };
}

function estimateStoppingDistance(initialSpeed) {
  if (initialSpeed <= PHYS.minSpeed) return 0;

  const drag = PHYS.friction;
  const idealDistance = (initialSpeed * PHYS.dt) / (1 - drag);
  return Math.max(0, idealDistance);
}

function stepBallPhysics(ball, dt, options = {}) {
  const p = playRect();
  const applyFriction = options.applyFriction !== false;
  const drag = options.drag ?? 1;
  const railJitter = options.railJitter ?? 0;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (applyFriction) {
    const decayPower = dt / PHYS.dt;
    const decay = Math.pow(PHYS.friction * drag, decayPower);
    ball.vx *= decay;
    ball.vy *= decay;
  }

  if (Math.abs(ball.vx) < PHYS.minSpeed) ball.vx = 0;
  if (Math.abs(ball.vy) < PHYS.minSpeed) ball.vy = 0;

  if (ball.x - ball.r < p.left) {
    ball.x = p.left + ball.r;
    ball.vx = Math.abs(ball.vx) * PHYS.restitution;
    ball.vy += railJitter ? randomJitter(railJitter) : 0;
  }
  if (ball.x + ball.r > p.right) {
    ball.x = p.right - ball.r;
    ball.vx = -Math.abs(ball.vx) * PHYS.restitution;
    ball.vy += railJitter ? randomJitter(railJitter) : 0;
  }
  if (ball.y - ball.r < p.top) {
    ball.y = p.top + ball.r;
    ball.vy = Math.abs(ball.vy) * PHYS.restitution;
    ball.vx += railJitter ? randomJitter(railJitter) : 0;
  }
  if (ball.y + ball.r > p.bottom) {
    ball.y = p.bottom - ball.r;
    ball.vy = -Math.abs(ball.vy) * PHYS.restitution;
    ball.vx += railJitter ? randomJitter(railJitter) : 0;
  }
}

function resolveBallCollision(a, b, options = {}) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist === 0 || dist >= minDist) return false;

  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velAlongNormal = rvx * nx + rvy * ny;
  if (velAlongNormal > 0) return false;

  const jImpulse = -(1 + PHYS.restitution) * velAlongNormal / 2;
  const jx = jImpulse * nx;
  const jy = jImpulse * ny;

  a.vx -= jx;
  a.vy -= jy;
  b.vx += jx;
  b.vy += jy;

  const tangent = { x: -ny, y: nx };
  const slipScale = options.slipScale ?? 0;
  if (slipScale) {
    const slip = randomJitter(slipScale);
    a.vx += tangent.x * slip;
    a.vy += tangent.y * slip;
    b.vx -= tangent.x * slip;
    b.vy -= tangent.y * slip;
  }

  if (typeof options.onCueContact === "function") {
    options.onCueContact(a, b);
  }

  return true;
}

function simulateBallPath(ball, maxSteps, sampleEvery) {
  const sim = { ...ball };
  const points = [{ x: sim.x, y: sim.y }];
  let pocketed = false;

  for (let i = 0; i < maxSteps; i++) {
    stepBallPhysics(sim, PHYS.dt);

    if (i % sampleEvery === 0) {
      points.push({ x: sim.x, y: sim.y });
    }

    for (const pocket of pockets()) {
      if (Math.hypot(sim.x - pocket.x, sim.y - pocket.y) < TABLE.pocketR) {
        points.push({ x: pocket.x, y: pocket.y });
        pocketed = true;
        break;
      }
    }
    if (pocketed || (sim.vx === 0 && sim.vy === 0)) break;
  }

  return { points, pocketed };
}

function simulatePreviewShot(cue, target) {
  const previewCue = {
    x: cue.x,
    y: cue.y,
    vx: 0,
    vy: 0,
    r: cue.r,
  };
  const velocity = buildShotVelocity(cue, target, false);
  previewCue.vx = velocity.x;
  previewCue.vy = velocity.y;

  const points = [{ x: previewCue.x, y: previewCue.y }];
  const maxSteps = 1200;
  let contact = null;

  for (let i = 0; i < maxSteps; i++) {
    const side = state.spinPick.x;
    const ox = previewCue.vx;
    const curve = side * 0.0008;
    previewCue.vx += -previewCue.vy * curve;
    previewCue.vy += ox * curve;

    stepBallPhysics(previewCue, PHYS.dt, {
      applyFriction: !isLightSpeedPower(),
      drag: 1 - Math.abs(state.spinPick.y) * 0.001,
    });

    if (i % 4 === 0) {
      points.push({ x: previewCue.x, y: previewCue.y });
    }

    const previewTarget = {
      x: target.x,
      y: target.y,
      vx: 0,
      vy: 0,
      r: target.r,
    };
    if (resolveBallCollision(previewCue, previewTarget)) {
      const targetPath = simulateBallPath(previewTarget, 1200, 4);
      contact = {
        x: previewCue.x,
        y: previewCue.y,
        targetPoints: targetPath.points,
      };
      break;
    }

    if (Math.hypot(previewCue.vx, previewCue.vy) <= PHYS.minSpeed) {
      break;
    }
  }

  return { points, contact };
}

function beginShot() {
  if (state.gameOver || state.shooting) return;
  const cue = getBallById("cue");
  const target = getBallById(state.selectedTargetId);
  if (!cue || !target) {
    state.message = "Pick a target ball first.";
    updateLabels();
    return;
  }

  for (const b of activeBalls()) {
    if (ballSpeed(b) > PHYS.minSpeed) {
      state.message = "Wait until balls stop moving.";
      updateLabels();
      return;
    }
  }

  pushHistory();

  const velocity = buildShotVelocity(cue, target, true);
  const speed = velocity.speed;
  cue.vx = velocity.x;
  cue.vy = velocity.y;
  state.cueSpin = { x: state.spinPick.x, y: state.spinPick.y };
  state.lightSpeedMode = isLightSpeedPower();
  state.shooting = true;
  state.shotContext = {
    pocketed: [],
    firstContact: null,
    shooter: state.turn,
    wasBreak: !state.breakDone && state.mode === "8ball",
    lightSpeedTime: 0,
  };

  if (speed > PHYS.cSpeed * 0.85) {
    state.warp.intensity = Math.min(
      1,
      (speed - PHYS.cSpeed * 0.85) / (PHYS.cSpeed * 0.15)
    );
    state.warp.time = 0.35;
  }

  state.message = `Shot by ${currentPlayerName()}`;
  updateLabels();
}

function anyBallMoving() {
  return activeBalls().some((b) => ballSpeed(b) > PHYS.minSpeed);
}

function step(dt) {
  if (state.shooting && state.lightSpeedMode && state.shotContext) {
    state.shotContext.lightSpeedTime += dt;
    if (state.shotContext.lightSpeedTime >= LIGHT_SPEED_TIMEOUT) {
      const cue = getBallById("cue");
      if (cue) {
        cue.vx = 0;
        cue.vy = 0;
      }
      state.lightSpeedMode = false;
    }
  }

  const subSteps = Math.max(
    1,
    Math.min(
      14,
      Math.ceil(Math.max(...activeBalls().map((b) => ballSpeed(b)), 0) / 600)
    )
  );
  const h = dt / subSteps;

  for (let s = 0; s < subSteps; s++) {
    for (const b of activeBalls()) {
      if (b.id === "cue") {
        // Cheap spin curve for visible english effect.
        const side = state.cueSpin.x;
        const curve = side * 0.0008;
        const ox = b.vx;
        b.vx += -b.vy * curve * h * 120;
        b.vy += ox * curve * h * 120;
      }

      stepBallPhysics(b, h, {
        applyFriction: !(b.id === "cue" && state.lightSpeedMode),
        drag: b.id === "cue" ? 1 - Math.abs(state.cueSpin.y) * 0.001 : 1,
        railJitter: 35,
      });
    }

    collideBalls();
    handlePockets();
  }

  if (state.warp.time > 0) {
    state.warp.time -= dt;
    if (state.warp.time <= 0) state.warp.intensity = 0;
  }

  if (state.flash.time > 0) {
    state.flash.time = Math.max(0, state.flash.time - dt);
    if (state.flash.time === 0) {
      state.flash.text = "";
    }
  }

  if (state.shooting && !anyBallMoving()) {
    state.shooting = false;
    evaluateShotEnd();
    saveState();
  }
}

function collideBalls() {
  const list = activeBalls();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      resolveBallCollision(a, b, {
        slipScale: 20,
        onCueContact(ballA, ballB) {
          if (
            !state.shotContext?.firstContact &&
            ((ballA.id === "cue" && ballB.id !== "cue") ||
              (ballB.id === "cue" && ballA.id !== "cue"))
          ) {
            state.shotContext.firstContact = ballA.id === "cue" ? ballB.id : ballA.id;
          }
        },
      });
    }
  }
}

function handlePockets() {
  for (const b of activeBalls()) {
    for (const p of pockets()) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < TABLE.pocketR) {
        b.active = false;
        b.vx = 0;
        b.vy = 0;
        if (state.shotContext) state.shotContext.pocketed.push(b.id);
        if (b.id === "cue") {
          triggerFlash("Scratch", "bad");
        } else {
          triggerFlash("Nice shot", "good");
        }
        break;
      }
    }
  }
}

function evaluateShotEnd() {
  const ctx = state.shotContext;
  if (!ctx) return;
  state.spinPick = { x: 0, y: 0 };
  state.cueSpin = { x: 0, y: 0 };
  state.lightSpeedMode = false;
  state.powerPct = DEFAULT_POWER_PCT;
  powerInput.value = String(DEFAULT_POWER_PCT);

  const cuePocketed = ctx.pocketed.includes("cue");

  if (cuePocketed) {
    const p = playRect();
    const cue = state.balls.find((b) => b.id === "cue");
    cue.active = true;
    cue.x = p.left + (p.right - p.left) * 0.2;
    cue.y = (p.top + p.bottom) / 2;
    cue.vx = 0;
    cue.vy = 0;
  }

  if (state.mode === "sandbox") {
    if (!activeBalls().some((b) => b.id !== "cue")) {
      state.gameOver = true;
      state.message = "Sandbox clear.";
      state.selectedTargetId = null;
      updateLabels();
      startCelebration();
      return;
    }
    state.message = cuePocketed
      ? "Scratch in sandbox. Cue ball respotted."
      : "Shot complete.";
    state.selectedTargetId = findDefaultTarget();
    updateLabels();
    return;
  }

  if (ctx.wasBreak) state.breakDone = true;

  const pocketedBalls = ctx.pocketed
    .map((id) => state.balls.find((b) => b.id === id))
    .filter(Boolean)
    .filter((b) => b.id !== "cue");

  const pocketedEight = pocketedBalls.some((b) => b.kind === "eight");
  const shooter = ctx.shooter;
  const opponent = shooter === 0 ? 1 : 0;
  const firstContactBall = state.balls.find((b) => b.id === ctx.firstContact) || null;

  if (pocketedEight) {
    const group = state.groups[shooter];
    const ownLeft = activeBalls().some((b) => b.kind === group);
    const legal = group && !ownLeft && !cuePocketed;
    state.gameOver = true;
    state.winner = legal ? state.players[shooter] : state.players[opponent];
    state.message = legal
      ? `${state.winner} wins by sinking the 8-ball.`
      : `${state.winner} wins (8-ball foul).`;
    updateLabels();
    if (legal) startCelebration();
    return;
  }

  if (!state.groups[0] || !state.groups[1]) {
    const first = pocketedBalls.find((b) => b.kind === "solid" || b.kind === "stripe");
    if (first) {
      state.groups[shooter] = first.kind;
      state.groups[opponent] = first.kind === "solid" ? "stripe" : "solid";
    }
  }

  const ownGroup = state.groups[shooter];
  const sunkOwn = pocketedBalls.some((b) => b.kind === ownGroup);
  const foulByFirstContact =
    ownGroup && ctx.firstContact
      ? firstContactBall?.kind !== ownGroup && firstContactBall?.kind !== "eight"
      : false;

  const keepTurn = !cuePocketed && !foulByFirstContact && sunkOwn;
  if (!keepTurn) {
    state.turn = opponent;
  }

  if (cuePocketed) {
    state.message = `Scratch. Turn to ${currentPlayerName()}.`;
  } else if (keepTurn) {
    state.message = `${currentPlayerName()} continues.`;
  } else {
    state.message = `Turn to ${currentPlayerName()}.`;
  }

  state.selectedTargetId = findDefaultTarget();
  updateLabels();
}

function drawTable() {
  tableCtx.clearRect(0, 0, TABLE.width, TABLE.height);

  tableCtx.fillStyle = "#6f4b2a";
  tableCtx.fillRect(0, 0, TABLE.width, TABLE.height);

  const p = playRect();
  const feltGrad = tableCtx.createLinearGradient(p.left, p.top, p.right, p.bottom);
  feltGrad.addColorStop(0, "#239e56");
  feltGrad.addColorStop(1, "#1a7d44");
  tableCtx.fillStyle = feltGrad;
  tableCtx.fillRect(p.left, p.top, p.right - p.left, p.bottom - p.top);

  tableCtx.strokeStyle = "rgba(255,255,255,0.18)";
  tableCtx.lineWidth = 1;
  tableCtx.strokeRect(p.left, p.top, p.right - p.left, p.bottom - p.top);

  tableCtx.fillStyle = "#0a0a0a";
  for (const pocket of pockets()) {
    tableCtx.beginPath();
    tableCtx.arc(pocket.x, pocket.y, TABLE.pocketR, 0, Math.PI * 2);
    tableCtx.fill();
  }

  for (const b of activeBalls()) {
    drawBall(b);
  }
}

function drawBall(ball) {
  const grad = tableCtx.createRadialGradient(
    ball.x - ball.r * 0.3,
    ball.y - ball.r * 0.3,
    2,
    ball.x,
    ball.y,
    ball.r
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.15, ball.color);
  grad.addColorStop(1, "#222222");

  tableCtx.beginPath();
  tableCtx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  tableCtx.fillStyle = grad;
  tableCtx.fill();

  if (ball.stripe) {
    tableCtx.fillStyle = "#f2f2f2";
    tableCtx.beginPath();
    tableCtx.ellipse(ball.x, ball.y, ball.r, ball.r * 0.45, 0, 0, Math.PI * 2);
    tableCtx.fill();
  }

  if (ball.number > 0) {
    tableCtx.fillStyle = ball.kind === "eight" ? "#f6f6f6" : "#111";
    tableCtx.font = "bold 9px sans-serif";
    tableCtx.textAlign = "center";
    tableCtx.textBaseline = "middle";
    tableCtx.fillText(String(ball.number), ball.x, ball.y);
  }
}

function drawCueStick(cue, target) {
  const aim = normalize(target.x - cue.x, target.y - cue.y);
  const startOffset = cue.r + 12;
  const stickLength = 160;
  const backX = cue.x - aim.x * (startOffset + stickLength);
  const backY = cue.y - aim.y * (startOffset + stickLength);
  const frontX = cue.x - aim.x * startOffset;
  const frontY = cue.y - aim.y * startOffset;

  overlayCtx.save();
  overlayCtx.lineCap = "round";

  overlayCtx.strokeStyle = "#5f3a1b";
  overlayCtx.lineWidth = 7;
  overlayCtx.beginPath();
  overlayCtx.moveTo(backX, backY);
  overlayCtx.lineTo(frontX, frontY);
  overlayCtx.stroke();

  overlayCtx.strokeStyle = "#d9c28a";
  overlayCtx.lineWidth = 2;
  overlayCtx.beginPath();
  overlayCtx.moveTo(backX + aim.x * 10, backY + aim.y * 10);
  overlayCtx.lineTo(frontX, frontY);
  overlayCtx.stroke();

  overlayCtx.strokeStyle = "#d9ecff";
  overlayCtx.lineWidth = 3;
  overlayCtx.beginPath();
  overlayCtx.moveTo(frontX, frontY);
  overlayCtx.lineTo(frontX + aim.x * 8, frontY + aim.y * 8);
  overlayCtx.stroke();

  overlayCtx.restore();
}

function drawOverlay() {
  overlayCtx.clearRect(0, 0, TABLE.width, TABLE.height);

  if (state.warp.intensity > 0) {
    const alpha = 0.15 + state.warp.intensity * 0.25;
    overlayCtx.fillStyle = `rgba(255,190,11,${alpha})`;
    overlayCtx.fillRect(0, 0, TABLE.width, TABLE.height);
  }

  if (state.flash.time > 0 && state.flash.text) {
    const alpha = Math.min(1, state.flash.time / 0.9);
    overlayCtx.save();
    overlayCtx.fillStyle =
      state.flash.tone === "bad"
        ? `rgba(255, 99, 99, ${0.18 * alpha})`
        : `rgba(255, 190, 11, ${0.18 * alpha})`;
    overlayCtx.fillRect(0, 0, TABLE.width, TABLE.height);
    overlayCtx.font = "bold 42px Trebuchet MS, sans-serif";
    overlayCtx.textAlign = "center";
    overlayCtx.textBaseline = "middle";
    overlayCtx.lineWidth = 6;
    overlayCtx.strokeStyle = `rgba(10, 20, 32, ${0.7 * alpha})`;
    overlayCtx.fillStyle =
      state.flash.tone === "bad"
        ? `rgba(255, 235, 235, ${alpha})`
        : `rgba(255, 248, 214, ${alpha})`;
    overlayCtx.strokeText(state.flash.text, TABLE.width / 2, TABLE.height / 2);
    overlayCtx.fillText(state.flash.text, TABLE.width / 2, TABLE.height / 2);
    overlayCtx.restore();
  }

  const cue = getBallById("cue");
  const target = getBallById(state.selectedTargetId);
  if (!cue || !target || state.shooting) return;

  drawCueStick(cue, target);

  overlayCtx.strokeStyle = "rgba(255,255,255,0.65)";
  overlayCtx.lineWidth = 2;
  overlayCtx.setLineDash([8, 5]);
  overlayCtx.beginPath();
  overlayCtx.moveTo(cue.x, cue.y);
  overlayCtx.lineTo(target.x, target.y);
  overlayCtx.stroke();
  overlayCtx.setLineDash([]);

  overlayCtx.strokeStyle = "rgba(255,190,11,0.95)";
  overlayCtx.lineWidth = 3;
  overlayCtx.beginPath();
  overlayCtx.arc(target.x, target.y, target.r + 4, 0, Math.PI * 2);
  overlayCtx.stroke();

  if (state.showProjection) {
    const preview = simulatePreviewShot(cue, target);

    overlayCtx.strokeStyle = "rgba(180,230,255,0.85)";
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([8, 5]);
    overlayCtx.beginPath();
    overlayCtx.moveTo(preview.points[0].x, preview.points[0].y);
    for (let i = 1; i < preview.points.length; i++) {
      overlayCtx.lineTo(preview.points[i].x, preview.points[i].y);
    }
    overlayCtx.stroke();
    overlayCtx.setLineDash([]);

    if (preview.contact) {
      overlayCtx.strokeStyle = "rgba(80,220,255,0.9)";
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([6, 4]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(preview.contact.targetPoints[0].x, preview.contact.targetPoints[0].y);
      for (let i = 1; i < preview.contact.targetPoints.length; i++) {
        overlayCtx.lineTo(
          preview.contact.targetPoints[i].x,
          preview.contact.targetPoints[i].y
        );
      }
      overlayCtx.stroke();
      overlayCtx.setLineDash([]);

      overlayCtx.fillStyle = "rgba(80,220,255,0.9)";
      overlayCtx.beginPath();
      overlayCtx.arc(preview.contact.x, preview.contact.y, 4, 0, Math.PI * 2);
      overlayCtx.fill();
    }
  }

  if (state.powerPct > 70) {
    const speed = mapPowerToSpeed(state.powerPct);
    const flashes = Math.min(8, Math.floor((speed / PHYS.cSpeed) * 4));
    overlayCtx.strokeStyle = "rgba(255,80,80,0.5)";
    for (let i = 0; i < flashes; i++) {
      const t = i / Math.max(1, flashes - 1);
      const x = cue.x + (target.x - cue.x) * t;
      const y = cue.y + (target.y - cue.y) * t;
      overlayCtx.beginPath();
      overlayCtx.moveTo(x - 8, y - 3);
      overlayCtx.lineTo(x + 8, y + 3);
      overlayCtx.stroke();
    }
  }
}

function drawSpinPicker() {
  const c = spinCanvas.width / 2;
  const r = spinCanvas.width * 0.43;
  spinCtx.clearRect(0, 0, spinCanvas.width, spinCanvas.height);

  spinCtx.fillStyle = "#f8f9fa";
  spinCtx.beginPath();
  spinCtx.arc(c, c, r, 0, Math.PI * 2);
  spinCtx.fill();

  spinCtx.strokeStyle = "#204060";
  spinCtx.lineWidth = 2;
  spinCtx.beginPath();
  spinCtx.arc(c, c, r, 0, Math.PI * 2);
  spinCtx.stroke();

  spinCtx.strokeStyle = "rgba(0,0,0,0.25)";
  spinCtx.beginPath();
  spinCtx.moveTo(c - r, c);
  spinCtx.lineTo(c + r, c);
  spinCtx.moveTo(c, c - r);
  spinCtx.lineTo(c, c + r);
  spinCtx.stroke();

  const px = c + state.spinPick.x * r;
  const py = c + state.spinPick.y * r;
  spinCtx.fillStyle = "#ff6b6b";
  spinCtx.beginPath();
  spinCtx.arc(px, py, 7, 0, Math.PI * 2);
  spinCtx.fill();
}

function pushHistory() {
  const snapshot = {
    mode: state.mode,
    gameOver: state.gameOver,
    winner: state.winner,
    turn: state.turn,
    groups: [...state.groups],
    breakDone: state.breakDone,
    selectedTargetId: state.selectedTargetId,
    spinPick: { ...state.spinPick },
    randomness: state.randomness,
    showProjection: state.showProjection,
    powerPct: state.powerPct,
    balls: state.balls.map((b) => ({ ...b })),
    message: state.message,
  };
  state.history.push(snapshot);
  if (state.history.length > 80) state.history.shift();
}

function undoShot() {
  if (!state.history.length || state.shooting) return;
  clearCelebration();
  const last = state.history.pop();
  state.mode = last.mode;
  state.gameOver = last.gameOver;
  state.winner = last.winner;
  state.turn = last.turn;
  state.groups = [...last.groups];
  state.breakDone = last.breakDone;
  state.selectedTargetId = last.selectedTargetId;
  state.spinPick = { ...last.spinPick };
  state.randomness = last.randomness;
  state.showProjection = last.showProjection ?? true;
  state.powerPct = last.powerPct;
  state.balls = last.balls.map((b) => ({ ...b }));
  state.message = "Undid last shot.";
  state.shooting = false;
  state.shotContext = null;
  powerInput.value = String(state.powerPct);
  saveState();
  updateLabels();
}

function saveState() {
  const save = {
    mode: state.mode,
    gameOver: state.gameOver,
    winner: state.winner,
    turn: state.turn,
    groups: state.groups,
    breakDone: state.breakDone,
    balls: state.balls,
    selectedTargetId: state.selectedTargetId,
    spinPick: state.spinPick,
    randomness: state.randomness,
    showProjection: state.showProjection,
    powerPct: state.powerPct,
    history: state.history,
    message: state.message,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    clearCelebration();
    const save = JSON.parse(raw);
    state.mode = save.mode;
    state.gameOver = !!save.gameOver;
    state.winner = save.winner;
    state.turn = save.turn || 0;
    state.groups = save.groups || [null, null];
    state.breakDone = !!save.breakDone;
    state.balls = (save.balls || []).map((b) => ({ ...b }));
    state.selectedTargetId = save.selectedTargetId;
    state.spinPick = save.spinPick || { x: 0, y: 0 };
    state.randomness = save.randomness ?? 0.1;
    state.showProjection = save.showProjection ?? true;
    state.powerPct = save.powerPct ?? 30;
    state.history = (save.history || []).map((h) => ({
      ...h,
      balls: (h.balls || []).map((b) => ({ ...b })),
    }));
    state.message = save.message || "Loaded saved game.";
    state.shooting = false;
    state.shotContext = null;
    powerInput.value = String(state.powerPct);
    updateLabels();
    showGame();
    return true;
  } catch {
    return false;
  }
}

function toCanvasCoords(evt, canvas, logicalWidth, logicalHeight) {
  const rect = canvas.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * logicalWidth;
  const y = ((evt.clientY - rect.top) / rect.height) * logicalHeight;
  return { x, y };
}

function handleTableTap(evt) {
  if (!state.mode || state.shooting) return;
  const { x, y } = toCanvasCoords(evt, overlayCanvas, TABLE.width, TABLE.height);
  let picked = null;
  let best = 99999;
  for (const b of activeBalls()) {
    if (b.id === "cue") continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < b.r * 1.8 && d < best) {
      picked = b;
      best = d;
    }
  }
  if (picked) {
    state.selectedTargetId = picked.id;
    state.message = `Target selected: ball ${picked.number || picked.id}`;
    updateLabels();
  }
}

function setSpinFromEvent(evt) {
  const { x, y } = toCanvasCoords(
    evt,
    spinCanvas,
    spinCanvas.width,
    spinCanvas.height
  );
  const c = spinCanvas.width / 2;
  const r = spinCanvas.width * 0.43;
  let dx = (x - c) / r;
  let dy = (y - c) / r;
  const m = Math.hypot(dx, dy);
  if (m > 1) {
    dx /= m;
    dy /= m;
  }
  state.spinPick = { x: dx, y: dy };
  updateLabels();
}

function showMenu() {
  clearCelebration();
  menuPanel.classList.add("active");
  gamePanel.classList.remove("active");
}

function showGame() {
  menuPanel.classList.remove("active");
  gamePanel.classList.add("active");
}

function showCelebrationPreview() {
  clearCelebration();
  state.mode = "sandbox";
  state.gameOver = true;
  state.winner = null;
  state.turn = 0;
  state.groups = [null, null];
  state.breakDone = true;
  state.balls = rackBalls("sandbox");
  state.selectedTargetId = null;
  state.history = [];
  state.shooting = false;
  state.shotContext = null;
  state.lightSpeedMode = false;
  state.spinPick = { x: 0, y: 0 };
  state.cueSpin = { x: 0, y: 0 };
  state.powerPct = DEFAULT_POWER_PCT;
  state.warp = { intensity: 0, time: 0 };
  state.flash = { text: "", time: 0, tone: "good" };
  state.message = "Celebration preview.";
  powerInput.value = String(DEFAULT_POWER_PCT);
  updateLabels();
  showGame();
  startCelebration();
}

document.getElementById("start8").addEventListener("click", () => startGame("8ball"));
document
  .getElementById("startSandbox")
  .addEventListener("click", () => startGame("sandbox"));
document.getElementById("resumeSaved").addEventListener("click", () => {
  if (!loadState()) {
    state.message = "No saved game found.";
    updateLabels();
  }
});

document.getElementById("shootBtn").addEventListener("click", beginShot);
document.getElementById("undoBtn").addEventListener("click", undoShot);
document.getElementById("newRackBtn").addEventListener("click", () => {
  if (!state.mode) return;
  startGame(state.mode);
});
document.getElementById("backMenuBtn").addEventListener("click", showMenu);
celebrationMenuBtn.addEventListener("click", showMenu);

powerInput.addEventListener("input", () => {
  state.powerPct = Number(powerInput.value);
  updateLabels();
});
overlayCanvas.addEventListener("pointerdown", (evt) => {
  evt.preventDefault();
  handleTableTap(evt);
});
spinCanvas.addEventListener("pointerdown", (evt) => {
  evt.preventDefault();
  setSpinFromEvent(evt);
});
spinCanvas.addEventListener("pointermove", (evt) => {
  if (evt.buttons) {
    evt.preventDefault();
    setSpinFromEvent(evt);
  }
});
overlayCanvas.addEventListener("contextmenu", (evt) => evt.preventDefault());
spinCanvas.addEventListener("contextmenu", (evt) => evt.preventDefault());
document.addEventListener("keydown", (evt) => {
  if (evt.repeat || evt.key.toLowerCase() !== "w") return;
  if (!menuPanel.classList.contains("active")) return;
  showCelebrationPreview();
});

let last = performance.now();
let acc = 0;

function frame(ts) {
  const delta = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  acc += delta;

  while (acc >= PHYS.dt) {
    if (state.mode && gamePanel.classList.contains("active")) {
      step(PHYS.dt);
    }
    acc -= PHYS.dt;
  }

  if (state.mode && gamePanel.classList.contains("active")) {
    drawTable();
    drawOverlay();
    drawSpinPicker();
  }

  requestAnimationFrame(frame);
}

updateLabels();
drawSpinPicker();
requestAnimationFrame(frame);
showMenu();
