import './style.css';
import { Audio } from './audio.js';
import { loadAssets } from './assets.js';
import { CLASSES, CONTRACT, QUESTS, SLOTS, TIERS, ZONES, makeItem } from './content.js';
import { Game, SAVE_KEY, XP, readSave } from './game.js';
import { Renderer } from './render.js';
import { distance } from './world.js';

const $ = selector => document.querySelector(selector);
const storage = (() => {
  try { return window.localStorage; } catch { return null; }
})();
const audio = new Audio(storage);
const canvas = $('#world');
const modal = $('#modal');
const modalBody = $('#modal-body');
const titleScreen = $('#title-screen');
const gameScreen = $('#game-screen');
let renderer;
const keys = new Set();
const mouse = { x: 0, y: 0, active: false };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let game;
let selectedClass = 'warden';
let panel = '';
let hover;
let save;
let lastSave = 0;
let mapVisible = true;
let savedAt = 0;
let previousFrame = 0;
let needsRender = true;

const itemColors = ['#e5dac1', '#a3cd87', '#8acbe9', '#efb373'];
const labels = { weapon: 'Weapon', armor: 'Armor', charm: 'Charm' };
const deck = {
  vigor: ['Vigor', '+15 maximum life'],
  might: ['Might', '+4 attack power'],
  focus: ['Focus', '+2.4 spirit regenerated per second'],
};

function titleButtons() {
  const continuation = $('#continue');
  const caption = $('#save-label');
  continuation.hidden = !save;
  $('#new-game').textContent = save ? 'New journey' : 'Begin journey';
  $('#new-game').className = save ? 'secondary' : 'primary';
  if (!save) $('#new-game').insertAdjacentHTML('beforeend', '<span aria-hidden="true">→</span>');
  caption.hidden = !save;
  if (save) caption.textContent = `Level ${save.level} ${CLASSES[save.classId].name} · ${save.stage === 5 ? 'Act I complete' : ZONES[save.zone].name}`;
}

function saveGame() {
  if (!game) return;
  save = game.snapshot();
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    savedAt = performance.now();
  } catch {
    $('#save-status').textContent = 'Browser storage unavailable';
  }
  lastSave = performance.now();
}

function soundButtons() {
  document.querySelectorAll('[data-audio]').forEach(button => {
    button.setAttribute('aria-pressed', String(audio.enabled));
    button.innerHTML = `<span aria-hidden="true">◖${audio.enabled ? '))' : '×'}</span> Sound ${audio.enabled ? 'on' : 'off'}`;
  });
}

function announce(title, detail) {
  const box = $('#notifications');
  const notice = document.createElement('section');
  notice.className = 'notice';
  const heading = document.createElement('b');
  heading.textContent = title;
  notice.append(heading);
  if (detail) {
    const text = document.createElement('p');
    text.textContent = detail;
    notice.append(text);
  }
  if (box.childElementCount >= 2) box.firstElementChild.remove();
  box.append(notice);
  setTimeout(() => notice.remove(), detail ? 5200 : 2250);
}

function showZone(world) {
  $('#zone-title').textContent = world.name;
  const banner = $('#zone-banner');
  banner.querySelector('h2').textContent = world.name;
  banner.querySelector('p').textContent = world.subtitle;
  banner.classList.remove('show');
  if (!reducedMotion.matches) {
    void banner.offsetWidth;
    banner.classList.add('show');
  }
  audio.ambience(world.id);
}

function onEvent(type, detail) {
  if (type === 'notice') announce(detail.title, detail.detail);
  if (type === 'sound') audio.play(detail);
  if (type === 'zone') {
    showZone(detail);
    if (game) renderer.center(game.player);
  }
  if (type === 'change' && game) {
    updateHUD();
    saveGame();
  }
  if (type === 'death') openPanel('death');
  if (type === 'shop') openPanel('shop');
  if (type === 'victory') openPanel('victory');
}

let assetsReady = false;

