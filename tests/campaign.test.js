import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASH_SEAL, CLASSES, IRON_SEAL } from '../src/content.js';
import { Game, SAVE_KEY, readSave } from '../src/game.js';
import { distance } from '../src/world.js';

const STEP = 0.025;
const tick = (game, seconds) => {
  for (let i = 0; i < seconds / STEP; i++) game.tick(STEP);
};
const marker = (game, id) => game.markers().find(entry => entry.id === id);
const alive = game => game.enemies.filter(enemy => enemy.hp > 0);
const nearest = (game) => alive(game).sort((a, b) => distance(a, game.player) - distance(b, game.player))[0];

function playTo(game, id, condition, budget = 105) {
  const destination = marker(game, id);
  assert.ok(destination, `missing ${id}`);
  let target;
  for (let i = 0; i < budget / STEP; i++) {
    if (condition()) return;
    if (game.dead) {
      throw new Error(`Died en route to ${id} at ${game.player.x.toFixed(1)},${game.player.y.toFixed(1)} ${JSON.stringify(game.snapshot())}`);
    }
    if (game.player.hp < game.maxHP * 0.62) game.heal();
    if (i % 12 === 0) {
      const enemy = nearest(game);
      const close = enemy && distance(enemy, game.player) < 6.7;
      const approach = close ? enemy : destination;
      if (target !== approach || !game.command) {
        target = approach;
        if (close) game.move(enemy, enemy);
        else game.move(destination, null, destination);
      }
      if (close) game.art(enemy);
    }
    game.tick(STEP);
    if (game.state.points) game.train(game.state.traits.might % 3 === 2 && game.state.traits.vigor === 0 ? 'vigor' : 'might');
    for (const item of [...game.state.inventory]) {
      const gear = game.state.gear[item.slot];
      if (!gear || item.tier >= gear.tier && item.value > gear.value) game.equip(item.id);
    }
  }
  assert.fail(`Timed out on ${id}, zone ${game.state.zone} and stage ${game.state.stage}, at ${game.player.x.toFixed(1)},${game.player.y.toFixed(1)}, targeting ${target?.name ?? target?.label}`);
}

test('complete Act I using combat, pathfinding, seals, and a reloaded checkpoint', () => {
  const messages = [];
  const soundAndEvents = (type, detail) => messages.push([type, detail]);
  let game = new Game('witch', null, soundAndEvents);

  game.interact(marker(game, 'wood'));
  assert.equal(game.state.zone, 'watch');

  playTo(game, 'keeper', () => game.state.stage === 1);
  playTo(game, 'wood', () => game.state.zone === 'wood');
  assert.equal(game.state.stage, 1);

  playTo(game, ASH_SEAL, () => game.state.stage === 2);
  const before = game.snapshot();
  const store = new Map([[SAVE_KEY, JSON.stringify(before)]]);
  game = new Game('witch', readSave({ getItem: key => store.get(key) }), soundAndEvents);
  assert.equal(game.state.kills, before.kills);
  assert.equal(game.state.stage, 2);
  assert.deepEqual(game.snapshot().position, before.position);
  assert.ok(!game.enemies.some(enemy => enemy.name === 'Shrine Reaver'));
  assert.equal(game.player.hp, before.health);

  playTo(game, 'crypt', () => game.state.zone === 'crypt');
  playTo(game, IRON_SEAL, () => game.state.stage === 3);
  playTo(game, 'belfry', () => game.state.zone === 'belfry');

  // Approach the far end until the boss and its guard are defeated.
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  let sawNova = false;
  let lastTarget;
  for (let i = 0; game.state.stage === 3 && i < 6000; i++) {
    assert.ok(!game.dead, `fallen to the Bellworn at boss health ${boss.hp}`);
    if (game.player.hp < game.maxHP * 0.73) game.heal();
    if (boss.wind > 0 && boss.intent === 'nova') sawNova = true;
    if (i % 8 === 0) {
      const foe = nearest(game);
      if (foe !== lastTarget || !game.command) { game.move(foe, foe); lastTarget = foe; }
      if (distance(foe, game.player) < 8.5) game.art(foe);
      if (boss.wind > 0.12 && boss.wind < 0.48 && boss.intent === 'slam' && distance(boss.impact, game.player) < 2) {
        game.dodge({ x: game.player.x - 3, y: game.player.y + 2 });
      }
    }
    game.tick(STEP);
  }
  assert.equal(game.state.stage, 4);
  assert.ok(sawNova);
  assert.ok(boss.phase >= 2);
  assert.ok(boss.hp <= 0);
  playTo(game, 'home', () => game.state.zone === 'watch');
  playTo(game, 'keeper', () => game.state.stage === 5);

  assert.ok(game.state.level >= 4);
  assert.ok(game.state.kills >= 20);
  assert.ok(game.state.inventory.some(item => item.slot === 'charm' && item.tier === 3) || game.state.gear.charm?.tier === 3);
  assert.ok(messages.some(([event]) => event === 'victory'));
  const completed = new Game('witch', game.snapshot());
  assert.equal(completed.state.stage, 5);
  assert.equal(completed.state.zone, 'watch');
});

