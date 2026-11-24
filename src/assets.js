import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const models = [
  'warden', 'witch', 'scout', 'smith', 'thrall', 'archer', 'knight', 'bellworn',
  'bone-axe', 'bone-crossbow', 'bone-blade', 'bone-staff',
  'ruin', 'pillar', 'rose-arch', 'doorway', 'grate', 'barrels', 'banner-red', 'banner-blue',
  'corner', 'chest', 'coffer', 'crates', 'table', 'candles', 'rubble',
  'house-a', 'house-b', 'forge', 'tavern', 'chapel', 'well',
  'dead-tree-a', 'dead-tree-b', 'dead-tree-c', 'maple', 'birch', 'bush',
];

const surfaces = ['cobblestone_floor_04', 'forest_floor'];
const library = new Map();
const images = new Map();
const sounds = ['whispers', 'dungeon-loop', 'swing-a', 'swing-b', 'clash-a', 'clash-b'];
const audio = new Map();
const finishes = new Map();
let pending;

export function loadAssets(onProgress) {
  if (!pending) pending = load(onProgress).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}

async function load(onProgress) {
  const tag = document.getElementById('offline-assets');
  const bundled = tag ? JSON.parse(tag.textContent) : null;
  const path = filename => bundled?.[filename] ?? new URL(`game-assets/${filename}`, document.baseURI).href;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const tasks = [
    ...models.map(name => async () => {
      const response = await fetch(path(`${name}.glb`));
      if (!response.ok) throw new Error(`Could not load model: ${name}`);
      const data = await loader.parseAsync(await response.arrayBuffer(), '');
      const box = new T.Box3().setFromObject(data.scene, true);
      library.set(name, { ...data, box });
    }),
    ...sounds.map(name => async () => {
      const response = await fetch(path(`${name}.ogg`));
      if (response.ok) audio.set(name, await response.arrayBuffer());
    }),
    ...surfaces.map(name => async () => {
      const texture = new Image();
      texture.src = path(`${name}.webp`);
      await texture.decode();
      images.set(name, texture);
    }),
  ];
  let next = 0;
  let done = 0;
  onProgress?.(0, tasks.length);
  // Limit simultaneous GLB decoding to keep memory stable on mobile.
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < tasks.length) {
      await tasks[next++]();
      onProgress?.(++done, tasks.length);
    }
  }));
}

export function sourceAudio(id) {
  return audio.get(id);
}

export function sourceImage(id) {
  return images.get(id);
}

