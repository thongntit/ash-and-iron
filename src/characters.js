import * as T from 'three';
import { beam, material, part } from './mesh.js';

const costumes = {
  warden: { plate: '#958b6d', clothes: '#4a5149', accent: '#d8ad6b', hood: '#53594f', skin: '#c79873', weapon: 'sword' },
  witch: { plate: '#76504a', clothes: '#602f39', accent: '#e7a068', hood: '#552b37', skin: '#ca9a86', weapon: 'staff', cloak: true },
  scout: { plate: '#74674f', clothes: '#3e5b4d', accent: '#b7b084', hood: '#375546', skin: '#ac8e72', weapon: 'bow', cloak: true },
  keeper: { plate: '#82708b', clothes: '#4a3a57', accent: '#ddb86f', hood: '#755d79', skin: '#be8d72', weapon: 'staff', cloak: true },
  smith: { plate: '#735440', clothes: '#5b5142', accent: '#b5865e', hood: '#775b4d', skin: '#b88865', weapon: 'hammer', bare: true },
  thrall: { plate: '#735347', clothes: '#4c3932', accent: '#c88156', hood: '#795d4f', skin: '#917f68', weapon: 'knife', bare: true },
  husk: { plate: '#978876', clothes: '#524b43', accent: '#cfa685', hood: '#8b7969', skin: '#ad9d83', weapon: 'axe', bare: true },
  archer: { plate: '#626756', clothes: '#475443', accent: '#b6ab75', hood: '#59644d', skin: '#a38f6c', weapon: 'bow', cloak: true },
  brute: { plate: '#8a5243', clothes: '#4b322a', accent: '#ec8e58', hood: '#704a3e', skin: '#9c6950', weapon: 'axe', bare: true, scale: 1.3 },
  knight: { plate: '#62667d', clothes: '#343b57', accent: '#b8b9d6', hood: '#5d6074', skin: '#96899a', weapon: 'sword', cloak: true, horns: true, scale: 1.29 },
  boss: { plate: '#735043', clothes: '#643138', accent: '#f39753', hood: '#7a4c41', skin: '#a66b55', weapon: 'scepter', cloak: true, horns: true, scale: 1.91 },
};

const dark = '#333334';
const steel = '#b0a596';

function hinge(parent, x, y, z) {
  const pivot = new T.Group();
  pivot.position.set(x, y, z);
  parent.add(pivot);
  return pivot;
}