test('all classes can damage foes with both attacks and gain equipment stats', () => {
  for (const classId of Object.keys(CLASSES)) {
    const game = new Game(classId);
    game.enter('wood', [7, 15]);
    const enemy = game.enemies[0];
    const starting = enemy.hp;
    game.primary(enemy);
    tick(game, 0.28);
    assert.ok(enemy.hp < starting, `${classId} primary attack`);
    game.art(enemy);
    tick(game, 0.24);
    assert.ok(enemy.hp <= 0, `${classId} class skill`);
    assert.ok(game.player.spirit < 100);
    game.enter('watch');
    game.state.gold = 100;
    const power = game.power;
    const boughtId = game.state.nextItem;
    game.buy('weapon');
    game.equip(boughtId);
    assert.ok(game.power > power);
    const spareId = game.state.nextItem;
    game.buy('weapon');
    const gold = game.state.gold;
    game.sell(spareId);
    assert.ok(game.state.gold > gold);
  }
});

test('falling and restoring keep campaign progress and recover at Gloamwatch', () => {
  const game = new Game('warden');
  game.interact(marker(game, 'keeper'));
  game.enter('wood');
  game.state.gold = 100;
  game.takeHit(1_000);
  assert.ok(game.dead);
  assert.equal(game.state.gold, 85);
  game.respawn();
  assert.equal(game.state.stage, 1);
  assert.equal(game.state.zone, 'watch');
  assert.equal(game.player.hp, game.maxHP);
  assert.equal(game.state.deaths, 1);
  assert.equal(readSave({ getItem: () => '{' }), null);
});

test('the ledger commission survives a save and pays out only once', () => {
  const game = new Game('warden');
  game.commission();
  game.enter('wood');
  const coffer = marker(game, 'ledger');
  game.interact(coffer);
  assert.equal(game.state.contract, 1);
  const deserter = game.enemies.find(enemy => enemy.name === 'Cinderwood Deserter');
  game.hurt(deserter, 1000);
  game.interact(coffer);
  assert.equal(game.state.contract, 2);
  const resumed = new Game('warden', game.snapshot());
  resumed.enter('watch');
  const before = resumed.state.gold;
  resumed.commission();
  resumed.commission();
  assert.equal(resumed.state.contract, 3);
  assert.equal(resumed.state.gold, before + 55);
  assert.ok(resumed.state.inventory.some(item => item.slot === 'weapon' && item.tier === 2));
  const legacy = game.snapshot();
  delete legacy.contract;
  assert.equal(new Game('warden', legacy).state.contract, 0);
});

test('guard, blink, and snare have class-specific gameplay effects', () => {
  const warden = new Game('warden');
  warden.enter('wood');
  const initialHP = warden.player.hp;
  warden.utility(warden.player);
  warden.takeHit(30);
  assert.ok(warden.player.hp > initialHP - 16);
  assert.ok(warden.player.guarded > warden.time);

  const witch = new Game('witch');
  witch.enter('wood');
  const start = { ...witch.player };
  witch.utility({ x: start.x + 3, y: start.y });
  assert.ok(witch.player.x > start.x + 2);
  assert.ok(witch.player.invuln > 0);
  assert.ok(witch.effects.some(effect => effect.kind === 'burst'));

  const scout = new Game('scout');
  scout.enter('wood');
  const target = scout.enemies[0];
  scout.utility(target);
  assert.equal(scout.traps.length, 1);
  tick(scout, 0.025);
  assert.equal(scout.traps.length, 0);
  assert.ok(target.hp < target.maxHP && target.snared > scout.time);
});

test('Blackroot Vault can be reached and cleared without advancing the main quests', () => {
  const game = new Game('witch');
  game.state.stage = 1;
  game.state.level = 3;
  game.state.draughts = 6;
  game.state.traits.might = 2;
  game.enter('wood', [8, 23.6]);
  playTo(game, 'vault', () => game.state.zone === 'vault');
  assert.equal(game.state.stage, 1);
  assert.ok(game.enemies.some(enemy => enemy.type === 'oathbreaker'));
  game.interact(marker(game, 'vaultReward'));
  assert.equal(game.state.vaultCleared, false);
  playTo(game, 'vaultReward', () => game.state.vaultCleared);
  assert.ok(game.state.gear.armor?.tier === 3 || game.state.inventory.some(item => item.slot === 'armor' && item.tier === 3));
  const restored = new Game('witch', game.snapshot());
  assert.equal(restored.state.vaultCleared, true);
  assert.equal(marker(restored, 'vaultReward'), undefined);
  playTo(restored, 'wood', () => restored.state.zone === 'wood');
  assert.equal(restored.state.stage, 1);
});
