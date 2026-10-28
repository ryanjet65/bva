// Ballhog vs Archive — local two-player platform fighter for p5.js 2.x.
// Controls: P1 A/D move, W double jump, hold S for shield, S+W drops through, E attack, F super.
//           P2 arrows move/double jump, hold down for shield, down+up drops through, N attack, M super.

const WORLD_W = 1280;
const WORLD_H = 760;
const FLOOR_Y = 638;
const GAME_VERSION = "3.1";
const FPS_LIMIT = 60;
const BALLHOG_MAX_CHARGE_SECONDS = 1.5;
const BALLHOG_MAX_CHARGE_DAMAGE = 2.5;
const BALLHOG_MAX_CHARGE_UP_DAMAGE = 50;
const BALLHOG_SWING_DURATION = 0.62;
const BALLHOG_SWING_ROTATION = 125 * Math.PI / 180;
const BALLHOG_HIT_ROTATION = Math.PI / 4;
const BEAM_CLASH_WINDOW = 0.35;
const MAX_AIR_JUMPS = 2;
const SHIELD_SUPER_DRAIN_PER_SECOND = 42;
const SHIELD_HEAL_PER_SECOND = 12;

const INK = [15, 14, 23];
const CREAM = [246, 238, 220];
const GOLD = [255, 193, 83];
const CYAN = [112, 221, 222];
const MAP_LAYOUTS = [
  { name: "Rooftop Run", platforms: [
    { x: 0, y: FLOOR_Y, w: WORLD_W, h: WORLD_H - FLOOR_Y },
    { x: 110, y: 510, w: 275, h: 20 }, { x: 895, y: 510, w: 275, h: 20 },
    { x: 425, y: 414, w: 270, h: 20 }, { x: 700, y: 327, w: 210, h: 20 },
    { x: 345, y: 267, w: 195, h: 20 },
  ] },
  { name: "Foundry", platforms: [
    { x: 0, y: FLOOR_Y, w: WORLD_W, h: WORLD_H - FLOOR_Y },
    { x: 100, y: 535, w: 300, h: 20 }, { x: 880, y: 535, w: 300, h: 20 },
    { x: 440, y: 455, w: 400, h: 20 }, { x: 170, y: 355, w: 230, h: 20 },
    { x: 880, y: 355, w: 230, h: 20 }, { x: 500, y: 275, w: 280, h: 20 },
  ] },
  { name: "Sky Bridges", platforms: [
    { x: 0, y: FLOOR_Y, w: WORLD_W, h: WORLD_H - FLOOR_Y },
    { x: 130, y: 545, w: 260, h: 20 }, { x: 890, y: 545, w: 260, h: 20 },
    { x: 455, y: 480, w: 370, h: 20 }, { x: 180, y: 390, w: 270, h: 20 },
    { x: 830, y: 390, w: 270, h: 20 }, { x: 500, y: 305, w: 280, h: 20 },
    { x: 390, y: 220, w: 220, h: 20 },
  ] },
  { name: "Spiral Steps", platforms: [
    { x: 0, y: FLOOR_Y, w: WORLD_W, h: WORLD_H - FLOOR_Y },
    { x: 85, y: 550, w: 220, h: 20 }, { x: 660, y: 510, w: 250, h: 20 },
    { x: 980, y: 465, w: 220, h: 20 }, { x: 350, y: 390, w: 270, h: 20 },
    { x: 60, y: 300, w: 190, h: 20 }, { x: 780, y: 270, w: 300, h: 20 },
    { x: 410, y: 190, w: 280, h: 20 },
  ] },
];

const BALLHOG_HAIR = [31, 24, 24];
const ARCHIVE_HAIR = [19, 19, 25];

let game;
let backgroundLayers = [];
let scaleFactor = 1;
let offsetX = 0;
let offsetY = 0;
const heldKeys = new Set();
const returnMenuKeyHeld = [false, false];

function isKeyDown(code) {
  return heldKeys.has(code);
}

function gameClamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

class Fighter {
  constructor(name, player, x, speed, damage, width, height, accent) {
    this.name = name;
    this.character = name;
    this.player = player;
    this.x = x;
    this.bottom = FLOOR_Y;
    this.vx = 0;
    this.vy = 0;
    this.speed = speed;
    this.damage = damage;
    this.w = width;
    this.h = height;
    this.accent = accent;
    this.health = 100;
    this.facing = player === 1 ? 1 : -1;
    this.grounded = true;
    this.groundY = FLOOR_Y;
    this.coyote = 0.11;
    this.jumpBuffer = 0;
    this.jumpsUsed = 0;
    this.shielding = false;
    this.shieldLockedUntilRelease = false;
    this.attackCooldown = 0;
    this.attackTime = -1;
    this.attackResolved = false;
    this.attackUp = false;
    this.attackDown = false;
    this.chargingAttack = false;
    this.chargeTime = 0;
    this.attackDamageMultiplier = 1;
    this.attackLockedFacing = false;
    this.chargedAttack = false;
    this.hitstun = 0;
    this.invulnerable = 0;
    this.flash = 0;
    this.rageStacks = 0;
    this.superCharge = 0;
    this.superTime = 0;
    this.superResolved = false;
    this.poisonTime = 0;
    this.poisonStacks = 0;
    this.poisonTick = 1;
    this.poisonDps = 0.9;
    this.poisonSourcePlayer = 0;
    this.walkPhase = 0;
    this.animationTime = 0;
  }

  get rageMultiplier() {
    return Math.pow(1.15, this.rageStacks);
  }

  get chestY() {
    return this.bottom - this.h * 0.60;
  }

  get rect() {
    return { x: this.x - this.w / 2, y: this.bottom - this.h, w: this.w, h: this.h };
  }
}

class Game {
  constructor() {
    this.mapIndex = 0;
    this.mapSelection = [0, 0];
    this.mapReady = [false, false];
    this.platforms = MAP_LAYOUTS[this.mapIndex].platforms.map((platform) => ({ ...platform }));
    this.started = false;
    this.practiceMode = false;
    this.elapsedTime = 0;
    this.pendingSupers = [];
    this.beamClash = null;
    this.menuPage = "main";
    this.menuSelection = [0, 0];
    this.characterChoices = ["BALLHOG", "ARCHIVE"];
    this.characterReady = [false, false];
    this.menuLastMover = 0;
    this.returnMenuProgress = [0, 0];
    this.resetRound();
  }

  createFighter(character, side, x) {
    if (character === "BALLHOG") return new Fighter("BALLHOG", side, x, 320, 14, 54, 105, GOLD);
    return new Fighter("ARCHIVE", side, x, 455, 9, 46, 126, CYAN);
  }

  resetRound() {
    this.platforms = MAP_LAYOUTS[this.mapIndex].platforms.map((platform) => ({ ...platform }));
    this.p1 = this.createFighter(this.characterChoices[0], 1, 245);
    this.p2 = this.createFighter(this.characterChoices[1], 2, 1035);
    this.winner = null;
    this.particles = [];
    this.texts = [];
    this.pickups = [];
    this.pickupSpawnTimer = 4;
    this.screenFlash = 0;
    this.elapsedTime = 0;
    this.pendingSupers = [];
    this.beamClash = null;
    this.returnMenuProgress = [0, 0];
  }

  requestJump(fighter) {
    const downKey = fighter.player === 1 ? "KeyS" : "ArrowDown";
    if (isKeyDown(downKey) && fighter.grounded && fighter.groundY !== FLOOR_Y) {
      fighter.bottom += 5;
      fighter.vy = 105;
      fighter.grounded = false;
      fighter.coyote = 0;
    } else {
      fighter.jumpBuffer = 0.13;
    }
  }

  movementKeys(fighter) {
    return fighter.player === 1
      ? { left: isKeyDown("KeyA"), right: isKeyDown("KeyD"), up: isKeyDown("KeyW"), down: isKeyDown("KeyS") }
      : { left: isKeyDown("ArrowLeft"), right: isKeyDown("ArrowRight"), up: isKeyDown("ArrowUp"), down: isKeyDown("ArrowDown") };
  }

  chooseAttackDirection(fighter, keys) {
    const horizontal = Number(keys.right) - Number(keys.left);
    if (horizontal !== 0) {
      fighter.facing = horizontal;
      fighter.attackUp = false;
      fighter.attackDown = false;
    } else if (keys.down) {
      fighter.attackUp = false;
      fighter.attackDown = true;
    } else {
      // A buffered jump or an airborne swing keeps the existing upward attack.
      fighter.attackUp = keys.up || !fighter.grounded || fighter.jumpBuffer > 0;
      fighter.attackDown = false;
    }
  }

  startAttack(fighter) {
    if (this.beamClash) { this.clashPress(fighter); return; }
    if (this.winner || fighter.shielding || fighter.attackCooldown > 0 || fighter.hitstun > 0 || fighter.superTime > 0) return;
    if (fighter.character === "BALLHOG") {
      this.startBallhogCharge(fighter);
      return;
    }
    fighter.attackTime = 0;
    fighter.attackResolved = false;
    this.chooseAttackDirection(fighter, this.movementKeys(fighter));
    fighter.attackCooldown = fighter.character === "BALLHOG" ? 0.69 : 0.43;
  }

  startBallhogCharge(fighter) {
    if (this.winner || fighter.shielding || fighter.chargingAttack || fighter.attackCooldown > 0 || fighter.hitstun > 0 || fighter.superTime > 0) return;
    fighter.chargingAttack = true;
    fighter.chargeTime = 0;
    fighter.attackDamageMultiplier = 1;
    fighter.chargedAttack = false;
    // Cut existing momentum immediately, then cap speed while charge is held.
    fighter.vx *= 0.8;
  }

  releaseBallhogCharge(fighter) {
    if (!fighter.chargingAttack) return;
    const chargeTime = Math.min(BALLHOG_MAX_CHARGE_SECONDS, fighter.chargeTime);
    fighter.chargingAttack = false;
    fighter.chargeTime = 0;
    if (this.winner || fighter.hitstun > 0 || fighter.superTime > 0) return;

    this.chooseAttackDirection(fighter, this.movementKeys(fighter));
    fighter.attackTime = 0;
    fighter.attackResolved = false;
    const chargeRatio = chargeTime / BALLHOG_MAX_CHARGE_SECONDS;
    const maxAttackMultiplier = fighter.attackUp
      ? BALLHOG_MAX_CHARGE_UP_DAMAGE / fighter.damage
      : BALLHOG_MAX_CHARGE_DAMAGE;
    fighter.attackDamageMultiplier = 1 + (maxAttackMultiplier - 1) * chargeRatio;
    fighter.attackLockedFacing = true;
    fighter.chargedAttack = true;
    fighter.attackCooldown = 0.69;
  }

  activateSuper(fighter) {
    if (this.winner || fighter.shielding || fighter.chargingAttack || fighter.superCharge < 100 || fighter.superTime > 0 || fighter.hitstun > 0) return;
    fighter.superCharge = 0;
    fighter.superTime = 0.62;
    fighter.superResolved = false;
    this.addBurst(fighter.x, fighter.chestY, fighter.accent, 18, 300);
    this.registerSuperShot(fighter);
  }

  beamsAreAligned(a, b) {
    const left = a.x < b.x ? a : b;
    const right = left === a ? b : a;
    return left.facing > 0 && right.facing < 0 && left.x < right.x && Math.abs(a.chestY - b.chestY) <= 50;
  }

  registerSuperShot(fighter) {
    const match = this.pendingSupers.find((shot) => shot.fighter !== fighter && this.elapsedTime - shot.time <= BEAM_CLASH_WINDOW && this.beamsAreAligned(shot.fighter, fighter));
    if (!match) { this.pendingSupers.push({ fighter, time: this.elapsedTime }); return; }
    this.pendingSupers = this.pendingSupers.filter((shot) => shot !== match);
    this.beamClash = { leftStake: 5, secondsLeft: 5, lastPlayer: fighter.player, pulse: 0 };
    this.p1.superTime = 0; this.p2.superTime = 0;
    this.p1.superResolved = true; this.p2.superResolved = true;
    this.addBurst((this.p1.x + this.p2.x) / 2, (this.p1.chestY + this.p2.chestY) / 2, [255, 244, 208], 14, 240);
    this.addText("BEAM CLASH! SPAM E / N!", WORLD_W / 2, 260, [255, 245, 216]);
  }

  clashPress(fighter) {
    if (!this.beamClash) return false;
    this.beamClash.leftStake = gameClamp(this.beamClash.leftStake + (fighter.player === 1 ? 1 : -1), 0, 10);
    this.beamClash.lastPlayer = fighter.player; this.beamClash.pulse = 0.18;
    this.addBurst(WORLD_W / 2 + random(-24, 24), 665 + random(-7, 7), fighter.accent, 2, 75);
    if (this.beamClash.leftStake === 10) this.finishBeamClash(this.p1);
    else if (this.beamClash.leftStake === 0) this.finishBeamClash(this.p2);
    return true;
  }

  finishBeamClash(winner) {
    if (!this.beamClash) return;
    this.beamClash = null; this.pendingSupers = [];
    const target = winner.player === 1 ? this.p2 : this.p1;
    target.health = Math.max(0, target.health - 45); target.vx = winner.facing * 390; target.vy = -390;
    target.grounded = false; target.hitstun = 0.75; target.flash = 0.3;
    this.addBurst(target.x, target.chestY, winner.accent, 22, 360);
    this.addText("CLASH BREAK! -45", target.x, target.chestY - 30, winner.accent);
    this.screenFlash = 0.16; if (target.health <= 0) this.winner = winner.name;
  }

  updateBeamClash(dt) {
    if (!this.beamClash) return;
    this.beamClash.secondsLeft = Math.max(0, this.beamClash.secondsLeft - dt);
    this.beamClash.pulse = Math.max(0, this.beamClash.pulse - dt);
    if (this.beamClash.secondsLeft <= 0) {
      const winner = this.beamClash.leftStake > 5 ? this.p1 : this.beamClash.leftStake < 5 ? this.p2 : (this.beamClash.lastPlayer === 1 ? this.p1 : this.p2);
      this.finishBeamClash(winner);
    }
  }

  updatePendingSupers() {
    for (let i = this.pendingSupers.length - 1; i >= 0; i -= 1) {
      const shot = this.pendingSupers[i];
      if (this.elapsedTime - shot.time >= BEAM_CLASH_WINDOW) {
        this.resolveSuper(shot.fighter, shot.fighter.player === 1 ? this.p2 : this.p1);
        this.pendingSupers.splice(i, 1);
      }
    }
  }

