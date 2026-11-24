import { ASH_SEAL, CLASSES, ENEMIES, IRON_SEAL, LEDGER, VAULT_REWARD, SLOTS, makeItem } from './content.js';
import { clamp, createWorld, distance, findPath, length, random, walkable } from './world.js';

export const XP = level => 120 + (level - 1) * 78;
export const SAVE_KEY = 'ash-and-iron.v1';
const makeState = classId => ({
  version: 1, classId, zone: 'watch', stage: 0, level: 1, xp: 0, gold: 20, draughts: 4,
  points: 0, traits: { vigor: 0, might: 0, focus: 0 }, inventory: [], gear: {}, defeated: {}, loot: {}, nextItem: 1,
  deaths: 0, kills: 0, contract: 0, vaultCleared: false,
});

export function readSave(storage) {
  try {
    const state = JSON.parse(storage.getItem(SAVE_KEY));
    if (state?.version === 1 && Object.hasOwn(CLASSES, state.classId)) return state;
  } catch { /* An unavailable or corrupted save is treated as an empty slot. */ }
  return null;
}

const point = ([x, y]) => ({ x, y });
const lerp = (a, b, t) => a + (b - a) * t;

export class Game {
  constructor(classId, save, emit = () => {}) {
    this.state = save ? structuredClone(save) : makeState(classId);
    this.state.contract ??= 0;
    this.state.vaultCleared ??= false;
    this.class = CLASSES[this.state.classId];
    this.emit = emit;
    this.time = 0;
    this.artReady = 0;
    this.dodgeReady = 0;
    this.utilityReady = 0;
    this.serial = 0;
    this.rng = random(647 + this.state.kills * 129 + this.state.nextItem * 93);
    this.player = { x: 0, y: 0, hp: this.maxHP, spirit: 100, face: 1, heading: 0.6, moving: false, attack: 0, dodge: 0, invuln: 0, flash: 0 };
    this.command = null;
    this.dead = false;
    this.enter(this.state.zone, this.state.position, Boolean(save));
    this.state.health = this.player.hp;
    this.state.spirit = this.player.spirit;
  }

  get maxHP() { return this.class.health + (this.state.level - 1) * 11 + this.state.traits.vigor * 15 + this.gearStat('health'); }
  get power() { return this.class.damage + (this.state.level - 1) * 3 + this.state.traits.might * 4 + this.gearStat('damage'); }
  get defense() { return this.gearStat('defense'); }
  gearStat(key) { return Object.values(this.state.gear).reduce((sum, item) => sum + (item?.[key] ?? 0), 0); }

  snapshot() {
    return structuredClone({
      ...this.state, position: [this.player.x, this.player.y], health: this.dead ? this.maxHP : Math.max(1, this.player.hp), spirit: this.player.spirit,
      zone: this.dead ? 'watch' : this.state.zone,
      ...(this.dead ? { position: [10, 12] } : {}),
    });
  }

  change() { this.emit('change'); }

  motion(actor, kind, duration) {
    actor.motion = { kind, duration, serial: ++this.serial };
  }
  notice(title, detail = '') { this.emit('notice', { title, detail }); }
  sound(name) { this.emit('sound', name); }

  enter(id, arrival, restore = false) {
    this.world = createWorld(id);
    this.state.zone = id;
    const location = Array.isArray(arrival) && walkable(this.world, ...arrival) ? arrival : this.world.spawn;
    Object.assign(this.player, point(location), { moving: false, attack: 0, dodge: 0, flash: 0, invuln: 0, strike: null, motion: null, guarded: 0 });
    if (restore) {
      this.player.hp = clamp(this.state.health ?? this.maxHP, 1, this.maxHP);
      this.player.spirit = clamp(this.state.spirit ?? 100, 0, 100);
    } else if (this.world.safe) {
      this.player.hp = this.maxHP;
      this.player.spirit = 100;
    }
    const defeated = this.state.defeated[id] ?? [];
    this.enemies = this.world.enemies.map((entry, index) => ({
      ...ENEMIES[entry.type], ...entry, name: entry.name ?? ENEMIES[entry.type].name, id: index, baseX: entry.x, baseY: entry.y,
      maxHP: ENEMIES[entry.type].hp, phase: 1, cooldown: 0.6, wind: 0, face: 1, flash: 0,
    })).filter(enemy => !defeated.includes(enemy.id));
    this.drops = (this.state.loot[id] ??= []);
    this.effects = [];
    this.shots = [];
    this.traps = [];
    this.command = null;
    this.emit('zone', this.world);
    this.change();
  }

