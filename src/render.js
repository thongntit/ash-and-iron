import * as T from 'three';
import { ASH_SEAL, IRON_SEAL, LEDGER, VAULT_REWARD } from './content.js';
import { animateWisp, makeWisp, makeSeal } from './characters.js';
import { animateRig, riggedAsset, disposeRig, sceneAsset } from './assets.js';
import { effectMaterial, part } from './mesh.js';
import { buildScenery, groundY, makeGate, PALETTES } from './terrain.js';
import { clamp, distance, random } from './world.js';

const TIERS = ['#e7d8b8', '#a6d389', '#87cdec', '#f2ad65'];
const TAU = Math.PI * 2;
const HOSTILE = '#ed815f';
const GOLD = '#e3b877';
const sq2 = Math.sqrt(2);
const slash = new T.RingGeometry(0.79, 1, 28, 1, -1.15, 2.30).rotateX(-Math.PI / 2);

function waypoint(game) {
  const stage = game.state.stage;
  if (stage >= 5 && game.world.id !== 'vault') return null;
  if (game.world.id === 'belfry' && stage === 3) {
    return game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
  }
  const next = {
    watch: stage === 0 || stage === 4 ? 'keeper' : 'wood',
    wood: stage === 1 ? ASH_SEAL : 'crypt',
    crypt: stage === 2 ? IRON_SEAL : 'belfry',
    belfry: 'home',
    vault: game.state.vaultCleared ? 'wood' : VAULT_REWARD,
  }[game.world.id];
  return game.markers().find(marker => marker.id === next);
}

function diamond(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fill();
}

