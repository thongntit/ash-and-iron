import * as T from 'three';
import { beam, combineStatic, material, part } from './mesh.js';
import { random } from './world.js';

export const PALETTES = {
  watch: {
    ground: [46, 51, 45], road: [92, 85, 69], fog: '#131d1e', stone: '#77766b',
    dark: '#494b43', vegetation: '#58684b', foliage: ['#344f42', '#3d5d4c', '#4f6952'], flame: '#ffac56',
    sky: '#b1c6d1', key: '#dbd6bf', earth: '#4e4739', density: 0.28,
  },
  wood: {
    ground: [42, 50, 45], road: [81, 72, 55], fog: '#152123', stone: '#686e62',
    dark: '#444740', vegetation: '#58694e', foliage: ['#2f5144', '#3d614b', '#4e6b52'], flame: '#ff9f58',
    sky: '#9db7c6', key: '#d4d5bc', earth: '#474b39', density: 0.36,
  },
  crypt: {
    ground: [43, 50, 57], road: [70, 79, 85], fog: '#121d29', stone: '#697788',
    dark: '#3c5058', vegetation: '#587078', foliage: ['#384f56', '#49676d', '#5e7b7a'], flame: '#82e2d1',
    sky: '#95b5dc', key: '#c8d5e5', earth: '#3e4856', density: 0.13,
  },
  belfry: {
    ground: [59, 47, 48], road: [96, 68, 59], fog: '#241a24', stone: '#826c69',
    dark: '#4c3e45', vegetation: '#76574c', foliage: ['#534851', '#654e4f', '#815e55'], flame: '#ff8b50',
    sky: '#bbaccb', key: '#e4b7a0', earth: '#634843', density: 0.16,
  },
};

export function groundY(zone, x, z) {
  const tileX = Math.max(0, Math.min(zone.size - 1, Math.round(x)));
  const tileZ = Math.max(0, Math.min(zone.size - 1, Math.round(z)));
  const road = zone.tiles[tileZ * zone.size + tileX]?.road;
  const elevation = Math.sin(x * 0.49 + z * 0.52 + zone.seed) * 0.1 + Math.cos(x * 0.73 - z * 0.36) * 0.075;
  const outskirts = Math.min(x + 0.5, z + 0.5, zone.size - x - 0.5, zone.size - z - 0.5);
  return elevation * (road ? 0.39 : 1) - Math.max(0, 0.9 - outskirts) * 0.43;
}

const tone = (base, variation) => `rgb(${base.map(c => Math.round(c + variation)).join(',')})`;