  markers() {
    return this.world.markers.filter(marker =>
      (marker.id !== ASH_SEAL || this.state.stage === 1) &&
      (marker.id !== IRON_SEAL || this.state.stage === 2) &&
      (marker.id !== 'home' || this.state.stage >= 4) &&
      (marker.id !== LEDGER || this.state.contract === 1) &&
      (marker.id !== VAULT_REWARD || !this.state.vaultCleared));
  }

  move(target, enemy = null, marker = null) {
    if (this.dead) return;
    const reach = enemy ? this.class.reach + enemy.radius : marker ? 1.3 : 0.12;
    this.command = { target, enemy, marker, path: findPath(this.world, this.player, target), reach, repath: this.time + 0.33 };
  }

  stepActor(actor, next, speed, dt, radius = 0.22) {
    const d = distance(actor, next);
    if (d < 0.06) return false;
    const scale = Math.min(1, speed * dt / d);
    const dx = (next.x - actor.x) * scale;
    const dy = (next.y - actor.y) * scale;
    actor.face = dx - dy >= 0 ? 1 : -1;
    actor.heading = Math.atan2(dx, dy);
    if (walkable(this.world, actor.x + dx, actor.y + dy, radius)) {
      actor.x += dx;
      actor.y += dy;
      return true;
    }
    let moved = false;
    if (walkable(this.world, actor.x + dx, actor.y, radius)) { actor.x += dx; moved = true; }
    if (walkable(this.world, actor.x, actor.y + dy, radius)) { actor.y += dy; moved = true; }
    return moved;
  }

  interact(marker) {
    if (this.dead || !this.markers().includes(marker)) return;
    if (marker.kind === 'gate') {
      const requirement = { wood: this.state.zone === 'watch' ? 1 : 0, crypt: this.state.zone === 'wood' ? 2 : 0, belfry: 3, home: 4 }[marker.id] ?? 0;
      if (this.state.stage < requirement) return this.notice('The way is sealed', 'Complete the current quest to open this passage.');
      this.sound('gate');
      this.enter(marker.dest, marker.arrival);
      return;
    }
    if (marker.kind === 'keeper') {
      this.motion(marker, 'talk', 0.9);
      if (this.state.stage === 0) {
        this.state.stage = 1;
        this.notice('A road of cinders', 'Mara: Find the seals of ash and iron. Only they can open the way to the bell.');
        this.sound('quest');
      } else if (this.state.stage === 4) {
        this.state.stage = 5;
        this.state.gold += 120;
        this.addItem(makeItem('charm', 3, this.state.level, this.state.nextItem++));
        this.sound('quest');
        this.emit('victory');
      } else {
        this.notice('Keeper Mara', this.state.stage === 5 ? 'The hearth is yours whenever you return.' : 'Follow the old road. Keep a little fire for the way home.');
      }
      this.change();
      return;
    }
    if (marker.kind === 'smith') return this.emit('shop');
    if (marker.kind === VAULT_REWARD) {
      if (this.enemies.some(enemy => enemy.type === 'oathbreaker' && enemy.hp > 0)) {
        return this.notice('The reliquary is sealed', 'Defeat the Oathbreaker to claim the relic.');
      }
      this.state.vaultCleared = true;
      this.state.gold += 65;
      this.state.draughts = Math.min(9, this.state.draughts + 3);
      this.addItem(makeItem('armor', 3, Math.max(3, this.state.level), this.state.nextItem++));
      this.sound('quest');
      this.notice('Blackroot’s ward', 'You recovered relic armor, 65 scrip, and three healing draughts.');
      this.change();
      return;
    }
    if (marker.kind === LEDGER) {
      if (this.enemies.some(enemy => enemy.name === 'Cinderwood Deserter' && enemy.hp > 0)) {
        return this.notice('The coffer is guarded', 'Defeat the Cinderwood Deserter first.');
      }
      this.state.contract = 2;
      this.sound('loot');
      this.notice('Courier’s ledger recovered', 'Return it to Smith Oren in Gloamwatch.');
      this.change();
      return;
    }
    if (marker.kind === 'shrine') {
      this.player.hp = this.maxHP;
      this.player.spirit = 100;
      this.state.draughts = Math.max(3, this.state.draughts);
      this.sound('quest');
      this.notice('Rest shrine', 'Life and spirit restored. Your belt holds at least three draughts.');
      this.change();
      return;
    }
    const guardian = marker.kind === ASH_SEAL ? 'Shrine Reaver' : 'Reliquary Knight';
    if (this.enemies.some(enemy => enemy.name === guardian && enemy.hp > 0)) return this.notice('The seal is guarded', `Defeat the ${guardian}.`);
    this.state.stage++;
    if (marker.kind === ASH_SEAL) {
      this.notice('Ash Seal recovered', 'The Reliquary lies beyond the northeast road.');
    } else {
      this.notice('Iron Seal recovered', 'The passage to Ashen Belfry is open.');
    }
    this.sound('quest');
    this.player.hp = Math.min(this.maxHP, this.player.hp + 55);
    this.state.draughts = Math.min(9, this.state.draughts + 2);
    this.change();
  }