function oval(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function disc(parent, color, radius, alpha, fill = false) {
  return part(parent, fill ? 'disc' : 'ring', effectMaterial(color, alpha), [0, 0.027, 0], [radius, 1, radius], {
    shadow: false, receive: false,
  });
}

function releaseDynamic(root) {
  root.traverse(mesh => {
    if (mesh.material?.isMeshBasicMaterial) mesh.material.dispose();
  });
  root.removeFromParent();
}

function markSize(entity) {
  if (!entity.kind) return ['boss', 'oathbreaker'].includes(entity.type) ? [0.74, entity.type === 'boss' ? 2.88 : 2.06] : entity.type === 'wisp' ? [0.43, 1.12] : [0.48, 1.54];
  if (entity.kind === 'gate') return [0.84, 1.62];
  return ['keeper', 'smith'].includes(entity.kind) ? [0.44, 1.42] : [0.41, 1.10];
}

function haze(palette, world) {
  const count = 700;
  const rng = random(world.seed * 12);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const white = new T.Color(palette.sky);
  const ember = new T.Color(palette.flame);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rng() * (world.size + 3) - 1.5;
    positions[i * 3 + 1] = rng() * 5.1 + 0.05;
    positions[i * 3 + 2] = rng() * (world.size + 3) - 1.5;
    const shade = rng() > 0.73 ? ember : white;
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  return new T.Points(geometry, new T.PointsMaterial({ size: 0.035, transparent: true, opacity: 0.32, depthWrite: false, vertexColors: true }));
}

export class Renderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.webgl = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const gl = this.webgl.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.software = debug && /swiftshader|llvmpipe|software/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = this.software ? T.BasicShadowMap : T.PCFShadowMap;
    this.webgl.shadowMap.autoUpdate = false;
    this.webgl.toneMapping = T.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.19;
    this.webgl.outputColorSpace = T.SRGBColorSpace;
    this.camera = new T.OrthographicCamera(0, 1, 1, 0, 0.5, 108);
    this.follow = { x: 0, y: 0 };
    this.zoom = 1;
    this.raycaster = new T.Raycaster();
    this.pointer = new T.Vector2();
    this.selection = new T.Box3();
    this.temp = new T.Vector3();
    this.plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    this.overlay = document.createElement('canvas');
    this.overlay.id = 'world-labels';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.ctx = this.overlay.getContext('2d');
    this.waypointButton = document.createElement('button');
    this.waypointButton.type = 'button';
    this.waypointButton.className = 'waypoint-button';
    this.waypointButton.hidden = true;
    this.waypointButton.innerHTML = '<span aria-hidden="true">➤</span><b></b>';
    canvas.after(this.overlay, this.waypointButton);
    this.map = map;
    this.resize();
  }

  resize() {
    this.width = Math.max(1, this.canvas.clientWidth);
    this.height = Math.max(1, this.canvas.clientHeight);
    const ratio = Math.min(this.width < 700 ? 1.25 : 1.5, window.devicePixelRatio || 1);
    this.webgl.setPixelRatio(this.software ? 0.62 : ratio);
    this.webgl.setSize(this.width, this.height, false);
    this.overlay.width = Math.round(this.width * ratio);
    this.overlay.height = Math.round(this.height * ratio);
    this.ratio = ratio;
    this.unit = clamp(this.width * 0.041, 31, 49) * sq2 * this.zoom;
    this.camera.left = -this.width * 0.5 / this.unit;
    this.camera.right = this.width * 0.5 / this.unit;
    this.camera.top = this.height * 0.48 / this.unit;
    this.camera.bottom = -this.height * 0.52 / this.unit;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  zoomBy(direction) {
    this.zoom = clamp(this.zoom - direction * 0.085, 0.79, 1.30);
    this.resize();
  }

  center(player) {
    this.follow.x = player.x;
    this.follow.y = player.y;
    this.placeCamera();
  }

  placeCamera() {
    const { x, y } = this.follow;
    this.camera.position.set(x + 21, 18.08, y + 21);
    this.camera.lookAt(x, 0, y);
    this.camera.updateMatrixWorld();
  }

  project(x, y, height = 0) {
    const worldY = this.world ? groundY(this.world, x, y) : 0;
    const p = this.temp.set(x, worldY + height, y).project(this.camera);
    return [(p.x + 1) * this.width / 2, (1 - p.y) * this.height / 2];
  }

  ray(x, y) {
    this.pointer.set(x / this.width * 2 - 1, 1 - y / this.height * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray;
  }

  unproject(x, y) {
    const ray = this.ray(x, y);
    const point = this.surface && this.raycaster.intersectObject(this.surface, false)[0]?.point
      || ray.intersectPlane(this.plane, this.temp);
    return point ? { x: point.x, y: point.z } : { ...this.follow };
  }

  pick(game, x, y) {
    const ray = this.ray(x, y);
    let nearest;
    let best = Infinity;
    for (const entity of [...game.markers(), ...game.enemies]) {
      if (entity.hp <= 0) continue;
      const [width, height] = markSize(entity);
      const ground = groundY(game.world, entity.x, entity.y);
      this.selection.min.set(entity.x - width, ground - 0.10, entity.y - width);
      this.selection.max.set(entity.x + width, ground + height + 0.12, entity.y + width);
      const hit = ray.intersectBox(this.selection, this.temp);
      if (!hit) continue;
      const d = hit.distanceToSquared(ray.origin);
      if (d >= best) continue;
      best = d;
      nearest = entity;
    }
    return nearest;
  }

  build(game) {
    if (this.scene) {
      this.surface.geometry.dispose();
      this.surface.material.map.dispose();
      this.surface.material.dispose();
      this.dust.geometry.dispose();
      this.dust.material.dispose();
      this.key.shadow.dispose();
      this.levelGeometry.traverse(mesh => {
        if (mesh.isInstancedMesh) mesh.dispose();
        if (mesh.geometry?.type === 'LatheGeometry') mesh.geometry.dispose();
      });
      this.levelGeometry.removeFromParent();
      releaseDynamic(this.combat);
      for (const model of this.models.values()) this.disposeModel(model);
      for (const material of this.zoneMaterials) material.dispose();
      for (const geometry of this.zoneGeometries) geometry.dispose();
      for (const texture of this.zoneTextures) texture.dispose();
      this.scene.clear();
    }
    const world = game.world;
    this.world = world;
    const palette = PALETTES[world.id];
    const scene = new T.Scene();
    scene.background = new T.Color(palette.fog);
    scene.fog = new T.FogExp2(palette.fog, 0.0205);
    scene.add(new T.HemisphereLight(palette.sky, '#63504b', 2.65));
    const key = new T.DirectionalLight(palette.key, 3.01);
    key.castShadow = true;
    const shadowSize = this.software ? 640 : 1536;
    key.shadow.mapSize.set(shadowSize, shadowSize);
    key.shadow.camera.left = -12.5;
    key.shadow.camera.right = 12.5;
    key.shadow.camera.top = 12.5;
    key.shadow.camera.bottom = -12.5;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 38;
    key.shadow.normalBias = 0.032;
    key.shadow.bias = -0.00026;
    key.shadow.radius = 2.5;
    scene.add(key, key.target);
    this.key = key;
    const fill = new T.DirectionalLight('#a9b7ce', 0.85);
    fill.position.set(4, 6, -7);
    scene.add(fill);
    const levelGeometry = new T.Group();
    this.levelGeometry = levelGeometry;
    const { surface, flames, zoneMaterials, zoneGeometries, zoneTextures } = buildScenery(world, levelGeometry);
    this.surface = surface;
    this.flames = flames;
    this.zoneMaterials = zoneMaterials;
    this.zoneGeometries = zoneGeometries;
    this.zoneTextures = zoneTextures;
    scene.add(levelGeometry);
    this.lamps = Array.from({ length: this.software ? 2 : 4 }, () => {
      const lamp = new T.PointLight(palette.flame, 0, 6, 1.8);
      scene.add(lamp);
      return lamp;
    });
    const lantern = new T.PointLight('#eac087', 7, 4.6, 2);
    scene.add(lantern);
    this.lantern = lantern;
    this.castLight = new T.PointLight('#e8a070', 0, 7, 2);
    scene.add(this.castLight);
    this.dust = haze(palette, world);
    scene.add(this.dust);
    this.characters = new T.Group();
    this.combat = new T.Group();
    this.selectedRing = disc(this.combat, HOSTILE, 1, 0.9);
    this.playerRing = disc(this.combat, '#e4b877', 0.27, 0.82);
    this.guard = disc(this.combat, '#f1cb80', 0.62, 0.95);
    this.destination = disc(this.combat, '#e4b877', 0.19, 0.78);
    scene.add(this.characters, this.combat);
    this.scene = scene;
    this.models = new Map();
    this.clips = new Map();
    this.minimapBase = null;
    this.shadowAt = -Infinity;
    this.center(game.player);
  }

  disposeModel(model) {
    if (model.mixer) disposeRig(model);
    model.root.traverse(mesh => {
      if (mesh.userData.disposeGeometry) mesh.geometry.dispose();
    });
    releaseDynamic(model.root);
  }

  createModel(entity, game) {
    let model;
    if (entity.kind === 'gate') {
      const root = makeGate(PALETTES[game.world.id]);
      root.rotation.y = Math.PI * 0.25;
      model = { root, height: 1.58 };
    } else if ([LEDGER, VAULT_REWARD].includes(entity.kind)) {
      const root = new T.Group();
      sceneAsset('coffer', root, { height: 0.64, rotation: 0.54, tint: '#e3c398' });
      model = { root, height: 0.66 };
    } else if (entity.kind && !['keeper', 'smith'].includes(entity.kind)) {
      model = makeSeal(entity.kind === IRON_SEAL ? '#a3cdc8' : entity.kind === ASH_SEAL ? '#f0ad60' : '#94b797', entity.kind === 'shrine');
    } else if (entity.item) {
      const root = new T.Group();
      const color = TIERS[entity.item.tier];
      const gem = part(root, 'blade', color, [0, 0.24, 0], [0.19, 0.3, 0.19], { style: 'ember' });
      part(root, 'cylinder', effectMaterial(color, 0.29), [0, 0.59, 0], [0.066, 0.95, 0.066], { shadow: false });
      disc(root, color, 0.21, 0.68);
      model = { root, gem, height: 0.55 };
    } else {
      const kind = entity === game.player ? game.state.classId : entity.kind ?? entity.type;
      model = kind === 'wisp' ? makeWisp() : riggedAsset(kind);
    }
    this.characters.add(model.root);
    this.models.set(entity, model);
    return model;
  }

  trackModels(game, visibleMarkers, selected, dt) {
    const entities = [game.player, ...visibleMarkers, ...game.enemies, ...game.drops];
    const seen = new Set(entities);
    for (const [entity, model] of this.models) {
      if (!seen.has(entity)) {
        this.disposeModel(model);
        this.models.delete(entity);
      }
    }
    for (const entity of entities) {
      const model = this.models.get(entity) ?? this.createModel(entity, game);
      const ground = groundY(game.world, entity.x, entity.y);
      model.root.position.set(entity.x, ground, entity.y);
      const [x, y] = this.project(entity.x, entity.y);
      model.root.visible = x > -115 && x < this.width + 115 && y > -85 && y < this.height + 165;
      if (!model.root.visible) continue;
      if (model.mixer) animateRig(model, entity, game.time, dt);
      if (model.body) animateWisp(model, entity, game.time);
      if (model.gem) {
        model.gem.rotation.y = game.time * 1.55;
        model.gem.position.y = (entity.item ? 0.22 : 0.84) + Math.sin(game.time * 3.4 + entity.x) * 0.066;
      }
    }
    const player = game.player;
    this.playerRing.position.set(player.x, groundY(game.world, player.x, player.y) + 0.034, player.y);
    this.guard.visible = player.guarded > game.time;
    this.guard.position.copy(this.playerRing.position);
    this.guard.position.y += 0.04;
    this.guard.material.opacity = 0.65 + Math.sin(game.time * 8) * 0.20;
    this.selectedRing.visible = Boolean(selected);
    if (selected) {
      const [scale] = markSize(selected);
      this.selectedRing.position.set(selected.x, groundY(game.world, selected.x, selected.y) + 0.049, selected.y);
      this.selectedRing.scale.set(scale, 1, scale);
      this.selectedRing.material.color.set(selected.kind ? GOLD : HOSTILE);
    }
    const destination = game.command && !game.command.enemy && !game.command.marker ? game.command.target : null;
    this.destination.visible = Boolean(destination);
    if (destination) this.destination.position.set(destination.x, 0.031 + groundY(game.world, destination.x, destination.y), destination.y);
  }

  groundEffect(clip, center, radius) {
    clip.root.position.set(center.x, groundY(this.world, center.x, center.y) + 0.025, center.y);
    clip.root.scale.set(radius, 1, radius);
  }

  clip(key, build) {
    if (!this.clips.has(key)) {
      const root = new T.Group();
      this.combat.add(root);
      this.clips.set(key, { root, ...build(root) });
    }
    const clip = this.clips.get(key);
    clip.current = true;
    return clip;
  }

  effects(game) {
    for (const clip of this.clips.values()) clip.current = false;
    for (const enemy of game.enemies) {
      if (enemy.hp <= 0 || enemy.wind <= 0) continue;
      const clip = this.clip(enemy, root => ({
        ring: disc(root, HOSTILE, 1, 0.92), fill: disc(root, '#ce573e', 0.98, 0.21, true),
        charge: disc(root, '#f5b17a', 1, 0.63),
        trail: part(root, 'box', effectMaterial(HOSTILE, 0.72), [0, 0.07, 0], [0.08, 0.016, 1], { shadow: false }),
      }));
      const { intent } = enemy;
      const line = intent === 'shot' || intent === 'fan';
      const at = intent === 'slam' ? enemy.impact : enemy;
      const radius = intent === 'slam' ? 1.85 + enemy.phase * 0.28 : intent === 'nova' ? 2.2 : enemy.radius + 0.68;
      this.groundEffect(clip, at, radius);
      clip.ring.visible = clip.fill.visible = clip.charge.visible = !line;
      const phase = Math.max(0.01, 1 - enemy.wind / enemy.windTotal);
      clip.charge.scale.set(phase, 1, phase);
      clip.trail.visible = line;
      if (line) {
        clip.root.scale.setScalar(1);
        clip.root.rotation.y = Math.PI * 0.5 - enemy.aim;
        clip.trail.position.z = 2.6;
        clip.trail.scale.z = 5.2;
      } else clip.root.rotation.y = 0;
    }
    for (const shot of game.shots) {
      const body = this.clip(shot, root => ({
        core: part(root, 'blade', shot.color, [0, 0, 0], [0.14, 0.14, 0.37], { style: 'ember', shadow: false }),
        head: part(root, 'round', '#ffdcaa', [0, 0, 0.12], [0.095, 0.095, 0.095], { style: 'light', shadow: false }),
        tail: part(root, 'cone', effectMaterial(shot.color, 0.59), [0, 0, -0.23], [0.15, 0.55, 0.15], { rotation: [-Math.PI * 0.5, 0, 0], shadow: false }),
      }));
      body.root.position.set(shot.x, groundY(this.world, shot.x, shot.y) + 0.61, shot.y);
      body.root.rotation.y = Math.PI * 0.5 - shot.angle;
    }
    for (const trap of game.traps) {
      const clip = this.clip(trap, root => ({
        ring: disc(root, '#9cce87', 1.08, 0.86),
        center: part(root, 'blade', '#bfe09a', [0, 0.14, 0], [0.22, 0.31, 0.22], { style: 'light', shadow: false }),
      }));
      this.groundEffect(clip, trap, 1);
      clip.ring.material.opacity = 0.70 + Math.sin(game.time * 5) * 0.25;
      clip.center.rotation.y = game.time * 2.8;
    }
    for (const effect of game.effects) {
      if (effect.kind === 'float') continue;
      const life = clamp((game.time - effect.born) / effect.life, 0, 1);
      const clip = this.clip(effect, root => {
        const rays = [];
        if (effect.kind === 'burst' || effect.kind === 'hit') for (let i = 0; i < (effect.kind === 'burst' ? 10 : 6); i++) {
          rays.push(part(root, 'cut', effectMaterial(effect.color, 0.85), [0, 0, 0], [0.07, 0.14, 0.07], { shadow: false }));
        }
        if (effect.kind === 'cleave') {
          const arc = new T.Mesh(slash, effectMaterial(effect.color, 0.85));
          arc.position.y = 0.56;
          root.add(arc);
          return { ring: arc, rays };
        }
        return { ring: disc(root, effect.color, 1, 0.85), rays };
      });
      const size = effect.radius * (0.5 + life * 0.58);
      this.groundEffect(clip, effect, size);
      if (effect.kind === 'cleave') {
        clip.root.rotation.y = -effect.angle + (0.42 - life * 0.84);
        clip.ring.position.y = 0.59 + life * 0.21;
      }
      clip.ring.visible = effect.kind !== 'hit';
      clip.ring.material.opacity = (1 - life) * 0.91;
      clip.rays.forEach((ray, i) => {
        const angle = i * 2.399 + effect.born;
        const r = effect.kind === 'burst' ? life * 0.95 : life * 0.48;
        const height = effect.kind === 'burst' ? 0.3 + Math.sin(life * Math.PI) * (0.86 + i % 4 * 0.19) : 0.62 + life * 0.33;
        ray.position.set(Math.cos(angle) * r, height, Math.sin(angle) * r);
        ray.rotation.set(life * 4 + i, angle, life * 5);
        ray.material.opacity = (1 - life) * 0.9;
      });
    }
    for (const [id, clip] of this.clips) {
      if (clip.current) continue;
      releaseDynamic(clip.root);
      this.clips.delete(id);
    }
  }

  lighting(game) {
    const { x, y } = this.follow;
    this.key.position.set(x - 7.8, 15.5, y - 5.2);
    this.key.target.position.set(x, 0, y);
    const cast = game.effects.findLast(effect => effect.kind === 'burst');
    this.castLight.intensity = cast ? (1 - (game.time - cast.born) / cast.life) * 23 : 0;
    if (cast) {
      this.castLight.position.set(cast.x, groundY(this.world, cast.x, cast.y) + 0.86, cast.y);
      this.castLight.color.set(cast.color);
    }
    this.lantern.position.set(game.player.x, groundY(this.world, game.player.x, game.player.y) + 1.25, game.player.y);
    const closest = [...this.flames].sort((a, b) =>
      (a.position.x - x) ** 2 + (a.position.z - y) ** 2 - (b.position.x - x) ** 2 - (b.position.z - y) ** 2);
    this.lamps.forEach((lamp, i) => {
      const flame = closest[i];
      if (flame) lamp.position.copy(flame.position).y += 0.28;
      lamp.intensity = flame ? 16.4 + Math.sin(game.time * (8.1 + i) + i * 2.4) * 1.9 : 0;
    });
    this.flames.forEach((flame, i) => {
      flame.scale.y = 0.89 + Math.sin(game.time * 12.3 + i) * 0.14 + Math.sin(game.time * 16.7 + i) * 0.08;
      flame.rotation.y = game.time * 0.55 + i * 3;
      flame.rotation.z = Math.sin(game.time * 5.9 + i * 2) * 0.19;
    });
    this.dust.position.set(Math.sin(game.time * 0.21) * 0.45, Math.sin(game.time * 0.40) * 0.28, Math.sin(game.time * 0.16) * 0.41);
  }

  label(text, x, y, color = '#f0dfbf') {
    const ctx = this.ctx;
    ctx.font = '600 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    const width = ctx.measureText(text).width + 17;
    ctx.fillStyle = '#111512df';
    ctx.fillRect(x - width / 2, y - 14, width, 20);
    ctx.strokeStyle = '#7a694c86';
    ctx.strokeRect(x - width / 2, y - 14, width, 20);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  overlayLabels(game, markers, selected, goal) {
    const c = this.ctx;
    const { width, height, ratio } = this;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, width, height);
    const vignette = c.createRadialGradient(width * 0.5, height * 0.47, Math.min(width, height) * 0.21, width * 0.5, height * 0.47, Math.max(width * 0.57, height * 0.64));
    vignette.addColorStop(0, '#0a101000');
    vignette.addColorStop(0.73, '#0a101033');
    vignette.addColorStop(1, '#060b0cda');
    c.fillStyle = vignette;
    c.fillRect(0, 0, width, height);

    for (const marker of markers) {
      const dist = distance(marker, game.player);
      if (marker !== selected && dist > (marker === goal ? 8.3 : 4)) continue;
      const x = marker.x;
      const z = marker.y;
      const [px, py] = this.project(x, z);
      if (marker === goal || marker.kind === LEDGER) {
        const [, tip] = this.project(x, z, (this.models.get(marker)?.height ?? 1.1) + 0.27);
        const gy = tip + Math.sin(game.time * 4.1) * 2.8;
        c.shadowBlur = 16;
        c.shadowColor = '#e6ab5e';
        diamond(c, px, gy, 6.5, marker.kind === LEDGER ? '#b7cc97' : '#f1c384');
        c.shadowBlur = 0;
      }
      this.label(marker.label, px, py + 18, marker === goal ? '#f1c384' : '#e8ddc4');
    }

    for (const enemy of game.enemies) {
      if (enemy.hp <= 0 || enemy.hp >= enemy.maxHP && enemy !== selected) continue;
      const [x, y] = this.project(enemy.x, enemy.y, (this.models.get(enemy)?.height ?? 1.36) + 0.12);
      if (x < 0 || x > width || y < 0 || y > height) continue;
      if (enemy === selected) this.label(enemy.name, x, y - 10, '#edc5a0');
      const w = enemy.type === 'boss' ? 60 : 35;
      c.fillStyle = '#171716e0';
      c.fillRect(x - w / 2, y - 1, w, 5);
      c.fillStyle = '#cd7c63';
      c.fillRect(x - w / 2 + 1, y, (w - 2) * enemy.hp / enemy.maxHP, 3);
    }
    for (const drop of game.drops) {
      if (distance(drop, game.player) > 5.2) continue;
      const [x, y] = this.project(drop.x, drop.y);
      this.label(drop.item.name, x, y + 14, TIERS[drop.item.tier]);
    }
    for (const effect of game.effects) {
      if (effect.kind !== 'float') continue;
      const life = clamp((game.time - effect.born) / effect.life, 0, 1);
      const [x, y] = this.project(effect.x, effect.y, 1.32 + life * 0.48);
      c.globalAlpha = 1 - life * 0.9;
      c.font = '700 15px Inter, sans-serif';
      c.textAlign = 'center';
      c.fillStyle = '#161516';
      c.fillText(effect.text, x + 1, y + 1);
      c.fillStyle = effect.color;
      c.fillText(effect.text, x, y);
      c.globalAlpha = 1;
    }
    this.guide = null;
    if (goal) {
      const [x, y] = this.project(goal.x, goal.y);
      const dx = x - width / 2;
      const dy = y - height / 2;
      const r = Math.max(Math.abs(dx) / (width * 0.36), Math.abs(dy) / (height * 0.26));
      if (r > 1.12) {
        this.guide = goal;
        this.waypointButton.style.left = `${width / 2 + dx / r}px`;
        this.waypointButton.style.top = `${height / 2 + dy / r}px`;
        this.waypointButton.firstElementChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
        const label = this.waypointButton.lastElementChild;
        const name = goal.label ?? goal.name;
        if (label.textContent !== name) label.textContent = name;
      }
    }
    this.waypointButton.hidden = !this.guide;
    if (game.player.flash > 0) {
      c.strokeStyle = `rgba(216,90,66,${game.player.flash})`;
      c.lineWidth = 20;
      c.strokeRect(0, 0, width, height);
    }
  }

  minimap(game, markers, goal) {
    if (this.map.hidden) return;
    const ctx = this.map.getContext('2d');
    const size = this.map.width;
    const scale = size / (game.world.size * 2.2);
    const point = (x, y) => [size * 0.5 + (x - y) * scale, size * 0.13 + (x + y) * scale * 0.86];
    if (!this.minimapBase) {
      const base = document.createElement('canvas');
      base.width = base.height = size;
      const b = base.getContext('2d');
      for (const tile of game.world.tiles) {
        const [x, y] = point(tile.x, tile.y);
        diamond(b, x, y, scale + 0.28, tile.road ? '#9d8b6b80' : '#4d635b61');
      }
      this.minimapBase = base;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.minimapBase, 0, 0);
    for (const marker of markers) {
      const [x, y] = point(marker.x, marker.y);
      oval(ctx, x, y, 2.65, marker.kind === 'gate' ? '#a8c3c0' : marker.kind === LEDGER ? '#b7cc97' : '#d1ba92');
    }
    if (goal) {
      const [x, y] = point(goal.x, goal.y);
      diamond(ctx, x, y, 5, '#e5b976');
    }
    const [x, y] = point(game.player.x, game.player.y);
    oval(ctx, x, y, 5.7, '#e8c18866');
    oval(ctx, x, y, 2.8, '#fff1c3');
  }

  draw(game, selected, dt) {
    if (this.world !== game.world) this.build(game);
    this.follow.x += (game.player.x - this.follow.x) * Math.min(1, dt * 7);
    this.follow.y += (game.player.y - this.follow.y) * Math.min(1, dt * 7);
    this.placeCamera();
    const markers = game.markers();
    this.trackModels(game, markers, selected, dt);
    this.lighting(game);
    this.effects(game);
    if (game.time > this.shadowAt) {
      this.webgl.shadowMap.needsUpdate = true;
      this.shadowAt = game.time + (this.software ? 0.56 : 0.034);
    }
    this.webgl.render(this.scene, this.camera);
    this.canvas.dataset.renderedZone = game.world.id;
    const goal = waypoint(game);
    this.overlayLabels(game, markers, selected, goal);
    this.minimap(game, markers, goal);
  }
}