function terrainTexture(world, palette) {
  const resolution = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = world.size * resolution;
  const ctx = canvas.getContext('2d');
  const rnd = random(world.seed * 203);
  const moss = world.id === 'wood' || world.id === 'watch';
  ctx.fillStyle = tone(palette.ground, 0);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const tile of world.tiles) {
    const x = tile.x * resolution;
    const z = tile.y * resolution;
    const hue = Math.sin(tile.x * 0.68 + tile.y * 0.21) * 3.2 + (tile.seed - 0.5) * 7;
    const shade = ctx.createRadialGradient(x + 35, z + 31, 9, x + 32, z + 32, 58);
    shade.addColorStop(0, tone(tile.road ? palette.road : palette.ground, hue));
    shade.addColorStop(1, tone(tile.road ? palette.road : palette.ground, hue - 5));
    ctx.fillStyle = shade;
    ctx.fillRect(x, z, resolution, resolution);

    if (tile.road && (world.id !== 'wood' || tile.seed > 0.63)) {
      for (let row = 0; row < 3; row++) {
        let left = x - (row % 2) * 11;
        while (left < x + resolution - 2) {
          const width = 12 + rnd() * 14;
          const sx = Math.max(x, left);
          const ex = Math.min(left + width, x + resolution);
          const top = z + row * (resolution / 3);
          const high = resolution / 3 - 2;
          ctx.fillStyle = tone(palette.road, hue + (rnd() - 0.5) * 12);
          ctx.beginPath();
          ctx.moveTo(sx + 3, top + 1);
          ctx.lineTo(ex - 2, top + 2 + rnd() * 2);
          ctx.lineTo(ex - 1, top + high - 4);
          ctx.lineTo(ex - 4, top + high);
          ctx.lineTo(sx + 2, top + high - rnd() * 2);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#18191875';
          ctx.stroke();
          ctx.strokeStyle = '#d2bb9c24';
          ctx.beginPath();
          ctx.moveTo(sx + 3, top + 4);
          ctx.lineTo(ex - 4, top + 4);
          ctx.stroke();
          left += width;
        }
      }
    }

    for (let sample = 0; sample < 55; sample++) {
      const px = x + rnd() * resolution;
      const pz = z + rnd() * resolution;
      const w = 1 + rnd() * (tile.road ? 6 : 9);
      ctx.fillStyle = rnd() < 0.57 ? '#111a195d' : moss && rnd() < 0.34 ? '#85856248' : '#cec1a035';
      ctx.beginPath();
      ctx.ellipse(px, pz, w, w * 0.26, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function floor(world, palette) {
  const terrain = new T.PlaneGeometry(world.size, world.size, world.size * 2, world.size * 2).rotateX(-Math.PI / 2);
  terrain.translate((world.size - 1) / 2, 0, (world.size - 1) / 2);
  const positions = terrain.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, groundY(world, positions.getX(i), positions.getZ(i)));
  terrain.computeVertexNormals();
  const texture = terrainTexture(world, palette);
  const finish = new T.MeshStandardMaterial({ color: '#ffffff', map: texture, roughness: 0.97 });
  const mesh = new T.Mesh(terrain, finish);
  mesh.receiveShadow = true;
  mesh.name = 'walkable terrain';
  return mesh;
}

function backdrop(world, palette) {
  const outer = 18;
  const shape = new T.PlaneGeometry(world.size + outer * 2, world.size + outer * 2, 32, 32).rotateX(-Math.PI / 2);
  shape.translate((world.size - 1) / 2, -0.52, (world.size - 1) / 2);
  const positions = shape.attributes.position;
  const colors = [];
  const base = new T.Color(tone(palette.ground, -3));
  const fog = new T.Color(palette.fog);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const d = Math.max(0, -x, -z, x - world.size + 1, z - world.size + 1);
    positions.setY(i, positions.getY(i) - d * 0.087 - Math.sin(x * 0.42 + z * 0.19) * Math.min(d * 0.07, 0.52));
    const color = base.clone().lerp(fog, Math.min(0.67, d * 0.05));
    colors.push(color.r, color.g, color.b);
  }
  shape.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  shape.computeVertexNormals();
  const finish = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const mesh = new T.Mesh(shape, finish);
  mesh.receiveShadow = true;
  return mesh;
}

const haloTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const halo = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  halo.addColorStop(0, 'rgba(255,255,255,0.86)');
  halo.addColorStop(0.25, 'rgba(255,255,255,0.33)');
  halo.addColorStop(0.59, 'rgba(255,255,255,0.08)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(canvas);
})();

function makeFlame(palette, glow) {
  const root = new T.Group();
  const shade = palette === PALETTES.crypt ? '#83edcf' : '#ffb15e';
  const core = palette === PALETTES.crypt ? '#d2ffe7' : '#ffe1a1';
  const edge = new T.MeshBasicMaterial({ color: shade, fog: false, toneMapped: false });
  const center = new T.MeshBasicMaterial({ color: core, fog: false, toneMapped: false });
  glow.owned.push(edge, center);
  part(root, 'cut', edge, [0, 0.12, 0], [0.23, 0.50, 0.23], { shadow: false });
  part(root, 'cone', center, [0.033, 0.06, 0.06], [0.16, 0.34, 0.13], { shadow: false });
  part(root, 'cone', edge, [-0.09, 0.09, 0.04], [0.13, 0.34, 0.13], { shadow: false, rotation: [0, 0, -0.29] });
  const halo = new T.Sprite(glow.halo);
  halo.position.y = 0.18;
  halo.scale.set(2.8, 2.8, 1);
  root.add(halo);
  return root;
}

