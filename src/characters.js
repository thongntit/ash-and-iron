import * as T from 'three';
import { part } from './mesh.js';

export function makeWisp() {
  const root = new T.Group();
  const body = new T.Group();
  root.add(body);
  part(body, 'cut', '#65a7a5', [0, 0.03, 0], [0.58, 0.64, 0.58], { style: 'light' });
  part(body, 'blade', '#a5f3da', [0, 0.13, 0], [0.34, 0.54, 0.37], { style: 'ember' });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    part(body, 'blade', '#417d83', [Math.cos(a) * 0.23, -0.15, Math.sin(a) * 0.23], [0.17, 0.43, 0.21],
      { style: 'light', rotation: [a * 0.1, a, 0.25] });
  }
  return { root, body, height: 1.08 };
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

export function animateWisp(model, actor, time) {
  model.root.visible = actor.hp > 0;
  model.body.position.y = 0.64 + Math.sin(time * 3.7 + actor.x) * 0.14;
  model.body.rotation.y = time * 1.8;
}
