import * as T from 'three';
import { beam, combineStatic, material, part } from './mesh.js';
import { random } from './world.js';
import { sceneAsset, sourceImage } from './assets.js';

export const PALETTES = {
  watch: {
    fog: '#131d1e', stone: '#77766b',
    dark: '#494b43', vegetation: '#58684b', flame: '#ffac56',
    sky: '#b1c6d1', key: '#dbd6bf', earth: '#4e4739', density: 0.28,
  },
  wood: {
    fog: '#152123', stone: '#686e62',
    dark: '#444740', vegetation: '#58694e', flame: '#ff9f58',
    sky: '#9db7c6', key: '#d4d5bc', earth: '#474b39', density: 0.36,
  },
  crypt: {
    fog: '#121d29', stone: '#697788',
    dark: '#3c5058', vegetation: '#587078', flame: '#82e2d1',
    sky: '#95b5dc', key: '#c8d5e5', earth: '#3e4856', density: 0.13,
  },
  vault: {
    fog: '#191d17', stone: '#82917c', dark: '#4c5343', vegetation: '#626b51',
    flame: '#c7d191',
    sky: '#afc4af', key: '#d7d0a8', earth: '#495040', density: 0.11,
  },
  belfry: {
    fog: '#241a24', stone: '#826c69',
    dark: '#4c3e45', vegetation: '#76574c', flame: '#ff8b50',
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

function terrainTexture(world, palette) {
  const resolution = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = world.size * resolution;
  const ctx = canvas.getContext('2d');
  const ground = sourceImage('forest_floor');
  const stone = sourceImage('cobblestone_floor_04');
  const vault = world.id === 'vault';
  const crypt = world.id === 'crypt' || vault;
  const belfry = world.id === 'belfry';

  function fillPattern(context, image, scale) {
    const pattern = context.createPattern(image, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(scale));
    context.fillStyle = pattern;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  fillPattern(ctx, crypt ? stone : ground, crypt ? 0.41 : 0.48);
  const paving = document.createElement('canvas');
  paving.width = paving.height = canvas.width;
  const road = paving.getContext('2d');
  fillPattern(road, stone, belfry ? 0.47 : 0.42);
  road.globalCompositeOperation = 'destination-in';
  const mask = document.createElement('canvas');
  mask.width = mask.height = world.size;
  const m = mask.getContext('2d');
  for (const tile of world.tiles) {
    const radius = belfry ? 3.1 : 1.72;
    const plaza = world.safe && Math.hypot(tile.x - 11, tile.y - 11) < 4.4;
    const coverage = plaza ? 1 : Math.max(0, Math.min(1, (radius + 0.55 - tile.roadDistance) / 0.85));
    m.fillStyle = `rgba(255,255,255,${coverage})`;
    m.fillRect(tile.x, tile.y, 1, 1);
  }
  road.drawImage(mask, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(paving, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = vault ? '#a3b2a0' : crypt ? '#9baec9' : belfry ? '#c8a7ab' : world.safe ? '#d2ccb6' : '#abb9a7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  for (const tile of world.tiles) {
    const x = (tile.x + 0.5) * resolution;
    const z = (tile.y + 0.5) * resolution;
    const shade = ctx.createRadialGradient(x, z, 0, x, z, resolution * 1.42);
    shade.addColorStop(0, crypt ? 'rgba(31,46,71,0.07)' : 'rgba(37,43,39,0.08)');
    shade.addColorStop(1, 'transparent');
    ctx.fillStyle = shade;
    ctx.fillRect(x - resolution * 1.42, z - resolution * 1.42, resolution * 2.84, resolution * 2.84);
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
  const finish = new T.MeshStandardMaterial({ color: '#ffffff', map: texture, bumpMap: texture, bumpScale: 0.043, roughness: 0.95 });
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
  const outsideTexture = new T.Texture(sourceImage(['crypt', 'vault'].includes(world.id) ? 'cobblestone_floor_04' : 'forest_floor'));
  outsideTexture.colorSpace = T.SRGBColorSpace;
  outsideTexture.wrapS = outsideTexture.wrapT = T.RepeatWrapping;
  outsideTexture.repeat.setScalar((world.size + outer * 2) / 6.6);
  outsideTexture.anisotropy = 4;
  outsideTexture.needsUpdate = true;
  const base = new T.Color(world.id === 'crypt' ? '#9da8b9' : world.id === 'belfry' ? '#ad9596' : '#9ca794');
  const fog = new T.Color(palette.fog);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const d = Math.max(0, -x, -z, x - world.size + 1, z - world.size + 1);
    positions.setY(i, positions.getY(i) - d * 0.087 - Math.sin(x * 0.42 + z * 0.19) * Math.min(d * 0.07, 0.52));
    const color = base.clone().lerp(fog, Math.min(0.84, d * 0.08));
    colors.push(color.r, color.g, color.b);
  }
  shape.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  shape.computeVertexNormals();
  const finish = new T.MeshStandardMaterial({ vertexColors: true, map: outsideTexture, roughness: 1 });
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
  const shade = palette === PALETTES.crypt ? '#83edcf' : palette === PALETTES.vault ? '#cad489' : '#ffb15e';
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
  const height = 1.7 + prop.seed * 1.55;
  if (prop.type === 'pine') {
    sceneAsset(prop.seed > 0.96 ? 'birch' : 'maple', root, {
      height: height * 1.12, tint: palette === PALETTES.watch ? '#91a696' : '#92a18a',
    });
    return;
  }
  const variant = ['dead-tree-a', 'dead-tree-b', 'dead-tree-c'][Math.floor(prop.seed * 9) % 3];
  sceneAsset(variant, root, { height, tint: '#a99d99' });
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
      sceneAsset(prop.seed > 0.51 ? 'house-a' : 'house-b', root, { width: 2.25, tint: '#aba697' });
    }
    if (prop.type === 'wall') {
      sceneAsset('ruin', root, { height: 0.82 + prop.seed * 0.19, tint: palette.stone });
    }
    if (prop.type === 'pillar') {
      sceneAsset('pillar', root, { height: 1.55 + prop.seed * 0.61, tint: '#8795a3' });
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
  for (const prop of world.setPieces) {
    const model = sceneAsset(prop.asset, shapes, { height: prop.size, rotation: prop.rotation,
      tint: prop.tint ?? (world.id === 'crypt' ? '#9ca6b3' : world.id === 'belfry' ? '#b2a09f' : '#b8ae9f') });
    model.position.set(prop.x, groundY(world, prop.x, prop.y), prop.y);
  }
  for (const tile of world.tiles) {
    if (tile.road && tile.seed < 0.88 || !tile.road && rnd() > palette.density) continue;
    const x = tile.x + (rnd() - 0.5) * 0.70;
    const z = tile.y + (rnd() - 0.5) * 0.70;
    const y = groundY(world, x, z);
    const width = 0.08 + rnd() * 0.18;
    if (!tile.road && (world.id === 'watch' || world.id === 'wood')) {
      if (tile.detail > 0.88) {
        const bush = sceneAsset('bush', shapes, { height: 0.25 + tile.seed * 0.29, tint: '#87927b' });
        bush.position.set(x, y, z);
      }
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
      part(root, ['crypt', 'vault'].includes(world.id) ? 'box' : 'boulder', palette.dark, [0, h * 0.25, 0], [0.6 + rnd(), h, 0.5 + rnd()],
        { rotation: [rnd() * 0.25, 0, rnd() * 0.35] });
    }
  }
  combineStatic(shapes, scene);
  return {
    surface, flames,
    zoneMaterials: [outside.material, halo, ...glow.owned],
    zoneGeometries: [outside.geometry],
    zoneTextures: [outside.material.map],
  };
}

export function makeGate(palette) {
  const root = new T.Group();
  sceneAsset('doorway', root, { height: 1.75, tint: palette === PALETTES.crypt ? '#a9afb8' : '#b8a68e' });
  const inner = new T.Mesh(new T.CircleGeometry(0.43, 36), new T.MeshBasicMaterial({
    color: '#c7ae74', transparent: true, opacity: 0.24, depthWrite: false, side: T.DoubleSide,
  }));
  inner.position.y = 0.74;
  inner.scale.y = 1.52;
  inner.userData.disposeGeometry = true;
  root.add(inner);
  return root;
}