function tree(root, prop, palette) {
  const size = 1.35 + prop.seed * 1.6;
  const wood = prop.type === 'pine' ? '#423d32' : '#55483a';
  const rotate = prop.seed * Math.PI * 7;
  root.rotation.y = rotate;
  beam(root, [0, -0.05, 0], [0.1, size * 0.73, 0], 0.23 + prop.seed * 0.13, wood);
  beam(root, [0.08, size * 0.64, 0], [0.22, size, -0.06], 0.16, wood);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI * 0.5;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    beam(root, [0, 0.22, 0], [dx * 0.48, -0.015, dz * 0.37], 0.13, wood);
  }
  if (prop.type === 'pine') {
    for (let i = 0; i < 5; i++) {
      part(root, 'cone', palette.foliage[i % 3], [0.07, size * (0.48 + 0.15 * i), 0], [1.58 - i * 0.22, size * 0.37, 1.53 - i * 0.20],
        { rotation: [(prop.seed - 0.8) * 0.23, i * 1.07, 0.08] });
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4;
      const y = size * (0.34 + i * 0.082);
      const t = size * (0.22 - i * 0.018);
      const dx = Math.cos(a) * t;
      const dz = Math.sin(a) * t;
      const end = [dx * 1.42, y + t * 1.67, dz * 1.42];
      beam(root, [0.05, y, 0], [dx, y + t * 0.62, dz], 0.13 - i * 0.01, wood);
      beam(root, [dx, y + t * 0.58, dz], end, 0.065 - i * 0.003, '#5b5040');
      beam(root, [dx, y + t * 0.61, dz], [dx * 1.9, y + t * 1.21, dz * 1.7], 0.052, '#514b3d');
    }
  }
}

function masonry(root, [x, y, z], w, h, d, palette, rnd, battered = false) {
  const rows = Math.ceil(h / 0.24);
  const height = h / rows;
  const cols = Math.max(1, Math.round(w / 0.3));
  const width = w / cols;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (battered && row > rows * 0.53 && rnd() < 0.23 + row / rows * 0.22) continue;
      const tint = rnd() < 0.29 ? palette.dark : palette.stone;
      part(root, 'box', tint, [x - w * 0.5 + (col + 0.5) * width + (row % 2) * 0.035, y + (row + 0.47) * height, z],
        [width - 0.018, height - 0.023, d * (0.93 + rnd() * 0.11)], { rotation: [0, (rnd() - 0.5) * 0.06, 0] });
    }
  }
}

function house(root, palette, rnd) {
  const w = 1.9;
  const d = 1.88;
  part(root, 'box', palette.dark, [0, 0.15, 0], [2.25, 0.32, 2.2]);
  part(root, 'box', '#554d42', [0, 0.75, 0], [w, 1.21, d]);
  for (const side of [-1, 1]) {
    masonry(root, [0, 0.14, side * 0.93], w, 1.1, 0.13, palette, rnd);
    const wing = new T.Group();
    wing.rotation.y = Math.PI / 2;
    root.add(wing);
    masonry(wing, [0, 0.14, side * 0.94], d, 1.1, 0.13, palette, rnd);
  }
  const timber = '#41362e';
  for (const x of [-0.89, 0.89]) for (const z of [-0.91, 0.91]) beam(root, [x, 0.21, z], [x, 1.44, z], 0.145, timber, 'box');
  for (const side of [-1, 1]) {
    const roof = new T.Group();
    roof.position.set(side * 0.54, 1.63, 0);
    roof.rotation.z = -side * 0.64;
    root.add(roof);
    part(roof, 'box', '#353c45', [0, 0, 0], [1.4, 0.13, 2.31]);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 3; j++) part(roof, 'box', ['#506065', '#424d56', '#4e545b'][(i + j) % 3],
        [j * 0.452 - 0.442, 0.075 - j * 0.018, i * 0.28 - 0.96], [0.48, 0.056, 0.26], {
          rotation: [0, (rnd() - 0.5) * 0.04, 0], shadow: false,
        });
    }
  }
  part(root, 'box', '#664e3d', [0.49, 1.93, -0.57], [0.37, 0.78, 0.45]);
  part(root, 'box', palette.stone, [0.49, 2.32, -0.57], [0.47, 0.13, 0.53]);
  part(root, 'box', '#2b2825', [-0.36, 0.43, 0.997], [0.48, 0.85, 0.09]);
  for (const x of [-0.59, -0.13]) beam(root, [x, 0.06, 1.045], [x, 0.94, 1.045], 0.075, timber, 'box');
  part(root, 'box', '#c79b66', [0.47, 0.82, 1.025], [0.45, 0.52, 0.065]);
  part(root, 'box', '#ffb663', [0.47, 0.82, 1.069], [0.34, 0.37, 0.035], { style: 'light' });
  part(root, 'box', timber, [0.47, 0.82, 1.099], [0.045, 0.39, 0.046]);
  part(root, 'box', '#c79b66', [1.014, 0.81, 0.32], [0.06, 0.43, 0.45]);
  part(root, 'box', '#ffb663', [1.05, 0.81, 0.32], [0.04, 0.30, 0.32], { style: 'light' });
}