function finish(original, tint) {
  const key = `${original.id}:${tint}`;
  if (!finishes.has(key)) {
    const material = original.clone();
    material.color.multiply(new T.Color(tint));
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        float assetLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(vec3(assetLuminance), diffuseColor.rgb, 0.65);
      `);
    };
    material.roughness = Math.max(0.68, material.roughness);
    finishes.set(key, material);
  }
  return finishes.get(key);
}

function treatment(root, tint) {
  root.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = node.receiveShadow = true;
    node.material = Array.isArray(node.material)
      ? node.material.map(material => finish(material, tint))
      : finish(node.material, tint);
  });
}

export function sceneAsset(id, parent, { height, width, rotation = 0, tint = '#ffffff' } = {}) {
  const asset = library.get(id);
  const box = asset.box;
  const size = box.getSize(new T.Vector3());
  const center = box.getCenter(new T.Vector3());
  const scale = height ? height / size.y : width ? width / Math.max(size.x, size.z) : 1;
  const pivot = new T.Group();
  const mesh = asset.scene.clone(true);
  mesh.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  mesh.scale.setScalar(scale);
  pivot.rotation.y = rotation;
  pivot.add(mesh);
  parent.add(pivot);
  treatment(mesh, tint);
  return pivot;
}

const ATTACKS = {
  melee: ['1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop'],
  caster: ['Spellcast_Shoot'],
  shooter: ['2H_Ranged_Shoot'],
};
const outfit = (asset, tint, height, held, attachment, attack = 'melee') => ({ asset, tint, height, held, attachment, attack });
const characters = {
  warden: outfit('warden', '#c4c3bb', 1.46, ['1H_Sword', 'Rectangle_Shield']),
  witch: outfit('witch', '#c1a9aa', 1.52, ['2H_Staff'], null, 'caster'),
  scout: outfit('scout', '#a9baad', 1.40, ['2H_Crossbow'], null, 'shooter'),
  keeper: outfit('witch', '#bfc6a5', 1.51, ['Spellbook', '1H_Wand'], null, 'caster'),
  smith: outfit('smith', '#bca183', 1.48, []),
  thrall: outfit('thrall', '#b4a78c', 1.32, [], 'bone-blade'),
  husk: outfit('thrall', '#b5b3a0', 1.48, [], 'bone-axe'),
  archer: outfit('archer', '#9aab92', 1.47, [], 'bone-crossbow', 'shooter'),
  brute: outfit('knight', '#b9886f', 1.85, [], 'bone-axe'),
  knight: outfit('knight', '#aab7ce', 1.74, [], 'bone-blade'),
  oathbreaker: outfit('knight', '#adb98d', 2.03, [], 'bone-axe'),
  boss: outfit('bellworn', '#e3b4a5', 2.78, [], 'bone-staff', 'caster'),
};

const props = /^(?:[12]H_|Badge_Shield|Rectangle_Shield|Round_Shield|Spike_Shield|Spellbook|Knife|Throwable|Axe|Hammer|Shield|Crossbow)/;

export function riggedAsset(kind) {
  const spec = characters[kind];
  const asset = library.get(spec.asset);
  const rig = clone(asset.scene);
  const size = asset.box.getSize(new T.Vector3());
  const scale = spec.height / Math.min(2.08, size.y);
  rig.scale.setScalar(scale);
  rig.traverse(node => {
    if (props.test(node.name) && !spec.held.some(name => node.name === name)) node.visible = false;
  });
  if (spec.attachment) {
    rig.traverse(node => {
      if (/^handslot[._]?r$/i.test(node.name)) {
        const accessory = library.get(spec.attachment).scene.clone(true);
        node.add(accessory);
      }
    });
  }
  if (kind === 'boss') {
    rig.traverse(node => {
      if (!node.isMesh || !/Eyes/.test(node.name)) return;
      node.material = new T.MeshStandardMaterial({ color: '#ffa54d', emissive: '#e75125', emissiveIntensity: 1.9 });
    });
  }
  treatment(rig, spec.tint);
  const root = new T.Group();
  root.name = kind;
  root.add(rig);
  const mixer = new T.AnimationMixer(rig);
  const shared = ['warden', 'witch', 'scout', 'smith'].includes(spec.asset) ? 'warden' : 'thrall';
  const clips = library.get(shared).animations;
  const actions = new Map(clips.map(clip => [clip.name, mixer.clipAction(clip)]));
  const model = {
    root, rig, mixer, actions, attacks: ATTACKS[spec.attack], height: spec.height,
    active: null, motion: 0, attackIndex: 0,
  };
  play(model, 'Idle');
  mixer.update(1 / 60);
  return model;
}

function play(model, name, duration = 0, once = false) {
  const next = model.actions.get(name);
  if (!next) return false;
  if (model.active === next && !once) return true;
  const previous = model.active;
  next.reset().setEffectiveWeight(1);
  next.setEffectiveTimeScale(duration ? next.getClip().duration / duration : 1);
  next.setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = once;
  next.fadeIn(previous === next ? 0 : 0.09).play();
  if (previous && previous !== next) previous.fadeOut(0.09);
  model.active = next;
  return true;
}

export function animateRig(model, actor, time, dt) {
  const { root, mixer } = model;
  if (actor.heading !== undefined) {
    const delta = Math.atan2(Math.sin(actor.heading - root.rotation.y), Math.cos(actor.heading - root.rotation.y));
    root.rotation.y += delta * Math.min(1, dt * 21);
  }
  if (actor.hp <= 0 && !model.dead) {
    model.dead = true;
    play(model, 'Death_A', 0.7, true);
  } else if (!model.dead) {
    const moving = actor.moving || actor.walk && time - actor.walk < 0.10;
    if (actor.motion && actor.motion.serial !== model.motion) {
      const { kind, duration, serial } = actor.motion;
      model.motion = serial;
      const clips = {
        strike: model.attacks[model.attackIndex++ % model.attacks.length],
        art: model.attacks[0] === 'Spellcast_Shoot' ? 'Spellcast_Raise'
          : model.attacks[0] === '2H_Ranged_Shoot' ? '2H_Ranged_Shoot' : '2H_Melee_Attack_Spin',
        dodge: 'Dodge_Forward',
        heal: 'Use_Item',
        hit: 'Hit_A',
        slam: '1H_Melee_Attack_Chop',
        nova: 'Spellcast_Summon',
        shot: '2H_Ranged_Shoot',
        spell: 'Spellcast_Long',
        talk: 'Interact',
      };
      if (play(model, clips[kind], duration, true)) model.until = time + duration;
    }
    if (!model.until || time >= model.until) {
      const run = model.actions.has('Running_A') ? 'Running_A' : 'Walking_A';
      play(model, moving ? run : 'Idle');
    }
  }
  mixer.update(dt);
}

export function disposeRig(model) {
  model.mixer.stopAllAction();
  model.mixer.uncacheRoot(model.rig);
  model.rig.traverse(node => {
    if (node.isSkinnedMesh) node.skeleton.dispose();
  });
}