  commission() {
    if (this.state.contract === 0) {
      this.state.contract = 1;
      this.notice('The missing ledger', 'The courier last set camp off the south trail in Cinderwood.');
    } else if (this.state.contract === 2) {
      this.state.contract = 3;
      this.state.gold += 55;
      this.addItem(makeItem('weapon', 2, Math.max(2, this.state.level), this.state.nextItem++));
      this.notice('Commission complete', 'You received 55 scrip and a rare weapon.');
    } else return;
    this.sound('quest');
    this.change();
  }

  buy(kind) {
    const item = kind === 'draught' ? null : makeItem(kind, this.state.stage >= 3 ? 2 : 1, Math.max(2, this.state.level), this.state.nextItem);
    const cost = item ? item.value + 13 : 12;
    if (this.state.gold < cost) return this.notice('Insufficient scrip');
    if (!item && this.state.draughts >= 9) return this.notice('Your belt is full');
    if (item && this.state.inventory.length >= 18) return this.notice('Your pack is full');
    this.state.gold -= cost;
    if (item) {
      this.state.nextItem++;
      this.addItem(item);
    } else this.state.draughts++;
    this.sound('loot');
    this.change();
  }

  sell(id) {
    const index = this.state.inventory.findIndex(item => item.id === id);
    if (index < 0) return;
    const [item] = this.state.inventory.splice(index, 1);
    this.state.gold += Math.floor(item.value / 2);
    this.sound('loot');
    this.change();
  }

  addItem(item) {
    if (this.state.inventory.length < 18) this.state.inventory.push(item);
    else this.state.loot[this.state.zone].push({ x: this.player.x, y: this.player.y, item });
  }

  equip(id) {
    const index = this.state.inventory.findIndex(item => item.id === id);
    if (index < 0) return;
    const previousMax = this.maxHP;
    const [item] = this.state.inventory.splice(index, 1);
    const old = this.state.gear[item.slot];
    this.state.gear[item.slot] = item;
    if (old) this.state.inventory.push(old);
    this.player.hp = clamp(this.player.hp + Math.max(0, this.maxHP - previousMax), 1, this.maxHP);
    this.sound('loot');
    this.change();
  }

  train(trait) {
    if (!this.state.points || !Object.hasOwn(this.state.traits, trait)) return;
    const hp = this.maxHP;
    this.state.points--;
    this.state.traits[trait]++;
    this.player.hp += this.maxHP - hp;
    this.sound('quest');
    this.change();
  }

  heal() {
    if (this.dead || this.player.hp >= this.maxHP || !this.state.draughts) return;
    this.state.draughts--;
    if (!this.player.attack) this.motion(this.player, 'heal', 0.41);
    this.player.hp = Math.min(this.maxHP, this.player.hp + 46 + this.state.level * 5);
    this.effect('ring', this.player, '#81c9a6', 1.15);
    this.sound('heal');
    this.change();
  }