function brazier(root, palette) {
  part(root, 'cylinder', palette.dark, [0, 0.09, 0], [0.44, 0.2, 0.44]);
  part(root, 'taper', '#765c48', [0, 0.38, 0], [0.21, 0.48, 0.21], { style: 'metal' });
  part(root, 'taper', '#977254', [0, 0.61, 0], [0.53, 0.20, 0.53], { rotation: [0, 0, Math.PI], style: 'metal' });
  part(root, 'cylinder', '#332c29', [0, 0.717, 0], [0.45, 0.055, 0.45]);
}

export function buildScenery(world, scene) {
  const palette = PALETTES[world.id];
  const surface = floor(world, palette);
  const outside = backdrop(world, palette);
  scene.add(outside, surface);
  const shapes = new T.Group();
  const flames = [];
  const rnd = random(world.seed * 201 + 4);
  const halo = new T.SpriteMaterial({
    color: palette.flame, map: haloTexture, transparent: true, opacity: 0.71,
    blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  });
  const glow = { halo, owned: [] };

  for (const prop of world.scenery) {
    const root = new T.Group();
    shapes.add(root);
    root.position.set(prop.x, groundY(world, prop.x, prop.y), prop.y);
    root.rotation.y = prop.seed * Math.PI * 2;
    if (prop.type === 'tree' || prop.type === 'pine') tree(root, prop, palette);
    if (prop.type === 'house') {
      root.rotation.y = Math.PI * 0.5 * Math.floor(prop.seed * 3);
      house(root, palette, rnd);
    }
    if (prop.type === 'wall') {
      const span = 1.3 + prop.seed * 0.3;
      masonry(root, [0, -0.05, 0], span, 0.96, 0.46, palette, rnd, true);
      for (const side of [-1, 1]) part(root, 'boulder', palette.stone, [side * 0.68, 0.03, 0.19], [0.39, 0.30, 0.35]);
    }
    if (prop.type === 'pillar') {
      masonry(root, [0, 0, 0], 0.53, 1.55 + prop.seed, 0.49, palette, rnd);
      part(root, 'box', palette.stone, [0, 0.15, 0], [0.66, 0.26, 0.7]);
      part(root, 'box', palette.stone, [0, 1.54 + prop.seed, 0], [0.65, 0.21, 0.67]);
    }
    if (prop.type === 'rock' || prop.type === 'debris') {
      const width = prop.type === 'rock' ? 0.63 : 0.25;
      part(root, 'boulder', palette.stone, [0, width * 0.26, 0], [width * 1.6, width * 0.9, width], { rotation: [0.35, 0.49, 0.15] });
      part(root, 'cut', palette.dark, [0.38, width * 0.08, -0.12], [width * 0.65, width * 0.42, width * 0.72]);
    }
    if (prop.type === 'brazier') {
      brazier(root, palette);
      const flame = makeFlame(palette, glow);
      flame.position.set(prop.x, root.position.y + 0.75, prop.y);
      scene.add(flame);
      flames.push(flame);
    }
    if (prop.type === 'altar') {
      masonry(root, [0, 0, 0], 1.1, 0.61, 0.64, palette, rnd);
      part(root, 'box', palette.stone, [0, 0.66, 0], [1.35, 0.16, 0.83]);
      part(root, 'box', '#aa9271', [0, 0.751, 0], [1.08, 0.035, 0.61], { style: 'metal' });
    }
    if (prop.type === 'tent') {
      root.rotation.y = 0.25;
      for (const side of [-1, 1]) part(root, 'box', side === 1 ? '#a08b64' : '#847252', [side * 0.49, 0.57, 0], [1.48, 0.036, 1.84], { rotation: [0, 0, -side * 0.84] });
      beam(root, [0, 0, 0.89], [0, 1.14, 0.89], 0.09, '#66533d', 'cylinder');
      beam(root, [0, 1.13, -0.94], [0, 1.13, 0.94], 0.078, '#66533d', 'cylinder');
    }
    if (prop.type === 'bell') {
      root.rotation.y = 0.18;
      for (const x of [-1.05, 1.05]) {
        masonry(root, [x, 0, 0], 0.62, 2.92, 0.72, palette, rnd);
        part(root, 'box', palette.dark, [x, 0.19, 0], [0.91, 0.39, 0.88]);
        part(root, 'box', palette.stone, [x, 2.93, 0], [0.78, 0.26, 0.82]);
      }
      part(root, 'box', '#715852', [0, 3, 0], [2.73, 0.29, 0.61]);
      const profile = [[0, 0.05], [0.72, 0.01], [0.78, 0.10], [0.59, 0.17], [0.46, 0.35], [0.39, 0.86], [0.29, 1.06], [0.12, 1.15], [0, 1.15]]
        .map(([x, y]) => new T.Vector2(x, y));
      const bell = new T.Mesh(new T.LatheGeometry(profile, 20), material('#b78047', 'metal'));
      bell.position.y = 1.43;
      bell.castShadow = bell.receiveShadow = true;
      root.add(bell);
      part(root, 'round', '#a16b42', [0, 1.37, 0], [0.26, 0.22, 0.26], { style: 'metal' });
      part(root, 'cylinder', '#b88456', [0, 2.71, 0], [0.18, 0.45, 0.18], { style: 'metal' });
    }
  }
  for (const tile of world.tiles) {
    if (tile.road && tile.seed < 0.88 || !tile.road && rnd() > palette.density) continue;
    const x = tile.x + (rnd() - 0.5) * 0.70;
    const z = tile.y + (rnd() - 0.5) * 0.70;
    const y = groundY(world, x, z);
    const width = 0.08 + rnd() * 0.18;
    if (!tile.road && (world.id === 'watch' || world.id === 'wood')) {
      for (let i = 0; i < 5; i++) {
        const height = 0.09 + rnd() * 0.21;
        part(shapes, 'cone', palette.vegetation, [x + (rnd() - 0.5) * 0.29, y + height * 0.32, z + (rnd() - 0.5) * 0.24], [0.06, height, 0.035],
          { rotation: [(rnd() - 0.5) * 0.6, rnd() * Math.PI, (rnd() - 0.5) * 0.6], shadow: false });
      }
    } else {
      part(shapes, 'cut', rnd() > 0.64 ? palette.stone : palette.earth, [x, y + width * 0.09, z], [width, width * 0.48, width * 0.64],
        { rotation: [0.24, rnd() * Math.PI, 0.15], shadow: false });
    }
  }
  const wooded = world.id === 'watch' || world.id === 'wood';
  for (let i = 0; i < (wooded ? 47 : 32); i++) {
    const side = i % 4;
    const inset = -1.2 - rnd() * 7.3;
    const along = rnd() * (world.size + 9) - 4.5;
    const x = side < 2 ? along : side === 2 ? inset : world.size - 1 - inset;
    const z = side >= 2 ? along : side === 0 ? inset : world.size - 1 - inset;
    const root = new T.Group();
    root.position.set(x, -0.6 + inset * 0.087, z);
    root.rotation.y = rnd() * Math.PI;
    shapes.add(root);
    if (wooded) {
      tree(root, { type: rnd() > 0.42 ? 'pine' : 'tree', seed: rnd() }, palette);
    } else {
      const h = 0.45 + rnd() * 2.17;
      part(root, world.id === 'crypt' ? 'box' : 'boulder', palette.dark, [0, h * 0.25, 0], [0.6 + rnd(), h, 0.5 + rnd()],
        { rotation: [rnd() * 0.25, 0, rnd() * 0.35] });
    }
  }
  combineStatic(shapes, scene);
  return {
    surface, flames,
    zoneMaterials: [outside.material, halo, ...glow.owned],
    zoneGeometries: [outside.geometry],
  };
}