async function start(classId, previousSave) {
  if (!assetsReady) {
    openPanel('loading');
    try {
      await loadAssets((current, total) => {
        const meter = $('#loading-meter');
        if (!meter) return;
        meter.max = total;
        meter.value = current;
        $('#loading-progress').textContent = `${current} / ${total}`;
      });
      assetsReady = true;
    } catch (error) {
      console.error(error);
      openPanel('load-error');
      return;
    }
  }
  if (!renderer) {
    try {
      renderer = new Renderer(canvas, $('#map'));
      renderer.waypointButton.addEventListener('click', () => {
        const marker = renderer.guide;
        if (!marker || !game || modal.open || game.dead) return;
        if (marker.kind) game.move(marker, null, marker);
        else game.move(marker, marker);
        canvas.focus({ preventScroll: true });
      });
    } catch {
      openPanel('graphics');
      return;
    }
  }
  closePanel();
  titleScreen.hidden = true;
  gameScreen.hidden = false;
  $('#notifications').replaceChildren();
  mouse.active = false;
  audio.start();
  game = new Game(classId, previousSave);
  game.emit = onEvent;
  renderer.resize();
  needsRender = true;
  renderer.center(game.player);
  showZone(game.world);
  $('.skill-icon').textContent = game.class.mark;
  $('#primary').title = game.class.attack;
  $('#art').title = `${game.class.art} · ${game.class.cost} spirit. ${game.class.artTip}`;
  $('#utility .skill-icon').textContent = game.class.utilityMark;
  $('#utility').title = `${game.class.utility} · ${game.class.utilityCost} spirit. ${game.class.utilityTip}`;
  $('#dodge').title = 'Dodge · Briefly avoid damage';
  $('#heal').title = 'Healing draught · Restore life';
  updateHUD();
  saveGame();
  canvas.focus({ preventScroll: true });
  if (!previousSave) announce('Find Keeper Mara', 'Click to move and interact. Press E near a character or gate.');
}

function returnToTitle() {
  closePanel();
  saveGame();
  game = null;
  gameScreen.hidden = true;
  titleScreen.hidden = false;
  audio.ambience('title');
  titleButtons();
  $('#continue').focus();
}

function updateHUD() {
  const p = game.player;
  const state = game.state;
  const [, objective] = QUESTS[state.stage];
  const vault = state.zone === 'vault';
  const oathbreaker = game.enemies.find(enemy => enemy.type === 'oathbreaker' && enemy.hp > 0);
  $('#quest-title').textContent = vault ? 'Blackroot Vault' : QUESTS[state.stage][0];
  $('#quest-objective').textContent = !vault ? objective : state.vaultCleared
    ? 'Return to Cinderwood' : oathbreaker ? 'Defeat the Oathbreaker' : 'Open the Blackroot Reliquary';
  $('#health-fill').style.height = `${100 * p.hp / game.maxHP}%`;
  $('#health-value').textContent = Math.ceil(p.hp);
  $('#health-panel').setAttribute('aria-label', `Life ${Math.ceil(p.hp)} of ${game.maxHP}`);
  $('#spirit-fill').style.height = `${p.spirit}%`;
  $('#spirit-value').textContent = Math.floor(p.spirit);
  $('#level-label').textContent = `LVL ${state.level} · ${game.class.name}`;
  $('#xp-label').textContent = `${state.xp} / ${XP(state.level)} XP`;
  $('#xp').max = XP(state.level);
  $('#xp').value = state.xp;
  $('#draught-count').textContent = state.draughts;
  $('#scrip').textContent = `◈ ${state.gold} scrip`;
  $('#art').classList.toggle('wait', p.spirit < game.class.cost || game.artReady > game.time);
  $('#utility').classList.toggle('wait', game.world.safe || p.spirit < game.class.utilityCost || game.utilityReady > game.time);
  $('#dodge').classList.toggle('wait', game.dodgeReady > game.time);
  $('#heal').classList.toggle('wait', !state.draughts || p.hp >= game.maxHP);
  if (savedAt) $('#save-status').textContent = performance.now() - savedAt < 1850 ? 'Journey saved' : 'Autosave active';
  const boss = game.enemies.find(enemy => ['boss', 'oathbreaker'].includes(enemy.type) && enemy.hp > 0 && enemy.active);
  $('#boss-bar').hidden = !boss;
  if (boss) {
    $('#boss-name').textContent = boss.name;
    $('#boss-hp').setAttribute('aria-label', `${boss.name} health`);
    $('#boss-hp').max = boss.maxHP;
    $('#boss-hp').value = boss.hp;
    $('#boss-phase').textContent = boss.type === 'boss' ? ['', 'I', 'II', 'III'][boss.phase] : '';
  }
  const nearby = closestMarker(1.7);
  $('#interact-hint').hidden = !nearby || modal.open;
  if (nearby) $('#interact-hint span').textContent = nearby.label;
}