  effect(kind, at, color, radius = 1, text) {
    this.effects.push({ kind, x: at.x, y: at.y, color, radius, text, life: kind === 'float' ? 0.75 : 0.39, born: this.time });
  }

  hurt(enemy, power, color = '#ead6ad') {
    if (enemy.hp <= 0) return;
    const roll = this.rng();
    const critical = roll >= 1 - this.gearStat('crit') / 100;
    const damage = Math.round(power * (0.88 + roll * 0.24) * (critical ? 1.65 : 1));
    enemy.hp -= damage;
    enemy.flash = 0.15;
    enemy.active = true;
    if (!enemy.wind && (enemy.type !== 'boss' || critical)) this.motion(enemy, 'hit', 0.22);
    this.effect('float', enemy, critical ? '#ffe3a3' : color, 1, critical ? `${damage}!` : String(damage));
    this.effect('hit', enemy, color);
    this.sound('hit');
    if (enemy.hp > 0) return;
    this.state.kills++;
    (this.state.defeated[this.state.zone] ??= []).push(enemy.id);
    this.state.xp += enemy.xp;
    this.state.gold += enemy.gold;
    this.effect('ring', enemy, enemy.color, 1.15);
    this.effect('float', enemy, '#d3ac6a', 1, `+${enemy.xp} XP`);
    while (this.state.xp >= XP(this.state.level)) {
      this.state.xp -= XP(this.state.level);
      this.state.level++;
      this.state.points++;
      this.player.hp = this.maxHP;
      this.player.spirit = 100;
      this.notice(`Level ${this.state.level}`, 'You gained a talent point. Press C to spend it.');
      this.sound('quest');
    }
    const elite = ['brute', 'knight', 'oathbreaker', 'boss'].includes(enemy.type);
    if (elite || this.rng() < 0.24) {
      const tier = enemy.type === 'boss' ? 3 : ['knight', 'oathbreaker'].includes(enemy.type) ? 2 : this.rng() < 0.40 ? 1 : 0;
      const slot = SLOTS[Math.floor(this.rng() * SLOTS.length)];
      this.drops.push({ x: enemy.x, y: enemy.y, item: makeItem(slot, tier, this.state.level, this.state.nextItem++) });
    }
    if (enemy.type === 'boss' && this.state.stage === 3) {
      this.state.stage = 4;
      this.notice('The Bellworn has fallen', 'The waygate is open. Return to Mara at Gloamwatch.');
      this.sound('quest');
    }
    this.change();
  }

  takeHit(damage) {
    if (this.player.invuln > 0 || this.dead) return;
    const guarded = this.player.guarded > this.time;
    const armor = this.defense + (guarded ? this.gearStat('barrier') : 0);
    const taken = Math.max(2, Math.round((damage - armor) * (guarded ? 0.42 : 1)));
    this.player.hp = Math.max(0, this.player.hp - taken);
    this.player.flash = 0.22;
    this.player.invuln = 0.22;
    if (!this.player.attack) this.motion(this.player, 'hit', 0.22);
    this.effect('float', this.player, guarded ? '#d6c597' : '#ff947b', 1, `−${taken}`);
    this.sound('hurt');
    if (!this.player.hp) {
      this.dead = true;
      this.state.deaths++;
      this.state.gold = Math.ceil(this.state.gold * 0.85);
      this.emit('death');
      this.change();
    }
  }

  respawn() {
    if (!this.dead) return;
    this.dead = false;
    this.state.draughts = Math.max(3, this.state.draughts);
    this.enter('watch');
  }

  shot(source, angle, speed, power, range, color, hostile = false, pierce = 0) {
    this.shots.push({ x: source.x, y: source.y, angle, speed, power, range, color, hostile, pierce, struck: new Set() });
  }

  primary(target) {
    const p = this.player;
    if (this.dead || p.attack > 0 || p.dodge > 0) return;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    p.face = Math.cos(angle) - Math.sin(angle) >= 0 ? 1 : -1;
    p.heading = Math.PI * 0.5 - angle;
    p.attack = this.state.classId === 'warden' ? 0.43 : 0.37;
    this.motion(p, 'strike', p.attack);
    p.strike = { angle, at: this.time + (this.state.classId === 'warden' ? 0.15 : 0.10) };
  }