export function makeGate(palette) {
  const root = new T.Group();
  const rnd = random(607);
  const width = 0.64;
  for (const side of [-1, 1]) {
    masonry(root, [side * width, 0, 0], 0.34, 0.95, 0.45, palette, rnd);
    part(root, 'box', palette.dark, [side * width, 0.10, 0], [0.46, 0.2, 0.54]);
    part(root, 'box', '#9f815a', [side * width, 0.84, 0.24], [0.08, 0.32, 0.055], { style: 'light' });
  }
  for (let i = 0; i <= 8; i++) {
    const angle = i * Math.PI / 8;
    part(root, 'box', i % 3 ? palette.stone : '#a09379', [Math.cos(angle) * width, 0.9 + Math.sin(angle) * 0.57, 0],
      [0.32, 0.27, 0.45], { rotation: [0, 0, angle] });
  }
  part(root, 'box', palette.dark, [0, 0.04, 0], [1.62, 0.13, 0.76]);
  const inner = new T.Mesh(new T.CircleGeometry(0.47, 36), new T.MeshBasicMaterial({
    color: '#ccbe91', transparent: true, opacity: 0.12, depthWrite: false, side: T.DoubleSide,
  }));
  inner.position.y = 0.76;
  inner.scale.y = 1.43;
  inner.userData.disposeGeometry = true;
  root.add(inner);
  return root;
}
