import { ZONES } from './content.js';

export function random(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export const length = (x, y) => Math.hypot(x, y);
export const distance = (a, b) => length(a.x - b.x, a.y - b.y);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function segmentDistance(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return length(x - ax - dx * t, y - ay - dy * t);
}

export function createWorld(id) {
  const zone = ZONES[id];
  const rnd = random(zone.seed);
  const segments = zone.paths.flatMap(path => path.slice(1).map((point, i) => [path[i], point]));
  const tiles = [];
  const scenery = zone.props.map(([type, x, y]) => ({ type, x, y, seed: rnd() }));
  const obstacles = scenery.filter(prop => ['house', 'wall', 'altar', 'bell'].includes(prop.type))
    .map(prop => ({ ...prop, radius: prop.type === 'house' ? 1.2 : 0.58 }));
  for (let y = 0; y < zone.size; y++) for (let x = 0; x < zone.size; x++) {
    const d = Math.min(...segments.map(segment => segmentDistance(x, y, ...segment)));
    const seed = rnd();
    const road = d < (id === 'belfry' ? 3 : 1.65) || (zone.safe && length(x - 11, y - 11) < 4.5);
    tiles.push({ x, y, road, seed, detail: rnd() });
    const edge = Math.min(x, y, zone.size - 1 - x, zone.size - 1 - y);
    const clear = d < 2.45 || [...zone.markers, ...zone.enemies, ...scenery.slice(0, zone.props.length)].some(point => distance({ x, y }, point) < 1.8);
    if (clear) continue;
    if ((id === 'wood' || zone.safe) && (seed > 0.88 || (edge <= 1 && seed > 0.39))) {
      scenery.push({ type: seed > 0.94 ? 'pine' : 'tree', x, y, seed });
      obstacles.push({ x, y, radius: 0.36 });
    } else if (seed > 0.94 || (edge <= 1 && seed > 0.48)) {
      scenery.push({ type: id === 'crypt' ? 'pillar' : 'rock', x, y, seed });
      obstacles.push({ x, y, radius: 0.33 });
    } else if (seed > 0.83) {
      scenery.push({ type: 'debris', x, y, seed });
    }
  }
  return { ...zone, id, tiles, scenery, obstacles };
}

export function walkable(world, x, y, radius = 0.22) {
  if (Math.min(x, y) < 0.55 || Math.max(x, y) > world.size - 1.55) return false;
  return !world.obstacles.some(prop => (x - prop.x) ** 2 + (y - prop.y) ** 2 < (radius + prop.radius) ** 2);
}

export function findPath(world, actor, target) {
  const start = [Math.round(actor.x), Math.round(actor.y)];
  const end = [clamp(Math.round(target.x), 1, world.size - 2), clamp(Math.round(target.y), 1, world.size - 2)];
  const nodes = [{ x: start[0], y: start[1], g: 0, f: 0 }];
  const seen = new Map([[start.join(','), 0]]);
  let best = nodes[0];
  let bestDist = Infinity;
  while (nodes.length) {
    nodes.sort((a, b) => b.f - a.f);
    const node = nodes.pop();
    const d = length(node.x - end[0], node.y - end[1]);
    if (d < bestDist) {
      best = node;
      bestDist = d;
    }
    if (d === 0) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = node.x + dx;
      const y = node.y + dy;
      const cost = node.g + length(dx, dy);
      const key = [x, y].join(',');
      if (cost >= (seen.get(key) ?? Infinity) || !walkable(world, x, y)) continue;
      if (dx && dy && (!walkable(world, node.x + dx, node.y) || !walkable(world, node.x, node.y + dy))) continue;
      seen.set(key, cost);
      nodes.push({ x, y, g: cost, f: cost + length(x - end[0], y - end[1]), previous: node });
    }
  }
  const path = [];
  if (best.x === end[0] && best.y === end[1] && walkable(world, target.x, target.y)) {
    path.push({ x: target.x, y: target.y });
  }
  while (best.previous) {
    path.push({ x: best.x, y: best.y });
    best = best.previous;
  }
  return path.reverse();
}