  releaseStrike(angle) {
    const p = this.player;
    if (this.state.classId === 'warden') {
      this.effect('cleave', p, '#efc997', 1.74);
      this.effects.at(-1).angle = angle;
      for (const enemy of this.enemies) {
        if (distance(p, enemy) <= this.class.reach + enemy.radius &&
          Math.cos(Math.atan2(enemy.y - p.y, enemy.x - p.x) - angle) > -0.15) this.hurt(enemy, this.power);
      }
    } else {
      this.shot(p, angle, 16, this.power, this.class.reach + 2, this.class.color, false, this.state.classId === 'scout' ? 1 : 0);
    }
    this.sound(this.state.classId === 'warden' ? 'steel' : 'attack');
  }

  art(target) {
    const p = this.player;
    if (this.dead || p.dodge > 0 || this.artReady > this.time) return;
    if (p.spirit < this.class.cost) return this.notice('Low spirit');
    p.spirit -= this.class.cost;
    this.artReady = this.time + 2.1;
    p.strike = null;
    p.attack = Math.max(p.attack, 0.34);
    this.motion(p, 'art', 0.39);
    this.sound('art');
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    p.heading = Math.PI * 0.5 - angle;
    if (this.state.classId === 'scout') {
      for (const offset of [-0.19, 0, 0.19]) this.shot(p, angle + offset, 20, this.power * 1.26, 10, '#aad99b', false, 3);
      return;
    }
    const at = this.state.classId === 'warden' ? p : {
      x: lerp(p.x, target.x, Math.min(1, 7 / distance(p, target))),
      y: lerp(p.y, target.y, Math.min(1, 7 / distance(p, target))),
    };
    const radius = this.state.classId === 'warden' ? 2.85 : 2.45;
    this.effect('burst', at, '#ffab62', radius);
    for (const enemy of this.enemies) if (distance(at, enemy) <= radius + enemy.radius) this.hurt(enemy, this.power * 2.15, '#ffb765');
  }

  utility(target) {
    if (this.dead || this.utilityReady > this.time || this.world.safe) return;
    const p = this.player;
    if (p.spirit < this.class.utilityCost) return this.notice('Low spirit');
    p.spirit -= this.class.utilityCost;
    this.utilityReady = this.time + 7.2;
    this.sound('art');
    this.motion(p, 'art', 0.36);
    if (this.state.classId === 'warden') {
      p.guarded = this.time + 4;
      this.effect('ring', p, '#f0cf89', 1.75);
      for (const enemy of this.enemies) if (distance(p, enemy) < 1.72 + enemy.radius) this.hurt(enemy, this.power * 0.9);
    } else if (this.state.classId === 'witch') {
      const origin = { x: p.x, y: p.y };
      const range = Math.min(3.8, distance(p, target));
      const angle = Math.atan2(target.y - p.y, target.x - p.x);
      for (let d = 0.22; d <= range; d += 0.22) {
        const x = origin.x + Math.cos(angle) * d;
        const y = origin.y + Math.sin(angle) * d;
        if (!walkable(this.world, x, y)) break;
        Object.assign(p, { x, y });
      }
      p.invuln = 0.36;
      p.strike = null;
      this.command = null;
      this.effect('burst', origin, '#e9946c', 1.65);
      this.effect('ring', p, '#f3c3a0', 0.9);
      for (const enemy of this.enemies) if (distance(origin, enemy) < 1.68 + enemy.radius) this.hurt(enemy, this.power * 1.35);
    } else {
      const t = Math.min(1, 5.3 / distance(p, target));
      const point = { x: lerp(p.x, target.x, t), y: lerp(p.y, target.y, t) };
      const at = walkable(this.world, point.x, point.y) ? point : p;
      this.traps.push({ x: at.x, y: at.y, expires: this.time + 10 });
    }
  }