function closestMarker(max) {
  return game.markers().map(marker => [marker, distance(marker, game.player)])
    .filter(([, d]) => d < max).sort((a, b) => a[1] - b[1])[0]?.[0];
}

function aim() {
  if (mouse.active) {
    const target = renderer.pick(game, mouse.x, mouse.y);
    return target?.type ? target : renderer.unproject(mouse.x, mouse.y);
  }
  const nearby = game.enemies.filter(enemy => enemy.hp > 0).sort((a, b) => distance(game.player, a) - distance(game.player, b))[0];
  return nearby ?? { x: game.player.x + game.player.face * 2, y: game.player.y };
}

function closePanel() {
  if (!modal.open) return;
  modal.close();
  panel = '';
  if (game) canvas.focus({ preventScroll: true });
}

function openPanel(name) {
  panel = name;
  keys.clear();
  renderPanel();
  if (!modal.open) modal.showModal();
}

function itemStats(item) {
  return [
    item.damage ? `+${item.damage} attack` : '',
    item.health ? `+${item.health} life` : '',
    item.defense ? `+${item.defense} armor` : '',
    item.crit ? `+${item.crit}% critical chance` : '',
    item.barrier ? `+${item.barrier} guard armor` : '',
    item.recovery ? `+${item.recovery.toFixed(1)} spirit/sec` : '',
  ].filter(Boolean).join(' · ');
}

function itemName(item) {
  return `<strong class="item-name">${item.name}</strong><small><span class="item-tier">${TIERS[item.tier]}</span> · ${labels[item.slot]} · ${itemStats(item)}</small>`;
}