  addBurst(x, y, color, count = 12, force = 230) {
    for (let i = 0; i < count; i += 1) {
      const angle = random(TWO_PI);
      const speed = random(force * 0.35, force);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.20, 0.48),
        max: 0.48,
        color,
        size: random(2, 5),
      });
    }
  }

  addText(message, x, y, color) {
    this.texts.push({ message, x, y, life: 0.85, color });
  }

  moveFighter(fighter, opponent, dt) {
    const keys = this.movementKeys(fighter);
    if (fighter.shielding) {
      fighter.vx = 0;
      fighter.vy = 0;
      fighter.jumpBuffer = 0;
      return;
    }
    const direction = Number(keys.right) - Number(keys.left);

    if (direction !== 0 && !fighter.attackLockedFacing) fighter.facing = direction;
    else if (fighter.attackTime < 0 && fighter.superTime <= 0 && !fighter.attackLockedFacing) {
      fighter.facing = opponent.x >= fighter.x ? 1 : -1;
    }

    if (fighter.grounded) {
      fighter.coyote = 0.11;
      fighter.jumpsUsed = 0;
    }
    else fighter.coyote = Math.max(0, fighter.coyote - dt);
    fighter.jumpBuffer = Math.max(0, fighter.jumpBuffer - dt);

    if (fighter.jumpBuffer > 0 && fighter.hitstun <= 0 && fighter.jumpsUsed < MAX_AIR_JUMPS && (fighter.coyote > 0 || fighter.jumpsUsed > 0)) {
      const isDoubleJump = fighter.jumpsUsed > 0;
      fighter.vy = -735;
      fighter.grounded = false;
      fighter.jumpsUsed += 1;
      fighter.coyote = 0;
      fighter.jumpBuffer = 0;
      this.addBurst(fighter.x, fighter.bottom - 4, isDoubleJump ? fighter.accent : [194, 158, 129], isDoubleJump ? 10 : 5, isDoubleJump ? 145 : 90);
      if (isDoubleJump) this.addText("DOUBLE JUMP", fighter.x, fighter.bottom - fighter.h - 12, fighter.accent);
    }

    // Let movement input select the attack direction during its wind-up.
    const directionLock = fighter.character === "BALLHOG" ? 0.45 : 0.07;
    if (fighter.attackTime >= 0 && fighter.attackTime < directionLock && !fighter.attackResolved && !fighter.attackLockedFacing) {
      this.chooseAttackDirection(fighter, keys);
    }

    if (fighter.hitstun <= 0) {
      const speedScale = fighter.chargingAttack ? 0.65 : 1;
      const targetVx = direction * fighter.speed * speedScale;
      const acceleration = (fighter.grounded ? 2500 : 1450) * (fighter.superTime > 0 ? 0.58 : 1);
      if (direction !== 0) fighter.vx = approach(fighter.vx, targetVx, acceleration * dt);
      else fighter.vx = approach(fighter.vx, 0, (fighter.grounded ? 2050 : (fighter.chargingAttack ? 1100 : 380)) * dt);
    } else {
      fighter.hitstun = Math.max(0, fighter.hitstun - dt);
    }

    fighter.x = gameClamp(fighter.x + fighter.vx * dt, fighter.w / 2 + 16, WORLD_W - fighter.w / 2 - 16);
    const oldBottom = fighter.bottom;
    fighter.grounded = false;
    fighter.vy = Math.min(1050, fighter.vy + 1950 * dt);
    fighter.bottom += fighter.vy * dt;

    if (fighter.vy >= 0) {
      const orderedPlatforms = this.platforms.slice().sort((a, b) => a.y - b.y);
      for (const platform of orderedPlatforms) {
        const feetOverlap = fighter.x + fighter.w * 0.34 > platform.x && fighter.x - fighter.w * 0.34 < platform.x + platform.w;
        if (oldBottom <= platform.y && platform.y <= fighter.bottom && feetOverlap) {
          fighter.bottom = platform.y;
          fighter.vy = 0;
          fighter.grounded = true;
          fighter.groundY = platform.y;
          break;
        }
      }
    }
    if (fighter.grounded) fighter.groundY = Math.round(fighter.bottom);
    fighter.walkPhase += Math.abs(fighter.vx) * dt / 25;
  }

  takeHit(target, attacker, amount, direction, message = null, dot = false) {
    if (target.health <= 0 || (!dot && target.invulnerable > 0)) return false;
    if (!dot && target.shielding) {
      this.addText("BLOCKED", target.x, target.chestY - 16, target.accent);
      this.addBurst(target.x, target.chestY, target.accent, 8, 150);
      return false;
    }
    target.health = Math.max(0, target.health - amount);
    if (!dot) {
      target.invulnerable = 0.30;
      target.hitstun = attacker.character === "ARCHIVE" ? 0.20 : 0.24;
      target.vx = direction * (attacker.character === "ARCHIVE" ? 300 : 250);
      target.vy = Math.min(target.vy, -115);
      target.grounded = false;
      target.flash = 0.15;
      if (target.character === "BALLHOG") target.rageStacks += 1;
      // Ballhog still gets a small super bonus for taking hits, but this gain
      // is deliberately much lower so his passive meter does not race ahead.
      if (target.character === "BALLHOG") target.superCharge = Math.min(100, target.superCharge + amount * 0.10 + 1.5);
      if (attacker.character === "BALLHOG") attacker.superCharge = Math.min(100, attacker.superCharge + amount * 0.35);
      this.addBurst(target.x, target.chestY, [255, 231, 197], 13, 260);
    }
    this.addText(message || `-${amount.toFixed(1)}`, target.x, target.chestY - 16, dot ? CYAN : [255, 214, 160]);
    if (target.health <= 0) {
      this.winner = attacker.name;
      this.screenFlash = 0.28;
    }
    return true;
  }

  resolveAttack(attacker, target) {
    let hitbox;
    if (attacker.attackUp) {
      // Keep the overhead strike centered on the fighter and extend it well
      // above the head, with enough lower overlap to catch a close platform gap.
      const upReach = 190;
      const downOverlap = 60;
      const upWidth = attacker.w + 110;
      hitbox = {
        x: attacker.x - upWidth / 2,
        y: attacker.bottom - attacker.h - upReach,
        w: upWidth,
        h: upReach + downOverlap,
      };
    } else if (attacker.attackDown) {
      const downReach = 145;
      const downWidth = attacker.w + 110;
      hitbox = {
        x: attacker.x - downWidth / 2,
        y: attacker.bottom - 8,
        w: downWidth,
        h: downReach,
      };
    } else {
      const reach = attacker.character === "BALLHOG" ? 93 : 102;
      const hitWidth = attacker.character === "BALLHOG" ? 84 : 98;
      const centerX = attacker.x + attacker.facing * reach * 0.47;
      hitbox = { x: centerX - hitWidth / 2, y: attacker.chestY - 30, w: hitWidth, h: 60 };
    }
    if (!overlaps(hitbox, target.rect)) return;
    let amount = attacker.damage
      * (attacker.character === "BALLHOG" ? attacker.rageMultiplier : 1)
      * (attacker.character === "BALLHOG" ? attacker.attackDamageMultiplier : 1);
    if (attacker.character === "BALLHOG" && attacker.chargedAttack && attacker.attackUp) {
      amount = Math.min(BALLHOG_MAX_CHARGE_UP_DAMAGE, amount);
    }
    const landed = this.takeHit(target, attacker, amount, attacker.attackUp || attacker.attackDown ? 0 : attacker.facing);
    if (landed && attacker.character === "ARCHIVE") {
      // Archive charges ultimate from confirmed normal hits and poison ticks.
      attacker.superCharge = Math.min(100, attacker.superCharge + amount * 0.5);
      this.applyPoison(target, attacker);
    }
  }

  resolveSuper(attacker, target) {
    const beamY = attacker.chestY + 2;
    const beamStart = Math.min(attacker.x, attacker.facing > 0 ? WORLD_W : 0);
    const beamEnd = Math.max(attacker.x, attacker.facing > 0 ? WORLD_W : 0);
    const beam = { x: beamStart, y: beamY - 25, w: Math.max(1, beamEnd - beamStart), h: 50 };
    if (!overlaps(beam, target.rect)) return;
    const amount = (attacker.character === "BALLHOG" ? 43 : 35) * (attacker.character === "BALLHOG" ? attacker.rageMultiplier : 1);
    const landed = this.takeHit(target, attacker, amount, attacker.facing, attacker.character === "BALLHOG" ? "BLASSIC!" : "SPEARED!");
    if (landed && attacker.character === "ARCHIVE") this.applyPoison(target, attacker);
  }

  applyPoison(target, attacker) {
    const poisonWasActive = target.poisonTime > 0 && target.poisonStacks > 0;
    target.poisonStacks = Math.min(4, target.poisonStacks + 1);
    target.poisonTime = 10;
    if (!poisonWasActive) target.poisonTick = 1;
    target.poisonDps = 0.9 * target.poisonStacks;
    target.poisonSourcePlayer = attacker.player;
  }

  updateFighter(fighter, opponent, dt) {
    fighter.attackCooldown = Math.max(0, fighter.attackCooldown - dt);
    fighter.invulnerable = Math.max(0, fighter.invulnerable - dt);
    fighter.flash = Math.max(0, fighter.flash - dt);
    // Practice mode keeps both ultimate meters full for unlimited use.
    if (this.practiceMode) {
      fighter.superCharge = 100;
    } else {
      const passiveSuperRate = fighter.character === "BALLHOG" ? 1.1 : 0;
      fighter.superCharge = Math.min(100, fighter.superCharge + dt * passiveSuperRate);
    }

    const keys = this.movementKeys(fighter);
    const dropThrough = keys.down && keys.up && fighter.grounded && fighter.groundY !== FLOOR_Y;
    if (!keys.down) fighter.shieldLockedUntilRelease = false;
    const canStartShield = keys.down && !dropThrough && !fighter.shieldLockedUntilRelease
      && fighter.superCharge > 0 && !fighter.chargingAttack && fighter.attackTime < 0
      && fighter.superTime <= 0 && fighter.hitstun <= 0;
    fighter.shielding = canStartShield;
    if (fighter.shielding) {
      fighter.superCharge = Math.max(0, fighter.superCharge - SHIELD_SUPER_DRAIN_PER_SECOND * dt);
      fighter.health = Math.min(100, fighter.health + SHIELD_HEAL_PER_SECOND * dt);
      if (fighter.superCharge <= 0) {
        fighter.shielding = false;
        fighter.shieldLockedUntilRelease = true;
      }
    }

    if (fighter.chargingAttack) {
      fighter.chargeTime = Math.min(BALLHOG_MAX_CHARGE_SECONDS, fighter.chargeTime + dt);
    }

    if (fighter.poisonTime > 0) {
      fighter.poisonTime = Math.max(0, fighter.poisonTime - dt);
      fighter.poisonTick -= dt;
      if (fighter.poisonTick <= 0) {
        fighter.poisonTick += 1;
        const poisonSource = fighter.poisonSourcePlayer === 1 ? this.p1 : this.p2;
        fighter.health = Math.max(0, fighter.health - fighter.poisonDps);
        if (poisonSource.character === "ARCHIVE") {
          // Each active stack adds super charge, so a full four-stack poison
          // pays Archive 8 meter per second while it deals 3.6 damage per tick.
          poisonSource.superCharge = Math.min(100, poisonSource.superCharge + fighter.poisonStacks * 2);
        }
        this.addText(`POISON x${fighter.poisonStacks} -${fighter.poisonDps.toFixed(1)}`, fighter.x, fighter.chestY - 25, CYAN);
        this.addBurst(fighter.x, fighter.chestY, CYAN, 3, 50);
        if (fighter.health <= 0) this.winner = poisonSource.name;
      }
      if (fighter.poisonTime <= 0) {
        fighter.poisonStacks = 0;
        fighter.poisonDps = 0.9;
      }
    }

    this.moveFighter(fighter, opponent, dt);

    if (fighter.attackTime >= 0) {
      fighter.attackTime += dt;
      // Ballhog's straight punch activates when the fist rotates 45 degrees into its eased arc.
      const ballhogStraightPunch = fighter.character === "BALLHOG" && fighter.chargedAttack && !fighter.attackUp && !fighter.attackDown;
      const activeStart = fighter.character === "BALLHOG" ? 0.45 : 0.07;
      const activeEnd = fighter.character === "BALLHOG" ? BALLHOG_SWING_DURATION : 0.17;
      const swingProgress = gameClamp(fighter.attackTime / BALLHOG_SWING_DURATION, 0, 1);
      const easedProgress = swingProgress * swingProgress * (3 - 2 * swingProgress);
      const fistReachedHitAngle = easedProgress * BALLHOG_SWING_ROTATION >= BALLHOG_HIT_ROTATION;
      const attackIsActive = ballhogStraightPunch
        ? fistReachedHitAngle
        : fighter.attackTime >= activeStart && fighter.attackTime <= activeEnd;
      if (attackIsActive && !fighter.attackResolved) {
        fighter.attackResolved = true;
        this.resolveAttack(fighter, opponent);
      }
      if (fighter.attackTime > (fighter.character === "BALLHOG" ? BALLHOG_SWING_DURATION : 0.27)) {
        fighter.attackTime = -1;
        fighter.attackLockedFacing = false;
        fighter.chargedAttack = false;
        fighter.attackDamageMultiplier = 1;
      }
    }

    if (fighter.superTime > 0) {
      const oldTime = fighter.superTime;
      fighter.superTime = Math.max(0, fighter.superTime - dt);
      if (oldTime > 0.34 && fighter.superTime <= 0.34 && !fighter.superResolved) {
        // Keep the shot pending through the full 0.75s clash window.
        fighter.superResolved = true;
        this.addBurst(fighter.x + fighter.facing * 90, fighter.chestY, fighter.character === "BALLHOG" ? GOLD : [86, 174, 255], 28, 420);
      }
    }
  }

  update(dt) {
    dt = Math.min(dt, 1 / 30);
    this.elapsedTime += dt;
    if (!this.winner) {
      this.updateFighter(this.p1, this.p2, dt);
      this.updateFighter(this.p2, this.p1, dt);
      this.updatePickups(dt);
    }
    this.updatePendingSupers();
    this.updateBeamClash(dt);
    const leftShiftHeld = returnMenuKeyHeld[0];
    const rightShiftHeld = returnMenuKeyHeld[1];
    this.returnMenuProgress[0] = leftShiftHeld
      ? Math.min(1, this.returnMenuProgress[0] + dt / 1.5)
      : Math.max(0, this.returnMenuProgress[0] - dt / 0.2);
    this.returnMenuProgress[1] = rightShiftHeld
      ? Math.min(1, this.returnMenuProgress[1] + dt / 1.5)
      : Math.max(0, this.returnMenuProgress[1] - dt / 0.2);
    if (this.returnMenuProgress[0] >= 1 && this.returnMenuProgress[1] >= 1) {
      this.practiceMode = false;
      this.resetRound();
      this.started = false;
      this.menuPage = "main";
      this.menuSelection = [0, 0];
      this.characterReady = [false, false];
      heldKeys.clear();
    }
    this.screenFlash = Math.max(0, this.screenFlash - dt);
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy += 540 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const item = this.texts[i];
      item.life -= dt;
      item.y -= 36 * dt;
      if (item.life <= 0) this.texts.splice(i, 1);
    }
  }

  spawnPickup() {
    const surfaces = [
      { x: 32, y: FLOOR_Y, w: WORLD_W - 64 },
      ...this.platforms.slice(1),
    ];
    const surface = random(surfaces);
    const x = random(surface.x + 24, surface.x + surface.w - 24);
    const y = surface.y - 18;
    this.pickups.push({
      type: random() < 0.5 ? "heal" : "super",
      x,
      y,
      baseY: y,
      phase: random(TWO_PI),
      life: 15,
    });
  }

  updatePickups(dt) {
    this.pickupSpawnTimer -= dt;
    if (this.pickupSpawnTimer <= 0) {
      if (this.pickups.length < 3) this.spawnPickup();
      this.pickupSpawnTimer = 7.5;
    }

    for (let pickupIndex = this.pickups.length - 1; pickupIndex >= 0; pickupIndex -= 1) {
      const pickup = this.pickups[pickupIndex];
      pickup.life -= dt;
      pickup.phase += dt * 3.2;
      pickup.y = pickup.baseY + Math.sin(pickup.phase) * 5;
      if (pickup.life <= 0) {
        this.pickups.splice(pickupIndex, 1);
        continue;
      }

      for (const fighter of [this.p1, this.p2]) {
        if (pickup.type === "heal" && fighter.health >= 100) continue;
        if (pickup.type === "super" && fighter.superCharge >= 100) continue;
        const rect = fighter.rect;
        const closestX = gameClamp(pickup.x, rect.x, rect.x + rect.w);
        const closestY = gameClamp(pickup.y, rect.y, rect.y + rect.h);
        const dx = pickup.x - closestX;
        const dy = pickup.y - closestY;
        if (dx * dx + dy * dy > 24 * 24) continue;

        if (pickup.type === "heal") {
          fighter.health = Math.min(100, fighter.health + 20);
          this.addText("+20 HEALTH", fighter.x, fighter.chestY - 28, [123, 255, 157]);
          this.addBurst(pickup.x, pickup.y, [90, 242, 126], 12, 150);
        } else {
          fighter.superCharge = Math.min(100, fighter.superCharge + 40);
          this.addText("+40 SUPER", fighter.x, fighter.chestY - 28, [113, 202, 255]);
          this.addBurst(pickup.x, pickup.y, [73, 166, 255], 12, 150);
        }
        this.pickups.splice(pickupIndex, 1);
        break;
      }
    }
  }

  drawPickup(pickup) {
    const pulse = 0.5 + 0.5 * Math.sin(pickup.phase * 2);
    const heal = pickup.type === "heal";
    const orbColor = heal ? [88, 245, 128] : [86, 174, 255];
    const alpha = pickup.life < 3 && Math.sin(pickup.phase * 12) < 0 ? 90 : 255;
    noStroke();
    fill(orbColor[0], orbColor[1], orbColor[2], 35 + pulse * 35);
    ellipse(pickup.x, pickup.y, 42 + pulse * 8);
    noFill();
    stroke(orbColor[0], orbColor[1], orbColor[2], alpha);
    strokeWeight(2);
    ellipse(pickup.x, pickup.y, 26 + pulse * 3);
    noStroke();
    fill(orbColor[0], orbColor[1], orbColor[2], alpha);
    ellipse(pickup.x, pickup.y, 15);
    fill(230, 255, 242, alpha * 0.85);
    ellipse(pickup.x - 3, pickup.y - 4, 5);
    if (heal) {
      stroke(222, 255, 230, alpha);
      strokeWeight(2);
      line(pickup.x - 5, pickup.y, pickup.x + 5, pickup.y);
      line(pickup.x, pickup.y - 5, pickup.x, pickup.y + 5);
      noStroke();
    } else {
      noFill();
      stroke(190, 229, 255, alpha);
      strokeWeight(1.5);
      arc(pickup.x, pickup.y, 34, 34, pickup.phase, pickup.phase + PI * 1.1);
      noStroke();
    }
  }

  drawPlatform(platform) {
    if (platform.y === FLOOR_Y) return;
    noStroke();
    fill(29, 25, 37);
    rect(platform.x, platform.y, platform.w, platform.h, 5);
    fill(118, 52, 68);
    rect(platform.x, platform.y, platform.w, 4, 3);
    stroke(54, 42, 54);
    strokeWeight(1);
    for (let x = platform.x + 14; x < platform.x + platform.w - 8; x += 35) {
      line(x, platform.y + 6, x, platform.y + platform.h - 5);
    }
    noStroke();
  }

  drawFighter(f, visualX = f.x, preview = false) {
    const x = Math.round(visualX);
    const foot = Math.round(f.bottom);
    const direction = f.facing;
    const walking = preview ? 0 : (f.grounded ? Math.min(1, Math.abs(f.vx) / Math.max(1, f.speed)) : 0);
    const airborne = !preview && !f.grounded ? 1 : 0;
    const swingDuration = f.character === "BALLHOG" ? BALLHOG_SWING_DURATION : 0.27;
    const attackPose = !preview && f.attackTime >= 0 && f.attackTime < swingDuration
      ? Math.sin(gameClamp(f.attackTime / swingDuration, 0, 1) * Math.PI)
      : 0;
    const breathing = Math.sin(f.animationTime * 3.1) * 1.8 * (preview ? 1 : 1 - walking);
    const phase = Math.sin(f.walkPhase) * 8 * walking;
    const armSwing = Math.sin(f.walkPhase) * 6 * walking;
    const hitLean = !preview && f.hitstun > 0 ? -Math.sign(f.vx || direction) * 5 : 0;
    const bodyX = x + direction * attackPose * 5 + hitLean;
    const bodyBob = breathing + Math.sin(f.walkPhase * 2) * 2.2 * walking - airborne * 3;
    const skin = f.character === "BALLHOG" ? [207, 157, 120] : [220, 178, 151];
    const bodyTop = foot - f.h + 34 + bodyBob;
    const bodyBottom = foot - (f.character === "BALLHOG" ? 40 : 48) + bodyBob;
    const headCY = foot - f.h + (f.character === "BALLHOG" ? 18 : 19) + bodyBob;
    const flashing = f.flash > 0;
    const shirt = flashing ? [255, 247, 229] : (f.character === "BALLHOG" ? [45, 44, 51] : [94, 34, 48]);

    const shadowW = Math.max(25, f.w * (1 - Math.max(0, FLOOR_Y - foot) / 500));
    noStroke();
    fill(12, 12, 20, 180);
    ellipse(x, FLOOR_Y + 1, shadowW, 12);
    if (!preview && f.shielding) {
      const pulse = 0.5 + 0.5 * Math.sin(f.animationTime * 9);
      drawingContext.save();
      drawingContext.shadowBlur = 22;
      drawingContext.shadowColor = `rgba(${f.accent[0]},${f.accent[1]},${f.accent[2]},0.85)`;
      fill(f.accent[0], f.accent[1], f.accent[2], 24 + pulse * 20);
      stroke(f.accent[0], f.accent[1], f.accent[2], 195);
      strokeWeight(2.5);
      ellipse(x, foot - f.h * 0.53, f.w + 38 + pulse * 7, f.h + 30 + pulse * 8);
      noFill();
      stroke(235, 247, 255, 95 + pulse * 70);
      strokeWeight(1);
      ellipse(x, foot - f.h * 0.53, f.w + 26 + pulse * 5, f.h + 18 + pulse * 5);
      drawingContext.restore();
    }

    const hipY = bodyBottom - 2;
    if (f.character === "BALLHOG") {
      fill(235, 232, 222);
      quad(bodyX - 13, hipY, bodyX - 2, hipY, bodyX - 7 + phase - airborne * 4, foot - 9 - airborne * 3, bodyX - 20 + phase - airborne * 5, foot - 7 - airborne * 3);
      quad(bodyX + 2, hipY, bodyX + 13, hipY, bodyX + 20 - phase + airborne * 5, foot - 7 - airborne * 3, bodyX + 7 - phase + airborne * 4, foot - 9 - airborne * 3);
      stroke(160, 157, 151);
      strokeWeight(1);
      line(bodyX - 7, hipY + 10, bodyX - 12 + phase, foot - 15 - airborne * 3);
      line(bodyX + 7, hipY + 10, bodyX + 12 - phase, foot - 15 - airborne * 3);
    } else {
      fill(24, 24, 32);
      quad(bodyX - 12, hipY, bodyX - 2, hipY, bodyX - 5 + phase - airborne * 4, foot - 15 - airborne * 5, bodyX - 19 + phase - airborne * 5, foot - 6 - airborne * 2);
      quad(bodyX + 2, hipY, bodyX + 12, hipY, bodyX + 19 - phase + airborne * 5, foot - 6 - airborne * 2, bodyX + 5 - phase + airborne * 4, foot - 15 - airborne * 5);
      stroke(76, 69, 79);
      strokeWeight(1);
      line(bodyX - 7, hipY + 12, bodyX - 10 + phase, foot - 17 - airborne * 4);
      line(bodyX + 7, hipY + 12, bodyX + 10 - phase, foot - 17 - airborne * 4);
    }
    noStroke();
    fill(12, 12, 17);
    ellipse(bodyX - 12 + phase, foot - 2 - airborne * 2, 22, 9);
    ellipse(bodyX + 13 - phase, foot - 2 - airborne * 2, 22, 9);

    fill(...shirt);
    rect(bodyX - (f.character === "BALLHOG" ? 19 : 16), bodyTop, f.character === "BALLHOG" ? 38 : 32, bodyBottom - bodyTop, 7);
    if (f.character === "ARCHIVE" && !flashing) {
      stroke(151, 72, 76);
      strokeWeight(2);
      line(bodyX, bodyTop + 4, bodyX - 8, bodyBottom - 4);
      line(bodyX + 3, bodyTop + 7, bodyX + 12, bodyBottom - 4);
      noStroke();
      fill(173, 104, 93);
      ellipse(bodyX - 10, bodyTop + 10, 4);
    }
    fill(...skin);
    rect(bodyX - 5, bodyTop - 6, 10, 11, 3);

    if (f.character === "BALLHOG" && !flashing) {
      fill(229, 223, 211);
      ellipse(bodyX, bodyTop + 15, 14);
      rect(bodyX - 6, bodyTop + 19, 12, 7, 2);
      fill(42, 39, 46);
      ellipse(bodyX - 2, bodyTop + 14, 2);
      ellipse(bodyX + 2, bodyTop + 14, 2);
      line(bodyX, bodyTop + 20, bodyX, bodyTop + 24);
    }

    const shoulderY = bodyTop + 9;
    if (!preview && f.chargingAttack) {
      const chargeRatio = gameClamp(f.chargeTime / BALLHOG_MAX_CHARGE_SECONDS, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(f.animationTime * 9);
      const fistX = bodyX + direction * 8;
      const fistY = bodyTop - 48 - pulse * 5;
      noFill();
      stroke(255, 206, 111, 100 + pulse * 100);
      strokeWeight(2 + pulse * 2);
      ellipse(fistX, fistY, 24 + pulse * 12);
      stroke(...skin);
      strokeWeight(9);
      line(bodyX + direction * 13, shoulderY, fistX, fistY);
      noStroke();
      fill(...skin);
      ellipse(fistX, fistY, 14);

      noStroke();
      fill(21, 19, 26, 235);
      rect(bodyX - 42, foot + 12, 84, 10, 5);
      fill(255, 193, 83);
      rect(bodyX - 40, foot + 14, 80 * chargeRatio, 6, 3);
      fill(255, 238, 192);
      textAlign(CENTER, CENTER);
      textSize(8);
      textStyle(BOLD);
      text("CHARGE", bodyX, foot + 31);
      stroke(255, 238, 192, 130 + pulse * 80);
      strokeWeight(2);
      line(fistX - 18, fistY + 14, fistX - 24 - chargeRatio * 8, fistY + 26);
      line(fistX + 18, fistY + 14, fistX + 24 + chargeRatio * 8, fistY + 26);
      noStroke();
    } else if (f.attackTime >= 0 && f.attackTime < swingDuration) {
      const attackProgress = gameClamp(f.attackTime / swingDuration, 0, 1);
      const arcStrength = Math.sin(attackProgress * Math.PI);
      if (f.chargedAttack && !f.attackUp && !f.attackDown) {
        // Rotate the arm around the shoulder/torso pivot through a broad swing arc.
        const easedProgress = attackProgress * attackProgress * (3 - 2 * attackProgress);
        const pivotX = bodyX + direction * 10;
        const pivotY = shoulderY + 2;
        const armAngle = -HALF_PI + easedProgress * BALLHOG_SWING_ROTATION;
        const elbowAngle = armAngle + 0.18;
        const elbowX = pivotX + direction * Math.cos(elbowAngle) * 24;
        const elbowY = pivotY + Math.sin(elbowAngle) * 24;
        const fistX = pivotX + direction * Math.cos(armAngle) * 54;
        const fistY = pivotY + Math.sin(armAngle) * 54;

        noFill();
        stroke(255, 193, 83, 220 * arcStrength);
        strokeWeight(5 + arcStrength * 3);
        beginShape();
        for (let arcIndex = 0; arcIndex <= 12; arcIndex += 1) {
          const pathAngle = -HALF_PI + (easedProgress * BALLHOG_SWING_ROTATION * arcIndex) / 12;
          vertex(pivotX + direction * Math.cos(pathAngle) * 62, pivotY + Math.sin(pathAngle) * 62);
        }
        endShape();

        stroke(...skin);
        strokeWeight(10);
        line(pivotX, pivotY, elbowX, elbowY);
        line(elbowX, elbowY, fistX, fistY);
        noStroke();
        fill(...skin);
        ellipse(elbowX, elbowY, 11);
        fill(255, 218, 150);
        ellipse(fistX, fistY, 15);
      } else if (f.attackUp) {
        const fistX = bodyX + direction * (5 + arcStrength * 10);
        const fistY = bodyTop - 10 - arcStrength * 72;
        const vfxTint = f.character === "BALLHOG" ? GOLD : CYAN;
        stroke(...skin);
        strokeWeight(8);
        line(bodyX + direction * 13, shoulderY, fistX, fistY);
        noStroke();
        fill(...skin);
        ellipse(fistX, fistY, 13);

        noFill();
        // The broad translucent pass fakes a glow without blur filters.
        stroke(vfxTint[0], vfxTint[1], vfxTint[2], 32 * arcStrength);
        strokeWeight(17);
        arc(bodyX, bodyTop - 48, 110, 116, Math.PI * 1.08, Math.PI * 1.92);
        stroke(vfxTint[0], vfxTint[1], vfxTint[2], 210 * arcStrength);
        strokeWeight(5);
        arc(bodyX, bodyTop - 48, 110, 116, Math.PI * 1.08, Math.PI * 1.92);
        stroke(vfxTint[0], vfxTint[1], vfxTint[2], 210 * arcStrength);
        strokeWeight(2.2);
        line(bodyX - 36, bodyTop - 12, bodyX - 10, bodyTop - 96);
        line(bodyX + 36, bodyTop - 12, bodyX + 10, bodyTop - 96);

        stroke(...skin);
        strokeWeight(7);
        line(bodyX - direction * 12, shoulderY, bodyX - direction * 18, bodyTop - 3);
      } else if (f.attackDown) {
        const fistX = bodyX + direction * (5 + arcStrength * 10);
        const fistY = bodyBottom + 4 + arcStrength * 40;
        const vfxTint = f.character === "BALLHOG" ? GOLD : CYAN;
        stroke(...skin);
        strokeWeight(8);
        line(bodyX + direction * 13, shoulderY, fistX, fistY);
        noStroke();
        fill(...skin);
        ellipse(fistX, fistY, 13);

        noFill();
        stroke(vfxTint[0], vfxTint[1], vfxTint[2], 32 * arcStrength);
        strokeWeight(17);
        arc(bodyX, bodyBottom + 37, 110, 116, Math.PI * 0.08, Math.PI * 0.92);
        stroke(vfxTint[0], vfxTint[1], vfxTint[2], 210 * arcStrength);
        strokeWeight(5);
        arc(bodyX, bodyBottom + 37, 110, 116, Math.PI * 0.08, Math.PI * 0.92);
        stroke(vfxTint[0], vfxTint[1], vfxTint[2], 210 * arcStrength);
        strokeWeight(2.2);
        line(bodyX - 36, bodyBottom + 2, bodyX - 10, bodyBottom + 83);
        line(bodyX + 36, bodyBottom + 2, bodyX + 10, bodyBottom + 83);

        stroke(...skin);
        strokeWeight(7);
        line(bodyX - direction * 12, shoulderY, bodyX - direction * 18, bodyTop - 3);
      } else {
      const reach = f.character === "BALLHOG" ? 40 : 45;
      const fistX = bodyX + direction * (20 + (reach - 20) * arcStrength);
      const fistY = shoulderY + 8 - arcStrength * 9;
      stroke(...skin);
      strokeWeight(8);
      line(bodyX + direction * 13, shoulderY, fistX, fistY);
      noStroke();
      fill(...skin);
      ellipse(fistX, fistY, 12);
      stroke(250, 223, 171, 220 * arcStrength);
      strokeWeight(2 + arcStrength * 2);
      line(fistX - direction * 22, fistY - 10, fistX + direction * 9, fistY - 18);
      line(fistX - direction * 19, fistY, fistX + direction * 14, fistY - 6);
      stroke(...skin);
      strokeWeight(7);
      line(bodyX - direction * 12, shoulderY, bodyX - direction * 20, bodyBottom - 3);
      }
    } else {
      stroke(...skin);
      strokeWeight(7);
      line(bodyX - 14, shoulderY, bodyX - 20, bodyBottom - 2 - armSwing);
      line(bodyX + 14, shoulderY, bodyX + 20, bodyBottom - 2 + armSwing);
      noStroke();
      fill(...skin);
      ellipse(bodyX - 20, bodyBottom - 2 - armSwing, 10);
      ellipse(bodyX + 20, bodyBottom - 2 + armSwing, 10);
    }

    const headW = f.character === "BALLHOG" ? 26 : 23;
    fill(...skin);
    ellipse(bodyX, headCY + 3, headW, 28);
    // Hair uses a fixed dark palette and is layered before the face details so
    // attack flashes and arm poses never recolor or hide the single eye.
    if (f.character === "BALLHOG") {
      fill(...BALLHOG_HAIR);
      ellipse(bodyX, headCY - 8, 27, 15);
      const curls = [[-10, -12, 5], [-5, -17, 5], [1, -18, 5], [7, -16, 5], [11, -11, 4]];
      for (const [dx, dy, r] of curls) ellipse(bodyX + dx, headCY + dy, r * 2);
      fill(52, 40, 38);
      ellipse(bodyX - 5, headCY - 16, 5, 3);
      ellipse(bodyX + 5, headCY - 18, 5, 3);
    } else {
      fill(...ARCHIVE_HAIR);
      ellipse(bodyX, headCY - 10, 25, 15);
      const spikes = [[-9, -15], [-3, -20], [4, -19], [10, -14]];
      for (let i = 0; i < spikes.length; i += 1) {
        const [dx, dy] = spikes[i];
        triangle(bodyX + dx - 4, headCY + dy + 6, bodyX + dx + 4, headCY + dy + 6, bodyX + dx + (i % 2 ? 2 : -2), headCY + dy - 4);
      }
      stroke(45, 45, 54);
      strokeWeight(2);
      line(bodyX - 7, headCY - 15, bodyX - 3, headCY - 17);
      noStroke();
    }
    // Exactly one visible eye for each fighter, on the side they face.
    noStroke();
    fill(45, 31, 30);
    ellipse(bodyX + direction * 7, headCY + 2, 4, 5);
    fill(255, 233, 206);
    ellipse(bodyX + direction * 7 + direction, headCY + 1, 1.5, 2);

    if (f.superCharge >= 100) {
      noFill();
      stroke(...f.accent);
      strokeWeight(2);
      ellipse(bodyX, f.chestY, 78 + Math.sin(f.animationTime * 8) * 6, 78 + Math.sin(f.animationTime * 8) * 6);
      noStroke();
    }
    if (f.poisonTime > 0) {
      noStroke();
      fill(...CYAN);
      for (let i = 0; i < Math.min(4, f.poisonStacks); i += 1) {
        const px = x + Math.sin(millis() / 130 + i * 2) * 18;
        const py = f.bottom - 42 - ((millis() / 5 + i * 23) % 54);
        ellipse(px, py, 6);
      }
    }
  }

  drawBeamClash() {
    const clash = this.beamClash;
    if (!clash) return;

    const clashRatio = clash.leftStake / 10;
    const cx = this.p1.x + (this.p2.x - this.p1.x) * clashRatio;
    const cy = this.p1.chestY + (this.p2.chestY - this.p1.chestY) * clashRatio;
    const time = millis() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);

    // Fake a soft beam glow with three flat strokes. This avoids per-frame
    // canvas shadow blur and screen blending, which were expensive on laptops.
    const drawBeam = (fighter, tint, phase) => {
      const x1 = fighter.x;
      const y1 = fighter.chestY;
      const dx = cx - x1;
      const dy = cy - y1;
      strokeCap(ROUND);
      stroke(tint[0], tint[1], tint[2], 28);
      strokeWeight(48 + pulse * 4);
      line(x1, y1, cx, cy);
      stroke(tint[0], tint[1], tint[2], 190);
      strokeWeight(15);
      line(x1, y1, cx, cy);
      stroke(255, 250, 236, 245);
      strokeWeight(3.5);
      line(x1, y1, cx, cy);

      // Three moving highlights per beam keep a sense of energy with few draws.
      noStroke();
      for (let mote = 0; mote < 3; mote += 1) {
        const progress = ((time * 0.55 + mote / 3 + phase) % 1 + 1) % 1;
        const moteX = x1 + dx * progress;
        const moteY = y1 + dy * progress;
        fill(tint[0], tint[1], tint[2], 190);
        circle(moteX, moteY, 6);
        fill(255, 255, 246, 225);
        circle(moteX, moteY, 2.5);
      }
    };

    drawBeam(this.p1, this.p1.accent, 0.1);
    drawBeam(this.p2, this.p2.accent, 0.6);
    strokeCap(SQUARE);

    // A compact rotating impact prism stays bright without a blur pass.
    push();
    translate(cx, cy);
    rotate(time * 1.3);
    noFill();
    stroke(this.p1.accent[0], this.p1.accent[1], this.p1.accent[2], 200);
    strokeWeight(2);
    ellipse(0, 0, 48 + pulse * 8, 28 + pulse * 4);
    stroke(this.p2.accent[0], this.p2.accent[1], this.p2.accent[2], 200);
    ellipse(0, 0, 28 + pulse * 4, 48 + pulse * 8);
    noStroke();
    fill(255, 251, 231, 245);
    beginShape();
    for (let point = 0; point < 8; point += 1) {
      const angle = point * TWO_PI / 8;
      const radius = point % 2 === 0 ? 19 + pulse * 4 : 8;
      vertex(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    endShape(CLOSE);
    for (let spark = 0; spark < 6; spark += 1) {
      const angle = time * (spark % 2 ? -1.8 : 1.8) + spark * TWO_PI / 6;
      const inner = 30 + 3 * Math.sin(time * 5 + spark);
      const outer = inner + 7;
      const tint = spark % 2 === 0 ? this.p1.accent : this.p2.accent;
      stroke(tint[0], tint[1], tint[2], 210);
      strokeWeight(1.5);
      line(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    pop();

    // The tug-of-war panel uses flat fills so its full-width glow is gone too.
    const x = 292, y = 681, w = 696, h = 22;
    const divider = x + w * clash.leftStake / 10;
    const panelPulse = 0.5 + 0.5 * Math.sin(time * 5);
    noStroke();
    fill(8, 10, 20, 238);
    rect(x - 20, y - 34, w + 40, 72, 13);
    stroke(255, 255, 255, 35);
    strokeWeight(1);
    noFill();
    rect(x - 20, y - 34, w + 40, 72, 13);
    noStroke();
    this.drawLabel("BALLHOG  ·  MASH E", 13, this.p1.accent, x, y - 21);
    this.drawLabel("ARCHIVE  ·  MASH N", 13, this.p2.accent, x + w, y - 21, RIGHT);
    const timerW = 90;
    fill(24, 25, 37);
    stroke(255, 245, 220, 130);
    strokeWeight(1);
    rect(WORLD_W / 2 - timerW / 2, y - 31, timerW, 23, 8);
    noStroke();
    this.drawLabel(clash.secondsLeft.toFixed(1) + "s", 14, CREAM, WORLD_W / 2, y - 28, CENTER);

    fill(30, 31, 43);
    stroke(238, 238, 246, 120);
    strokeWeight(1.5);
    rect(x, y, w, h, 7);
    noStroke();
    fill(this.p1.accent[0], this.p1.accent[1], this.p1.accent[2]);
    rect(x + 2, y + 2, Math.max(0, divider - x - 2), h - 4, 5);
    fill(this.p2.accent[0], this.p2.accent[1], this.p2.accent[2]);
    rect(divider, y + 2, Math.max(0, x + w - divider - 2), h - 4, 5);
    for (let mark = 1; mark < 10; mark += 1) {
      const markX = x + w * mark / 10;
      stroke(22, 24, 33, 180);
      strokeWeight(2);
      line(markX, y + 3, markX, y + h - 3);
    }
    const dividerPulse = clash.pulse > 0 ? 1 : panelPulse;
    stroke(255, 255, 255, 240);
    strokeWeight(2.5 + dividerPulse * 1.5);
    line(divider, y - 4, divider, y + h + 4);
    noStroke();
    fill(255);
    circle(divider, y + h / 2, 7 + dividerPulse * 3);
    this.drawLabel(clash.leftStake + "/10", 12, INK, x + 10, y + 4);
    this.drawLabel((10 - clash.leftStake) + "/10", 12, INK, x + w - 10, y + 4, RIGHT);
    this.drawLabel("FIRST TO THE EDGE WINS  ·  5 SECOND CLASH", 10, [205, 211, 224], WORLD_W / 2, y + 23, CENTER);
  }

  drawSuperEffect(fighter) {
    if (fighter.superTime <= 0) return;

    const y = fighter.chestY + 2;
    const edge = fighter.facing > 0 ? WORLD_W : 0;
    const t = millis() / 1000;
    const charging = fighter.superTime > 0.36;

    if (charging) {
      // Rotating charge rings and sparks make the super's wind-up readable.
      noFill();
      strokeWeight(3);
      if (fighter.character === "BALLHOG") {
        stroke(255, 204, 91, 210);
        ellipse(fighter.x, y, 88 + Math.sin(t * 12) * 9);
        stroke(255, 247, 199, 200);
        ellipse(fighter.x, y, 58 + Math.cos(t * 15) * 7);
        for (let i = 0; i < 4; i += 1) {
          const a = t * 4 + i * HALF_PI;
          arc(fighter.x, y, 118, 118, a, a + 0.72);
          const sx = fighter.x + Math.cos(a) * 57;
          const sy = y + Math.sin(a) * 57;
          line(sx - 5, sy, sx + 5, sy);
          line(sx, sy - 5, sx, sy + 5);
        }
        this.drawLabel("BLASSIC BLAST", 14, [255, 230, 161], fighter.x, y - 76, CENTER);
      } else {
        stroke(78, 163, 255, 220);
        ellipse(fighter.x, y, 78, 112);
        stroke(199, 232, 255, 200);
        ellipse(fighter.x, y, 48, 82);
        for (let i = 0; i < 5; i += 1) {
          const a = -t * 5 + i * TWO_PI / 5;
          const sx = fighter.x + Math.cos(a) * 47;
          const sy = y + Math.sin(a) * 58;
          line(sx, sy, sx + Math.cos(a + 0.6) * 12, sy + Math.sin(a + 0.6) * 12);
        }
        this.drawLabel("SLIMANE SPEAR", 14, [183, 224, 255], fighter.x, y - 78, CENTER);
      }
      noStroke();
      return;
    }

    const progress = gameClamp(1 - fighter.superTime / 0.34, 0, 1);
    const tipX = fighter.x + (edge - fighter.x) * progress;

    if (fighter.character === "BALLHOG") {
      // A layered gold-white laser with lively lightning filaments and traveling flares.
      stroke(255, 244, 195, 105);
      strokeWeight(76);
      line(fighter.x, y, edge, y);
      stroke(255, 177, 48, 190);
      strokeWeight(48);
      line(fighter.x, y, edge, y);
      stroke(255, 227, 118, 235);
      strokeWeight(26);
      line(fighter.x, y, edge, y);
      stroke(255, 255, 238, 255);
      strokeWeight(9);
      line(fighter.x, y, edge, y);

      for (let strand = 0; strand < 4; strand += 1) {
        noFill();
        stroke(strand % 2 ? 255 : 255, strand % 2 ? 248 : 201, 128, 205);
        strokeWeight(strand === 0 ? 3 : 2);
        beginShape();
        for (let strandPoint = 0; strandPoint <= 12; strandPoint += 1) {
          const fraction = strandPoint / 12;
          const px = fighter.x + (edge - fighter.x) * fraction;
          const jitter = Math.sin(t * 23 + strandPoint * 2.4 + strand * 1.8) * (5 + strand * 2);
          vertex(px, y + jitter);
        }
        endShape();
      }

      noStroke();
      for (let i = 0; i < 7; i += 1) {
        const fraction = (t * 1.7 + i / 7) % 1;
        const px = fighter.x + (edge - fighter.x) * fraction;
        const flare = 10 + 8 * Math.sin(t * 18 + i);
        fill(255, 249, 214, 220);
        ellipse(px, y, flare * 2, flare * 2);
        fill(255, 255, 248);
        ellipse(px, y, flare, flare);
      }

      fill(255, 253, 225);
      ellipse(fighter.x, y, 72 + Math.sin(t * 28) * 10);
      this.drawLabel("BLASSIC BLAST", 16, [255, 241, 193], fighter.x + fighter.facing * 170, y - 47, CENTER);
    } else {
      // The Slimane Spear races across the arena, leaving a blue-white wake.
      stroke(184, 224, 255, 110);
      strokeWeight(36);
      line(fighter.x, y, tipX, y);
      stroke(35, 105, 200, 220);
      strokeWeight(22);
      line(fighter.x, y, tipX, y);
      stroke(67, 157, 255, 245);
      strokeWeight(11);
      line(fighter.x, y, tipX, y);
      stroke(255, 246, 238, 255);
      strokeWeight(3);
      line(fighter.x, y, tipX, y);

      noStroke();
      for (let i = 1; i <= 8; i += 1) {
        const px = fighter.x + (tipX - fighter.x) * i / 9;
        const tooth = (i % 2 ? 1 : -1) * 12;
        fill(103, 185, 255, 225);
        triangle(px, y, px - fighter.facing * 22, y + tooth, px - fighter.facing * 8, y);
      }

      fill(255, 239, 232);
      triangle(tipX, y, tipX - fighter.facing * 44, y - 22, tipX - fighter.facing * 44, y + 22);
      fill(241, 82, 112);
      triangle(tipX - fighter.facing * 5, y, tipX - fighter.facing * 38, y - 11, tipX - fighter.facing * 38, y + 11);

      noFill();
      stroke(255, 137, 154, 210);
      strokeWeight(3);
      ellipse(fighter.x, y, 50 + Math.sin(t * 24) * 8);
      this.drawLabel("SLIMANE SPEAR", 16, [255, 206, 211], fighter.x + fighter.facing * 158, y - 43, CENTER);
    }
    noStroke();
  }

  drawLabel(message, size, color, x, y, align = LEFT) {
    noStroke();
    fill(...color);
    textStyle(BOLD);
    textSize(size);
    textAlign(align, TOP);
    text(message, x, y);
  }

  drawMeter(x, y, meterWidth, value, color) {
    noStroke();
    fill(36, 34, 44);
    rect(x, y, meterWidth, 10, 5);
    const fillWidth = meterWidth * value / 100;
    if (fillWidth > 0) {
      fill(...color);
      rect(x, y, fillWidth, 10, 5);
    }
    noFill();
    stroke(108, 98, 107);
    strokeWeight(1);
    rect(x, y, meterWidth, 10, 5);
    noStroke();
  }

  drawReturnMenuProgress(x, y, w) {
    const left = gameClamp(this.returnMenuProgress[0], 0, 1);
    const right = gameClamp(this.returnMenuProgress[1], 0, 1);
    const h = 13;
    const halfWidth = w * 0.5;
    const leftWidth = halfWidth * left;
    const rightWidth = halfWidth * right;
    noStroke(); fill(9, 11, 20, 235); rect(x - 12, y - 24, w + 24, 47, 8);
    this.drawLabel("P1 HOLD ~  ·  P2 HOLD BACKSPACE  ·  MEET AT CENTER", 10, [224, 228, 236], x + w / 2, y - 20, CENTER);
    fill(31, 33, 45); rect(x, y, w, h, 6);
    drawingContext.save(); drawingContext.shadowBlur = 14;
    drawingContext.shadowColor = "rgba(255,193,83,0.95)";
    fill(255, 193, 83);
    if (leftWidth > 0) rect(x + 2, y + 2, Math.max(0, leftWidth - 2), h - 4, 4);
    drawingContext.shadowColor = "rgba(112,221,222,0.95)";
    fill(112, 221, 222);
    if (rightWidth > 0) rect(x + w - rightWidth, y + 2, Math.max(0, rightWidth - 2), h - 4, 4);
    drawingContext.restore();
    noFill(); stroke(230, 234, 244, 210); strokeWeight(1); rect(x, y, w, h, 6);
    stroke(255, 255, 255, 90); line(x + w / 2, y - 2, x + w / 2, y + h + 2);
    noStroke();
    this.drawLabel(Math.floor(left * 100) + "%", 9, CREAM, x + 5, y + 1);
    this.drawLabel(Math.floor(right * 100) + "%", 9, CREAM, x + w - 5, y + 1, RIGHT);
  }

  drawHud() {
    noStroke();
    fill(19, 18, 28);
    rect(0, 0, WORLD_W, 122);
    stroke(122, 54, 67);
    strokeWeight(2);
    line(0, 121, WORLD_W, 121);
    noStroke();
    this.drawLabel(this.p1.name, 26, this.p1.accent, 42, 15);
    this.drawLabel(this.p1.character === "BALLHOG" ? "Raf Simons Rage" : "Archive Over Time", 16, [208, 178, 154], 44, 47);
    this.drawLabel(`DAMAGE  ×${this.p1.rageMultiplier.toFixed(2)}`, 12, [235, 198, 150], 44, 69);
    this.drawLabel(this.p2.name, 26, this.p2.accent, WORLD_W - 42, 15, RIGHT);
    this.drawLabel(this.p2.character === "ARCHIVE" ? "Archive Over Time" : "Raf Simons Rage", 16, [184, 201, 199], WORLD_W - 44, 47, RIGHT);
    this.drawLabel(this.p2.character === "ARCHIVE" ? "HITS APPLY 10s RESIDUAL DAMAGE" : "GAINS RAGE WHEN HIT", 12, [145, 187, 184], WORLD_W - 44, 69, RIGHT);

    if (this.practiceMode) {
      noStroke();
      fill(12, 15, 22, 230);
      rect(WORLD_W / 2 - 105, 35, 210, 29, 8);
      stroke(255, 193, 83, 210);
      strokeWeight(1.5);
      noFill();
      rect(WORLD_W / 2 - 105, 35, 210, 29, 8);
      noStroke();
      this.drawLabel("PRACTICE MODE", 15, [255, 225, 164], WORLD_W / 2, 38, CENTER);
      this.drawLabel("7  ·  RETURN TO TITLE", 9, [200, 207, 218], WORLD_W / 2, 54, CENTER);
    }

    const barW = 430;
    noStroke();
    fill(54, 35, 43);
    rect(44, 91, barW, 17, 7);
    fill(...this.p1.accent);
    rect(44, 91, barW * this.p1.health / 100, 17, 7);
    fill(54, 35, 43);
    rect(WORLD_W - 44 - barW, 91, barW, 17, 7);
    fill(...this.p2.accent);
    const p2Fill = barW * this.p2.health / 100;
    rect(WORLD_W - 44 - p2Fill, 91, p2Fill, 17, 7);
    noFill();
    stroke(203, 183, 163);
    strokeWeight(1);
    rect(44, 91, barW, 17, 7);
    rect(WORLD_W - 44 - barW, 91, barW, 17, 7);
    noStroke();
    this.drawLabel(`${Math.ceil(this.p1.health)}`, 12, INK, 54, 92);
    this.drawLabel(`${Math.ceil(this.p2.health)}`, 12, INK, WORLD_W - 54, 92, RIGHT);

    this.drawLabel((this.p1.character === "BALLHOG" ? "BLASSIC BLAST" : "SLIMANE SPEAR") + " · F", 12, [221, 203, 174], 45, 109);
    this.drawMeter(180, 111, 294, this.p1.superCharge, this.p1.accent);
    this.drawLabel((this.p2.character === "ARCHIVE" ? "SLIMANE SPEAR" : "BLASSIC BLAST") + " · M", 12, [190, 212, 207], WORLD_W - 45, 109, RIGHT);
    this.drawMeter(WORLD_W - 474, 111, 294, this.p2.superCharge, this.p2.accent);
    if (this.p1.superCharge >= 100) this.drawLabel("READY", 12, GOLD, 480, 107);
    if (this.p2.superCharge >= 100) this.drawLabel("READY", 12, CYAN, WORLD_W - 480, 107, RIGHT);
  }

  drawMapSelectScreen() {
    image(backgroundLayers[this.mapIndex] || backgroundLayers[0], 0, 0);
    for (const platform of MAP_LAYOUTS[this.mapIndex].platforms) this.drawPlatform(platform);
    noStroke(); fill(9, 10, 20, 200); rect(0, 0, WORLD_W, WORLD_H);
    this.drawLabel("MAP SELECT", 34, CREAM, WORLD_W / 2, 78, CENTER);
    this.drawLabel("Choose a shared stage · both players confirm with E / N", 15, [205, 207, 216], WORLD_W / 2, 112, CENTER);
    const cardW = 520, cardH = 220;
    const mx = (mouseX - offsetX) / scaleFactor, my = (mouseY - offsetY) / scaleFactor;
    for (let i = 0; i < MAP_LAYOUTS.length; i += 1) {
      const x = 90 + (i % 2) * 600;
      const cardY = 155 + Math.floor(i / 2) * 245;
      const p1 = this.mapSelection[0] === i, p2 = this.mapSelection[1] === i;
      const hovered = mx >= x && mx <= x + cardW && my >= cardY && my <= cardY + cardH;
      const shared = (p1 && p2) || (hovered && (p1 || p2));
      const active = p1 || p2 || hovered;
      noStroke(); fill(13, 15, 26, 235); rect(x, cardY, cardW, cardH, 13);
      if (shared) {
        drawingContext.save(); drawingContext.shadowBlur = 25; drawingContext.shadowColor = "rgba(255,193,83,0.9)";
        fill(255, 193, 83, 110); rect(x + 2, cardY + 2, cardW / 2 - 2, cardH - 4, 11);
        drawingContext.shadowColor = "rgba(112,221,222,0.9)"; fill(112, 221, 222, 110);
        rect(x + cardW / 2, cardY + 2, cardW / 2 - 2, cardH - 4, 11); drawingContext.restore();
      } else if (p1 || p2) {
        drawingContext.save(); drawingContext.shadowBlur = 25;
        drawingContext.shadowColor = p1 ? "rgba(255,193,83,0.95)" : "rgba(112,221,222,0.95)";
        const tint = p1 ? GOLD : CYAN; fill(tint[0], tint[1], tint[2], 100); rect(x + 2, cardY + 2, cardW - 4, cardH - 4, 11); drawingContext.restore();
      } else if (hovered) {
        drawingContext.save(); drawingContext.shadowBlur = 18; drawingContext.shadowColor = "rgba(255,255,255,0.75)";
        fill(225, 231, 244, 70); rect(x + 2, cardY + 2, cardW - 4, cardH - 4, 11); drawingContext.restore();
      }
      stroke(active ? 245 : 93, active ? 230 : 100, active ? 196 : 120); strokeWeight(active ? 2.5 : 1); noFill(); rect(x, cardY, cardW, cardH, 13);
      noStroke(); this.drawLabel(MAP_LAYOUTS[i].name, 19, CREAM, x + cardW / 2, cardY + 18, CENTER);
      const previewX = x + 18, previewW = cardW - 36, previewH = 132, groundY = cardY + 177;
      fill(30, 35, 51); rect(previewX, cardY + 40, previewW, previewH, 7);
      fill(87, 61, 75, 180); rect(previewX, groundY, previewW, 8, 3);
      for (const platform of MAP_LAYOUTS[i].platforms.slice(1)) {
        const px = previewX + platform.x / WORLD_W * previewW;
        const py = groundY - (FLOOR_Y - platform.y) / WORLD_H * previewH;
        const pw = platform.w / WORLD_W * previewW;
        fill(157, 82, 94); rect(px, py, pw, 6, 3);
        fill(215, 147, 116, 110); rect(px + 3, py + 6, pw - 6, 4, 2);
      }
      this.drawLabel("P1 " + (p1 ? (this.mapReady[0] ? "READY" : "HIGHLIGHT") : ""), 10, GOLD, x + 14, cardY + 195);
      this.drawLabel("P2 " + (p2 ? (this.mapReady[1] ? "READY" : "HIGHLIGHT") : ""), 10, CYAN, x + cardW - 14, cardY + 195, RIGHT);
      if (this.mapIndex === i) this.drawLabel("CURRENT", 9, [222, 222, 231], x + cardW / 2, cardY + 196, CENTER);
    }
    if (this.mapReady[0] && this.mapReady[1] && this.mapSelection[0] !== this.mapSelection[1]) {
      this.drawLabel("Choose the same map to start", 15, [255, 183, 149], WORLD_W / 2, 644, CENTER);
    }
    this.drawLabel("P1: WASD + E CONFIRM   ·   P2: ARROWS + N CONFIRM   ·   BACKSPACE: MENU", 13, [255, 236, 196], WORLD_W / 2, 690, CENTER);
  }

  drawCharacterSelectScreen() {
    image(backgroundLayers[this.mapIndex] || backgroundLayers[0], 0, 0);
    for (const platform of this.platforms) this.drawPlatform(platform);
    noStroke(); fill(8, 8, 17, 125); rect(0, 0, WORLD_W, WORLD_H);
    this.drawLabel("CHOOSE YOUR FIGHTER", 35, CREAM, WORLD_W / 2, 47, CENTER);
    this.drawLabel("Two fighters. Two styles. Pick a side and lock in.", 14, [202, 207, 219], WORLD_W / 2, 82, CENTER);

    const cards = [
      { player: 0, x: 68, center: 343, frame: GOLD, side: "PLAYER 1  ·  WASD" },
      { player: 1, x: 657, center: 937, frame: CYAN, side: "PLAYER 2  ·  ARROW KEYS" },
    ];
    const cardY = 116, cardW = 555, cardH = 536;
    for (const card of cards) {
      const character = this.characterChoices[card.player];
      const fighter = this.createFighter(character, card.player + 1, card.center);
      fighter.animationTime = millis() / 1000 + card.player * 0.8;
      fighter.facing = card.player === 0 ? 1 : -1;
      const isBallhog = character === "BALLHOG";
      const role = isBallhog ? "HEAVY HITTER" : "FAST STRIKER";
      const passive = isBallhog ? "RAF SIMONS RAGE" : "ARCHIVE OVER TIME";
      const passiveDescription = isBallhog
        ? "Every hit taken raises his damage by 15%."
        : "Poison stacks to 4 and poison ticks charge super.";

      drawingContext.save();
      drawingContext.shadowBlur = 22;
      drawingContext.shadowColor = `rgba(${card.frame[0]},${card.frame[1]},${card.frame[2]},0.42)`;
      fill(10, 12, 22, 238);
      stroke(card.frame[0], card.frame[1], card.frame[2], 190);
      strokeWeight(1.7);
      rect(card.x, cardY, cardW, cardH, 18);
      drawingContext.restore();
      noStroke();
      fill(card.frame[0], card.frame[1], card.frame[2], 150);
      rect(card.x + 20, cardY + 3, cardW - 40, 3, 2);

      this.drawLabel(card.side, 13, card.frame, card.center, 133, CENTER);
      this.drawLabel(character, 29, fighter.accent, card.center, 161, CENTER);
      this.drawLabel(role, 11, [202, 208, 220], card.center, 188, CENTER);

      const halo = 34 + Math.round(12 * Math.sin(millis() / 360 + card.player));
      drawingContext.save();
      drawingContext.shadowBlur = 24;
      drawingContext.shadowColor = `rgba(${fighter.accent[0]},${fighter.accent[1]},${fighter.accent[2]},0.75)`;
      noStroke();
      fill(fighter.accent[0], fighter.accent[1], fighter.accent[2], 20);
      ellipse(card.center, 333, 160 + halo, 220 + halo);
      noFill();
      stroke(fighter.accent[0], fighter.accent[1], fighter.accent[2], 85);
      strokeWeight(1.5);
      ellipse(card.center, 333, 190 + halo, 250 + halo);
      drawingContext.restore();

      push();
      translate(card.center, 470);
      scale(1.55);
      translate(-card.center, -FLOOR_Y);
      this.drawFighter(fighter, card.center, true);
      pop();

      this.drawLabel(passive, 13, fighter.accent, card.center, 488, CENTER);
      this.drawLabel(passiveDescription, 11, [203, 207, 218], card.center, 507, CENTER);
      const statRows = [
        { label: "POWER", value: isBallhog ? 0.92 : 0.60, y: 535 },
        { label: "SPEED", value: isBallhog ? 0.62 : 0.94, y: 554 },
      ];
      for (const stat of statRows) {
        this.drawLabel(stat.label, 9, [164, 174, 192], card.center - 112, stat.y, RIGHT);
        noStroke(); fill(39, 43, 57); rect(card.center - 100, stat.y + 2, 200, 7, 4);
        fill(...fighter.accent); rect(card.center - 100, stat.y + 2, 200 * stat.value, 7, 4);
      }
      this.drawLabel(card.player === 0 ? "A / D CHANGE  ·  E CONFIRM" : "← / → CHANGE  ·  N CONFIRM", 11, CREAM, card.center, 592, CENTER);
      const ready = this.characterReady[card.player];
      this.drawLabel(ready ? `PLAYER ${card.player + 1} READY · PRESS ${card.player === 0 ? "E" : "N"} TO UNREADY` : `PRESS ${card.player === 0 ? "E" : "N"} TO LOCK IN`, 12, card.frame, card.center, 619, CENTER);
    }
    this.drawLabel("DOUBLE JUMP: TAP JUMP AGAIN IN AIR  ·  HOLD S / ↓ TO BLOCK + HEAL USING SUPER", 12, [231, 222, 205], WORLD_W / 2, 688, CENTER);
    this.drawLabel("BOTH PLAYERS CONFIRM WITH E / N     ·     BACKSPACE TO MENU", 12, [177, 188, 204], WORLD_W / 2, 713, CENTER);
  }

  drawMenuButtons() {
    const labels = ["PLAY", "PRACTICE MODE", "CHARACTER SELECT", "MAP SELECT"];
    const descriptions = ["Start a standard match", "Infinite ultimate · test moves", "Choose Ballhog or Archive", "Choose a floating platform layout"];
    const x = 58, y = 320, w = 342, h = 56, gap = 8;
    const mx = (mouseX - offsetX) / scaleFactor;
    const my = (mouseY - offsetY) / scaleFactor;
    for (let i = 0; i < labels.length; i += 1) {
      const by = y + i * (h + gap);
      const p1 = this.menuSelection[0] === i;
      const p2 = this.menuSelection[1] === i;
      const hovered = mx >= x && mx <= x + w && my >= by && my <= by + h;
      const shared = (p1 && p2) || (hovered && (p1 || p2));
      const active = p1 || p2 || hovered;
      noStroke(); fill(12, 13, 23, 245); rect(x, by, w, h, 10);
      if (shared) {
        drawingContext.save(); drawingContext.shadowBlur = 20;
        drawingContext.shadowColor = "rgba(255,220,130,0.85)";
        fill(255, 193, 83, 145); rect(x + 2, by + 2, w / 2 - 2, h - 4, 8);
        drawingContext.shadowColor = "rgba(90,215,255,0.85)";
        fill(92, 205, 244, 145); rect(x + w / 2, by + 2, w / 2 - 2, h - 4, 8);
        drawingContext.restore();
      } else if (p1 || p2) {
        const tint = p1 ? GOLD : CYAN;
        drawingContext.save(); drawingContext.shadowBlur = 22;
        drawingContext.shadowColor = p1 ? "rgba(255,193,83,0.95)" : "rgba(112,221,222,0.95)";
        fill(tint[0], tint[1], tint[2], 145); rect(x + 2, by + 2, w - 4, h - 4, 8);
        drawingContext.restore();
      } else if (hovered) {
        fill(220, 230, 245, 75); rect(x + 2, by + 2, w - 4, h - 4, 8);
      }
      stroke(active ? 245 : 100, active ? 233 : 100, active ? 198 : 115);
      strokeWeight(active ? 2 : 1); noFill(); rect(x, by, w, h, 10);
      noStroke();
      this.drawLabel(labels[i], 15, CREAM, x + 16, by + 8);
      this.drawLabel(descriptions[i], 10, [208, 204, 200], x + 16, by + 32);
      this.drawLabel(p1 && p2 ? "P1 + P2" : p1 ? "P1" : p2 ? "P2" : "", 9, p1 ? GOLD : CYAN, x + w - 12, by + 10, RIGHT);
    }
  }

  drawStartScreen() {
    if (this.menuPage === "characters") { this.drawCharacterSelectScreen(); return; }
    if (this.menuPage === "maps") { this.drawMapSelectScreen(); return; }
    image(backgroundLayers[this.mapIndex] || backgroundLayers[0], 0, 0);
    for (const platform of this.platforms) this.drawPlatform(platform);
    noStroke(); fill(8, 8, 17, 158); rect(0, 0, WORLD_W, WORLD_H);

    this.drawLabel("LOCAL TWO-PLAYER PLATFORM FIGHTER", 13, [207, 177, 157], WORLD_W / 2, 48, CENTER);
    this.drawLabel("BALLHOG", 48, GOLD, WORLD_W / 2 - 165, 78, CENTER);
    this.drawLabel("VS", 20, CREAM, WORLD_W / 2, 96, CENTER);
    this.drawLabel("ARCHIVE", 48, CYAN, WORLD_W / 2 + 165, 78, CENTER);
    this.drawLabel("Pick your fighter. Pick your arena. Settle it.", 15, [223, 211, 198], WORLD_W / 2, 137, CENTER);
    this.drawLabel(`VERSION ${GAME_VERSION}`, 12, [202, 208, 220], WORLD_W - 30, 24, RIGHT);

    // Character previews remain on the menu backdrop behind the information cards.
    this.drawFighter(this.p1, 390, true);
    this.drawFighter(this.p2, 890, true);

    this.drawMenuButtons();

    const cardY = 320, cardH = 188, cardW = 380;
    const p1X = 432, p2X = 832;
    noStroke(); fill(13, 14, 24, 247);
    rect(p1X, cardY, cardW, cardH, 13);
    rect(p2X, cardY, cardW, cardH, 13);
    stroke(...GOLD); strokeWeight(2); line(p1X + 14, cardY + 2, p1X + cardW - 14, cardY + 2);
    stroke(...CYAN); line(p2X + 14, cardY + 2, p2X + cardW - 14, cardY + 2);
    noStroke();

    this.drawLabel("PLAYER 1  ·  " + this.p1.name, 19, this.p1.accent, p1X + 18, cardY + 18);
    this.drawLabel("A / D MOVE   W DOUBLE JUMP   S + W DROP", 11, CREAM, p1X + 18, cardY + 55);
    this.drawLabel((this.p1.character === "BALLHOG" ? "HOLD E + RELEASE  ·  CHARGED ATTACK" : "E  ·  NORMAL ATTACK"), 12, [226, 215, 198], p1X + 18, cardY + 82);
    this.drawLabel("F  ·  " + (this.p1.character === "BALLHOG" ? "BLASSIC BLAST" : "SLIMANE SPEAR"), 12, [226, 215, 198], p1X + 18, cardY + 107);
    this.drawLabel(this.p1.character === "BALLHOG" ? "Super builds slowly; dealing hits adds more." : "Poison stacks to 4 and its ticks charge super.", 10, [177, 190, 190], p1X + 18, cardY + 142);
    this.drawLabel("HOLD S  ·  BLOCK + HEAL USING SUPER", 10, [190, 213, 231], p1X + 18, cardY + 165);

    this.drawLabel("PLAYER 2  ·  " + this.p2.name, 19, this.p2.accent, p2X + 18, cardY + 18);
    this.drawLabel("← / → MOVE   ↑ DOUBLE JUMP   ↓ + ↑ DROP", 11, CREAM, p2X + 18, cardY + 55);
    this.drawLabel("N  ·  NORMAL ATTACK", 12, [211, 225, 222], p2X + 18, cardY + 82);
    this.drawLabel("M  ·  " + (this.p2.character === "ARCHIVE" ? "SLIMANE SPEAR" : "BLASSIC BLAST"), 12, [211, 225, 222], p2X + 18, cardY + 107);
    this.drawLabel(this.p2.character === "BALLHOG" ? "Super builds slowly; dealing hits adds more." : "Poison stacks to 4 and its ticks charge super.", 10, [177, 190, 190], p2X + 18, cardY + 142);
    this.drawLabel("HOLD ↓  ·  BLOCK + HEAL USING SUPER", 10, [190, 213, 231], p2X + 18, cardY + 165);

    const orbY = 523, orbH = 128;
    noStroke(); fill(13, 14, 24, 247); rect(432, orbY, 780, orbH, 13);
    stroke(93, 111, 126, 160); strokeWeight(1); noFill(); rect(432, orbY, 780, orbH, 13);
    noStroke(); this.drawLabel("ARENA PICKUPS", 14, CREAM, 450, orbY + 14);
    drawingContext.save(); drawingContext.shadowBlur = 12; drawingContext.shadowColor = "rgba(88,245,128,0.75)";
    noStroke(); fill(88, 245, 128); circle(463, orbY + 52, 18); drawingContext.restore();
    this.drawLabel("GREEN ORB  ·  restores 20 health", 12, [191, 239, 199], 480, orbY + 45);
    drawingContext.save(); drawingContext.shadowBlur = 12; drawingContext.shadowColor = "rgba(86,174,255,0.8)";
    noStroke(); fill(86, 174, 255); circle(830, orbY + 52, 18); drawingContext.restore();
    this.drawLabel("BLUE ORB  ·  restores 40 super", 12, [190, 220, 255], 847, orbY + 45);
    this.drawLabel("CURRENT MAP  ·  " + MAP_LAYOUTS[this.mapIndex].name, 11, [189, 198, 211], 450, orbY + 88);
    this.drawLabel("PICK MAP SELECT TO CHANGE THE FLOATING PLATFORM LAYOUT", 10, [166, 178, 190], 1192, orbY + 88, RIGHT);

    this.drawLabel("MENU  ·  P1: W / S + E SELECT     P2: ↑ / ↓ + N SELECT", 12, [255, 236, 196], WORLD_W / 2, 690, CENTER);
    this.drawLabel("PRACTICE MODE gives both players infinite ultimate. Hold ~ + BACKSPACE in a match to return.", 10, [178, 190, 202], WORLD_W / 2, 711, CENTER);
  }

  draw() {
    if (!this.started) {
      this.drawStartScreen();
      return;
    }

    image(backgroundLayers[this.mapIndex] || backgroundLayers[0], 0, 0);
    for (const x of [85, WORLD_W - 85]) {
      const glow = 82 + Math.round(8 * Math.sin(millis() / 420 + x));
      noFill();
      stroke(107, 53, 67);
      strokeWeight(1);
      ellipse(x, 414, glow * 2);
      noStroke();
      fill(148, 71, 72);
      ellipse(x, 414, 12);
    }
    for (const platform of this.platforms) this.drawPlatform(platform);
    for (const pickup of this.pickups) this.drawPickup(pickup);
    this.drawSuperEffect(this.p1);
    this.drawSuperEffect(this.p2);
    this.drawFighter(this.p1);
    this.drawFighter(this.p2);
    if (this.beamClash) this.drawBeamClash();

    for (const p of this.particles) {
      const alpha = gameClamp(p.life / p.max, 0, 1);
      noStroke();
      fill(p.color[0], p.color[1], p.color[2], 255 * alpha);
      ellipse(p.x, p.y, Math.max(1, p.size * alpha));
    }
    for (const item of this.texts) {
      this.drawLabel(item.message, 12, item.color, item.x, item.y, CENTER);
    }

    this.drawHud();
    if ((this.returnMenuProgress[0] > 0 || this.returnMenuProgress[1] > 0 || returnMenuKeyHeld[0] || returnMenuKeyHeld[1]) && !this.winner) this.drawReturnMenuProgress(455, 156, 370);
    noStroke();
    fill(20, 19, 29);
    rect(0, 721, WORLD_W, 39);
    stroke(82, 47, 60);
    strokeWeight(1);
    line(0, 721, WORLD_W, 721);
    noStroke();
    this.drawLabel("P1  A/D MOVE  W×2 JUMP  S SHIELD  E ATTACK  F SUPER", 11, [230, 202, 158], 34, 732);
    this.drawLabel("P2  ←/→ MOVE  ↑×2 JUMP  ↓ SHIELD  N ATTACK  M SUPER", 11, [160, 210, 207], WORLD_W - 34, 732, RIGHT);
    this.drawLabel("G FULLSCREEN · HOLD ~ + BACKSPACE TO RETURN TO MENU", 10, [194, 181, 171], WORLD_W / 2, 734, CENTER);

    if (this.winner) {
      noStroke();
      fill(9, 9, 17, 190);
      rect(0, 0, WORLD_W, WORLD_H);
      this.drawLabel(`${this.winner} WINS`, 54, this.winner === "BALLHOG" ? GOLD : CYAN, WORLD_W / 2, 304, CENTER);
      this.drawLabel("ENTER  ·  RESTART ROUND", 24, CREAM, WORLD_W / 2, 370, CENTER);
      this.drawReturnMenuProgress(WORLD_W / 2 - 210, 452, 420);
    }
    if (this.screenFlash > 0) {
      noStroke();
      fill(255, 235, 205, 100 * this.screenFlash / 0.28);
      rect(0, 0, WORLD_W, WORLD_H);
    }
  }
}

function makeBackground(mapIndex = 0) {
  const layer = createGraphics(WORLD_W, WORLD_H);
  const themes = [
    { top: [26, 23, 39], bottom: [63, 34, 48], floor: [25, 24, 34], edge: [187, 76, 74], grid: [47, 39, 49] },
    { top: [22, 27, 34], bottom: [83, 43, 29], floor: [30, 25, 25], edge: [231, 111, 57], grid: [62, 43, 37] },
    { top: [14, 35, 59], bottom: [39, 86, 112], floor: [21, 34, 43], edge: [105, 208, 220], grid: [42, 63, 74] },
    { top: [20, 18, 43], bottom: [62, 38, 83], floor: [25, 22, 39], edge: [177, 118, 239], grid: [50, 41, 72] },
  ];
  const theme = themes[mapIndex] || themes[0];
  layer.noStroke();
  for (let y = 0; y < WORLD_H; y += 1) {
    const t = y / WORLD_H;
    layer.fill(
      theme.top[0] * (1 - t) + theme.bottom[0] * t,
      theme.top[1] * (1 - t) + theme.bottom[1] * t,
      theme.top[2] * (1 - t) + theme.bottom[2] * t,
    );
    layer.rect(0, y, WORLD_W, 1);
  }

  if (mapIndex === 0) {
    // Rooftop Run: a rose-lit city skyline and distant orbital sign.
    for (let i = 0; i < 12; i += 1) {
      const x = i * 116 - 20;
      const towerH = 90 + (i * 47 % 170);
      layer.fill(34, 30, 46);
      layer.rect(x, 395 - towerH, 82, towerH + 245);
      layer.stroke(91, 47, 61);
      layer.strokeWeight(2);
      layer.line(x + 8, 400 - towerH, x + 8, 625);
      layer.noStroke();
      for (let wy = 422 - towerH; wy < 626; wy += 31) {
        if ((i + wy) % 3 !== 0) {
          layer.fill(134, 72, 68);
          layer.rect(x + 22, wy, 9, 3);
          layer.rect(x + 53, wy, 9, 3);
        }
      }
    }
    layer.noFill();
    layer.stroke(80, 43, 58);
    layer.strokeWeight(2);
    layer.ellipse(WORLD_W / 2, 205, 320);
    layer.stroke(64, 39, 57);
    layer.strokeWeight(1);
    layer.ellipse(WORLD_W / 2, 205, 260);
    layer.stroke(117, 56, 66);
    layer.line(0, 430, WORLD_W, 430);
  } else if (mapIndex === 1) {
    // Foundry: furnace mouths, heavy stacks, and hot pipework.
    layer.noStroke();
    for (let i = 0; i < 6; i += 1) {
      const x = 24 + i * 218;
      const h = 170 + (i * 53 % 130);
      layer.fill(31, 30, 36);
      layer.rect(x, 395 - h, 120, h + 240);
      layer.fill(49, 37, 34);
      layer.rect(x + 18, 420 - h, 84, 28, 5);
      layer.fill(160, 72, 39, 170);
      layer.ellipse(x + 60, 434 - h, 55, 18);
      layer.fill(35, 30, 31);
      layer.rect(x + 8, 498, 104, 104);
    }
    layer.stroke(129, 72, 49);
    layer.strokeWeight(8);
    layer.noFill();
    layer.line(0, 338, 180, 338);
    layer.line(180, 338, 180, 395);
    layer.line(1040, 300, 1210, 300);
    layer.line(1040, 300, 1040, 370);
    layer.stroke(225, 116, 55, 120);
    layer.strokeWeight(2);
    for (let x = 110; x < WORLD_W; x += 220) layer.line(x, 415, x + 90, 415);
  } else if (mapIndex === 2) {
    // Sky Bridges: a pale moon, layered clouds, and floating distant mesas.
    layer.noStroke();
    layer.fill(151, 222, 232, 70);
    layer.ellipse(1000, 170, 210);
    layer.fill(178, 228, 232, 42);
    layer.ellipse(1000, 170, 150);
    for (let i = 0; i < 7; i += 1) {
      const x = i * 205 - 70;
      const y = 190 + (i * 61 % 160);
      layer.fill(101, 157, 180, 52);
      layer.ellipse(x + 55, y, 175, 30);
      layer.ellipse(x + 25, y + 5, 88, 24);
      layer.ellipse(x + 105, y + 6, 100, 23);
    }
    layer.fill(25, 52, 70, 135);
    for (let i = 0; i < 8; i += 1) {
      const x = i * 190 - 50;
      const peak = 420 + (i * 43 % 115);
      layer.triangle(x, 615, x + 90, peak, x + 190, 615);
      layer.rect(x + 45, peak + 20, 90, 90);
    }
  } else {
    // Spiral Steps: luminous orbit rings and scattered stars over a violet void.
    layer.noStroke();
    for (let i = 0; i < 74; i += 1) {
      const x = (i * 173 + 43) % WORLD_W;
      const y = (i * 97 + 21) % 470;
      const size = 1 + (i % 3);
      layer.fill(210, 195, 255, 70 + (i % 4) * 28);
      layer.ellipse(x, y, size);
    }
    layer.noFill();
    for (let i = 0; i < 5; i += 1) {
      layer.stroke(133, 100, 205, 45 - i * 5);
      layer.strokeWeight(3);
      layer.ellipse(640, 258, 250 + i * 78, 120 + i * 38);
    }
    layer.stroke(196, 150, 255, 65);
    layer.strokeWeight(2);
    layer.arc(640, 260, 430, 250, -PI * 0.75, PI * 0.75);
  }

  layer.noStroke();
  layer.fill(...theme.floor);
  layer.rect(0, FLOOR_Y, WORLD_W, WORLD_H - FLOOR_Y);
  layer.stroke(...theme.edge);
  layer.strokeWeight(3);
  layer.line(0, FLOOR_Y, WORLD_W, FLOOR_Y);
  layer.stroke(...theme.grid);
  layer.strokeWeight(1);
  for (let x = -300; x < WORLD_W + 300; x += 115) layer.line(WORLD_W / 2, FLOOR_Y, x, WORLD_H);
  for (const y of [675, 710, 750]) layer.line(0, y, WORLD_W, y);
  layer.noStroke();
  for (const x of [85, WORLD_W - 85]) {
    layer.fill(theme.edge[0] * 0.32, theme.edge[1] * 0.32, theme.edge[2] * 0.38, 110);
    layer.quad(x - 55, 0, x + 55, 0, x + 200, FLOOR_Y, x - 200, FLOOR_Y);
  }
  return layer;
}

let studyMode = false;
let studyTab = "science";

const STUDY_CONTENT = {
  math: {
    breadcrumb: "MY CLASSES   /   MATHEMATICS",
    title: "Systems of Equations",
    subtitle: "Algebra II notes  ·  Lesson 4",
    lesson: "Two equations can describe the same pair of unknowns.",
    notes: [
      "1. Substitution isolates a variable before replacing it in the second equation.",
      "2. Elimination combines equations so one variable cancels out.",
      "3. The solution is the ordered pair that satisfies both equations.",
      "4. Graphing shows the solution where the two lines intersect.",
    ],
    tasks: ["Review substitution examples", "Solve the practice system", "Check answers by graphing"],
    terms: ["Coefficient — number beside a variable", "Elimination — cancel a variable", "Solution — shared ordered pair"],
  },
  science: {
    breadcrumb: "MY CLASSES   /   BIOLOGY 101",
    title: "Cellular Respiration",
    subtitle: "Unit 5 notes  ·  Updated today",
    lesson: "How cells convert glucose into usable energy",
    notes: [
      "1. Glycolysis splits glucose into pyruvate in the cytoplasm.",
      "2. The Krebs cycle transfers energy to electron carriers.",
      "3. The electron transport chain uses oxygen to make ATP.",
      "4. Most ATP is produced across the inner mitochondrial membrane.",
    ],
    tasks: ["Review the three stages", "Label the mitochondrion diagram", "Answer the end-of-unit questions"],
    terms: ["ATP — the cell's usable energy", "Aerobic — requiring oxygen", "Mitochondrion — site of most ATP production"],
  },
  social: {
    breadcrumb: "MY CLASSES   /   WORLD HISTORY",
    title: "The Silk Road",
    subtitle: "World History notes  ·  Trade networks",
    lesson: "Ideas and goods traveled in both directions",
    notes: [
      "1. Routes connected China with Central Asia and the Mediterranean.",
      "2. Merchants exchanged silk, spices, glass, horses, and paper.",
      "3. Caravan cities grew where travelers could rest and trade.",
      "4. Religions, technologies, and stories crossed the same routes.",
    ],
    tasks: ["Trace the main trade routes", "Compare two traded goods", "Write a short source analysis"],
    terms: ["Caravan — group traveling together", "Oasis — water stop on a route", "Cultural diffusion — exchange of ideas"],
  },
};

function drawStudyScreen() {
  const w = width;
  const browserH = 34;
  const h = height - browserH;
  const sidebarW = Math.min(226, w * 0.22);
  const topH = 58;
  const contentX = sidebarW + 34;
  const contentW = Math.max(300, w - contentX - 32);
  const compact = h < 620;
  const subject = STUDY_CONTENT[studyTab];

  push();
  textFont("Arial");
  noStroke();
  background(245, 246, 248);
  translate(0, browserH);
  fill(255);
  rect(0, 0, w, topH);
  stroke(229, 232, 236);
  line(0, topH, w, topH);
  noStroke();

  fill(48, 111, 88);
  circle(27, 29, 23);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(13);
  textStyle(BOLD);
  text("S", 27, 29);
  fill(36, 45, 54);
  textAlign(LEFT, CENTER);
  textSize(16);
  text("StudyDesk", 46, 29);
  fill(244, 246, 247);
  rect(Math.max(180, w * 0.33), 13, Math.min(340, w * 0.35), 32, 8);
  fill(137, 146, 155);
  textSize(12);
  textStyle(NORMAL);
  text("⌕   Search notes and classes", Math.max(194, w * 0.33 + 14), 29);
  fill(48, 111, 88);
  circle(w - 30, 29, 30);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(11);
  textStyle(BOLD);
  text("JD", w - 30, 29);

  // Navigation sidebar.
  fill(255);
  rect(0, topH, sidebarW, h - topH);
  stroke(229, 232, 236);
  line(sidebarW, topH, sidebarW, h);
  noStroke();
  textAlign(LEFT, CENTER);
  fill(145, 153, 161);
  textSize(10);
  textStyle(BOLD);
  text("WORKSPACE", 20, 91);
  const nav = ["Overview", "My classes", "Assignments", "Notes", "Calendar"];
  const navY = [121, 160, 199, 238, 277];
  for (let i = 0; i < nav.length; i += 1) {
    if (i === 2) {
      fill(232, 242, 237);
      rect(10, navY[i] - 16, sidebarW - 20, 32, 7);
    }
    if (i === 2) fill(48, 111, 88);
    else fill(76, 86, 96);
    textStyle(i === 2 ? BOLD : NORMAL);
    text(nav[i], 28, navY[i]);
  }
  fill(145, 153, 161);
  textSize(10);
  textStyle(BOLD);
  text("YOUR CLASSES", 20, 327);
  const classes = [
    { label: "Algebra II", y: 356, color: [196, 154, 96] },
    { label: "Biology 101", y: 389, color: [118, 181, 147] },
    { label: "World History", y: 422, color: [118, 147, 190] },
  ];
  for (const item of classes) {
    fill(item.color[0], item.color[1], item.color[2]);
    circle(25, item.y, 9);
    fill(76, 86, 96);
    textSize(12);
    textStyle(NORMAL);
    text(item.label, 38, item.y);
  }
  if (h >= 700) {
    fill(145, 153, 161);
    textSize(10);
    textStyle(BOLD);
    text("WEEKLY GOAL", 20, 486);
    fill(76, 86, 96);
    textSize(12);
    textStyle(NORMAL);
    text("3 of 5 study sessions", 20, 511);
    fill(232, 237, 234);
    rect(20, 528, sidebarW - 40, 7, 4);
    fill(91, 161, 120);
    rect(20, 528, (sidebarW - 40) * 0.6, 7, 4);
    fill(145, 153, 161);
    textSize(10);
    textStyle(BOLD);
    text("RECENT NOTES", 20, 571);
    fill(76, 86, 96);
    textSize(11);
    textStyle(NORMAL);
    text("Energy review  ·  2h ago", 20, 597);
    text("Lab report outline", 20, 622);
    text("Chapter 5 vocabulary", 20, 647);
  }

  // Subject heading and clickable tabs.
  textAlign(LEFT, CENTER);
  fill(130, 139, 148);
  textSize(11);
  text(subject.breadcrumb, contentX, 91);
  fill(35, 44, 53);
  textSize(compact ? 24 : 29);
  textStyle(BOLD);
  text(subject.title, contentX, 132);
  textStyle(NORMAL);
  fill(111, 121, 130);
  textSize(13);
  text(subject.subtitle, contentX, 160);

  const tabs = [
    { key: "math", label: "Math", width: 76 },
    { key: "science", label: "Science", width: 88 },
    { key: "social", label: "Social Science", width: 124 },
  ];
  let tabX = contentX;
  for (const tab of tabs) {
    const selected = studyTab === tab.key;
    if (selected) {
      fill(232, 242, 237);
      stroke(190, 219, 201);
    } else {
      fill(255);
      stroke(224, 229, 233);
    }
    rect(tabX, 177, tab.width, 30, 8);
    noStroke();
    if (selected) fill(48, 111, 88);
    else fill(87, 97, 107);
    textAlign(CENTER, CENTER);
    textSize(11);
    textStyle(selected ? BOLD : NORMAL);
    text(tab.label, tabX + tab.width / 2, 192);
    tabX += tab.width + 8;
  }

  const cardY = 218;
  const cardH = Math.min(220, Math.max(180, h * 0.27));
  fill(255);
  stroke(229, 232, 236);
  rect(contentX, cardY, contentW, cardH, 12);
  noStroke();
  fill(48, 111, 88);
  textAlign(LEFT, CENTER);
  textSize(12);
  textStyle(BOLD);
  text("TODAY'S STUDY NOTES", contentX + 20, cardY + 25);
  fill(43, 52, 61);
  textSize(14);
  textStyle(BOLD);
  text(subject.lesson, contentX + 20, cardY + 55);
  fill(91, 101, 111);
  textSize(contentW < 680 ? 10 : 12);
  textStyle(NORMAL);
  for (let i = 0; i < subject.notes.length; i += 1) {
    text(subject.notes[i], contentX + 20, cardY + 84 + i * 25);
  }
  drawStudyDiagram(studyTab, contentX + contentW * 0.70, cardY + 40, contentW * 0.27, cardH - 56);

  const lowerY = cardY + cardH + 14;
  const gap = 14;
  const leftW = Math.max(175, contentW * 0.61);
  const rightX = contentX + leftW + gap;
  const rightW = Math.max(150, contentW - leftW - gap);
  const lowerH = Math.max(116, h - lowerY - 26);
  fill(255);
  stroke(229, 232, 236);
  rect(contentX, lowerY, leftW, lowerH, 12);
  noStroke();
  fill(43, 52, 61);
  textSize(14);
  textStyle(BOLD);
  text("Assignment checklist", contentX + 18, lowerY + 25);
  const taskY = [lowerY + 55, lowerY + 84, lowerY + 113];
  for (let i = 0; i < subject.tasks.length; i += 1) {
    noFill();
    stroke(196, 203, 208);
    rect(contentX + 18, taskY[i] - 7, 14, 14, 3);
    noStroke();
    fill(91, 101, 111);
    textSize(12);
    textStyle(NORMAL);
    text(subject.tasks[i], contentX + 43, taskY[i]);
  }
  if (lowerH > 230) {
    fill(48, 111, 88);
    textSize(10);
    textStyle(BOLD);
    text("KEY TERMS", contentX + 18, lowerY + 151);
    fill(91, 101, 111);
    textSize(11);
    textStyle(NORMAL);
    for (let i = 0; i < subject.terms.length; i += 1) {
      text(subject.terms[i], contentX + 18, lowerY + 174 + i * 23);
    }
  }

  fill(255);
  stroke(229, 232, 236);
  rect(rightX, lowerY, rightW, lowerH, 12);
  noStroke();
  fill(43, 52, 61);
  textSize(14);
  textStyle(BOLD);
  text("Study session", rightX + 16, lowerY + 25);
  fill(48, 111, 88);
  textSize(25);
  textStyle(BOLD);
  text("28:14", rightX + 16, lowerY + 62);
  fill(121, 131, 140);
  textSize(11);
  textStyle(NORMAL);
  text("Focus time today", rightX + 16, lowerY + 85);
  fill(232, 237, 234);
  rect(rightX + 16, lowerY + 101, Math.max(90, rightW - 32), 7, 4);
  fill(91, 161, 120);
  rect(rightX + 16, lowerY + 101, Math.max(42, (rightW - 32) * 0.62), 7, 4);
  fill(48, 111, 88);
  textSize(10);
  textStyle(BOLD);
  text("TODAY'S PLAN", rightX + 16, lowerY + 132);
  fill(91, 101, 111);
  textSize(11);
  textStyle(NORMAL);
  text("45 min focus  ·  3 topics reviewed", rightX + 16, lowerY + 153);
  text("Next: finish notes and practice questions", rightX + 16, lowerY + 174);
  if (lowerH > 220) {
    fill(48, 111, 88);
    textSize(10);
    textStyle(BOLD);
    text("READING QUEUE", rightX + 16, lowerY + 207);
    fill(91, 101, 111);
    textSize(11);
    textStyle(NORMAL);
    text("Related review  ·  8 min", rightX + 16, lowerY + 229);
  }

  fill(148, 157, 165);
  textSize(10);
  textAlign(RIGHT, BOTTOM);
  text("Press SPACE to return to the game", w - 24, h - 12);
  pop();

  // Faux browser chrome makes the hidden study page read like a separate site.
  push();
  noStroke();
  fill(231, 234, 239);
  rect(0, 0, width, browserH);
  fill(218, 105, 104); circle(14, 12, 7);
  fill(231, 185, 90); circle(27, 12, 7);
  fill(103, 175, 126); circle(40, 12, 7);
  fill(255);
  rect(60, 3, Math.min(230, width * 0.3), 23, 7);
  fill(72, 81, 91);
  textAlign(LEFT, CENTER);
  textSize(9);
  textStyle(NORMAL);
  text("Biology 101 - StudyDesk", 71, 14);
  fill(241, 243, 246);
  rect(Math.min(300, width * 0.36), 5, Math.max(120, width * 0.54), 20, 10);
  fill(125, 134, 143);
  textSize(9);
  text("🔒  learn.schooldesk.edu/classes/biology-101/notes", Math.min(312, width * 0.36 + 12), 15);
  pop();
}

function drawStudyDiagram(subjectKey, x, y, w, h) {
  push();
  fill(247, 249, 248);
  stroke(226, 232, 228);
  rect(x, y, w, h, 9);
  noStroke();
  fill(48, 111, 88);
  textAlign(LEFT, CENTER);
  textSize(9);
  textStyle(BOLD);
  text("CONCEPT DIAGRAM", x + 10, y + 13);
  const left = x + 12;
  const top = y + 26;
  const plotW = Math.max(70, w - 24);
  const plotH = Math.max(52, h - 38);

  if (subjectKey === "math") {
    stroke(222, 228, 225);
    strokeWeight(1);
    for (let i = 1; i < 5; i += 1) {
      const gx = left + plotW * i / 5;
      const gy = top + plotH * i / 5;
      line(gx, top, gx, top + plotH);
      line(left, gy, left + plotW, gy);
    }
    stroke(117, 128, 136);
    line(left, top + plotH, left + plotW, top + plotH);
    line(left, top, left, top + plotH);
    stroke(91, 161, 120);
    strokeWeight(2);
    line(left + 5, top + plotH * 0.85, left + plotW - 5, top + plotH * 0.12);
    stroke(113, 147, 190);
    line(left + 5, top + plotH * 0.16, left + plotW - 5, top + plotH * 0.82);
    noStroke();
    fill(231, 155, 79);
    circle(left + plotW * 0.51, top + plotH * 0.49, 8);
    fill(76, 86, 96);
    textSize(8);
    textStyle(NORMAL);
    text("intersection = solution", left + 4, top + plotH + 10);
  } else if (subjectKey === "science") {
    const blockW = (plotW - 18) / 3;
    const labels = ["GLYCOLYSIS", "KREBS", "ETC"];
    const colors = [[214, 235, 220], [222, 232, 244], [249, 229, 200]];
    for (let i = 0; i < labels.length; i += 1) {
      const bx = left + i * (blockW + 9);
      fill(colors[i][0], colors[i][1], colors[i][2]);
      rect(bx, top + 10, blockW, Math.min(34, plotH * 0.42), 6);
      fill(61, 75, 82);
      textAlign(CENTER, CENTER);
      textSize(7);
      textStyle(BOLD);
      text(labels[i], bx + blockW / 2, top + 27);
      if (i < labels.length - 1) {
        stroke(131, 146, 138);
        strokeWeight(1.5);
        line(bx + blockW + 1, top + 27, bx + blockW + 7, top + 27);
        noStroke();
        fill(131, 146, 138);
        triangle(bx + blockW + 8, top + 27, bx + blockW + 3, top + 23, bx + blockW + 3, top + 31);
      }
    }
    fill(91, 101, 111);
    textAlign(LEFT, CENTER);
    textSize(8);
    textStyle(NORMAL);
    text("Glucose  →  pyruvate  →  carriers  →  ATP", left + 2, top + plotH - 7);
  } else {
    // Simplified Eurasia map with several major trading cities.
    noStroke();
    fill(224, 233, 227);
    beginShape();
    vertex(left + plotW * 0.05, top + plotH * 0.34);
    vertex(left + plotW * 0.18, top + plotH * 0.18);
    vertex(left + plotW * 0.34, top + plotH * 0.22);
    vertex(left + plotW * 0.48, top + plotH * 0.11);
    vertex(left + plotW * 0.64, top + plotH * 0.25);
    vertex(left + plotW * 0.79, top + plotH * 0.19);
    vertex(left + plotW * 0.95, top + plotH * 0.39);
    vertex(left + plotW * 0.83, top + plotH * 0.63);
    vertex(left + plotW * 0.68, top + plotH * 0.71);
    vertex(left + plotW * 0.54, top + plotH * 0.58);
    vertex(left + plotW * 0.38, top + plotH * 0.69);
    vertex(left + plotW * 0.21, top + plotH * 0.58);
    vertex(left + plotW * 0.08, top + plotH * 0.68);
    endShape(CLOSE);
    const cities = [
      { name: "Chang'an", px: 0.82, py: 0.49 },
      { name: "Samarkand", px: 0.52, py: 0.43 },
      { name: "Antioch", px: 0.25, py: 0.48 },
    ];
    stroke(193, 135, 76);
    strokeWeight(2);
    for (let i = 0; i < cities.length - 1; i += 1) {
      line(left + plotW * cities[i].px, top + plotH * cities[i].py, left + plotW * cities[i + 1].px, top + plotH * cities[i + 1].py);
    }
    noStroke();
    for (const city of cities) {
      fill(179, 101, 67);
      circle(left + plotW * city.px, top + plotH * city.py, 6);
      fill(74, 84, 91);
      textAlign(CENTER, TOP);
      textSize(7);
      textStyle(NORMAL);
      text(city.name, left + plotW * city.px, top + plotH * city.py + 4);
    }
  }
  pop();
}

function mousePressed() {
  if (!studyMode) return;
  const sidebarW = Math.min(226, width * 0.22);
  let tabX = sidebarW + 34;
  const tabs = [
    { key: "math", width: 76 },
    { key: "science", width: 88 },
    { key: "social", width: 124 },
  ];
  for (const tab of tabs) {
    if (mouseX >= tabX && mouseX <= tabX + tab.width && mouseY >= 177 && mouseY <= 207) {
      studyTab = tab.key;
      return false;
    }
    tabX += tab.width + 8;
  }
  return false;
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  frameRate(FPS_LIMIT);
  textFont("Arial");
  backgroundLayers = MAP_LAYOUTS.map((_, index) => makeBackground(index));
  game = new Game();
  // Track the menu keys directly so p5 callback timing cannot
  // leave either independent return-to-menu meter advancing after key-up.
  window.addEventListener("keydown", (event) => {
    if (event.code === "Backquote") returnMenuKeyHeld[0] = true;
    else if (event.code === "Backspace") { returnMenuKeyHeld[1] = true; event.preventDefault(); }
  }, true);
  window.addEventListener("keyup", (event) => {
    if (event.code === "Backquote") returnMenuKeyHeld[0] = false;
    else if (event.code === "Backspace") returnMenuKeyHeld[1] = false;
  }, true);
  window.addEventListener("blur", () => {
    if (game) game.releaseBallhogCharge(game.p1);
    heldKeys.clear();
    returnMenuKeyHeld[0] = false;
    returnMenuKeyHeld[1] = false;
  });
  describe("A two-player fighting game. Ballhog and Archive battle across a dark arena with floating platforms.");
}

function draw() {
  if (studyMode) {
    background(245, 246, 248);
    drawStudyScreen();
    return;
  }
  background(17, 16, 25);
  scaleFactor = Math.min(width / WORLD_W, height / WORLD_H);
  offsetX = (width - WORLD_W * scaleFactor) / 2;
  offsetY = (height - WORLD_H * scaleFactor) / 2;
  const dt = Math.min(deltaTime / 1000, 1 / 30);
  game.p1.animationTime += dt;
  game.p2.animationTime += dt;
  push();
  translate(offsetX, offsetY);
  scale(scaleFactor);
  if (game.started) game.update(dt);
  game.draw();
  pop();
}

function keyPressed(event) {
  const pressed = (event && event.key ? event.key : key).toLowerCase();
  if (event && event.code) heldKeys.add(event.code);

  // Space toggles the study page; ignore key repeat so holding it cannot flicker.
  if (pressed === " " || (event && event.code === "Space")) {
    if (event && event.repeat) return false;
    if (!studyMode && game) {
      game.releaseBallhogCharge(game.p1);
      heldKeys.clear();
    }
    studyMode = !studyMode;
    heldKeys.clear();
    return false;
  }

  if (pressed === "7" && game && game.practiceMode) {
    game.practiceMode = false;
    game.resetRound();
    game.started = false;
    studyMode = false;
    heldKeys.clear();
    return false;
  }

  if (pressed === "7" && !studyMode && game && (!game.started || game.winner)) {
    game.practiceMode = true;
    game.resetRound();
    game.started = true;
    return false;
  }

  if (pressed === "g") {
    fullscreen(!fullscreen());
    return false;
  }

  if (studyMode) return false;

  if (pressed === "backspace" && !game.started) {
    game.menuPage = "main";
    return false;
  }

  if (!game.started) {
    if (game.menuPage === "maps") {
      const adjustMap = (playerIndex, axis, step) => {
        const current = game.mapSelection[playerIndex];
        let row = Math.floor(current / 2), column = current % 2;
        if (axis === "column") column = (column + step + 2) % 2;
        else row = (row + step + 2) % 2;
        game.mapSelection[playerIndex] = row * 2 + column;
        game.mapReady[playerIndex] = false;
      };
      if (pressed === "a") adjustMap(0, "column", -1);
      else if (pressed === "d") adjustMap(0, "column", 1);
      else if (pressed === "w") adjustMap(0, "row", -1);
      else if (pressed === "s") adjustMap(0, "row", 1);
      else if (pressed === "arrowleft") adjustMap(1, "column", -1);
      else if (pressed === "arrowright") adjustMap(1, "column", 1);
      else if (pressed === "arrowup") adjustMap(1, "row", -1);
      else if (pressed === "arrowdown") adjustMap(1, "row", 1);
      else if ((pressed === "e" || pressed === "n") && !(event && event.repeat)) {
        const playerIndex = pressed === "e" ? 0 : 1;
        game.mapReady[playerIndex] = true;
        if (game.mapReady[0] && game.mapReady[1] && game.mapSelection[0] === game.mapSelection[1]) {
          game.mapIndex = game.mapSelection[0];
          game.practiceMode = false; game.menuPage = "main"; game.resetRound(); game.started = true;
        }
      }
      return false;
    }
    if (game.menuPage === "characters") {
      if (pressed === "a" || pressed === "d") { game.characterChoices[0] = game.characterChoices[0] === "BALLHOG" ? "ARCHIVE" : "BALLHOG"; game.characterReady[0] = false; }
      else if (pressed === "arrowleft" || pressed === "arrowright") { game.characterChoices[1] = game.characterChoices[1] === "BALLHOG" ? "ARCHIVE" : "BALLHOG"; game.characterReady[1] = false; }
      else if ((pressed === "e" || pressed === "n") && !(event && event.repeat)) {
        const playerIndex = pressed === "e" ? 0 : 1;
        game.characterReady[playerIndex] = !game.characterReady[playerIndex];
        if (game.characterReady[0] && game.characterReady[1]) {
          game.practiceMode = false; game.menuPage = "main"; game.resetRound(); game.started = true;
        }
      }
      return false;
    }
    if (pressed === "w" || pressed === "s") {
      game.menuSelection[0] = gameClamp(game.menuSelection[0] + (pressed === "s" ? 1 : -1), 0, 3);
      game.menuLastMover = 0; return false;
    }
    if (pressed === "arrowup" || pressed === "arrowdown") {
      game.menuSelection[1] = gameClamp(game.menuSelection[1] + (pressed === "arrowdown" ? 1 : -1), 0, 3);
      game.menuLastMover = 1; return false;
    }
    const selectingPlayer = pressed === "e" ? 0 : pressed === "n" ? 1 : -1;
    if (selectingPlayer >= 0) {
      if (event && event.repeat) return false;
      const playerIndex = selectingPlayer >= 0 ? selectingPlayer : game.menuLastMover;
      game.menuLastMover = playerIndex;
      const choice = game.menuSelection[playerIndex];
      if (choice === 2) { game.menuPage = "characters"; game.characterReady = [false, false]; }
      else if (choice === 3) { game.menuPage = "maps"; game.mapSelection = [game.mapIndex, game.mapIndex]; game.mapReady = [false, false]; }
      else {
        game.practiceMode = choice === 1; game.menuPage = "main"; game.resetRound(); game.started = true;
      }
      return false;
    }
    return false;
  }
  if (game.winner) {
    if (pressed === "enter") game.resetRound();
    return false;
  }
  if (pressed === "w") game.requestJump(game.p1);
  else if (pressed === "arrowup") game.requestJump(game.p2);
  else if (pressed === "e") game.startAttack(game.p1);
  else if (pressed === "n") game.startAttack(game.p2);
  else if (pressed === "f") game.activateSuper(game.p1);
  else if (pressed === "m") game.activateSuper(game.p2);

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(pressed)) return false;
  return undefined;
}

function keyReleased(event) {
  if (event && event.code) heldKeys.delete(event.code);
  const released = (event && event.key ? event.key : key).toLowerCase();
  if (released === "e" && game) game.releaseBallhogCharge(game.p1);
  if (released === "n" && game) game.releaseBallhogCharge(game.p2);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(released)) return false;
  return undefined;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}