  dodge(target) {
    const p = this.player;
    if (this.dead || this.dodgeReady > this.time) return;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    const d = distance(p, target);
    this.command = null;
    this.dodgeReady = this.time + 1.28;
    p.dodge = 0.28;
    p.strike = null;
    p.heading = Math.PI * 0.5 - angle;
    this.motion(p, 'dodge', 0.34);
    p.invuln = 0.36;
    p.dodgeToward = { x: p.x + Math.cos(angle) * Math.max(2.35, Math.min(3, d)), y: p.y + Math.sin(angle) * Math.max(2.35, Math.min(3, d)) };
    this.effect('ring', p, '#afc6c9', 0.72);
    this.sound('dodge');
  }

  attackEnemy(enemy) {
    const p = this.player;
    if (enemy.type === 'boss') {
      enemy.phase = enemy.hp < enemy.maxHP * 0.36 ? 3 : enemy.hp < enemy.maxHP * 0.7 ? 2 : 1;
      enemy.pattern = (enemy.pattern ?? 0) + 1;
      if (enemy.pattern % 3 === 0) enemy.intent = 'nova';
      else if (enemy.pattern % 3 === 1 || distance(enemy, p) < 2.5) enemy.intent = 'slam';
      else enemy.intent = 'fan';
      enemy.impact = enemy.intent === 'slam' ? { x: p.x, y: p.y } : { x: enemy.x, y: enemy.y };
      enemy.aim = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      enemy.windTotal = enemy.phase === 3 ? 0.62 : 0.87;
    } else if (enemy.type === 'oathbreaker') {
      enemy.pattern = (enemy.pattern ?? 0) + 1;
      enemy.intent = enemy.pattern % 2 ? 'slam' : 'nova';
      enemy.impact = enemy.intent === 'slam' ? { x: p.x, y: p.y } : enemy;
      enemy.aim = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      enemy.windTotal = 0.92;
    } else {
      enemy.intent = enemy.ranged ? 'shot' : 'bite';
      enemy.impact = { x: p.x, y: p.y };
      enemy.aim = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      enemy.windTotal = enemy.ranged ? 0.62 : enemy.type === 'knight' ? 0.75 : 0.42;
    }
    enemy.wind = enemy.windTotal;
    const action = { slam: 'slam', nova: 'nova', fan: 'spell', shot: 'shot', bite: 'strike' }[enemy.intent];
    this.motion(enemy, action, enemy.windTotal + 0.13);
  }

  resolveEnemy(enemy) {
    const p = this.player;
    if (enemy.intent === 'shot' || enemy.intent === 'fan' || enemy.intent === 'nova') {
      const angles = enemy.intent === 'shot' ? [0] : enemy.intent === 'fan' ? [-0.37, -0.18, 0, 0.18, 0.37] :
        Array.from({ length: 8 + enemy.phase * 2 }, (_, i) => i * Math.PI * 2 / (8 + enemy.phase * 2));
      for (const offset of angles) this.shot(enemy, enemy.aim + offset, enemy.type === 'boss' ? 6.4 + enemy.phase : 7.3, enemy.damage, 11, '#ed7859', true);
      this.effect('ring', enemy, '#e28057', 1.05);
    } else {
      const radius = enemy.intent === 'slam' ? 1.85 + enemy.phase * 0.28 : enemy.radius + 0.68;
      const center = enemy.intent === 'slam' ? enemy.impact : enemy;
      this.effect(enemy.intent === 'slam' ? 'burst' : 'ring', center, '#dc7659', radius);
      if (distance(p, center) < radius + 0.21) this.takeHit(enemy.damage + (enemy.phase - 1) * 5);
    }
    enemy.cooldown = enemy.type === 'boss' ? 0.97 - enemy.phase * 0.12 : enemy.ranged ? 1.3 : 0.76;
  }