function button(label, action, style = 'secondary', disabled = false) {
  return `<button type="button" class="${style}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}

const controls = [
  ['Move', '<kbd>Click ground</kbd> or <kbd>WASD</kbd> / <kbd>↑ ↓ ← →</kbd>'],
  ['Attack', '<kbd>Click an enemy</kbd> to engage. <kbd>Shift + click</kbd> or <kbd>F</kbd> attacks in place.'],
  ['Class skill', '<kbd>Q</kbd> or <kbd>Right click</kbd>'],
  ['Tactical skill', '<kbd>X</kbd> uses your class’s defensive or control skill'],
  ['Camera', '<kbd>Mouse wheel</kbd> zooms in or out'],
  ['Dodge', '<kbd>Space</kbd> toward movement or cursor'],
  ['Heal', '<kbd>R</kbd> uses a draught'],
  ['Interact', '<kbd>E</kbd> near a character or gate, or click them'],
  ['Menus', '<kbd>I</kbd> inventory · <kbd>C</kbd> character · <kbd>J</kbd> journal · <kbd>M</kbd> map · <kbd>Esc</kbd> pause'],
];

function contractCard(state, shop = false) {
  const status = state.contract;
  const action = status === 0 ? 'Accept commission' : status === 2 ? 'Hand in ledger' : '';
  return `<section class="contract-card">
    <h3 class="subheading"><span aria-hidden="true">${status === 3 ? '✓ ' : ''}</span> The missing ledger</h3>
    <p>${CONTRACT[status]}</p>
    ${shop && action ? button(action, 'commission', 'secondary') : ''}
  </section>`;
}

function renderPanel(focusAction) {
  let name;
  let body;
  const state = game?.state;
  if (panel === 'class') {
    name = 'Choose your calling';
    body = `<p class="dialog-copy">${save ? 'Starting a new journey will replace the current autosave.' : 'Choose how you’ll fight your way to the bell.'}</p>
      <div class="class-grid">${Object.entries(CLASSES).map(([id, entry]) =>
        `<button type="button" class="class-card" aria-pressed="${id === selectedClass}" data-action="class:${id}" style="--class-color:${entry.color}">
        <span class="mark" aria-hidden="true">${entry.mark}</span><span class="class-name">${entry.name}</span><span class="role">${entry.role}</span><small>${entry.description}</small></button>`).join('')}</div>
      <div class="dialog-actions">${button('Enter Gloamwatch', 'start', 'primary')}${button('Back', 'close')}</div>`;
  }
  if (panel === 'loading') {
    name = 'Preparing Gloamwatch';
    body = '<p class="dialog-copy">Loading the 3D world and character animations <span id="loading-progress"></span></p><progress id="loading-meter" aria-label="Game asset loading"></progress>';
  }
  if (panel === 'load-error') {
    name = 'Game files unavailable';
    body = '<p class="dialog-copy">A 3D asset could not be loaded. Reopen the downloaded game or reload this page and try again.</p>' + button('Back', 'close');
  }
  if (panel === 'graphics') {
    name = '3D graphics unavailable';
    body = '<p class="dialog-copy">Ash & Iron needs a browser with WebGL 2 and hardware acceleration. Enable hardware acceleration in your browser settings, then reopen the game.</p>' + button('Back', 'close');
  }
  if (panel === 'help') {
    name = 'How to play';
    body = `<ul class="panel-list control-list">${controls.map(([label, detail]) => `<li><span>${label}</span><span>${detail}</span></li>`).join('')}</ul>
      <p class="dialog-copy">Walk over fallen loot to collect it. Equip it from your inventory. Red outlines mark incoming attacks. Your journey saves automatically in this browser.</p>
      ${button('Close', 'close')}`;
  }
  if (panel === 'pause') {
    name = 'Journey paused';
    body = `<p class="dialog-copy">Your progress is saved in this browser as you play.</p>
      <div class="dialog-actions">${button('Resume', 'close', 'primary')}${button('How to play', 'help')}${button('Save & return to title', 'title')}
      <button type="button" class="text-button sound-button" data-audio></button></div>`;
  }
  if (panel === 'journal') {
    name = 'Quest journal';
    body = `<ol class="panel-list">${QUESTS.slice(0, 5).map(([title, objective, detail], index) =>
      `<li class="${index < state.stage ? 'quest-done' : index === state.stage ? 'current-step' : ''}">
      <strong>${index < state.stage ? '✓ ' : ''}${index <= state.stage ? title : 'Undiscovered'}</strong>
      ${index <= state.stage ? `<p>${index < state.stage ? 'Complete' : `${objective}. ${detail}`}</p>` : ''}</li>`).join('')}</ol>${contractCard(state)}
      <section class="contract-card"><h3 class="subheading">${state.vaultCleared ? '✓ ' : ''}Blackroot Vault</h3>
      <p>${state.vaultCleared ? 'The Oathbreaker is defeated and the relic claimed.' : 'Look for the vault entrance beyond the Cinderwood courier camp.'}</p></section>`;
  }
  if (panel === 'pack') {
    name = 'Inventory';
    body = `<p class="dialog-copy">${state.inventory.length} / 18 in pack · ${state.gold} scrip</p><div class="columns">
      <div class="stack"><h3 class="subheading">Equipped</h3>${SLOTS.map(slot => {
        const item = state.gear[slot];
        return item ? `<div class="list-row" style="--item:${itemColors[item.tier]}"><div>${itemName(item)}</div></div>` :
          `<div class="empty">${labels[slot]} empty</div>`;
      }).join('')}</div>
      <div class="stack"><h3 class="subheading">Pack</h3>${state.inventory.map(item =>
        `<div class="list-row" style="--item:${itemColors[item.tier]}"><div>${itemName(item)}</div>${button('Equip', `equip:${item.id}`)}</div>`).join('') ||
        '<p class="empty">Your pack is empty.</p>'}</div></div>`;
  }
  if (panel === 'character') {
    name = game.class.name;
    body = `<p class="dialog-copy">Level ${state.level} · ${state.points} talent ${state.points === 1 ? 'point' : 'points'} available</p>
      <div class="stat-grid">${[['Life', game.maxHP], ['Attack', game.power], ['Armor', game.defense], ['Defeated', state.kills]].map(([label, value]) =>
        `<div><strong>${value}</strong>${label}</div>`).join('')}</div>
      <h3 class="subheading">Talents</h3><div class="stack">${Object.entries(deck).map(([id, [label, detail]]) =>
        `<div class="list-row"><div><strong>${label} · ${state.traits[id]}</strong><small>${detail}</small></div>${button('Train', `train:${id}`, 'secondary', !state.points)}</div>`).join('')}</div>
      <h3 class="subheading" style="margin-top:14px">Class skill</h3><p class="dialog-copy">${game.class.art} · ${game.class.cost} spirit. ${game.class.artTip}</p>
      <h3 class="subheading">Tactical skill</h3><p class="dialog-copy">${game.class.utility} · ${game.class.utilityCost} spirit. ${game.class.utilityTip}</p>`;
  }
  if (panel === 'shop') {
    name = 'Smith Oren';
    const tier = state.stage >= 3 ? 2 : 1;
    body = `<p class="dialog-copy">“Hard iron, fresh draughts, and a fair price.” · ${state.gold} scrip</p>
      ${contractCard(state, true)}
      <div class="columns"><div class="stack"><h3 class="subheading">Buy</h3>
      <div class="list-row"><div><strong>Healing draught</strong><small>${state.draughts} / 9 on belt</small></div>${button('12 ◈', 'buy:draught', 'secondary', state.gold < 12 || state.draughts >= 9)}</div>
      ${SLOTS.map(slot => {
        const item = makeItem(slot, tier, Math.max(2, state.level));
        return `<div class="list-row" style="--item:${itemColors[tier]}"><div>${itemName(item)}</div>${button(`${item.value + 13} ◈`, `buy:${slot}`, 'secondary', state.gold < item.value + 13 || state.inventory.length >= 18)}</div>`;
      }).join('')}</div>
      <div class="stack"><h3 class="subheading">Sell</h3>${state.inventory.map(item =>
        `<div class="list-row" style="--item:${itemColors[item.tier]}"><div>${itemName(item)}</div>${button(`+${Math.floor(item.value / 2)} ◈`, `sell:${item.id}`)}</div>`).join('') ||
        '<p class="empty">Your pack is empty.</p>'}</div></div>`;
  }
  if (panel === 'death') {
    name = 'Fallen to ash';
    body = `<p class="dialog-copy">You lost some scrip. Your equipment, quest progress, and fallen enemies carry over when you return to Gloamwatch.</p>
      ${button('Return to Gloamwatch', 'respawn', 'primary')}`;
  }
  if (panel === 'victory') {
    name = 'The bell is silent';
    body = `<div class="victory-art"></div><p class="dialog-copy">Mara hangs the two seals over the gate. No answer rises from the stone. For the first time in living memory, the lamps of Gloamwatch can go dark at dawn.</p>
      <div class="stat-grid">${[['Act complete', 'I'], ['Level', state.level], ['Defeated', state.kills], ['Falls', state.deaths]].map(([label, value]) =>
        `<div><strong>${value}</strong>${label}</div>`).join('')}</div>
      <div class="dialog-actions">${button('Keep exploring', 'close', 'primary')}${button('Return to title', 'title')}</div>`;
  }
  const dismiss = ['death', 'loading'].includes(panel) ? '' : '<button type="button" class="modal-close" aria-label="Close dialog" data-action="close">×</button>';
  modalBody.innerHTML = `<div class="modal-top"><h2 id="dialog-title">${name}</h2>${dismiss}</div>${body}`;
  if (focusAction) {
    Array.from(modalBody.querySelectorAll('[data-action]')).find(node => node.dataset.action === focusAction)?.focus({ preventScroll: true });
  }
  soundButtons();
}

function action(value) {
  const [type, param] = value.split(':');
  if (type === 'close') return closePanel();
  if (type === 'help') return openPanel('help');
  if (type === 'title') return returnToTitle();
  if (type === 'class') {
    selectedClass = param;
    audio.play('select');
    return renderPanel(value);
  }
  if (type === 'start') return start(selectedClass);
  if (type === 'respawn') {
    closePanel();
    return game.respawn();
  }
  const inventoryActions = {
    equip: () => game.equip(Number(param)),
    sell: () => game.sell(Number(param)),
    buy: () => game.buy(param),
    train: () => game.train(param),
    commission: () => game.commission(),
  };
  inventoryActions[type]?.();
  renderPanel(value);
}

function movement() {
  const horizontal = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const vertical = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  if (!horizontal && !vertical) return null;
  const x = vertical + horizontal;
  const y = vertical - horizontal;
  const magnitude = Math.hypot(x, y);
  return { x: x / magnitude, y: y / magnitude };
}

function perform(type) {
  if (!game || modal.open || game.dead) return;
  audio.start();
  const target = aim();
  if (type === 'art') game.art(target);
  if (type === 'utility') game.utility(target);
  if (type === 'dodge') {
    const vec = movement();
    game.dodge(vec ? { x: game.player.x + vec.x * 3, y: game.player.y + vec.y * 3 } : target);
  }
  if (type === 'heal') game.heal();
  if (type === 'primary') game.primary(target);
}

function toggleMap() {
  mapVisible = !mapVisible;
  $('#map').hidden = !mapVisible;
  $('#toggle-map').setAttribute('aria-expanded', String(mapVisible));
}

document.addEventListener('click', event => {
  const element = event.target.closest('button');
  if (!element) return;
  if (element.hasAttribute('data-audio')) {
    audio.toggle();
    audio.ambience(game?.state.zone ?? 'title');
    soundButtons();
  } else {
    audio.start();
    if (element.dataset.action) action(element.dataset.action);
    if (element.dataset.panel) openPanel(element.dataset.panel);
  }
});

$('#new-game').addEventListener('click', () => openPanel('class'));
$('#continue').addEventListener('click', () => save && start(save.classId, save));
$('#title-help').addEventListener('click', () => openPanel('help'));
$('#toggle-map').setAttribute('aria-expanded', String(mapVisible));
$('#toggle-map').addEventListener('click', toggleMap);
for (const id of ['primary', 'art', 'utility', 'dodge', 'heal']) $('#' + id).addEventListener('click', () => perform(id));
modal.addEventListener('cancel', event => {
  event.preventDefault();
  if (!['death', 'loading'].includes(panel)) closePanel();
});

canvas.addEventListener('pointermove', event => {
  Object.assign(mouse, { x: event.offsetX, y: event.offsetY, active: true });
});
canvas.addEventListener('pointerleave', () => { mouse.active = false; });
canvas.addEventListener('pointerdown', event => {
  if (!game || modal.open || game.dead || event.button > 2) return;
  audio.start();
  const x = event.offsetX;
  const y = event.offsetY;
  Object.assign(mouse, { x, y, active: true });
  if (event.button === 2) return perform('art');
  if (event.button !== 0) return;
  if (event.shiftKey) return perform('primary');
  const entity = renderer.pick(game, x, y);
  if (entity?.kind) game.move(entity, null, entity);
  else if (entity) game.move(entity, entity);
  else game.move(renderer.unproject(x, y));
});
canvas.addEventListener('wheel', event => {
  if (!game || modal.open) return;
  event.preventDefault();
  renderer.zoomBy(Math.sign(event.deltaY));
}, { passive: false });
canvas.addEventListener('contextmenu', event => event.preventDefault());

window.addEventListener('keydown', event => {
  if (!game || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (modal.open) {
    const toggle = { j: 'journal', i: 'pack', c: 'character' }[key];
    if (toggle === panel) { event.preventDefault(); closePanel(); }
    return;
  }
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && !event.target.closest?.('button')) event.preventDefault();
  keys.add(key);
  if (event.repeat) return;
  const panels = { escape: 'pause', j: 'journal', i: 'pack', c: 'character' };
  const skills = { q: 'art', x: 'utility', r: 'heal', f: 'primary', ' ': 'dodge' };
  if (panels[key]) {
    event.preventDefault();
    openPanel(panels[key]);
  }
  if (skills[key] && (key !== ' ' || !event.target.closest?.('button'))) perform(skills[key]);
  if (key === 'm') toggleMap();
  if (key === 'e') {
    const marker = closestMarker(1.8);
    if (marker) game.move(marker, null, marker);
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => {
  if (!game) return;
  renderer.resize();
  needsRender = true;
});
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear();
    saveGame();
  }
});

let hudAt = 0;
function frame(now) {
  const dt = Math.min(0.36, (now - previousFrame) / 1000 || 0);
  previousFrame = now;
  if (game) {
    const vector = movement();
    let remaining = dt;
    while (!modal.open && remaining > 0.001) {
      const step = Math.min(0.025, remaining);
      game.tick(step, vector);
      remaining -= step;
    }
    hover = mouse.active && !modal.open ? renderer.pick(game, mouse.x, mouse.y) : null;
    canvas.classList.toggle('interactive', Boolean(hover));
    if (!modal.open || needsRender) {
      renderer.draw(game, hover, dt);
      needsRender = false;
    }
    if (now > hudAt) {
      updateHUD();
      hudAt = now + 85;
    }
    if (now - lastSave > 4000 && !game.dead && !modal.open) saveGame();
  }
  requestAnimationFrame(frame);
}

save = readSave(storage);
titleButtons();
soundButtons();
requestAnimationFrame(frame);