function cloakMesh(color) {
  const geometry = new T.BufferGeometry();
  const widths = [0.15, 0.23, 0.27, 0.30];
  const positions = [];
  const indices = [];
  for (let row = 0; row < widths.length; row++) {
    for (let column = 0; column < 7; column++) {
      const fraction = column / 6 * 2 - 1;
      const x = fraction * widths[row];
      const y = 1.065 - row * 0.245 - (row === 3 ? 0.024 * Math.sin(column * 3.1) : 0);
      const z = -0.14 - row * 0.063 + Math.abs(fraction) * 0.087 + Math.sin(column * 2.7) * 0.028;
      positions.push(x, y, z);
      if (row && column) {
        const i = row * 7 + column;
        indices.push(i - 8, i - 7, i, i - 8, i, i - 1);
      }
    }
  }
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const finish = material(color);
  const capeMaterial = finish.clone();
  capeMaterial.side = T.DoubleSide;
  const mesh = new T.Mesh(geometry, capeMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function weapon(root, kind, accent) {
  if (kind === 'bow') {
    const limbs = [[0, -0.33, -0.02], [0, -0.18, 0.16], [0, 0, 0.19], [0, 0.17, 0.16], [0, 0.33, -0.02]];
    for (let i = 1; i < limbs.length; i++) beam(root, limbs[i - 1], limbs[i], 0.055, '#af8053');
    beam(root, limbs[0], limbs.at(-1), 0.009, '#c8bf9b', 'cylinder');
    return;
  }
  if (kind === 'staff' || kind === 'scepter') {
    const staff = kind === 'staff';
    beam(root, [0, -0.48, 0], [0, 0.44, 0], staff ? 0.043 : 0.078, staff ? '#856549' : '#7b6755', 'cylinder');
    part(root, 'cylinder', '#b38c5b', [0, 0.36, 0], [0.16, 0.13, 0.16], { style: 'metal' });
    part(root, 'blade', accent, [0, 0.50, 0], [0.22, staff ? 0.29 : 0.25, 0.21], { style: 'light' });
    for (const sign of [-1, 1]) beam(root, [0, 0.38, 0], [sign * 0.14, 0.58, 0], 0.045, '#b89162');
    return;
  }
  if (kind === 'axe' || kind === 'hammer') {
    beam(root, [0, -0.34, 0], [0, 0.40, 0], 0.06, '#805e47', 'cylinder');
    if (kind === 'axe') part(root, 'blade', steel, [0, 0.30, 0.084], [0.078, 0.40, 0.36], { style: 'metal', rotation: [0.3, 0, 0] });
    else part(root, 'box', steel, [0, 0.32, 0], [0.17, 0.19, 0.37], { style: 'metal' });
    part(root, 'cylinder', accent, [0, 0.245, 0], [0.093, 0.09, 0.093], { style: 'metal' });
    return;
  }
  const size = kind === 'knife' ? 0.33 : 0.56;
  beam(root, [0, -0.10, 0], [0, 0.12, 0], 0.053, '#49382e', 'cylinder');
  part(root, 'box', accent, [0, 0.12, 0], [0.18, 0.04, 0.058], { style: 'metal' });
  part(root, 'blade', steel, [0, 0.12 + size * 0.48, 0], [0.11, size, 0.045], { style: 'metal' });
  part(root, 'blade', '#d0b599', [0, 0.12 + size * 0.48, 0.023], [0.041, size * 0.88, 0.016], { style: 'metal' });
}

export function makeCharacter(kind) {
  const root = new T.Group();
  root.name = kind;
  if (kind === 'wisp') {
    const body = hinge(root, 0, 0.63, 0);
    part(body, 'cut', '#65a7a5', [0, 0.03, 0], [0.58, 0.64, 0.58], { style: 'light' });
    part(body, 'blade', '#a5f3da', [0, 0.13, 0], [0.34, 0.54, 0.37], { style: 'ember' });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      part(body, 'blade', '#417d83', [Math.cos(a) * 0.23, -0.15, Math.sin(a) * 0.23], [0.17, 0.43, 0.21],
        { style: 'light', rotation: [a * 0.1, a, 0.25] });
    }
    return { root, body, kind, height: 1.08 };
  }

  const outfit = costumes[kind];
  const { plate, clothes, accent, hood, skin, cloak, bare, horns } = outfit;
  const size = outfit.scale ?? 1;
  root.scale.setScalar(size);
  const body = hinge(root, 0, 0, 0);
  if (cloak) body.add(cloakMesh(clothes));
  part(body, 'round', clothes, [0, 0.62, 0], [0.35, 0.32, 0.24]);
  part(body, 'taper', clothes, [0, 0.83, 0], [0.40, 0.42, 0.30], { rotation: [0, 0, Math.PI] });
  part(body, 'cut', plate, [0, 0.91, 0.065], [0.48, 0.44, 0.31], { style: 'metal', rotation: [0.13, 0, 0] });
  part(body, 'box', dark, [0, 0.70, 0.015], [0.35, 0.075, 0.265]);
  part(body, 'box', accent, [0, 0.701, 0.158], [0.088, 0.066, 0.027], { style: 'metal' });
  for (const side of [-1, 1]) {
    part(body, 'box', plate, [side * 0.14, 0.64, 0.093], [0.12, 0.18, 0.09], { style: 'metal', rotation: [0.09, side * 0.11, side * 0.15] });
    beam(body, [side * 0.14, 1.04, 0.16], [side * 0.058, 0.86, 0.24], 0.024, accent, 'box');
  }
  const head = hinge(body, 0, 1.18, 0);
  part(head, 'round', bare ? skin : hood, [0, 0.023, 0], [0.28, 0.31, 0.27], { style: cloak || bare ? 'matte' : 'metal' });
  part(head, 'round', bare ? '#7a5b47' : dark, [0, 0.003, 0.095], [0.198, 0.20, 0.105]);
  if (cloak) part(head, 'cut', hood, [0, 0.087, 0.005], [0.34, 0.25, 0.31], { rotation: [0, 0.4, 0] });
  if (bare) part(head, 'round', skin, [0, 0.025, 0.134], [0.058, 0.066, 0.052]);
  if (!bare && !cloak) {
    part(head, 'box', plate, [0, -0.064, 0.134], [0.192, 0.075, 0.043], { style: 'metal' });
    part(head, 'box', accent, [0, 0.01, 0.153], [0.022, 0.10, 0.023], { style: 'metal' });
  }
  for (const side of [-1, 1]) {
    part(head, 'box', accent, [side * 0.05, 0.037, 0.151], [0.042, 0.015, 0.014], { style: 'light' });
    if (horns) {
      beam(head, [side * 0.106, 0.083, -0.02], [side * 0.19, 0.20, -0.045], 0.105, plate);
      beam(head, [side * 0.19, 0.20, -0.045], [side * 0.24, 0.30, -0.068], 0.061, accent);
    }
  }

  const limbs = [];
  for (const side of [-1, 1]) {
    const leg = hinge(body, side * 0.114, 0.61, 0);
    part(leg, 'taper', clothes, [0, -0.14, 0], [0.142, 0.32, 0.17]);
    const knee = hinge(leg, 0, -0.27, 0.014);
    part(knee, 'cut', plate, [0, -0.047, 0.03], [0.153, 0.17, 0.155], { style: 'metal' });
    part(knee, 'box', dark, [0, -0.22, 0.045], [0.143, 0.22, 0.15]);
    part(knee, 'box', plate, [0, -0.302, 0.083], [0.166, 0.092, 0.242], { style: 'metal' });

    const arm = hinge(body, side * 0.21, 0.99, 0.023);
    arm.rotation.z = side * 0.19;
    part(arm, 'cut', plate, [side * 0.045, -0.021, 0], [0.249, 0.22, 0.245], { style: 'metal', rotation: [0, side * 0.23, side * 0.18] });
    part(arm, 'taper', clothes, [side * 0.023, -0.135, 0], [0.134, 0.24, 0.139]);
    const forearm = hinge(arm, side * 0.025, -0.22, 0.01);
    part(forearm, 'taper', plate, [0, -0.097, 0.015], [0.127, 0.21, 0.135], { style: 'metal' });
    part(forearm, 'round', bare ? skin : dark, [0, -0.198, 0.021], [0.116, 0.137, 0.121]);
    if (side === -1) {
      const grip = hinge(forearm, 0, -0.198, 0.027);
      grip.rotation.x = -1.04;
      grip.rotation.z = -0.12;
      weapon(grip, outfit.weapon, accent);
    } else if (kind === 'warden' || kind === 'knight') {
      part(forearm, 'cut', plate, [0, -0.11, 0.114], [0.29, 0.40, 0.093], { style: 'metal' });
      part(forearm, 'cut', accent, [0, -0.11, 0.151], [0.097, 0.176, 0.047], { style: 'metal' });
    }
    limbs.push({ leg, knee, arm, forearm, side });
  }
  return { root, body, limbs, kind, height: size * (horns ? 1.54 : 1.37) };
}

export function makeSeal(color, shrine = false) {
  const root = new T.Group();
  const metal = shrine ? '#8c947e' : '#9b7754';
  part(root, 'cylinder', '#60626a', [0, 0.07, 0], [0.83, 0.17, 0.83]);
  part(root, 'taper', metal, [0, 0.28, 0], [0.64, 0.35, 0.64]);
  part(root, 'cylinder', metal, [0, 0.52, 0], [0.54, 0.14, 0.54], { style: 'metal' });
  const gem = part(root, 'blade', color, [0, 0.85, 0], [0.29, 0.43, 0.29], { style: 'ember' });
  return { root, gem, height: 1.05 };
}

export function animateCharacter(model, actor, time, isPlayer = false) {
  const { root, body, limbs } = model;
  if (actor.hp <= 0) {
    root.rotation.z = Math.PI * 0.46;
    root.position.y += 0.1;
    return;
  }
  root.rotation.z = 0;
  if (actor.heading !== undefined) {
    const delta = Math.atan2(Math.sin(actor.heading - root.rotation.y), Math.cos(actor.heading - root.rotation.y));
    root.rotation.y += delta * 0.34;
  }
  const active = actor.moving || actor.walk && time - actor.walk < 0.075;
  const stride = active ? Math.sin(time * 15.5) : 0;
  const wind = actor.wind > 0 ? 1 - actor.wind / actor.windTotal : 0;
  const attack = actor.attack > 0 ? Math.sin(actor.attack * 7.3) * 1.53 : wind * 1.44;
  if (!limbs) {
    body.position.y = 0.64 + Math.sin(time * 3.7 + actor.x) * 0.14;
    body.rotation.y = time * 1.8;
    return;
  }
  body.position.y = active ? Math.abs(stride) * 0.029 : Math.sin(time * 3.7 + actor.x) * 0.012;
  body.rotation.x = actor.dodge > 0 ? 0.49 : active ? 0.12 : 0;
  body.rotation.y = attack * 0.19;
  for (const { leg, knee, arm, forearm, side } of limbs) {
    leg.rotation.x = stride * side * 0.49;
    knee.rotation.x = Math.max(0, stride * -side) * 0.43;
    arm.rotation.x = stride * -side * 0.36 - (side === -1 ? attack : attack * 0.28);
    arm.rotation.z = side * (0.18 + (side === -1 ? attack * 0.19 : 0));
    forearm.rotation.x = -0.47 - (isPlayer ? 0.14 : 0) - attack * 0.19;
  }
}