  tick(dt, movement = null) {
    if (this.dead) return;
    this.time += dt;
    const p = this.player;
    p.attack = Math.max(0, p.attack - dt);
    p.dodge = Math.max(0, p.dodge - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.spirit = Math.min(100, p.spirit + (9 + this.state.traits.focus * 2.4 + this.gearStat('recovery')) * dt);
    p.moving = false;
    if (p.strike && p.strike.at <= this.time) {
      const { angle } = p.strike;
      p.strike = null;
      this.releaseStrike(angle);
    }
    if (p.dodge > 0) {
      p.moving = this.stepActor(p, p.dodgeToward, 10.4, dt);
    } else if (movement) {
      this.command = null;
      p.moving = this.stepActor(p, { x: p.x + movement.x, y: p.y + movement.y }, 4.6, dt);
    } else if (this.command) {
      const cmd = this.command;
      if (cmd.enemy && cmd.enemy.hp <= 0) this.command = null;
      else if (distance(p, cmd.target) <= cmd.reach) {
        if (cmd.enemy) this.primary(cmd.enemy);
        else {
          this.command = null;
          if (cmd.marker) this.interact(cmd.marker);
        }
      } else {
        if (cmd.enemy && this.time > cmd.repath) {
          cmd.path = findPath(this.world, p, cmd.target);
          cmd.repath = this.time + 0.33;
        }
        if (cmd.path[0] && distance(p, cmd.path[0]) < 0.14) cmd.path.shift();
        if (cmd.path[0]) p.moving = this.stepActor(p, cmd.path[0], 4.6, dt);
        else if (!cmd.enemy) this.command = null;
      }
    }

    this.traps = this.traps.filter(trap => {
      if (trap.expires <= this.time) return false;
      if (!this.enemies.some(enemy => enemy.hp > 0 && distance(trap, enemy) < 1.25)) return true;
      this.effect('burst', trap, '#a8d49d', 1.8);
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || distance(trap, enemy) > 1.8) continue;
        enemy.snared = this.time + (enemy.type === 'boss' ? 1.2 : 3.4);
        this.hurt(enemy, this.power * 1.75, '#c3dba0');
      }
      return false;
    });

    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.cooldown -= dt;
      const d = distance(enemy, p);
      if (d > 13 && !enemy.wind) { enemy.active = false; continue; }
      if (d < (enemy.type === 'boss' ? 9.2 : 4)) enemy.active = true;
      if (!enemy.active) continue;
      enemy.face = p.x - enemy.x - (p.y - enemy.y) >= 0 ? 1 : -1;
      enemy.heading = Math.atan2(p.x - enemy.x, p.y - enemy.y);
      if (enemy.wind > 0) {
        enemy.wind -= dt;
        if (enemy.wind <= 0) this.resolveEnemy(enemy);
        continue;
      }
      const range = enemy.type === 'boss' ? 8.8 : enemy.type === 'oathbreaker' ? 6.1 : enemy.ranged ? 5.7 : enemy.radius + 0.57;
      if (d <= range && enemy.cooldown <= 0) {
        this.attackEnemy(enemy);
      } else if (d > range - 0.13) {
        if (this.stepActor(enemy, p, enemy.speed * (enemy.snared > this.time ? 0.42 : 1), dt, 0.18)) enemy.walk = this.time;
      }
    }

    this.shots = this.shots.filter(shot => {
      const travel = shot.speed * dt;
      shot.range -= travel;
      shot.x += Math.cos(shot.angle) * travel;
      shot.y += Math.sin(shot.angle) * travel;
      if (shot.range <= 0 || shot.x < 0 || shot.y < 0 || Math.max(shot.x, shot.y) >= this.world.size) return false;
      if (shot.hostile && distance(shot, p) < 0.45) {
        this.takeHit(shot.power);
        return false;
      }
      if (!shot.hostile) for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || shot.struck.has(enemy.id) || distance(enemy, shot) > enemy.radius + 0.26) continue;
        shot.struck.add(enemy.id);
        this.hurt(enemy, shot.power, shot.color);
        if (shot.pierce-- <= 0) return false;
      }
      return true;
    });

    this.effects = this.effects.filter(effect => this.time - effect.born < effect.life);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      if (this.state.inventory.length >= 18 || distance(p, drop) > 0.86) continue;
      this.state.inventory.push(drop.item);
      this.drops.splice(i, 1);
      this.effect('float', p, ['#e0d6bd', '#a5cc89', '#80c9e4', '#f1b968'][drop.item.tier], 1, drop.item.name);
      this.sound('loot');
      this.change();
    }
  }
}
